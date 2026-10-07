// Interviewer on Gemini (latency screening, 7 Oct 2026 — not a production
// provider). The same JSON turn (turn-schema.ts) through
// streamGenerateContent, into the same parser and the same one-regeneration
// rule as the other adapters, so the orchestrator cannot tell providers apart.
// Called over fetch — no SDK dependency. Reads GEMINI_API_KEY.
//
// Thinking can't be turned off on Gemini 3.8 Flash; "low" is the floor.
// Thought parts are never the answer. The fixed instructions and this turn's
// state go in the system instruction (state last, so the fixed prefix can be
// cached implicitly); the history is the conversation.
import type { InterviewerModel, TurnContext, TurnEvent, TurnValidation } from './interface';
import { TURN_SCHEMA, parseTurn, toRequests, unknownIds, type ModelTurn } from './turn-schema';
import { TurnStreamParser } from './turn-stream';
import { collectTurn, NEUTRAL_TURN } from './turn-events';
import { TURN_KEYS, retryNote, type Attempt } from './anthropic';
import { SseReader } from './cerebras';

type GeminiChunk = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
  error?: { message?: string };
};

// The turn schema as Gemini's responseJsonSchema takes it (it lists no
// `const`; single-value enums stand in — none today, kept for safety).
export function geminiSchema(x: unknown = TURN_SCHEMA): unknown {
  if (Array.isArray(x)) return x.map(v => geminiSchema(v));
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if ('const' in o) return { type: 'string', enum: [o.const] };
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, geminiSchema(v)]));
  }
  return x;
}

export class GeminiInterviewerModel implements InterviewerModel {
  constructor(
    private modelId: string,
    private thinkingLevel: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async runTurn(ctx: TurnContext): Promise<ModelTurn> {
    return collectTurn(this.streamTurn(ctx));
  }

  async *streamTurn(ctx: TurnContext): AsyncGenerator<TurnEvent> {
    const canRegenerate = () => ctx.canRegenerate?.() ?? true;
    let attempt = yield* this.attempt(ctx);
    let retried = false;
    const needsRetry = (a: Attempt) => a.turn === null || a.unknown.length > 0 || (!a.turn.say && !a.turn.question);
    if (needsRetry(attempt) && canRegenerate()) {
      retried = true;
      const note = retryNote(attempt, ctx.validIds ?? []);
      console.warn('[interviewer-model] regenerating:', note);
      yield { type: 'restart', reason: note };
      ctx.onMark?.('model_regenerate');
      attempt = yield* this.attempt(ctx, note, 'retry_');
    }
    const turn = attempt.turn && (attempt.turn.say || attempt.turn.question) ? attempt.turn : NEUTRAL_TURN;
    const validation: TurnValidation = {
      unknownIds: attempt.unknown, emptyTurn: !attempt.turn || (!attempt.turn.say && !attempt.turn.question),
      retried, unparsed: attempt.turn === null, refused: false,
    };
    ctx.onValidation?.(validation);
    yield { type: 'done', turn, validation };
  }

  private async *attempt(ctx: TurnContext, retry?: string, markPrefix = ''): AsyncGenerator<TurnEvent, Attempt> {
    const abort = new AbortController();
    const body = {
      systemInstruction: { parts: [{ text: [ctx.systemPrompt, ctx.turnSystem, retry].filter(Boolean).join('\n\n') }] },
      contents: ctx.history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: {
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseJsonSchema: geminiSchema(),
        thinkingConfig: { thinkingLevel: this.thinkingLevel },
      },
    };
    ctx.onMark?.(`${markPrefix}model_request`);
    const res = await this.fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
    if (!res.ok || !res.body) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const parser = new TurnStreamParser();
    const sse = new SseReader();
    const decoder = new TextDecoder();
    let unknown: string[] = [];
    let usage: GeminiChunk['usageMetadata'];
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const raw of sse.push(decoder.decode(value, { stream: true }))) {
          if (raw === 'done') continue;
          const chunk = raw as unknown as GeminiChunk;
          if (chunk.error) throw new Error(`Gemini stream error: ${chunk.error.message ?? ''}`);
          if (chunk.usageMetadata) usage = chunk.usageMetadata;
          for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
            if (part.thought) { ctx.onMark?.(`${markPrefix}model_first_reasoning`); continue; }
            if (!part.text) continue;
            ctx.onMark?.(`${markPrefix}model_first_token`);
            for (const p of parser.push(part.text)) {
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
      }
    } finally {
      reader.releaseLock();
    }
    const cached = usage?.cachedContentTokenCount ?? 0;
    ctx.onUsage?.({
      component: 'interviewer',
      model: `gemini/${this.modelId}`,
      inputTokens: (usage?.promptTokenCount ?? 0) - cached,
      outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
      cacheReadTokens: cached,
      cacheWriteTokens: 0,
    });
    console.log('[interviewer-model] raw response:', parser.text);
    return { turn: parseTurn(parser.text), refused: false, unknown };
  }
}
