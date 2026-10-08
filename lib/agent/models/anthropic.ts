import Anthropic from '@anthropic-ai/sdk';
import type { InterviewerModel, TurnContext, TurnEvent, TurnValidation } from './interface';
import { INTERVIEWER_MODEL_ID, FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { TURN_SCHEMA, parseTurn, toRequests, unknownIds, type ModelTurn } from './turn-schema';
import { TurnStreamParser } from './turn-stream';
import { collectTurn, NEUTRAL_TURN } from './turn-events';

export { INTERVIEWER_MODEL_ID } from '@/lib/models';

export const TURN_KEYS = new Set(['move', 'requests', 'exhibit', 'rescue_item', 'say', 'question']);

export type Attempt = { turn: ModelTurn | null; refused: boolean; unknown: string[] };

// Request settings that differ by model. The defaults are production's Sonnet
// 5.5 request, unchanged. Experiment (8 Oct): Haiku 5.5 runs with thinking
// 'disabled' (accepted at effort high or below; it rejects 'between_tools'),
// effort 'medium' (its default), and no fallbacks (Haiku 5.5 has no
// server-side fallback).
export type AnthropicRequestOptions = {
  thinking?: 'between_tools' | 'disabled';
  effort?: 'low' | 'medium' | 'high';
  fallbacks?: boolean;
};

export class AnthropicInterviewerModel implements InterviewerModel {
  private client: Anthropic;
  private modelId: string;
  private layout: PromptLayout;
  private options: AnthropicRequestOptions;

  constructor(modelId: string = INTERVIEWER_MODEL_ID, layout: PromptLayout = promptLayoutFromEnv(), options: AnthropicRequestOptions = {}) {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.modelId = modelId;
    this.layout = layout;
    this.options = options;
  }

  async runTurn(ctx: TurnContext): Promise<ModelTurn> {
    return collectTurn(this.streamTurn(ctx));
  }

  // The turn, streamed (spec 2026-10-06-plan-owns-decisions §4): the say
  // text streams by sentence first, then the declarations close, then the
  // question. One regeneration for an unknown id (caught when `requests`
  // closes), an unparseable reply or an empty turn — only while the caller
  // has delivered nothing; once "say" is spoken, unknown ids are dropped
  // (resolveRequests).
  async *streamTurn(ctx: TurnContext): AsyncGenerator<TurnEvent> {
    const first = buildRequest(ctx, this.layout);
    const canRegenerate = () => ctx.canRegenerate?.() ?? true;

    let attempt = yield* this.attempt(first.system, first.messages, ctx);
    let retried = false;
    const needsRetry = (a: Attempt) => !a.refused && (a.turn === null || a.unknown.length > 0 || (!a.turn.say && !a.turn.question));
    if (needsRetry(attempt) && canRegenerate()) {
      retried = true;
      const note = retryNote(attempt, ctx.validIds ?? []);
      console.warn('[interviewer-model] regenerating:', note);
      yield { type: 'restart', reason: note };
      ctx.onMark?.('model_regenerate');
      const retry = buildRequest(ctx, this.layout, note);
      attempt = yield* this.attempt(retry.system, retry.messages, ctx, 'retry_');
    }

    const turn = attempt.turn && (attempt.turn.say || attempt.turn.question) ? attempt.turn : NEUTRAL_TURN;
    const validation: TurnValidation = {
      unknownIds: attempt.unknown, emptyTurn: !attempt.turn || (!attempt.turn.say && !attempt.turn.question),
      retried, unparsed: attempt.turn === null && !attempt.refused, refused: attempt.refused,
    };
    ctx.onValidation?.(validation);
    yield { type: 'done', turn, validation };
  }

  // One streamed request. Returns early (aborting the stream) when the
  // declared requests name an id the case doesn't have and a regeneration is
  // still possible.
  private async *attempt(
    system: Anthropic.Beta.BetaTextBlockParam[],
    messages: Anthropic.Beta.BetaMessageParam[],
    ctx: TurnContext,
    markPrefix = '',
  ): AsyncGenerator<TurnEvent, Attempt> {
    // Thinking off: Sonnet 5.5 rejects {type: "disabled"}; "between_tools"
    // is how it runs without thinking (batch 6: thinking turns took 4.1s).
    // The structured format keeps reasoning out of speech. With the
    // server-side fallback, a declined request re-runs on another model.
    ctx.onMark?.(`${markPrefix}model_request`);
    const { thinking = 'between_tools', effort, fallbacks = true } = this.options;
    const stream = this.client.beta.messages.stream({
      model: this.modelId,
      max_tokens: 1024,
      system,
      messages,
      output_config: { format: { type: 'json_schema', schema: TURN_SCHEMA }, ...(effort ? { effort } : {}) },
      thinking: { type: thinking },
      ...(fallbacks ? { betas: [FALLBACK_BETA], fallbacks: FALLBACKS } : {}),
    });
    const parser = new TurnStreamParser();
    let unknown: string[] = [];
    for await (const ev of stream as AsyncIterable<{ type: string; delta?: { type: string; text?: string } }>) {
      if (ev.type !== 'content_block_delta' || ev.delta?.type !== 'text_delta') continue;
      ctx.onMark?.(`${markPrefix}model_first_token`);
      for (const p of parser.push(ev.delta.text ?? '')) {
        if (p.type === 'sentence') { yield p; continue; }
        if (p.key === 'requests' && ctx.resolveId) {
          unknown = unknownIds(toRequests(p.value), ctx.resolveId);
          if (unknown.length > 0 && (ctx.canRegenerate?.() ?? true)) {
            (stream as unknown as { abort?: () => void }).abort?.();
            console.warn('[interviewer-model] unknown ids declared:', JSON.stringify(unknown));
            return { turn: parseTurn(parser.text), refused: false, unknown };
          }
        }
        if (TURN_KEYS.has(p.key)) yield { type: 'field', key: p.key as 'move', value: p.value };
      }
    }
    const r = await (stream as unknown as { finalMessage(): Promise<Anthropic.Beta.BetaMessage> }).finalMessage();
    ctx.onUsage?.({
      component: 'interviewer',
      model: this.modelId,
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
      cacheReadTokens: r.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: r.usage.cache_creation_input_tokens ?? 0,
    });
    console.log('[interviewer-model] raw response:', parser.text);
    if (r.stop_reason === 'refusal') {
      console.warn('[interviewer-model] refusal:', JSON.stringify(r.stop_details));
      return { turn: null, refused: true, unknown: [] };
    }
    return { turn: parseTurn(parser.text), refused: false, unknown };
  }
}

// Unknown ids first: a draft aborted at `requests` is also unparseable.
export function retryNote(a: Attempt, validIds: string[]): string {
  if (a.unknown.length > 0) {
    return `Your previous draft named ids the case doesn't have: ${a.unknown.map(i => `"${i}"`).join(', ')}. Write the whole turn again; use only these ids in item_ids: ${validIds.map(i => `"${i}"`).join(', ') || 'none'}. If the case doesn't have what was asked for, leave item_ids empty.`;
  }
  if (a.turn === null) return 'Your previous draft of this turn was not a complete JSON object. Write the whole turn again as one JSON object.';
  return 'Your previous draft had nothing to say and no question. Write the whole turn again as one JSON object.';
}

// Where the per-turn case state goes (A/B, 7 Oct):
// - 'state-in-system' (default): fixed instructions (cached), then the state
//   as a second system block — ahead of the history, so the history is never
//   cached and is resent in full every turn.
// - 'cached-history': fixed instructions (cached); the history cached
//   incrementally (a breakpoint on the last earlier message, so each turn
//   reads the previous turn's prefix); the state after the candidate's
//   message as a mid-conversation system message (Sonnet 5.5). The batch-8
//   replay that measured this order at +310ms ran each turn cold, so it could
//   not see the cache benefit.
export type PromptLayout = 'state-in-system' | 'cached-history';

export function promptLayoutFromEnv(): PromptLayout {
  return process.env.INTERVIEWER_PROMPT_LAYOUT === 'cached-history' ? 'cached-history' : 'state-in-system';
}

type Request = { system: Anthropic.Beta.BetaTextBlockParam[]; messages: Anthropic.Beta.BetaMessageParam[] };
const systemMessage = (text: string) => ({ role: 'system', content: text }) as unknown as Anthropic.Beta.BetaMessageParam;

export function buildRequest(ctx: Pick<TurnContext, 'systemPrompt' | 'turnSystem' | 'history'>, layout: PromptLayout, retry?: string): Request {
  const history: Anthropic.Beta.BetaMessageParam[] = ctx.history.map(m => ({ role: m.role, content: m.content }));
  if (layout === 'state-in-system') {
    return {
      system: buildSystemBlocks(ctx.systemPrompt, ctx.turnSystem),
      messages: retry ? [...history, systemMessage(retry)] : history,
    };
  }
  // Breakpoint on the message before the candidate's current one.
  const marked = history.map((m, i) => i === history.length - 2 && typeof m.content === 'string'
    ? { role: m.role, content: [{ type: 'text' as const, text: m.content, cache_control: { type: 'ephemeral' as const } }] }
    : m);
  // One system message after the candidate's turn: two in a row are not allowed.
  const state = [ctx.turnSystem, retry].filter(Boolean).join('\n\n');
  return {
    system: buildSystemBlocks(ctx.systemPrompt),
    messages: state ? [...marked, systemMessage(state)] : marked,
  };
}

// System prompt with prompt caching (latency plan step 3). The breakpoint on
// the fixed instructions caches them (~5k tokens); the per-turn case state
// follows in `system`, uncached. Replay (batch 8): moving the state after the
// candidate's message added ~310ms, so it stays in `system`.
export function buildSystemBlocks(stable: string, turn?: string): Anthropic.Beta.BetaTextBlockParam[] {
  const blocks: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: stable, cache_control: { type: 'ephemeral' } }];
  if (turn) blocks.push({ type: 'text', text: turn });
  return blocks;
}
