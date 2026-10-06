import Anthropic from '@anthropic-ai/sdk';
import type { InterviewerModel, TurnContext, TurnEvent, TurnValidation } from './interface';
import { INTERVIEWER_MODEL_ID, FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { TURN_SCHEMA, parseTurn, toRequests, unknownIds, type ModelTurn } from './turn-schema';
import { TurnStreamParser } from './turn-stream';
import { collectTurn, NEUTRAL_TURN } from './turn-events';

export { INTERVIEWER_MODEL_ID } from '@/lib/models';

const TURN_KEYS = new Set(['move', 'requests', 'exhibit', 'rescue_item', 'say', 'question']);

type Attempt = { turn: ModelTurn | null; refused: boolean; unknown: string[] };

export class AnthropicInterviewerModel implements InterviewerModel {
  private client: Anthropic;
  private modelId: string;

  constructor(modelId: string = INTERVIEWER_MODEL_ID) {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.modelId = modelId;
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
    const messages: Anthropic.Beta.BetaMessageParam[] = ctx.history.map(m => ({ role: m.role, content: m.content }));
    const system = buildSystemBlocks(ctx.systemPrompt, ctx.turnSystem);
    const canRegenerate = () => ctx.canRegenerate?.() ?? true;

    let attempt = yield* this.attempt(system, messages, ctx);
    let retried = false;
    const needsRetry = (a: Attempt) => !a.refused && (a.turn === null || a.unknown.length > 0 || (!a.turn.say && !a.turn.question));
    if (needsRetry(attempt) && canRegenerate()) {
      retried = true;
      const note = retryNote(attempt, ctx.validIds ?? []);
      console.warn('[interviewer-model] regenerating:', note);
      yield { type: 'restart', reason: note };
      attempt = yield* this.attempt(system, [...messages, { role: 'system', content: note } as unknown as Anthropic.Beta.BetaMessageParam], ctx);
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
  ): AsyncGenerator<TurnEvent, Attempt> {
    // Thinking off: Sonnet 5.5 rejects {type: "disabled"}; "between_tools"
    // is how it runs without thinking (batch 6: thinking turns took 4.1s).
    // The structured format keeps reasoning out of speech. With the
    // server-side fallback, a declined request re-runs on another model.
    const stream = this.client.beta.messages.stream({
      model: this.modelId,
      max_tokens: 1024,
      system,
      messages,
      output_config: { format: { type: 'json_schema', schema: TURN_SCHEMA } },
      thinking: { type: 'between_tools' },
      betas: [FALLBACK_BETA],
      fallbacks: FALLBACKS,
    });
    const parser = new TurnStreamParser();
    let unknown: string[] = [];
    for await (const ev of stream as AsyncIterable<{ type: string; delta?: { type: string; text?: string } }>) {
      if (ev.type !== 'content_block_delta' || ev.delta?.type !== 'text_delta') continue;
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
function retryNote(a: Attempt, validIds: string[]): string {
  if (a.unknown.length > 0) {
    return `Your previous draft named ids the case doesn't have: ${a.unknown.map(i => `"${i}"`).join(', ')}. Write the whole turn again; use only these ids in item_ids: ${validIds.map(i => `"${i}"`).join(', ') || 'none'}. If the case doesn't have what was asked for, leave item_ids empty.`;
  }
  if (a.turn === null) return 'Your previous draft of this turn was not a complete JSON object. Write the whole turn again as one JSON object.';
  return 'Your previous draft had nothing to say and no question. Write the whole turn again as one JSON object.';
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
