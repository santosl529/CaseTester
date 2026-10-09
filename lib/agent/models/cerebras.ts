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
import { activeRunBudget } from '@/lib/llm-budget';

// The OpenAI-style chat-completions endpoints this adapter speaks to.
type Endpoint = { url: string; keyEnv: string; label: string; name: string; extraBody?: Record<string, unknown> };
const CEREBRAS: Endpoint = { url: 'https://api.cerebras.ai/v1/chat/completions', keyEnv: 'CEREBRAS_API_KEY', label: 'cerebras', name: 'Cerebras' };
// OpenAI (latency screening of GPT-6 Luna / GPT-6.1 Sol, 7 Oct): usage only
// arrives on the stream when asked for.
const OPENAI: Endpoint = {
  url: 'https://api.openai.com/v1/chat/completions', keyEnv: 'OPENAI_API_KEY', label: 'openai', name: 'OpenAI',
  extraBody: { stream_options: { include_usage: true } },
};

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type Chunk = {
  choices?: { delta?: { content?: string | null; reasoning?: string | null }; finish_reason?: string | null }[];
  usage?: {
    prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

// Fixed instructions first (cached prefix), then the history, then this
// turn's state — and a retry note joined to it, so there is one system
// message at the end. 'leading-system' (Qwen, whose chat template rejects any
// system message after the first — Cerebras 400, 8 Oct): the state joins the
// fixed instructions in the one leading system message, as Sonnet's prompt
// has it; the cached prefix is then the fixed instructions only.
export type MessageLayout = 'state-last' | 'leading-system';
export function buildMessages(ctx: Pick<TurnContext, 'systemPrompt' | 'turnSystem' | 'history'>, retry?: string, layout: MessageLayout = 'state-last'): ChatMessage[] {
  const state = [ctx.turnSystem, retry].filter(Boolean).join('\n\n');
  if (layout === 'leading-system') {
    return [
      { role: 'system', content: [ctx.systemPrompt, state].filter(Boolean).join('\n\n') },
      ...ctx.history.map(m => ({ role: m.role, content: m.content })),
    ];
  }
  return [
    { role: 'system', content: ctx.systemPrompt },
    ...ctx.history.map(m => ({ role: m.role, content: m.content })),
    ...(state ? [{ role: 'system' as const, content: state }] : []),
  ];
}

export function buildBody(model: string, messages: ChatMessage[], reasoningEffort: string, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
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

// Requests per rolling minute, enforced before sending (pay-as-you-go allows
// 5; CEREBRAS_RPM overrides). `now`/`sleep` are injectable for tests.
export class RateLimiter {
  private sent: number[] = [];
  constructor(
    private perMinute: number,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
  ) {}

  async acquire(): Promise<number> {
    let waited = 0;
    for (;;) {
      const t = this.now();
      this.sent = this.sent.filter(x => t - x < 60_000);
      if (this.sent.length < this.perMinute) { this.sent.push(t); return waited; }
      const wait = this.sent[0] + 60_000 - t + 50;
      waited += wait;
      await this.sleep(wait);
    }
  }
}

// How long to wait after a 429: the retry-after header (seconds) if present,
// else exponential backoff from 5s.
export function retryDelayMs(retryAfter: string | null, attempt: number): number {
  const s = retryAfter ? Number(retryAfter) : NaN;
  return Number.isFinite(s) && s >= 0 ? s * 1000 + 100 : 5000 * 2 ** attempt;
}

const MAX_429_RETRIES = 3;

export class CerebrasInterviewerModel implements InterviewerModel {
  private limiter: RateLimiter;
  constructor(
    private modelId: string = CEREBRAS_INTERVIEWER_MODEL_ID,
    private reasoningEffort: string = process.env.CEREBRAS_REASONING_EFFORT ?? 'low',
    private fetchImpl: typeof fetch = fetch,
    limiter?: RateLimiter,
    private sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
    private endpoint: Endpoint = CEREBRAS,
  ) {
    this.limiter = limiter ?? new RateLimiter(Number(process.env.CEREBRAS_RPM ?? 5));
  }

  // One request, under the rate limit; a 429 waits and retries. A wait shows
  // up in the turn's timing (model_rate_wait) — it is latency the candidate
  // would feel.
  private async post(body: unknown, signal: AbortSignal, ctx: TurnContext, markPrefix: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const waited = await this.limiter.acquire();
      if (waited > 0) {
        ctx.onMark?.(`${markPrefix}model_rate_wait`);
        console.warn(`[interviewer-model] ${this.endpoint.label} rate limit: waited ${waited}ms before sending`);
      }
      ctx.onMark?.(`${markPrefix}model_request`);
      const res = await this.fetchImpl(this.endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env[this.endpoint.keyEnv] ?? ''}` },
        body: JSON.stringify(body),
        signal,
      });
      if (res.status !== 429 || attempt >= MAX_429_RETRIES) return res;
      const delay = retryDelayMs(res.headers.get('retry-after'), attempt);
      console.warn(`[interviewer-model] ${this.endpoint.label} 429 — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_429_RETRIES})`);
      await res.body?.cancel();
      await this.sleep(delay);
    }
  }

  async runTurn(ctx: TurnContext): Promise<ModelTurn> {
    return collectTurn(this.streamTurn(ctx));
  }

  async *streamTurn(ctx: TurnContext): AsyncGenerator<TurnEvent> {
    const canRegenerate = () => ctx.canRegenerate?.() ?? true;
    const layout: MessageLayout = this.modelId.startsWith('qwen') ? 'leading-system' : 'state-last';
    let attempt = yield* this.attempt(buildMessages(ctx, undefined, layout), ctx);
    let retried = false;
    const needsRetry = (a: Attempt) => a.turn === null || a.unknown.length > 0 || (!a.turn.say && !a.turn.question);
    if (needsRetry(attempt) && canRegenerate()) {
      retried = true;
      const note = retryNote(attempt, ctx.validIds ?? []);
      console.warn('[interviewer-model] regenerating:', note);
      yield { type: 'restart', reason: note };
      ctx.onMark?.('model_regenerate');
      attempt = yield* this.attempt(buildMessages(ctx, note, layout), ctx, 'retry_');
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
    // Under a run budget (lib/llm-budget.ts) each attempt is checked before it
    // is sent — an unpriced model is refused — and recorded from the stream's
    // usage, or estimated from the characters if the stream was cut short.
    const budget = activeRunBudget();
    const usageModel = `${this.endpoint.label}/${this.modelId}`;
    budget?.check(usageModel);
    const abort = new AbortController();
    const res = await this.post(buildBody(this.modelId, messages, this.reasoningEffort, this.endpoint.extraBody), abort.signal, ctx, markPrefix);
    if (!res.ok || !res.body) {
      throw new Error(`${this.endpoint.name} ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
      if (budget) {
        const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
        budget.record(usage
          ? { model: usageModel, inputTokens: (usage.prompt_tokens ?? 0) - cachedTokens, outputTokens: usage.completion_tokens ?? 0,
              cacheReadTokens: cachedTokens, cacheWriteTokens: 0, outputEstimated: false }
          : { model: usageModel, inputTokens: Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 3),
              outputTokens: Math.ceil(parser.text.length / 3), cacheReadTokens: 0, cacheWriteTokens: 0, outputEstimated: true });
      }
    }
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
    ctx.onUsage?.({
      component: 'interviewer',
      model: usageModel,
      inputTokens: (usage?.prompt_tokens ?? 0) - cached,
      outputTokens: usage?.completion_tokens ?? 0,
      cacheReadTokens: cached,
      cacheWriteTokens: 0,
      ...(usage?.completion_tokens_details?.reasoning_tokens !== undefined ? { reasoningTokens: usage.completion_tokens_details.reasoning_tokens } : {}),
    });
    console.log('[interviewer-model] raw response:', parser.text);
    return { turn: parseTurn(parser.text), refused: false, unknown };
  }
}

// The same adapter on OpenAI (latency screening, 7 Oct — not a production
// provider): GPT-6 Luna at reasoning "none", GPT-6.1 Sol at "low" (its
// lowest). No client-side rate limit; reads OPENAI_API_KEY.
export class OpenAIInterviewerModel extends CerebrasInterviewerModel {
  constructor(modelId: string, reasoningEffort: string, fetchImpl: typeof fetch = fetch) {
    super(modelId, reasoningEffort, fetchImpl, new RateLimiter(Number.POSITIVE_INFINITY), undefined, OPENAI);
  }
}
