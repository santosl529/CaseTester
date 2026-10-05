# Streaming Interviewer Turn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the interviewer turn into Plan → Stream → Settle so the first sentence can be delivered while Sonnet is still writing, with every guard and guarantee intact.

**Architecture:** The model streams its JSON action list; an incremental parser emits sentences and actions. A pure Plan stage decides everything the model call needs. Stream delivers a sentence only if every gate passes it unchanged (else the rest of the turn is buffered), holds trailing questions, and waits for the distress verdict before delivering anything. Settle runs today's post-model pipeline unchanged on the full action list, delivers only the text after the already-delivered prefix, then commits all writes once.

**Tech Stack:** TypeScript, Next.js route handlers, `@anthropic-ai/sdk` (`client.beta.messages.stream`), drizzle, vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-streaming-turn-design.md`

## Global Constraints

- Work happens in an isolated git worktree on branch `streaming-turn` (created at execution start with superpowers:using-git-worktrees). `main`/`latency-json-output` are untouched until the user approves a merge.
- No voice library anywhere; `lib/orchestrator`, `lib/agent`, `lib/scoring` must not import `lib/voice` (lint boundary).
- Model ids only from `lib/models.ts`; the interviewer request stays as today: `output_config.format` JSON schema, `thinking: { type: 'between_tools' }`, `betas: [FALLBACK_BETA]`, `fallbacks: FALLBACKS`, cached fixed system block.
- `TurnResult` response shape and `components/chat-window.tsx` unchanged.
- Decisions D1–D4 (spec §3): wait for the distress verdict before any delivery; buffer late-case turns; reveals booked on delivery; trailing questions held until the stream ends.
- Commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. One commit per task, tests passing. Checkpoint with the user after each task.
- No API-costing run (smoke run, persona batch) without the user's OK and a cost estimate.

## Review Focus

- A sentence terminator inside a figure ("$4.2M", "58.5%") must not split; abbreviations ("e.g. ") split the same way the guards' `(?<=[.!?])\s+` regex does → Task 1 test.
- A JSON escape (`\"`, `—`) split across two stream chunks must decode to the same text as one chunk → Task 1 test.
- The model regenerating after something was already delivered would repeat or contradict speech → Task 2 test: `canRegenerate` false blocks the retry.
- A distress verdict arriving after sentences were held must leave nothing delivered → Task 6 test.
- A reveal after a delivered question, or text after `end_case`, must not be spoken out of order → Task 6 tests (question hold, end_case switch) and Task 7 prefix-lock test.

## File Structure

| File | Responsibility |
|---|---|
| `lib/agent/models/json-action-stream.ts` (new) | `ActionStreamParser`: raw JSON chunks → sentence/action events |
| `lib/agent/models/interface.ts` | `TurnEvent` type; optional `streamTurn` on `InterviewerModel`; `canRegenerate` on `TurnContext` |
| `lib/agent/models/turn-events.ts` (new) | `collectActions`, `eventsFromActions` helpers |
| `lib/agent/models/anthropic.ts` | `streamTurn` (stream + regeneration rules); `runTurn` collects it |
| `lib/agent/interviewer.ts` | `streamInterviewerTurn` (phase filter); `runInterviewerTurn` collects it |
| `lib/orchestrator/turn-types.ts` (new) | `TurnResult`, `ExhibitDisplay`, `Segment`, `SegmentSink`, `PendingEvent`, `TurnCtx`, `ModelState`, `TurnPlan` |
| `lib/orchestrator/plan-turn.ts` (new) | `planTurn(reads, candidateText, deps): TurnPlan` — pure |
| `lib/orchestrator/settle-turn.ts` (new) | `settleTurn` (today's post-model pipeline), `tailAfterDelivered`, `commitTurn`, `commitScripted` |
| `lib/orchestrator/stream-turn.ts` (new) | `streamTurnSegments`: distress gate, pass-or-buffer gates, question hold, segments |
| `lib/orchestrator/session-runner.ts` | Coordinator: reads → plan → stream → settle → deliver tail → commit; `runSilence` unchanged |
| `app/api/channel/[sessionId]/turn/route.ts` | Unchanged call (`runTurn` collects segments internally) |

---

### Task 1: Incremental action-stream parser

**Files:**
- Create: `lib/agent/models/json-action-stream.ts`
- Test: `tests/agent/json-action-stream.test.ts`

**Interfaces:**
- Consumes: `RawAction` from `lib/agent/models/json-actions.ts`
- Produces: `class ActionStreamParser { push(chunk: string): ParsedEvent[]; readonly text: string }`, `type ParsedEvent = { type: 'sentence'; text: string; sayIndex: number } | { type: 'action'; raw: RawAction; index: number }`

- [ ] **Step 0: Create the worktree** — invoke superpowers:using-git-worktrees; branch `streaming-turn` from `latency-json-output` HEAD; run `npm ci`; symlink the untracked run records so the replay corpus runs: `ln -s "<main>/Case Interview Runs" "Case Interview Runs"`; confirm `npm test` passes as the baseline.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/agent/json-action-stream.test.ts
import { describe, it, expect } from 'vitest';
import { ActionStreamParser, type ParsedEvent } from '@/lib/agent/models/json-action-stream';

const TURN = JSON.stringify({ actions: [
  { type: 'say', text: 'Okay. COGS rose from 42% to 58.5% — that is $4.2M per store.' },
  { type: 'reveal_data', item_id: 'bean_costs' },
  { type: 'say', text: 'He said "check it", e.g. against labor. What drove it?' },
  { type: 'advance_phase' },
] });

function run(chunks: string[]): ParsedEvent[] {
  const p = new ActionStreamParser();
  return chunks.flatMap(c => p.push(c));
}
const chunked = (s: string, n: number) => Array.from({ length: Math.ceil(s.length / n) }, (_, i) => s.slice(i * n, i * n + n));

const EXPECTED: ParsedEvent[] = [
  { type: 'sentence', text: 'Okay.', sayIndex: 0 },
  { type: 'sentence', text: 'COGS rose from 42% to 58.5% — that is $4.2M per store.', sayIndex: 0 },
  { type: 'action', raw: { type: 'say', text: 'Okay. COGS rose from 42% to 58.5% — that is $4.2M per store.' }, index: 0 },
  { type: 'action', raw: { type: 'reveal_data', item_id: 'bean_costs' }, index: 1 },
  { type: 'sentence', text: 'He said "check it", e.g.', sayIndex: 1 },
  { type: 'sentence', text: 'against labor.', sayIndex: 1 },
  { type: 'sentence', text: 'What drove it?', sayIndex: 1 },
  { type: 'action', raw: { type: 'say', text: 'He said "check it", e.g. against labor. What drove it?' }, index: 2 },
  { type: 'action', raw: { type: 'advance_phase' }, index: 3 },
];

describe('ActionStreamParser', () => {
  it('emits sentences and actions from one chunk', () => {
    expect(run([TURN])).toEqual(EXPECTED);
  });
  it('gives the same events whatever the chunk size', () => {
    for (const n of [1, 2, 3, 5, 7, 13]) expect(run(chunked(TURN, n))).toEqual(EXPECTED);
  });
  it('decodes escapes split across chunks', () => {
    const s = '{"actions":[{"type":"say","text":"A dash \\u2014 here. Then \\"quoted\\"."}]}';
    for (const n of [1, 2, 4]) {
      const sentences = run(chunked(s, n)).filter(e => e.type === 'sentence').map(e => (e as { text: string }).text);
      expect(sentences).toEqual(['A dash — here.', 'Then "quoted".']);
    }
  });
  it('does not split inside figures', () => {
    const s = '{"actions":[{"type":"say","text":"Margin fell 18.0 points to 6.5%."}]}';
    expect(run(chunked(s, 1)).filter(e => e.type === 'sentence')).toEqual([
      { type: 'sentence', text: 'Margin fell 18.0 points to 6.5%.', sayIndex: 0 },
    ]);
  });
  it('emits nothing for an unfinished sentence when the stream is cut off', () => {
    const p = new ActionStreamParser();
    const ev = p.push('{"actions":[{"type":"say","text":"Walk me through');
    expect(ev).toEqual([]);
    expect(p.text).toBe('{"actions":[{"type":"say","text":"Walk me through');
  });
  it('treats only a "text" value inside an action as speech', () => {
    const s = '{"actions":[{"type":"show_exhibit","exhibit_id":"text. Not speech."}]}';
    expect(run([s]).filter(e => e.type === 'sentence')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agent/json-action-stream.test.ts`
Expected: FAIL — cannot resolve `@/lib/agent/models/json-action-stream`.

- [ ] **Step 3: Implement**

```ts
// lib/agent/models/json-action-stream.ts
// Incremental reader for the interviewer's JSON turn ({"actions":[...]}, see
// json-actions.ts) as it streams. Emits each complete sentence of a "say"
// text as soon as it is written — the unit voice hands to TTS — and each
// action when its object closes. Sentences split on . ? ! followed by
// whitespace, or at the end of the string: the same boundary the guards use
// ((?<=[.!?])\s+), so "58.5%" never splits. The final action list is still
// parsed from the whole text (parseResponse) at the end of the stream.
import type { RawAction } from './json-actions';

export type ParsedEvent =
  | { type: 'sentence'; text: string; sayIndex: number }
  | { type: 'action'; raw: RawAction; index: number };

const ACTION_DEPTH = 3; // { root  [ actions  { action
const TEXT_KEY = /"text"\s*:\s*$/;

export class ActionStreamParser {
  private buf = '';
  private pos = 0;
  private depth = 0;
  private inStr = false;
  private inSayText = false;
  private objStart = -1;
  private actionIndex = 0;
  private sayIndex = -1;
  private sentence = '';

  get text(): string { return this.buf; }

  push(chunk: string): ParsedEvent[] {
    this.buf += chunk;
    const out: ParsedEvent[] = [];
    while (this.pos < this.buf.length) {
      const c = this.buf[this.pos];
      if (this.inStr) {
        if (c === '\\') {
          const need = this.buf[this.pos + 1] === 'u' ? 6 : 2;
          if (this.pos + need > this.buf.length) break; // rest of the escape not here yet
          if (this.inSayText) this.sentence += JSON.parse(`"${this.buf.slice(this.pos, this.pos + need)}"`) as string;
          this.pos += need;
          continue;
        }
        if (c === '"') {
          if (this.inSayText) this.flush(out);
          this.inStr = false;
          this.inSayText = false;
          this.pos++;
          continue;
        }
        if (this.inSayText && /[.?!]/.test(c)) {
          if (this.pos + 1 >= this.buf.length) break; // the next char decides the boundary
          this.sentence += c;
          if (/\s/.test(this.buf[this.pos + 1])) this.flush(out);
          this.pos++;
          continue;
        }
        if (this.inSayText) this.sentence += c;
        this.pos++;
        continue;
      }
      if (c === '"') {
        this.inStr = true;
        this.inSayText = this.depth === ACTION_DEPTH && this.objStart >= 0
          && TEXT_KEY.test(this.buf.slice(this.objStart, this.pos));
        if (this.inSayText) { this.sayIndex++; this.sentence = ''; }
      } else if (c === '{' || c === '[') {
        this.depth++;
        if (c === '{' && this.depth === ACTION_DEPTH) this.objStart = this.pos;
      } else if (c === '}' || c === ']') {
        if (c === '}' && this.depth === ACTION_DEPTH && this.objStart >= 0) {
          try {
            out.push({ type: 'action', raw: JSON.parse(this.buf.slice(this.objStart, this.pos + 1)) as RawAction, index: this.actionIndex++ });
          } catch { /* malformed object: left to the final parse */ }
          this.objStart = -1;
        }
        this.depth--;
      }
      this.pos++;
    }
    return out;
  }

  private flush(out: ParsedEvent[]): void {
    const text = this.sentence.trim();
    if (text) out.push({ type: 'sentence', text, sayIndex: this.sayIndex });
    this.sentence = '';
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/agent/json-action-stream.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add lib/agent/models/json-action-stream.ts tests/agent/json-action-stream.test.ts
git commit -m "feat(interviewer): incremental parser for the streamed JSON turn"
```

---

### Task 2: Model layer streams the turn

**Files:**
- Modify: `lib/agent/models/interface.ts`
- Create: `lib/agent/models/turn-events.ts`
- Modify: `lib/agent/models/anthropic.ts:68-145` (`runTurn`)
- Modify test: `tests/agent/anthropic-json-turn.test.ts` (stub `stream` instead of `create`)
- Test: `tests/agent/anthropic-stream-turn.test.ts`

**Interfaces:**
- Consumes: `ActionStreamParser` (Task 1); `parseResponse`, `normalizeActions`, `retryNote`, `RESPONSE_SCHEMA`, `RESPONSE_FORMAT` (json-actions.ts)
- Produces:
  ```ts
  // interface.ts
  export type TurnEvent =
    | { type: 'sentence'; text: string; sayIndex: number }
    | { type: 'action'; action: Exclude<Action, { type: 'speak' }> }
    | { type: 'restart'; reason: string }
    | { type: 'done'; actions: Action[]; report: ValidationReport; retried: boolean; unparsed: boolean; refused: boolean };
  // TurnContext gains: canRegenerate?: () => boolean   (default: true)
  // InterviewerModel gains: streamTurn?(ctx: TurnContext): AsyncIterable<TurnEvent>
  // turn-events.ts
  export async function collectActions(events: AsyncIterable<TurnEvent>): Promise<Action[]>;
  export async function* eventsFromActions(actions: Promise<Action[]>): AsyncGenerator<TurnEvent>;
  ```

- [ ] **Step 1: Add the types** to `interface.ts` exactly as in Interfaces above (import `Action` already present; import `ValidationReport` already present). `streamTurn` is optional so the replay script's Gemini model and test mocks that implement only `runTurn` keep compiling.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/agent/anthropic-stream-turn.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AnthropicInterviewerModel } from '@/lib/agent/models/anthropic';
import type { TurnContext, TurnEvent } from '@/lib/agent/models/interface';

// A fake BetaMessageStream: async-iterates text deltas, then finalMessage().
function fakeStream(text: string, stop_reason = 'end_turn', chunk = 7) {
  const events = Array.from({ length: Math.ceil(text.length / chunk) }, (_, i) => ({
    type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(i * chunk, i * chunk + chunk) },
  }));
  return {
    async *[Symbol.asyncIterator]() { for (const e of events) yield e; },
    finalMessage: async () => ({
      content: [{ type: 'text', text }], stop_reason, stop_details: null,
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    }),
  };
}
function stubbed(replies: { text: string; stop_reason?: string }[]) {
  const model = new AnthropicInterviewerModel('test-model');
  const stream = vi.fn();
  for (const r of replies) stream.mockReturnValueOnce(fakeStream(r.text, r.stop_reason));
  (model as unknown as { client: unknown }).client = { beta: { messages: { stream } } };
  return { model, stream };
}
const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({
  systemPrompt: 'FIXED', turnSystem: 'STATE',
  history: [{ role: 'user', content: 'Can I see the cost breakdown?' }], tools: [],
  idValidators: { reveal_data: { idKey: 'item_id', resolve: raw => (raw === 'cogs_pct' ? raw : null), validOptions: ['cogs_pct'] } },
  ...over,
});
async function all(it: AsyncIterable<TurnEvent>) { const out: TurnEvent[] = []; for await (const e of it) out.push(e); return out; }

describe('AnthropicInterviewerModel.streamTurn', () => {
  it('streams sentences and resolved actions, then done', async () => {
    const { model } = stubbed([{ text: '{"actions":[{"type":"say","text":"Okay. Here it is."},{"type":"reveal_data","item_id":"cogs_pct"},{"type":"say","text":"What stands out?"}]}' }]);
    const ev = await all(model.streamTurn!(ctx()));
    expect(ev.filter(e => e.type !== 'done')).toEqual([
      { type: 'sentence', text: 'Okay.', sayIndex: 0 },
      { type: 'sentence', text: 'Here it is.', sayIndex: 0 },
      { type: 'action', action: { type: 'reveal_data', itemId: 'cogs_pct' } },
      { type: 'sentence', text: 'What stands out?', sayIndex: 1 },
    ]);
    expect(ev.at(-1)).toMatchObject({ type: 'done', retried: false, actions: [
      { type: 'speak', text: 'Okay. Here it is.' }, { type: 'reveal_data', itemId: 'cogs_pct' }, { type: 'speak', text: 'What stands out?' },
    ] });
  });
  it('skips an unresolvable id mid-stream and regenerates once', async () => {
    const { model, stream } = stubbed([
      { text: '{"actions":[{"type":"reveal_data","item_id":"bogus"}]}' },
      { text: '{"actions":[{"type":"reveal_data","item_id":"cogs_pct"}]}' },
    ]);
    const ev = await all(model.streamTurn!(ctx()));
    expect(stream).toHaveBeenCalledTimes(2);
    expect(ev.map(e => e.type)).toEqual(['restart', 'action', 'done']);
  });
  it('does not regenerate once the caller has delivered something', async () => {
    const { model, stream } = stubbed([{ text: '{"actions":[{"type":"say","text":"Okay."},{"type":"reveal_data","item_id":"bogus"}]}' }]);
    const ev = await all(model.streamTurn!(ctx({ canRegenerate: () => false })));
    expect(stream).toHaveBeenCalledTimes(1);
    expect(ev.at(-1)).toMatchObject({ type: 'done', retried: false, actions: [{ type: 'speak', text: 'Okay.' }] });
  });
  it('returns the neutral continuation on a refusal, without regenerating', async () => {
    const { model, stream } = stubbed([{ text: '', stop_reason: 'refusal' }]);
    const ev = await all(model.streamTurn!(ctx()));
    expect(stream).toHaveBeenCalledTimes(1);
    expect(ev.at(-1)).toMatchObject({ type: 'done', refused: true, actions: [{ type: 'speak', text: 'I see. What would you like to explore next?' }] });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/agent/anthropic-stream-turn.test.ts`
Expected: FAIL — `model.streamTurn` is not a function.

- [ ] **Step 4: Implement `turn-events.ts`**

```ts
// lib/agent/models/turn-events.ts
// Bridges between the streamed turn and callers that want the whole action list.
import type { Action } from '@/lib/orchestrator/actions';
import type { TurnEvent } from './interface';

export async function collectActions(events: AsyncIterable<TurnEvent>): Promise<Action[]> {
  let actions: Action[] = [];
  for await (const e of events) if (e.type === 'done') actions = e.actions;
  return actions;
}

// A model without streamTurn (test mocks, the replay script's Gemini arm):
// its finished turn as one burst of events.
export async function* eventsFromActions(actions: Promise<Action[]>): AsyncGenerator<TurnEvent> {
  const list = await actions;
  for (const a of list) {
    if (a.type === 'speak') {
      for (const s of a.text.trim().split(/(?<=[.!?])\s+/).filter(Boolean)) yield { type: 'sentence', text: s, sayIndex: 0 };
    } else yield { type: 'action', action: a };
  }
  yield { type: 'done', actions: list, report: { dropped: [], invalidIds: [], empty: list.length === 0, capped: false }, retried: false, unparsed: false, refused: false };
}
```

- [ ] **Step 5: Implement `streamTurn` and make `runTurn` collect it** in `anthropic.ts`. Replace the body of `runTurn` (lines 68–144) with:

```ts
  async runTurn(ctx: TurnContext): Promise<Action[]> {
    return collectActions(this.streamTurn(ctx));
  }

  // One request, streamed. Sentences and actions go out as they close; the
  // whole text is parsed at the end (json-actions.ts) as before.
  private async *attempt(
    system: Anthropic.Beta.BetaTextBlockParam[], messages: Anthropic.Beta.BetaMessageParam[], ctx: TurnContext,
  ): AsyncGenerator<TurnEvent, { raw: RawAction[] | null; refused: boolean }> {
    const validators = ctx.idValidators ?? {};
    // Thinking off and the JSON format: see the comment history in git
    // (batch 6: thinking turns 4.1s; json-actions.ts: narration 16 → 0).
    const stream = this.client.beta.messages.stream({
      model: this.modelId,
      max_tokens: 1024,
      system,
      messages,
      output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
      thinking: { type: 'between_tools' },
      betas: [FALLBACK_BETA],
      fallbacks: FALLBACKS,
    } as never);
    const parser = new ActionStreamParser();
    for await (const ev of stream as AsyncIterable<{ type: string; delta?: { type: string; text?: string } }>) {
      if (ev.type !== 'content_block_delta' || ev.delta?.type !== 'text_delta') continue;
      for (const p of parser.push(ev.delta.text ?? '')) {
        if (p.type === 'sentence') { yield p; continue; }
        const action = liveAction(p.raw, validators);
        if (action) yield { type: 'action', action };
      }
    }
    const r = await (stream as unknown as { finalMessage(): Promise<Anthropic.Beta.BetaMessage> }).finalMessage();
    ctx.onUsage?.({
      component: 'interviewer', model: this.modelId,
      inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens,
      cacheReadTokens: r.usage.cache_read_input_tokens ?? 0, cacheWriteTokens: r.usage.cache_creation_input_tokens ?? 0,
    });
    console.log('[interviewer-model] raw response:', parser.text);
    if (r.stop_reason === 'refusal') {
      console.warn('[interviewer-model] refusal:', JSON.stringify(r.stop_details));
      return { raw: null, refused: true };
    }
    return { raw: parseResponse(parser.text), refused: false };
  }

  async *streamTurn(ctx: TurnContext): AsyncGenerator<TurnEvent> {
    const messages: Anthropic.Beta.BetaMessageParam[] = ctx.history.map(m => ({ role: m.role, content: m.content }));
    const validators = ctx.idValidators ?? {};
    const system = buildSystemBlocks(`${ctx.systemPrompt}\n\n${RESPONSE_FORMAT}`, ctx.turnSystem);

    let first = yield* this.attempt(system, messages, ctx);
    let result = normalizeActions(first.raw ?? [], validators);
    let retried = false;
    // One regeneration for an unusable draft — only while the caller has
    // delivered nothing of it (a retry after speech would repeat or contradict).
    if (!first.refused && (first.raw === null || result.retry) && (ctx.canRegenerate?.() ?? true)) {
      retried = true;
      const note = first.raw === null
        ? 'Your previous draft of this turn was not a complete JSON object. Write the whole turn again as one JSON object.'
        : retryNote(result.report, validators);
      console.warn('[interviewer-model] regenerating:', note);
      yield { type: 'restart', reason: note };
      first = yield* this.attempt(system, [...messages, { role: 'system', content: note } as never], ctx);
      result = normalizeActions(first.raw ?? [], validators);
    }
    if (result.report.dropped.length > 0) {
      console.warn('[interviewer-model] dropped actions:', JSON.stringify(result.report.dropped));
    }
    ctx.onValidation?.({ report: result.report, retried, unparsed: first.raw === null, refused: first.refused });
    const actions = result.actions;
    if (actions.length === 0) actions.push({ type: 'speak', text: 'I see. What would you like to explore next?' });
    yield { type: 'done', actions, report: result.report, retried, unparsed: first.raw === null, refused: first.refused };
  }
```

and add, below the class:

```ts
// A streamed action whose id resolves — the same resolution normalizeActions
// applies at the end. Speech is delivered as sentences, never as an action.
function liveAction(raw: RawAction, validators: Record<string, ToolIdValidator>): Exclude<Action, { type: 'speak' }> | null {
  if (raw.type === 'reveal_data' || raw.type === 'show_exhibit') {
    const rawId = String(raw.type === 'reveal_data' ? raw.item_id ?? '' : raw.exhibit_id ?? '');
    const id = validators[raw.type]?.resolve(rawId) ?? null;
    if (!id) return null;
    return raw.type === 'reveal_data' ? { type: 'reveal_data', itemId: id } : { type: 'show_exhibit', exhibitId: id };
  }
  if (raw.type === 'advance_phase' || raw.type === 'end_case') return { type: raw.type };
  return null;
}
```

Imports to add in `anthropic.ts`: `ActionStreamParser` from `./json-action-stream`; `collectActions` from `./turn-events`; `type RawAction` from `./json-actions`; `type TurnEvent, type ToolIdValidator` from `./interface`.

- [ ] **Step 6: Move the existing JSON-turn tests to the stream stub.** In `tests/agent/anthropic-json-turn.test.ts`, replace the `stubbed` helper with the `fakeStream`/`stubbed` pair from Step 2 (renaming the returned spy from `create` to `stream`), and replace every `create` with `stream` (`create.mock.calls[N][0]` → `stream.mock.calls[N][0]`). Assertions are otherwise unchanged.

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/agent`
Expected: PASS, including the 4 new tests and every existing `anthropic-json-turn` test.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add lib/agent/models tests/agent/anthropic-stream-turn.test.ts tests/agent/anthropic-json-turn.test.ts
git commit -m "feat(interviewer): stream the JSON turn; regenerate only before delivery"
```

---

### Task 3: `streamInterviewerTurn`

**Files:**
- Modify: `lib/agent/interviewer.ts`
- Test: `tests/agent/interviewer-stream.test.ts`

**Interfaces:**
- Consumes: `TurnEvent`, `eventsFromActions`, `collectActions` (Task 2)
- Produces: `streamInterviewerTurn(input: InterviewerTurnInput & { canRegenerate?: () => boolean }): AsyncGenerator<TurnEvent>`; `runInterviewerTurn` unchanged signature, now `collectActions(streamInterviewerTurn(input))`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/agent/interviewer-stream.test.ts
import { describe, it, expect } from 'vitest';
import { streamInterviewerTurn, runInterviewerTurn } from '@/lib/agent/interviewer';
import type { InterviewerModel, TurnEvent } from '@/lib/agent/models/interface';
import type { PromptContext } from '@/lib/agent/prompts/system';

const promptCtx: PromptContext = {
  casePrompt: 'Case', currentPhase: 'WRAP', revealedValues: {}, unrevealedItems: [], exhibits: [],
  advancedLastTurn: false, elapsedMs: 0, totalMs: 1_200_000,
};
const mock = (actions: Parameters<typeof Promise.resolve>[0]): InterviewerModel => ({ runTurn: async () => actions as never });

describe('streamInterviewerTurn', () => {
  it('drops actions illegal in the phase from the stream and the final list', async () => {
    const model = mock([{ type: 'speak', text: 'Thanks.' }, { type: 'advance_phase' }]);
    const ev: TurnEvent[] = [];
    for await (const e of streamInterviewerTurn({ model, candidateText: 'ok', history: [], promptCtx, phase: 'WRAP' })) ev.push(e);
    expect(ev.some(e => e.type === 'action' && e.action.type === 'advance_phase')).toBe(false);
    expect(ev.at(-1)).toMatchObject({ type: 'done', actions: [{ type: 'speak', text: 'Thanks.' }] });
  });
  it('runInterviewerTurn returns the same list as before', async () => {
    const model = mock([{ type: 'advance_phase' }]);
    expect(await runInterviewerTurn({ model, candidateText: 'ok', history: [], promptCtx, phase: 'WRAP' }))
      .toEqual([{ type: 'speak', text: "Let's continue — what are your thoughts?" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agent/interviewer-stream.test.ts`
Expected: FAIL — `streamInterviewerTurn` is not exported.

- [ ] **Step 3: Implement.** In `lib/agent/interviewer.ts`, rename the body of `runInterviewerTurn` into `streamInterviewerTurn` (an `async function*`) keeping the prompt parts, messages and `idValidators` construction (lines 20–44) verbatim, then:

```ts
  const ctx: TurnContext = {
    systemPrompt, turnSystem, history: messages, tools: [], idValidators,
    onUsage: input.onUsage, onValidation: input.onValidation, canRegenerate: input.canRegenerate,
  };
  const events = input.model.streamTurn ? input.model.streamTurn(ctx) : eventsFromActions(input.model.runTurn(ctx));
  const legal = LEGAL_ACTIONS[input.phase];
  for await (const e of events) {
    if (e.type === 'action' && !legal.includes(e.action.type)) continue;
    if (e.type === 'done') {
      const filtered = e.actions.filter(a => legal.includes(a.type));
      console.log('[interviewer] phase:', input.phase, 'raw:', e.actions.map(a => a.type), '→ filtered:', filtered.map(a => a.type));
      yield { ...e, actions: filtered.length > 0 ? filtered : [{ type: 'speak', text: "Let's continue — what are your thoughts?" }] };
      continue;
    }
    yield e;
  }
}

export async function runInterviewerTurn(input: InterviewerTurnInput): Promise<Action[]> {
  return collectActions(streamInterviewerTurn(input));
}
```

Add `canRegenerate?: () => boolean` to `InterviewerTurnInput`; import `TurnEvent` and `TurnContext` types and `eventsFromActions`, `collectActions`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/agent`
Expected: PASS (new tests plus the existing `interviewer.test.ts`).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add lib/agent/interviewer.ts tests/agent/interviewer-stream.test.ts
git commit -m "feat(interviewer): streamInterviewerTurn with per-phase action filter"
```

---

### Task 4: Extract the Plan stage (no behaviour change)

**Files:**
- Create: `lib/orchestrator/turn-types.ts`, `lib/orchestrator/plan-turn.ts`
- Modify: `lib/orchestrator/session-runner.ts:56-405`
- Test: `tests/orchestrator/plan-turn.test.ts`

**Interfaces:**
- Produces (`turn-types.ts`):
  ```ts
  export type ExhibitDisplay = { id: string; title: string; chartType: string; data: Record<string, unknown>[] }; // moved from session-runner
  export type TurnResult = { /* moved verbatim from session-runner.ts:56-69 */ };
  export type PendingEvent = { category: 'intervention' | 'conduct'; subtype: string; payload: Record<string, unknown> };
  export type TurnReads = {
    session: typeof sessions.$inferSelect; turnRows: (typeof sessionTurns.$inferSelect)[];
    exhibitRows: (typeof exhibitsShown.$inferSelect)[]; revealedRows: (typeof revealedData.$inferSelect)[];
    dataRequestEventRows: (typeof sessionEvents.$inferSelect)[];
  };
  export type TurnCtx = {
    sessionId: string; userId: string; candidateText: string; now: number; turnStartMs: number;
    nextTurnIndex: number; currentPhase: Phase; caseData: ReturnType<typeof getCaseById>;
    flags: Record<string, unknown>; conduct: ConductFlags; checks: CheckLog;
    events: PendingEvent[];                   // session events to write at commit
    later: (task: () => Promise<void>) => void; // analytics, unchanged
  };
  export type ScriptedPlan = {
    kind: 'scripted'; ctx: TurnCtx; interviewerText: string; result: TurnResult;
    sessionUpdate: Partial<typeof sessions.$inferInsert>;
  };
  export type ModelState = {
    repliedToDistressOffer: boolean; shownExhibitIds: Set<string>; ledger: DataLedger;
    catalog: { id: string; label: string }[]; dataRequestRows: { subtype: string; turnIndex: number | null; payloadJsonb: unknown }[];
    openDataRequests: ReturnType<typeof summarizeDataRequests>['requestedUnanswered']; openDataRequestsHint: string | undefined;
    elapsedMs: number; timeUp: boolean; coverage: CoverageScores | null; coverageMayEnd: boolean;
    phaseBudgetsMs: Partial<Record<Phase, number>>; shouldFireTimeWarning: boolean;
    recomputeFlags: ReturnType<typeof checkRecomputeForTurn>; recomputeAttempts: RecomputeAttempts;
    recomputeHint: string | undefined; derivedValueTexts: string[];
    verifiedNow: VerifiedFigure[]; verifiedPrev: VerifiedFigure[]; explainProbedBefore: Set<string>; verifiedHint: string | undefined;
    unitCheckHint: string | undefined; priorStall: StallState; stallDecision: ReturnType<typeof evaluateStall>;
    recommendationReceived: boolean; stages: StageAdministration; mayEnd: boolean; awaitingRecAsk: boolean;
    coverageSteer: string | undefined; conductRedirectHint: string | undefined;
    history: { role: 'user' | 'assistant'; content: string }[]; turnRows: TurnReads['turnRows'];
    distress: Promise<DistressVerdict | null>; detectedRequests: Promise<DataRequest[] | null>;
    buffered: boolean; bufferReason?: string;
  };
  export type ModelPlan = { kind: 'model'; ctx: TurnCtx; state: ModelState };
  export type TurnPlan = ScriptedPlan | ModelPlan;
  ```
  (Exact types for `DataRequest` and the summarize return come from `classifyDataRequests` / `summarizeDataRequests`; use `Awaited<ReturnType<typeof classifyDataRequests>>` where no named type exists.)
- Produces (`plan-turn.ts`): `planTurn(reads: TurnReads, candidateText: string, deps: { now: number; turnStartMs: number; later: TurnCtx['later'] }): TurnPlan`, plus `scriptedOffer(plan: ModelPlan, riskToSelf: boolean, payload: Record<string, unknown>): ScriptedPlan` (today's `offerPause`, without writes).

- [ ] **Step 1: Write the failing purity test**

```ts
// tests/orchestrator/plan-turn.test.ts
import { describe, it, expect, vi } from 'vitest';

const writes = vi.fn();
vi.mock('@/db/client', () => ({ db: new Proxy({}, { get: () => { writes(); return () => { throw new Error('db used in plan'); }; } }) }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { planTurn } from '@/lib/orchestrator/plan-turn';
import { readsFixture } from './fixtures/turn-reads';

describe('planTurn', () => {
  it('touches no database for a normal model turn', () => {
    const plan = planTurn(readsFixture({ phase: 'ANALYSIS' }), 'COGS went from 42 to 58, so 16 points.', { now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    expect(plan.kind).toBe('model');
    expect(writes).not.toHaveBeenCalled();
    if (plan.kind === 'model') expect(plan.ctx.events.map(e => e.subtype)).toContain('recompute_flag');
  });
  it('returns a scripted plan for a conduct termination, with the writes deferred', () => {
    const plan = planTurn(readsFixture({ phase: 'ANALYSIS', warnings: 1 }), 'You are a useless idiot.', { now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    expect(plan.kind).toBe('scripted');
    if (plan.kind === 'scripted') {
      expect(plan.sessionUpdate.status).toBe('terminated');
      expect(plan.result.scoringSuppressed).toBe(true);
    }
    expect(writes).not.toHaveBeenCalled();
  });
  it('buffers late-case turns', () => {
    for (const phase of ['RECOMMENDATION', 'WRAP'] as const) {
      const plan = planTurn(readsFixture({ phase }), 'My recommendation is to raise prices.', { now: Date.now(), turnStartMs: Date.now(), later: () => {} });
      expect(plan.kind === 'model' && plan.state.buffered).toBe(true);
    }
    const mid = planTurn(readsFixture({ phase: 'ANALYSIS' }), 'Can I see the cost breakdown?', { now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    expect(mid.kind === 'model' && mid.state.buffered).toBe(false);
  });
});
```

Create `tests/orchestrator/fixtures/turn-reads.ts` exporting `readsFixture({ phase, warnings?, elapsedMs? })` that returns a `TurnReads` for case `prof-001`: a session row (`status: 'active'`, `caseId: 'prof-001'`, `phase`, `startedAt: new Date(Date.now() - (elapsedMs ?? 300_000))`, `flagsJsonb: { conduct: { warnings: warnings ?? 0 } }`, `coverageJsonb: null`, `userId: 'u1'`), two turn rows (interviewer opening at index 0, candidate at 1), and empty exhibit / revealed / data-request rows. Before writing it, check the termination text against `classifyConduct` in `lib/orchestrator/conduct.ts` and use a message that function terminates on with one prior warning.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/orchestrator/plan-turn.test.ts`
Expected: FAIL — cannot resolve `@/lib/orchestrator/plan-turn`.

- [ ] **Step 3: Implement.**
  1. Create `turn-types.ts` with the types above; move `ExhibitDisplay` and `TurnResult` there and re-export both from `session-runner.ts` (`export type { TurnResult, ExhibitDisplay } from './turn-types'`) so existing imports keep working.
  2. Create `plan-turn.ts`. Move `session-runner.ts` lines 130–405 (from `const currentPhase` to the `detectedRequestsPromise` start) into `planTurn`, with these mechanical changes:
     - Every `await logSessionEvent(sessionId, cat, sub, nextTurnIndex, currentPhase, payload)` → `ctx.events.push({ category: cat, subtype: sub, payload })`.
     - Each early return (`session.status !== 'active'`, C5 accept, terminate, warn, regex C5 offer) → return a `ScriptedPlan` whose `sessionUpdate` is the object today's `db.update(sessions).set(...)` receives, and whose `interviewerText`/`result` are today's return values. The inactive-session case returns `{ kind: 'scripted', interviewerText: '', result: <today's>, sessionUpdate: {} }` and is flagged `noPersist: true` (add `noPersist?: boolean` to `ScriptedPlan`) — today it writes nothing.
     - `offerPause` → exported `scriptedOffer(plan, riskToSelf, payload)` building the same `ScriptedPlan` (`sessionUpdate.flagsJsonb` with `distressOffered: true, distressOfferedAtMs: Date.now()`, event `{ category: 'conduct', subtype: 'C5', payload }`).
     - Collect the locals into `ModelState` (field names exactly as in the type above).
     - `buffered` = `timeUp || (shouldFireTimeWarning && !recommendationReceived) || mayEnd || awaitingRecAsk || currentPhase === 'RECOMMENDATION' || currentPhase === 'WRAP'`; `bufferReason` names the first true condition.
  3. In `session-runner.ts`, `runTurnBody` becomes: the five parallel reads (unchanged) → `const plan = planTurn(reads, candidateText, { now: Date.now(), turnStartMs, later })` → `if (plan.kind === 'scripted') return commitScripted(plan)` → the remaining body (today's lines 405–1141) reading from `plan.ctx` / `plan.state` (destructure at the top so the moved code is unchanged). Add `commitScripted` in `session-runner.ts` for now (Task 5 moves it): unless `noPersist`, insert the candidate + interviewer turn pair, `writeChecks`, insert `ctx.events` as `sessionEvents` rows, and `db.update(sessions).set(plan.sessionUpdate)` when it is non-empty; return `plan.result`.
  4. Pending events in model turns (`session_resumed`, `recompute_flag`, the C4 / C2 conduct logs) are inserted with the persist `Promise.all` at the end of the turn, in the order pushed.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — new plan tests, and every existing test unchanged (the runner's behaviour is identical; only the write timing of pre-model events moved to the end of the turn).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add lib/orchestrator/turn-types.ts lib/orchestrator/plan-turn.ts lib/orchestrator/session-runner.ts tests/orchestrator/plan-turn.test.ts tests/orchestrator/fixtures/turn-reads.ts
git commit -m "refactor(turn): side-effect-free Plan stage; scripted turns committed at the end"
```

---

### Task 5: Extract the Settle stage and the prefix lock (no behaviour change)

**Files:**
- Create: `lib/orchestrator/settle-turn.ts`
- Modify: `lib/orchestrator/session-runner.ts` (post-model body)
- Test: `tests/orchestrator/settle-turn.test.ts`

**Interfaces:**
- Consumes: `ModelPlan`, `ScriptedPlan`, `TurnCtx`, `ModelState` (Task 4)
- Produces:
  ```ts
  export type ModelOutcome = {
    actions: Action[]; modelCallStart: number; modelLatencyMs: number; distressWaitMs: number;
    turnUsage: { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; apiCalls: number };
    delivered: string[];          // sentences/segments already delivered, in order ([] when nothing streamed)
  };
  export type Settled = {
    spokenText: string; tail: string; prefixMismatch: boolean;
    exhibit?: ExhibitDisplay; nextPhaseValue: Phase; ended: boolean;
    newReveals: string[]; exhibitReveals: string[]; auditPassed: boolean; dataRequestsClassified: boolean;
    persist: () => Promise<void>;  // today's Promise.all writes + pending events + latency analytics
  };
  export function tailAfterDelivered(finalText: string, delivered: string[]): { tail: string; mismatch: boolean };
  export async function settleTurn(plan: ModelPlan, out: ModelOutcome): Promise<Settled>;
  export async function commitScripted(plan: ScriptedPlan): Promise<TurnResult>; // moved from session-runner
  ```

- [ ] **Step 1: Write the failing tests for the prefix lock**

```ts
// tests/orchestrator/settle-turn.test.ts
import { describe, it, expect } from 'vitest';
import { tailAfterDelivered } from '@/lib/orchestrator/settle-turn';

describe('tailAfterDelivered', () => {
  it('returns everything when nothing was delivered', () => {
    expect(tailAfterDelivered('Okay. What drove it?', [])).toEqual({ tail: 'Okay. What drove it?', mismatch: false });
  });
  it('returns only the text after the delivered prefix', () => {
    expect(tailAfterDelivered('Okay. COGS is 58% of revenue. Here is more. What drove it?', ['Okay.', 'COGS is 58% of revenue.']))
      .toEqual({ tail: 'Here is more. What drove it?', mismatch: false });
  });
  it('ignores whitespace differences in the prefix', () => {
    expect(tailAfterDelivered('Okay.  COGS  is up. Why?', ['Okay.', 'COGS is up.'])).toEqual({ tail: 'Why?', mismatch: false });
  });
  it('on a replacement, delivers the final sentences not yet delivered, in order', () => {
    expect(tailAfterDelivered('Before we close, what would you tell the CEO?', ['Okay.']))
      .toEqual({ tail: 'Before we close, what would you tell the CEO?', mismatch: true });
    expect(tailAfterDelivered('Okay. Revenue is $480M. What now?', ['Revenue is $480M.']))
      .toEqual({ tail: 'Okay. What now?', mismatch: true });
  });
  it('returns an empty tail when the final text was fully delivered', () => {
    expect(tailAfterDelivered('Okay. Go on.', ['Okay.', 'Go on.'])).toEqual({ tail: '', mismatch: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/orchestrator/settle-turn.test.ts`
Expected: FAIL — cannot resolve `@/lib/orchestrator/settle-turn`.

- [ ] **Step 3: Implement `tailAfterDelivered`**

```ts
// The prefix lock (spec §4.4): today's pipeline decides the final text; the
// candidate already received `delivered`, so only what follows is sent. A
// final text that no longer starts with what was delivered (a replacement
// after a mid-stream buffer switch) sends its not-yet-delivered sentences.
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const sentencesOf = (s: string) => norm(s).split(/(?<=[.!?])\s+/).filter(Boolean);

export function tailAfterDelivered(finalText: string, delivered: string[]): { tail: string; mismatch: boolean } {
  const final = norm(finalText);
  const prefix = norm(delivered.join(' '));
  if (!prefix) return { tail: final, mismatch: false };
  if (final === prefix) return { tail: '', mismatch: false };
  if (final.startsWith(prefix + ' ')) return { tail: final.slice(prefix.length + 1), mismatch: false };
  const done = new Set(delivered.flatMap(sentencesOf));
  return { tail: sentencesOf(final).filter(s => !done.has(s)).join(' '), mismatch: true };
}
```

- [ ] **Step 4: Move the post-model pipeline into `settleTurn`.** Move `session-runner.ts` from the distress handling (today ~line 456) through the `turn_latency` analytics (~line 1131) into `settle-turn.ts`:
  - Distress: `settleTurn` does not handle distress; the caller does (Task 6) before calling it. Remove those lines from the moved block and keep the `conduct_model` check records in the caller.
  - The block from `// Execute actions` to the blank-turn guard is moved **verbatim**, reading `ctx`/`state`/`out` (destructure at the top so names match).
  - `await logSessionEvent(... 'grace_ask' ...)` → `ctx.events.push({ category: 'intervention', subtype: 'grace_ask', payload: { elapsedMs } })`.
  - After the blank-turn guard: `const { tail, mismatch } = tailAfterDelivered(spokenText, out.delivered); ctx.checks.record('stream_prefix_mismatch', mismatch, 'final text replaced delivered speech — undelivered sentences sent', { delivered: out.delivered });`
  - The persist `Promise.all`, analytics and `turn_latency` move into `persist()` (closure). `turn_latency` gains `firstSegmentMs` and `streamed` (passed in Task 7; default `null`/`false` now).
  - `commitScripted` moves here from the runner.
  - The runner now: plan → (scripted? `commitScripted`) → today's model call via `runInterviewerTurn` (unchanged) → today's distress wait/discard (scripted offer via `scriptedOffer` + `commitScripted`) → `settleTurn(plan, { ..., delivered: [] })` → `await settled.persist()` → return the `TurnResult` built from `settled` (same fields as today).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — prefix-lock tests and every existing test; the replay corpus unchanged.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add lib/orchestrator/settle-turn.ts lib/orchestrator/session-runner.ts tests/orchestrator/settle-turn.test.ts
git commit -m "refactor(turn): Settle stage — today's post-model pipeline plus the prefix lock"
```

---

### Task 6: The Stream stage

**Files:**
- Create: `lib/orchestrator/stream-turn.ts`
- Modify: `lib/orchestrator/turn-types.ts` (add `Segment`, `SegmentSink`)
- Test: `tests/orchestrator/stream-turn.test.ts`

**Interfaces:**
- Consumes: `TurnEvent` (Task 2); `ModelPlan` (Task 4); guards from `audit.ts`, `numeric-provenance.ts`, `probe-guard.ts`, `assumption-guard.ts`, `synthesis-guard.ts`, `spoken-close.ts`, `scripts.ts`; `canReveal`, `revealedValues`, `changeFigures`.
- Produces:
  ```ts
  // turn-types.ts
  export type Segment = { text: string; revealIds: string[]; exhibitId?: string };
  export type SegmentSink = (s: Segment) => Promise<void>; // resolves when delivered; rejects if not (D3)
  // stream-turn.ts
  export type GateContext = {
    allowedTexts: string[]; verified: VerifiedFigure[]; alreadyProbed: Set<string>; flaggedThisTurn: boolean;
    openItems: OpenRequestItem[]; phase: Phase;
  };
  export type GateVerdict = { pass: true } | { pass: false; reason: string };
  export function gateSentence(sentence: string, g: GateContext): GateVerdict;
  export type StreamOutcome =
    | { kind: 'distress'; verdict: DistressVerdict; distressWaitMs: number }
    | { kind: 'done'; actions: Action[]; delivered: string[]; deliveredRevealIds: string[]; undeliveredRevealIds: string[];
        firstSegmentMs: number | null; bufferSwitch: string | null; distressWaitMs: number };
  export async function streamTurnSegments(
    events: AsyncIterable<TurnEvent>, plan: ModelPlan, sink: SegmentSink,
    opts: { isDelivered: { value: boolean } },  // read by the model's canRegenerate
  ): Promise<StreamOutcome>;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/orchestrator/stream-turn.test.ts
import { describe, it, expect } from 'vitest';
import { gateSentence, streamTurnSegments, type GateContext } from '@/lib/orchestrator/stream-turn';
import type { TurnEvent } from '@/lib/agent/models/interface';
import type { Segment } from '@/lib/orchestrator/turn-types';
import { modelPlanFixture } from './fixtures/model-plan';

const g = (over: Partial<GateContext> = {}): GateContext => ({
  allowedTexts: ['Revenue is $480M a year.'], verified: [], alreadyProbed: new Set(), flaggedThisTurn: false,
  openItems: [], phase: 'ANALYSIS', ...over,
});
async function* events(list: TurnEvent[]) { for (const e of list) yield e; }
const done = (actions: unknown[]): TurnEvent =>
  ({ type: 'done', actions, report: { dropped: [], invalidIds: [], empty: false, capped: false }, retried: false, unparsed: false, refused: false }) as TurnEvent;
function collect() { const got: Segment[] = []; return { got, sink: async (s: Segment) => { got.push(s); } }; }

describe('gateSentence', () => {
  it('passes a clean sentence', () => expect(gateSentence('Walk me through that.', g())).toEqual({ pass: true }));
  it('stops at an unsourced figure', () => expect(gateSentence('Margins are 12% now.', g()).pass).toBe(false));
  it('passes a revealed figure', () => expect(gateSentence('Revenue is $480M a year.', g()).pass).toBe(true));
  it('stops at narration', () => expect(gateSentence("I'll release the cost data now.", g()).pass).toBe(false));
  it('stops at a close cue', () => expect(gateSentence("That's our time, thanks for working through it.", g()).pass).toBe(false));
  it('stops at a supplied recommendation in BRAINSTORM', () =>
    expect(gateSentence('You should raise menu prices by 5%.', g({ phase: 'BRAINSTORM' })).pass).toBe(false));
});

describe('streamTurnSegments', () => {
  it('delivers statements at once and holds the trailing question', async () => {
    const plan = modelPlanFixture({ distress: null });
    const { got, sink } = collect();
    const out = await streamTurnSegments(events([
      { type: 'sentence', text: 'Okay.', sayIndex: 0 },
      { type: 'sentence', text: 'What drove the change?', sayIndex: 0 },
      done([{ type: 'speak', text: 'Okay. What drove the change?' }]),
    ]), plan, sink, { isDelivered: { value: false } });
    expect(got.map(s => s.text)).toEqual(['Okay.']);
    expect(out).toMatchObject({ kind: 'done', delivered: ['Okay.'], bufferSwitch: null });
  });
  it('releases a mid-turn question before the next statement', async () => {
    const { got, sink } = collect();
    await streamTurnSegments(events([
      { type: 'sentence', text: 'Is that MECE?', sayIndex: 0 },
      { type: 'sentence', text: 'Take a moment.', sayIndex: 0 },
      done([]),
    ]), modelPlanFixture({ distress: null }), sink, { isDelivered: { value: false } });
    expect(got.map(s => s.text)).toEqual(['Is that MECE?', 'Take a moment.']);
  });
  it('delivers nothing when the distress verdict is positive, even after held sentences', async () => {
    const { got, sink } = collect();
    const out = await streamTurnSegments(events([
      { type: 'sentence', text: 'Okay.', sayIndex: 0 },
      done([{ type: 'speak', text: 'Okay.' }]),
    ]), modelPlanFixture({ distress: { label: 'distress', reason: 'x' } }), sink, { isDelivered: { value: false } });
    expect(got).toEqual([]);
    expect(out.kind).toBe('distress');
  });
  it('switches to buffered at end_case and delivers nothing after it', async () => {
    const { got, sink } = collect();
    const out = await streamTurnSegments(events([
      { type: 'sentence', text: 'Okay.', sayIndex: 0 },
      { type: 'action', action: { type: 'end_case' } },
      { type: 'sentence', text: 'Revenue is $480M a year.', sayIndex: 1 },
      done([]),
    ]), modelPlanFixture({ distress: null }), sink, { isDelivered: { value: false } });
    expect(got.map(s => s.text)).toEqual(['Okay.']);
    expect(out).toMatchObject({ kind: 'done', bufferSwitch: 'end_case' });
  });
  it('delivers nothing on a buffered plan', async () => {
    const { got, sink } = collect();
    await streamTurnSegments(events([{ type: 'sentence', text: 'Okay.', sayIndex: 0 }, done([])]),
      modelPlanFixture({ distress: null, buffered: true }), sink, { isDelivered: { value: false } });
    expect(got).toEqual([]);
  });
  it('delivers a reveal as its approved wording and books it only if the sink resolves', async () => {
    const plan = modelPlanFixture({ distress: null });
    const rejecting = async () => { throw new Error('interrupted'); };
    const out = await streamTurnSegments(events([
      { type: 'action', action: { type: 'reveal_data', itemId: 'stores_count' } },
      done([{ type: 'reveal_data', itemId: 'stores_count' }]),
    ]), plan, rejecting, { isDelivered: { value: false } });
    expect(out).toMatchObject({ kind: 'done', deliveredRevealIds: [], undeliveredRevealIds: ['stores_count'] });
  });
  it('discards held events on a restart', async () => {
    const { got, sink } = collect();
    await streamTurnSegments(events([
      { type: 'sentence', text: 'First draft.', sayIndex: 0 },
      { type: 'restart', reason: 'bad id' },
      { type: 'sentence', text: 'Second draft.', sayIndex: 0 },
      done([{ type: 'speak', text: 'Second draft.' }]),
    ]), modelPlanFixture({ distress: null, distressDelayMs: 20 }), sink, { isDelivered: { value: false } });
    expect(got.map(s => s.text)).toEqual(['Second draft.']);
  });
});
```

Create `tests/orchestrator/fixtures/model-plan.ts` exporting `modelPlanFixture({ distress, buffered?, distressDelayMs? })`: builds a `ModelPlan` by calling `planTurn(readsFixture({ phase: 'ANALYSIS' }), 'Can I see the data?', ...)` with the classifiers mocked as in Task 4, then overrides `state.distress` with a promise resolving to `distress` after `distressDelayMs ?? 0` ms, `state.detectedRequests` with `Promise.resolve([])`, and `state.buffered` with `buffered ?? false`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/orchestrator/stream-turn.test.ts`
Expected: FAIL — cannot resolve `@/lib/orchestrator/stream-turn`.

- [ ] **Step 3: Implement**

```ts
// lib/orchestrator/stream-turn.ts
// The Stream stage (spec §4.3). Pass or buffer: a sentence is delivered only
// if every gate leaves it unchanged; the first one a gate would change sends
// the rest of the turn to Settle, which runs today's full pipeline and
// delivers what follows the delivered prefix (settle-turn.ts). Nothing is
// delivered before the distress verdict (D1); a trailing question is held to
// the end of the stream (D4) so end-of-turn inserts can go before it.
import type { Action } from './actions';
import type { TurnEvent } from '@/lib/agent/models/interface';
import type { ModelPlan, Segment, SegmentSink } from './turn-types';
import type { Phase } from './state-machine';
import type { VerifiedFigure } from './recompute';
import type { OpenRequestItem } from './assumption-guard';
import { isDistressVerdict, type DistressVerdict } from './distress';
import { stripFabricatedTurn, stripMetaLeak, rewriteSystemLanguage, stripCopiedCheckIn } from './audit';
import { enforceNumericProvenance, changeFigures } from './numeric-provenance';
import { withholdProbesOnVerified } from './probe-guard';
import { withholdAssumptionChallenges } from './assumption-guard';
import { suppliesRecommendation } from './synthesis-guard';
import { isClosingTurn } from './spoken-close';
import { hasCloseCue, alreadySignaledTimeOrRec } from '@/lib/agent/prompts/scripts';
import { canReveal, reveal, revealedValues } from './data-ledger';

export type GateContext = {
  allowedTexts: string[]; verified: VerifiedFigure[]; alreadyProbed: Set<string>; flaggedThisTurn: boolean;
  openItems: OpenRequestItem[]; phase: Phase;
};
export type GateVerdict = { pass: true } | { pass: false; reason: string };

const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

export function gateSentence(sentence: string, g: GateContext): GateVerdict {
  if (stripFabricatedTurn(sentence).fabricated !== null) return { pass: false, reason: 'fabricated_turn' };
  if (stripMetaLeak(sentence).strippedSentences.length > 0) return { pass: false, reason: 'meta_leak' };
  if (rewriteSystemLanguage(sentence).rewrites.length > 0) return { pass: false, reason: 'system_language' };
  if (stripCopiedCheckIn(sentence).stripped) return { pass: false, reason: 'copied_check_in' };
  if (enforceNumericProvenance(sentence, g.allowedTexts).blocked) return { pass: false, reason: 'provenance' };
  const probe = withholdProbesOnVerified(sentence, { verified: g.verified, alreadyProbed: g.alreadyProbed, flaggedThisTurn: g.flaggedThisTurn });
  if (probe.withheld.length > 0 || probe.explainProbed.length > 0 || !same(probe.text, sentence)) return { pass: false, reason: 'probe_guard' };
  if (withholdAssumptionChallenges(sentence, g.openItems).withheld.length > 0) return { pass: false, reason: 'assumption_guard' };
  if (hasCloseCue(sentence) || isClosingTurn(sentence)) return { pass: false, reason: 'close_cue' };
  if (alreadySignaledTimeOrRec(sentence)) return { pass: false, reason: 'time_or_rec_cue' };
  if (g.phase === 'BRAINSTORM' && suppliesRecommendation(sentence)) return { pass: false, reason: 'synthesis' };
  return { pass: true };
}

export type StreamOutcome =
  | { kind: 'distress'; verdict: DistressVerdict; distressWaitMs: number }
  | { kind: 'done'; actions: Action[]; delivered: string[]; deliveredRevealIds: string[]; undeliveredRevealIds: string[];
      firstSegmentMs: number | null; bufferSwitch: string | null; distressWaitMs: number };

type Pending = { kind: 'sentence'; text: string } | { kind: 'reveal'; id: string; text: string } | { kind: 'exhibit'; id: string };

export async function streamTurnSegments(
  events: AsyncIterable<TurnEvent>, plan: ModelPlan, sink: SegmentSink, opts: { isDelivered: { value: boolean } },
): Promise<StreamOutcome> {
  const { ctx, state } = plan;
  const start = Date.now();
  let verdict: DistressVerdict | null | undefined;            // undefined = not in yet
  const distressAt = state.distress.then(v => { verdict = v; return v; });
  const ledger = structuredClone(state.ledger);                 // Stream never books (D3); Settle does
  const revealedTexts = () => Object.values(revealedValues(ledger));
  const g: GateContext = {
    allowedTexts: [ctx.caseData.prompt, ...state.turnRows.filter(t => t.role === 'candidate').map(t => t.text), ctx.candidateText, ...state.derivedValueTexts],
    verified: [...state.verifiedNow, ...state.verifiedPrev], alreadyProbed: state.explainProbedBefore,
    flaggedThisTurn: state.recomputeFlags.length > 0 || state.unitCheckHint !== undefined,
    openItems: state.openDataRequests.map(r => ({ ledgerItemId: r.ledgerItemId, label: r.label })), phase: ctx.currentPhase,
  };
  let buffered: string | null = state.buffered ? `plan:${state.bufferReason ?? 'late'}` : null;
  let queue: Pending[] = [];            // waiting for the distress verdict
  let heldQuestions: string[] = [];     // trailing questions (D4)
  const delivered: string[] = [];
  const deliveredRevealIds: string[] = [];
  const undeliveredRevealIds: string[] = [];
  let firstSegmentMs: number | null = null;
  let actions: Action[] = [];

  const send = async (seg: Segment, label: string) => {
    try {
      await sink(seg);
      opts.isDelivered.value = true;
      firstSegmentMs ??= Date.now() - start;
      delivered.push(label);
      deliveredRevealIds.push(...seg.revealIds);
    } catch {
      undeliveredRevealIds.push(...seg.revealIds);
    }
  };
  const releaseQuestions = async () => {
    for (const q of heldQuestions) await send({ text: q, revealIds: [] }, q);
    heldQuestions = [];
  };
  const handle = async (p: Pending) => {
    if (buffered) return;
    if (p.kind === 'sentence') {
      const v = gateSentence(p.text, { ...g, allowedTexts: [...g.allowedTexts, ...revealedTexts(), ...changeFigures(revealedTexts())] });
      if (!v.pass) { buffered = v.reason; return; }
      if (p.text.trim().endsWith('?')) { heldQuestions.push(p.text); return; }
      await releaseQuestions();
      await send({ text: p.text, revealIds: [] }, p.text);
    } else if (p.kind === 'reveal') {
      await releaseQuestions();
      await send({ text: p.text, revealIds: [p.id] }, p.text);
    } else {
      await send({ text: '', revealIds: [], exhibitId: p.id }, `[exhibit:${p.id}]`);
    }
  };
  const flushQueue = async () => { const q = queue; queue = []; for (const p of q) await handle(p); };

  for await (const e of events) {
    if (e.type === 'restart') { queue = []; heldQuestions = []; continue; }
    if (e.type === 'done') { actions = e.actions; break; }
    let p: Pending | null = null;
    if (e.type === 'sentence') p = { kind: 'sentence', text: e.text };
    else if (e.action.type === 'reveal_data') {
      if (canReveal(ledger, e.action.itemId)) {
        // reveal() on the clone returns the approved wording; the real ledger is booked by Settle
        p = { kind: 'reveal', id: e.action.itemId, text: reveal(ledger, e.action.itemId) };
      }
    } else if (e.action.type === 'show_exhibit') p = { kind: 'exhibit', id: e.action.exhibitId };
    else if (e.action.type === 'end_case') { buffered ??= 'end_case'; }
    if (!p) continue;
    if (verdict === undefined) { queue.push(p); continue; }   // D1: hold until the verdict
    if (isDistressVerdict(verdict)) continue;
    await flushQueue();
    await handle(p);
  }
  const v = verdict === undefined ? await distressAt : verdict;
  const distressWaitMs = Date.now() - start;
  if (v && isDistressVerdict(v)) return { kind: 'distress', verdict: v, distressWaitMs };
  await flushQueue();
  // Held questions are NOT sent here: Settle may insert before them; the
  // prefix lock sends them with the tail.
  return { kind: 'done', actions, delivered, deliveredRevealIds, undeliveredRevealIds, firstSegmentMs, bufferSwitch: buffered, distressWaitMs };
}
```

Before Step 4, confirm `structuredClone` copies the `DataLedger` (`lib/orchestrator/data-ledger.ts:11-50`; Maps and Sets clone fine) and check the distress verdict shape in `distress.ts` and match `modelPlanFixture`'s positive verdict to what `isDistressVerdict` accepts.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/orchestrator/stream-turn.test.ts`
Expected: PASS (13 tests). If `gateSentence` passes or fails a sentence differently from the guard's own unit tests, the guard's tests are the reference — adjust the test sentence, not the guard.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add lib/orchestrator/stream-turn.ts lib/orchestrator/turn-types.ts tests/orchestrator/stream-turn.test.ts tests/orchestrator/fixtures/model-plan.ts
git commit -m "feat(turn): Stream stage — distress gate, pass-or-buffer sentences, held questions"
```

---

### Task 7: Wire the runner to stream; latency fields

**Files:**
- Modify: `lib/orchestrator/session-runner.ts`, `lib/orchestrator/settle-turn.ts`
- Test: `tests/orchestrator/streamed-equivalence.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `runTurn(sessionId, candidateText, opts: { defer?; onSegment?: SegmentSink })` — `TurnResult` unchanged. Default sink: collect in memory.

- [ ] **Step 1: Write the failing equivalence test** (the core guarantee: streaming changes when text is delivered, never what the candidate ends up hearing).

```ts
// tests/orchestrator/streamed-equivalence.test.ts
import { describe, it, expect } from 'vitest';
import { streamTurnSegments } from '@/lib/orchestrator/stream-turn';
import { settleTurn, tailAfterDelivered } from '@/lib/orchestrator/settle-turn';
import { modelPlanFixture } from './fixtures/model-plan';
import { eventsFromActions } from '@/lib/agent/models/turn-events';
import type { Action } from '@/lib/orchestrator/actions';

const TURNS: Action[][] = [
  [{ type: 'speak', text: 'Okay. Walk me through that.' }],
  [{ type: 'speak', text: 'Okay.' }, { type: 'reveal_data', itemId: 'stores_count' }, { type: 'speak', text: 'What does that tell you?' }],
  [{ type: 'speak', text: "Here's the cost data. What stands out?" }],             // promise recovery inserts before the question
  [{ type: 'speak', text: "I'll release the cost data now. What stands out?" }],    // meta-leak: buffered at sentence 1
  [{ type: 'speak', text: 'Thanks for working through this with me.' }],           // close cue
];

describe('streamed turn = buffered turn', () => {
  for (const [i, actions] of TURNS.entries()) {
    it(`turn ${i}: delivered + tail equals the settle-only text`, async () => {
      const base = { actions, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0,
        turnUsage: { model: '', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 } };
      const reference = await settleTurn(modelPlanFixture({ distress: null }), { ...base, delivered: [] });
      const plan = modelPlanFixture({ distress: null });
      const segs: string[] = [];
      const out = await streamTurnSegments(eventsFromActions(Promise.resolve(actions)), plan, async s => { if (s.text) segs.push(s.text); }, { isDelivered: { value: false } });
      if (out.kind !== 'done') throw new Error('distress');
      const settled = await settleTurn(plan, { ...base, delivered: out.delivered });
      expect([...segs, settled.tail].join(' ').replace(/\s+/g, ' ').trim()).toBe(reference.spokenText.replace(/\s+/g, ' ').trim());
      expect(settled.prefixMismatch).toBe(false);
    });
  }
});
```

`settleTurn` must not write in these tests: its writes live in `persist()`, which the test never calls. The hint check and the ask-turn classifier are only reached on rung/ask turns, which these fixtures avoid.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/orchestrator/streamed-equivalence.test.ts`
Expected: FAIL until Settle books only `deliveredRevealIds ∪ tail reveals` and returns `prefixMismatch` (wired in Step 3).

- [ ] **Step 3: Wire it.**
  - `settleTurn`: exclude `out.undeliveredRevealIds` (add to `ModelOutcome`, default `[]`) from the revealed rows written by `persist()` (D3); return `prefixMismatch: mismatch`.
  - `runTurnBody` (model path):
    ```ts
    const isDelivered = { value: false };
    const sink: SegmentSink = opts.onSegment ?? (async () => {});
    const modelCallStart = Date.now();
    const events = streamInterviewerTurn({ model, candidateText, history: state.history, phase: ctx.currentPhase,
      promptCtx: /* today's promptCtx object, unchanged */, onUsage, onValidation, canRegenerate: () => !isDelivered.value });
    const streamed = await streamTurnSegments(events, plan, sink, { isDelivered });
    const modelLatencyMs = Date.now() - modelCallStart;
    if (streamed.kind === 'distress') return commitScripted(scriptedOffer(plan, streamed.verdict.label === 'risk_to_self', { reason: streamed.verdict.reason, label: streamed.verdict.label, layer: 'model' }));
    ctx.checks.record('stream_buffer_switch', streamed.bufferSwitch !== null && !plan.state.buffered, `streaming stopped: ${streamed.bufferSwitch}`);
    const settled = await settleTurn(plan, { actions: streamed.actions, modelCallStart, modelLatencyMs, distressWaitMs: streamed.distressWaitMs, turnUsage, delivered: streamed.delivered, undeliveredRevealIds: streamed.undeliveredRevealIds });
    if (settled.tail) { await sink({ text: settled.tail, revealIds: [], exhibitId: undefined }); }
    await settled.persist({ firstSegmentMs: streamed.firstSegmentMs ?? (settled.tail ? Date.now() - turnStartMs : null), streamed: streamed.delivered.length > 0 });
    return { interviewerText: settled.spokenText, exhibit: settled.exhibit, phase: settled.ended ? 'SCORING' : settled.nextPhaseValue,
      ended: settled.ended, auditPassed: settled.auditPassed, dataRequestsClassified: settled.dataRequestsClassified };
    ```
    `persist` takes `{ firstSegmentMs, streamed }` and writes them into `turn_latency`. Keep the `conduct_model` check records exactly as today (record on the distress verdict; `skip` when replying to an offer or the classifier failed).
  - `interviewerText` stays the full final text (the route and the client are unchanged).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — equivalence, stream, settle, plan, parser and every existing test, including `tests/replay/corpus.test.ts` (with the run records symlinked).

- [ ] **Step 5: Typecheck, lint, build, commit**

```bash
npm run typecheck && npm run lint && npm run build
git add lib/orchestrator tests/orchestrator/streamed-equivalence.test.ts
git commit -m "feat(turn): runner streams the turn — Plan → Stream → Settle; firstSegmentMs logged"
```

---

### Task 8: Verification gate (costs money — ask first)

**Files:** none (records go to `Case Interview Runs/test runs/batch-9-<date>/`).

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build` — all clean; record counts.
- [ ] **Step 2: Ask the user** for the smoke run (≈$1): `npx tsx --env-file=.env.local scripts/live-run.ts` (one default-candidate run). Check: completes, scores, `turn_latency` rows carry `firstSegmentMs` and `streamed`.
- [ ] **Step 3: Ask the user** for one 10-persona batch (≈$10), launched in parallel (memory: run batches in parallel). Same persona set as batch 7.
- [ ] **Step 4:** Read every transcript by hand; count leaks, broken promises, ignored ledger requests, goodbyes per session, blank turns, `stream_buffer_switch` and `stream_prefix_mismatch` checks; compare `firstSegmentMs` to `totalMs` on streamed turns. Report numbers with the transcript evidence.
- [ ] **Step 5:** Flag the PRD updates listed in spec §8 to the user (do not edit the PRD). Then use superpowers:finishing-a-development-branch to offer merge / PR / keep / discard.
