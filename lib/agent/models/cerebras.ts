// Interviewer on Cerebras (experiment, 7 Oct 2026). The same JSON turn
// (turn-schema.ts) through Cerebras's OpenAI-style chat completions API,
// streamed into the same parser, so the orchestrator cannot tell the
// providers apart. Called over fetch — no SDK dependency. Reads
// CEREBRAS_API_KEY from the environment.
//
// Differences from the Anthropic adapter: no server-side refusal fallback;
// prompt caching is automatic on the prefix, so the fixed instructions come
// first and the per-turn state goes last (after the history) as a system
// message; gpt-oss reasons before answering, at reasoning_effort "low".
import type { InterviewerModel, TurnContext, TurnEvent, TurnValidation } from './interface';
import { CEREBRAS_INTERVIEWER_MODEL_ID } from '@/lib/models';
import { TURN_SCHEMA, parseTurn, toRequests, unknownIds, type ModelTurn } from './turn-schema';
import { TurnStreamParser } from './turn-stream';
import { collectTurn, NEUTRAL_TURN } from './turn-events';
import { TURN_KEYS, retryNote, type Attempt } from './anthropic';

const URL = 'https://api.cerebras.ai/v1/chat/completions';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type Chunk = {
  choices?: { delta?: { content?: string | null; reasoning?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
};

// Fixed instructions first (cached prefix), then the history, then this
// turn's state — and a retry note joined to it, so there is one system
// message at the end.
export function buildMessages(ctx: Pick<TurnContext, 'systemPrompt' | 'turnSystem' | 'history'>, retry?: string): ChatMessage[] {
  const state = [ctx.turnSystem, retry].filter(Boolean).join('\n\n');
  return [
    { role: 'system', content: ctx.systemPrompt },
    ...ctx.history.map(m => ({ role: m.role, content: m.content })),
    ...(state ? [{ role: 'system' as const, content: state }] : []),
  ];
}

export function buildBody(model: string, messages: ChatMessage[], reasoningEffort: string) {
  return {
    model,
    messages,
    stream: true,
    // High reasoning can spend the budget before the JSON closes (replay, 7 Oct).
    max_completion_tokens: Number(process.env.CEREBRAS_MAX_TOKENS ?? 2048),
    reasoning_effort: reasoningEffort,
    response_format: { type: 'json_schema', json_schema: { name: 'interviewer_turn', strict: true, schema: TURN_SCHEMA } },
  };
}

// Server-sent events → parsed chunks. Partial lines are carried over.
export class SseReader {
  private rest = '';
  push(text: string): (Chunk | 'done')[] {
    const lines = (this.rest + text).split('\n');
    this.rest = lines.pop() ?? '';
    const out: (Chunk | 'done')[] = [];
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith('data:')) continue;
      const data = l.slice(5).trim();
      if (data === '[DONE]') { out.push('done'); continue; }
      try { out.push(JSON.parse(data) as Chunk); } catch { /* malformed chunk: skipped */ }
    }
    return out;
  }
}

export class CerebrasInterviewerModel implements InterviewerModel {
  constructor(
    private modelId: string = CEREBRAS_INTERVIEWER_MODEL_ID,
    private reasoningEffort: string = process.env.CEREBRAS_REASONING_EFFORT ?? 'low',
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async runTurn(ctx: TurnContext): Promise<ModelTurn> {
    return collectTurn(this.streamTurn(ctx));
  }

  async *streamTurn(ctx: TurnContext): AsyncGenerator<TurnEvent> {
    const canRegenerate = () => ctx.canRegenerate?.() ?? true;
    let attempt = yield* this.attempt(buildMessages(ctx), ctx);
    let retried = false;
    const needsRetry = (a: Attempt) => a.turn === null || a.unknown.length > 0 || (!a.turn.say && !a.turn.question);
    if (needsRetry(attempt) && canRegenerate()) {
      retried = true;
      const note = retryNote(attempt, ctx.validIds ?? []);
      console.warn('[interviewer-model] regenerating:', note);
      yield { type: 'restart', reason: note };
      ctx.onMark?.('model_regenerate');
      attempt = yield* this.attempt(buildMessages(ctx, note), ctx, 'retry_');
    }
    const turn = attempt.turn && (attempt.turn.say || attempt.turn.question) ? attempt.turn : NEUTRAL_TURN;
    const validation: TurnValidation = {
      unknownIds: attempt.unknown, emptyTurn: !attempt.turn || (!attempt.turn.say && !attempt.turn.question),
      retried, unparsed: attempt.turn === null, refused: false,
    };
    ctx.onValidation?.(validation);
    yield { type: 'done', turn, validation };
  }

  private async *attempt(messages: ChatMessage[], ctx: TurnContext, markPrefix = ''): AsyncGenerator<TurnEvent, Attempt> {
    const abort = new AbortController();
    ctx.onMark?.(`${markPrefix}model_request`);
    const res = await this.fetchImpl(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CEREBRAS_API_KEY ?? ''}` },
      body: JSON.stringify(buildBody(this.modelId, messages, this.reasoningEffort)),
      signal: abort.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`Cerebras ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const parser = new TurnStreamParser();
    const sse = new SseReader();
    const decoder = new TextDecoder();
    let unknown: string[] = [];
    let usage: Chunk['usage'];
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const chunk of sse.push(decoder.decode(value, { stream: true }))) {
          if (chunk === 'done') continue;
          if (chunk.usage) usage = chunk.usage;
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.reasoning) ctx.onMark?.(`${markPrefix}model_first_reasoning`);
          if (!delta?.content) continue;
          ctx.onMark?.(`${markPrefix}model_first_token`);
          for (const p of parser.push(delta.content)) {
            if (p.type === 'sentence') { yield p; continue; }
            if (p.key === 'requests' && ctx.resolveId) {
              unknown = unknownIds(toRequests(p.value), ctx.resolveId);
              if (unknown.length > 0 && (ctx.canRegenerate?.() ?? true)) {
                abort.abort();
                console.warn('[interviewer-model] unknown ids declared:', JSON.stringify(unknown));
                return { turn: parseTurn(parser.text), refused: false, unknown };
              }
            }
            if (TURN_KEYS.has(p.key)) yield { type: 'field', key: p.key as 'move', value: p.value };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
    ctx.onUsage?.({
      component: 'interviewer',
      model: `cerebras/${this.modelId}`,
      inputTokens: (usage?.prompt_tokens ?? 0) - cached,
      outputTokens: usage?.completion_tokens ?? 0,
      cacheReadTokens: cached,
      cacheWriteTokens: 0,
    });
    console.log('[interviewer-model] raw response:', parser.text);
    return { turn: parseTurn(parser.text), refused: false, unknown };
  }
}
