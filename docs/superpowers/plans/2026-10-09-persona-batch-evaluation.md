# Persona Batch Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every turn of the batch-18 persona runs exactly, run them in user-sized waves under a frozen configuration, and turn them into a scorecard, a confirmed fault list and a persona-band scoring check.

**Architecture:** Optional hooks in the model adapters and `runTurn` feed a pure `TurnRecorder`; `scripts/live-run.ts` writes the records as a gzipped JSONL beside each run. A batch manifest (`lib/eval/batch-manifest.ts`) names waves and enforces the freeze; `scripts/persona-batch.ts` launches a wave. Pure extractors in `lib/eval/` (scorecard, pre-screen, review sheet, bands) are wrapped by thin scripts that read run folders and write batch-level files.

**Tech Stack:** TypeScript, Next.js lib code run with `tsx`, vitest, zod, `@anthropic-ai/sdk` (beta messages, structured output), Node `zlib`/`child_process`.

**Spec:** `docs/superpowers/specs/2026-10-09-persona-batch-evaluation-design.md`

**Deferred (not in this plan):** the training collection export (§2.6 — needs confirmed faults; a small follow-up plan after the review), the blind ChatGPT comparison (§2.7 — post-batch, as approved), and the hand-check of 20 data-request denominators (§2.3 — a review step during the fault confirmation, no code).

## Global Constraints
- Production behaviour unchanged: every new hook is optional; with no callback nothing is recorded and no timing changes.
- No voice library may enter the orchestrator / agent / scoring dependency graph (lint boundary rule, `npm run lint`).
- Case answer keys and ledger values are server-only; the pre-screen runs only in `scripts/` (never imported by `app/`).
- Every paid script installs a run budget (`requireRunBudget`) and calls Anthropic through `anthropicClient()` (metered). Ask the user before every paid step, with an estimate.
- No database migrations.
- Batch 18, version `v1`; runs numbered 1–62 in run order; wave folders `Case Interview Runs/test runs/batch-18-<mon>-<dd>-runs-<x>-<y>/`; batch-level files in `Case Interview Runs/test runs/batch-18/`.
- Waves of ≤10 personas, sized by the user; a wave refuses a dirty tree or a commit different from the manifest's unless `--new-version=<label>`.
- Turn-record files (`*.turns.jsonl.gz`) are git-ignored.
- 62 personas (ids 1–62, `scripts/personas.ts`).
- Definition of done per task: `npm run typecheck`, `npm test`, `npm run lint` pass; commit; report to the user and wait for go-ahead before the next task.

## Review Focus
1. A turn that throws (budget refusal, `TurnCancelled`) or a recorder callback that throws must never break or alter the turn → Task 3 test "a throwing onTurnRecord does not fail the turn".
2. A wave interrupted mid-run (Ctrl-C, budget stop) leaves personas without a run JSON → manifest marks them `failed`, and the next wave can rerun them → Task 5 test "marks a persona failed when its run folder has no run JSON".
3. Old runs (batches 1–17) have no turn records → the scorecard still produces a row with record-dependent columns `null` → Task 7 test "a run without a turns file yields a row with nulls".
4. The pre-screen quotes with curly quotes or different whitespace → verification normalises quotes/whitespace but still rejects a paraphrase → Task 8 test.
5. A hand-edited review sheet with "Confirmed", "YES", or a typo → parser accepts known verdicts case-insensitively and lists unrecognised lines instead of dropping them → Task 9 test.

---

### Task 1: TurnRecord type and TurnRecorder

**Files:**
- Create: `lib/orchestrator/turn-record.ts`
- Test: `tests/orchestrator/turn-record.test.ts`

**Interfaces:**
- Consumes: `CheckDecision` (`lib/orchestrator/check-log.ts`), `PromptContext` (`lib/agent/prompts/system.ts`), `ModelTurn` (`lib/agent/models/turn-schema.ts`), `TurnValidation` (`lib/agent/models/interface.ts`), `LlmUsage` (`lib/llm-usage.ts`), `Segment`/`SegmentKind` (`lib/orchestrator/turn-types.ts`), `Phase`.
- Produces: `AttemptKind`, `TurnStateBefore`, `TurnRecord`, `class TurnRecorder { request(); output(); usage(); segment(); setState(); setModelTurn(); finish(): TurnRecord }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orchestrator/turn-record.test.ts
import { describe, it, expect } from 'vitest';
import { TurnRecorder, type TurnStateBefore } from '@/lib/orchestrator/turn-record';

const state: TurnStateBefore = {
  phase: 'ANALYSIS', elapsedMs: 300_000, kind: 'model', promptContext: null,
  revealedIds: ['cogs_pct'], shownExhibitIds: [], openDataRequests: [], pressureTest: { state: 'satisfied' },
  stallRung: null, verifiedFigures: [], recomputeFlags: [], requestCues: ['can I get'],
};

describe('TurnRecorder', () => {
  it('collects requests, outputs, usage and segments with times from the turn start', () => {
    let t = 1000;
    const rec = new TurnRecorder(1000, () => t);
    rec.setState(state);
    t = 1100; rec.request('first', 'claude-sonnet-5-5', { model: 'claude-sonnet-5-5', messages: [] });
    t = 1900; rec.output('first', '{"say":"Got it."}');
    rec.usage({ component: 'interviewer', model: 'claude-sonnet-5-5', inputTokens: 10, outputTokens: 5 });
    t = 2000; rec.segment({ kind: 'say', text: 'Got it.', revealIds: [] });
    t = 2500; rec.segment({ kind: 'tail', text: 'What next?', revealIds: [] });
    const r = rec.finish({
      sessionId: 's1', turnIndex: 4, candidateText: 'Can I get costs?', checks: [{ check: 'vetoes', decision: 'pass' }],
      savedLine: 'Got it. What next?', phaseAfter: 'ANALYSIS', ended: false, timing: { plan_done: 30 },
    });
    expect(r.type).toBe('turn');
    expect(r.requests).toEqual([{ attempt: 'first', model: 'claude-sonnet-5-5', body: { model: 'claude-sonnet-5-5', messages: [] }, atMs: 100 }]);
    expect(r.outputs).toEqual([{ attempt: 'first', text: '{"say":"Got it."}', atMs: 900 }]);
    expect(r.delivered.map(s => [s.kind, s.atMs])).toEqual([['say', 1000], ['tail', 1500]]);
    expect(r.usage).toHaveLength(1);
    expect(r.stateBefore).toEqual(state);
    expect(r.parsedTurn).toBeNull();
  });

  it('keeps the request body as a snapshot (later mutation does not change the record)', () => {
    const rec = new TurnRecorder(0, () => 0);
    const body = { messages: [{ role: 'user', content: 'a' }] };
    rec.request('first', 'm', body);
    body.messages.push({ role: 'user', content: 'b' });
    rec.setState(state);
    const r = rec.finish({ sessionId: 's', turnIndex: 0, candidateText: '', checks: [], savedLine: '', phaseAfter: 'INTRO', ended: false, timing: {} });
    expect((r.requests[0].body as { messages: unknown[] }).messages).toHaveLength(1);
  });

  it('refuses to finish without a state snapshot', () => {
    const rec = new TurnRecorder(0, () => 0);
    expect(() => rec.finish({ sessionId: 's', turnIndex: 0, candidateText: '', checks: [], savedLine: '', phaseAfter: 'INTRO', ended: false, timing: {} }))
      .toThrow('state');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestrator/turn-record.test.ts`
Expected: FAIL — cannot resolve `@/lib/orchestrator/turn-record`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/orchestrator/turn-record.ts
// One record per candidate turn for evaluation runs (spec 2026-10-09
// persona-batch-evaluation §2.1): the exact requests the model got, the state
// they were built from, what the model wrote, what code decided and what was
// delivered. Filled through optional hooks; production passes none.
import type { CheckDecision } from './check-log';
import type { PromptContext } from '@/lib/agent/prompts/system';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { TurnValidation } from '@/lib/agent/models/interface';
import type { LlmUsage } from '@/lib/llm-usage';
import type { Segment, SegmentKind } from './turn-types';
import type { Phase } from './state-machine';

// first / retry: the adapter's own attempts; guard / guard_retry: the same
// after guard B wrote the turn again (lib/agent/interviewer.ts).
export type AttemptKind = 'first' | 'retry' | 'guard' | 'guard_retry';

export type TurnStateBefore = {
  phase: Phase;
  elapsedMs: number | null;
  kind: string;                       // TurnKind, or 'scripted'
  promptContext: PromptContext | null; // the exact input the prompt was built from
  revealedIds: string[];
  shownExhibitIds: string[];
  openDataRequests: { ledgerItemId: string; what: string }[];
  pressureTest: unknown;
  stallRung: number | null;
  verifiedFigures: unknown[];
  recomputeFlags: unknown[];
  requestCues: string[];
};

export type TurnRecord = {
  type: 'turn';
  sessionId: string;
  turnIndex: number;
  candidateText: string;
  stateBefore: TurnStateBefore;
  requests: { attempt: AttemptKind; model: string; body: unknown; atMs: number }[];
  outputs: { attempt: AttemptKind; text: string; atMs: number }[];
  parsedTurn: ModelTurn | null;
  validation: TurnValidation | null;
  checks: CheckDecision[];
  delivered: { kind: SegmentKind; text: string; revealIds: string[]; exhibitId?: string; atMs: number }[];
  savedLine: string;
  phaseAfter: Phase;
  ended: boolean;
  timing: Record<string, number>;
  usage: LlmUsage[];
};

export class TurnRecorder {
  private state: TurnStateBefore | null = null;
  private requests: TurnRecord['requests'] = [];
  private outputs: TurnRecord['outputs'] = [];
  private usages: LlmUsage[] = [];
  private segments: TurnRecord['delivered'] = [];
  private modelTurn: ModelTurn | null = null;
  private validation: TurnValidation | null = null;

  constructor(private startMs: number, private now: () => number = Date.now) {}

  private at(): number { return this.now() - this.startMs; }

  setState(s: TurnStateBefore): void { this.state = s; }
  setModelTurn(turn: ModelTurn | null, validation: TurnValidation | null): void { this.modelTurn = turn; this.validation = validation; }
  request(attempt: AttemptKind, model: string, body: unknown): void {
    this.requests.push({ attempt, model, body: structuredClone(body), atMs: this.at() });
  }
  output(attempt: AttemptKind, text: string): void { this.outputs.push({ attempt, text, atMs: this.at() }); }
  usage(u: LlmUsage): void { this.usages.push({ ...u }); }
  segment(seg: Segment): void {
    this.segments.push({ kind: seg.kind, text: seg.text, revealIds: [...seg.revealIds], ...(seg.exhibitId ? { exhibitId: seg.exhibitId } : {}), atMs: this.at() });
  }

  finish(p: {
    sessionId: string; turnIndex: number; candidateText: string; checks: CheckDecision[];
    savedLine: string; phaseAfter: Phase; ended: boolean; timing: Record<string, number>;
  }): TurnRecord {
    if (!this.state) throw new Error('TurnRecorder.finish: no state snapshot was set');
    return {
      type: 'turn', sessionId: p.sessionId, turnIndex: p.turnIndex, candidateText: p.candidateText,
      stateBefore: this.state, requests: this.requests, outputs: this.outputs,
      parsedTurn: this.modelTurn, validation: this.validation, checks: p.checks.map(c => ({ ...c })),
      delivered: this.segments, savedLine: p.savedLine, phaseAfter: p.phaseAfter, ended: p.ended,
      timing: { ...p.timing }, usage: this.usages,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestrator/turn-record.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/orchestrator/turn-record.ts tests/orchestrator/turn-record.test.ts
git commit -m "feat(eval): TurnRecord type and TurnRecorder"
```

---

### Task 2: Request / raw-output hooks in the model layer

**Files:**
- Modify: `lib/agent/models/interface.ts` (TurnContext)
- Modify: `lib/agent/models/anthropic.ts` (`attempt`)
- Modify: `lib/agent/models/cerebras.ts` (`attempt`)
- Modify: `lib/agent/models/gemini.ts` (`attempt`)
- Modify: `lib/agent/interviewer.ts` (`InterviewerTurnInput`, `streamInterviewerTurn`)
- Test: `tests/agent/model-hooks.test.ts`

**Interfaces:**
- Consumes: `AttemptKind` (Task 1).
- Produces: `TurnContext.onRequest?: (r: { attempt: 'first' | 'retry'; model: string; body: unknown }) => void`, `TurnContext.onRawOutput?: (r: { attempt: 'first' | 'retry'; text: string }) => void`; `InterviewerTurnInput.onRequest?: (r: { attempt: AttemptKind; model: string; body: unknown }) => void`, `InterviewerTurnInput.onRawOutput?: (r: { attempt: AttemptKind; text: string }) => void` (guard-B attempts tagged `guard` / `guard_retry`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/agent/model-hooks.test.ts
import { describe, it, expect } from 'vitest';
import { CerebrasInterviewerModel, RateLimiter } from '@/lib/agent/models/cerebras';
import { streamInterviewerTurn } from '@/lib/agent/interviewer';
import type { TurnContext, InterviewerModel, TurnEvent } from '@/lib/agent/models/interface';
import { eventsFromTurn } from '@/lib/agent/models/turn-events';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';

const turnJson = (over: Record<string, unknown> = {}) => JSON.stringify({ say: 'Got it.', move: 'analysis', requests: [], exhibit: null, rescue_item: null, question: 'What next?', ...over });
function sse(texts: string[]): typeof fetch {
  let i = 0;
  return (async () => {
    const t = texts[Math.min(i++, texts.length - 1)];
    const enc = new TextEncoder();
    const parts = [`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`, `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`, 'data: [DONE]\n\n'];
    return new Response(new ReadableStream({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); } }), { status: 200 });
  }) as unknown as typeof fetch;
}
const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({
  systemPrompt: 'FIXED', turnSystem: 'STATE', history: [{ role: 'user', content: 'hi' }],
  resolveId: id => (id === 'cogs_pct' ? id : null), validIds: ['cogs_pct'], ...over,
});
async function drain(g: AsyncIterable<TurnEvent>) { for await (const _ of g) void _; }

describe('model-layer request / raw-output hooks', () => {
  it('Cerebras: reports the exact body and the raw text of every attempt, retry included', async () => {
    const reqs: { attempt: string; body: unknown }[] = [];
    const outs: { attempt: string; text: string }[] = [];
    const m = new CerebrasInterviewerModel('qwen-3.8-27b', 'none', sse([turnJson({ requests: [{ what: 'x', item_ids: ['nope'], explicit: true, respond: 'release' }] }), turnJson()]), new RateLimiter(100));
    await drain(m.streamTurn(ctx({ onRequest: r => reqs.push(r), onRawOutput: r => outs.push(r) })));
    expect(reqs.map(r => r.attempt)).toEqual(['first', 'retry']);
    expect((reqs[0].body as { model: string }).model).toBe('qwen-3.8-27b');
    expect(outs.map(o => o.attempt)).toEqual(['first', 'retry']);
    expect(outs[1].text).toBe(turnJson());
  });

  it('interviewer: guard-B attempts are tagged guard / guard_retry', async () => {
    const turns: ModelTurn[] = [
      { move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'Q1?' },
      { move: 'analysis', requests: [{ what: 'costs', itemIds: ['cogs_pct'], explicit: true, respond: 'release' }], exhibit: null, rescueItem: null, say: '', question: 'Q2?' },
    ];
    const model: InterviewerModel = {
      runTurn: async () => turns[0],
      streamTurn: (c: TurnContext) => {
        c.onRequest?.({ attempt: 'first', model: 'fake', body: { turnSystem: c.turnSystem } });
        c.onRawOutput?.({ attempt: 'first', text: 'raw' });
        return eventsFromTurn(Promise.resolve(turns.shift()!));
      },
    };
    const reqs: string[] = [];
    await drain(streamInterviewerTurn({
      model, candidateText: 'Can I get the costs?', history: [], phase: 'ANALYSIS', requireRequests: true,
      promptCtx: { casePrompt: 'p', currentPhase: 'ANALYSIS', revealedValues: {}, unrevealedItems: [], exhibits: [], advancedLastTurn: false, elapsedMs: 0, totalMs: 1, phaseBudgetsMs: {} } as never,
      onRequest: r => reqs.push(r.attempt),
    }));
    expect(reqs).toEqual(['first', 'guard']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/model-hooks.test.ts`
Expected: FAIL — `onRequest` never called (`reqs` is `[]`).

- [ ] **Step 3: Implement**

`lib/agent/models/interface.ts` — add to `TurnContext` after `onMark`:

```ts
  // Evaluation recorder (spec 2026-10-09 §2.1): the exact request body of
  // every API call and the raw text it returned. Production passes none.
  onRequest?: (r: { attempt: 'first' | 'retry'; model: string; body: unknown }) => void;
  onRawOutput?: (r: { attempt: 'first' | 'retry'; text: string }) => void;
```

`lib/agent/models/anthropic.ts` — in `attempt`, build the params object once, report it, stream it, and report the raw text before each return:

```ts
    ctx.onMark?.(`${markPrefix}model_request`);
    const { thinking = 'between_tools', effort, fallbacks = true } = this.options;
    const params = {
      model: this.modelId,
      max_tokens: 1024,
      system,
      messages,
      output_config: { format: { type: 'json_schema' as const, schema: TURN_SCHEMA }, ...(effort ? { effort } : {}) },
      thinking: { type: thinking },
      ...(fallbacks ? { betas: [FALLBACK_BETA], fallbacks: FALLBACKS } : {}),
    };
    const which = markPrefix ? 'retry' as const : 'first' as const;
    ctx.onRequest?.({ attempt: which, model: this.modelId, body: params });
    const stream = this.client.beta.messages.stream(params as never);
```

and immediately before each of the three `return` statements in `attempt` (unknown-id abort, refusal, normal end) add:

```ts
    ctx.onRawOutput?.({ attempt: which, text: parser.text });
```

`lib/agent/models/cerebras.ts` — in `attempt`:

```ts
    const which = markPrefix ? 'retry' as const : 'first' as const;
    const body = buildBody(this.modelId, messages, this.reasoningEffort, this.endpoint.extraBody);
    ctx.onRequest?.({ attempt: which, model: this.modelId, body });
    const res = await this.post(body, abort.signal, ctx, markPrefix);
```

(replacing the inline `buildBody(...)` argument), and `ctx.onRawOutput?.({ attempt: which, text: parser.text });` before both `return` statements.

`lib/agent/models/gemini.ts` — in `attempt`, after `const body = {...}`:

```ts
    const which = markPrefix ? 'retry' as const : 'first' as const;
    ctx.onRequest?.({ attempt: which, model: this.modelId, body });
```

and `ctx.onRawOutput?.({ attempt: which, text: parser.text });` before both `return` statements.

`lib/agent/interviewer.ts` — add to `InterviewerTurnInput`:

```ts
  // Evaluation recorder: every API request and raw reply, guard-B ones tagged.
  onRequest?: (r: { attempt: AttemptKind; model: string; body: unknown }) => void;
  onRawOutput?: (r: { attempt: AttemptKind; text: string }) => void;
```

(with `import type { AttemptKind } from '@/lib/orchestrator/turn-record';`), and in `streamInterviewerTurn` set on `ctx`:

```ts
    onRequest: input.onRequest,
    onRawOutput: input.onRawOutput,
```

and for the guard regeneration replace the last line with:

```ts
  const guardTag = <T extends { attempt: 'first' | 'retry' }>(r: T) => ({ ...r, attempt: r.attempt === 'first' ? 'guard' as const : 'guard_retry' as const });
  yield* run({
    ...ctx,
    turnSystem: [ctx.turnSystem, REQUEST_GUARD_NOTE].filter(Boolean).join('\n\n'),
    onRequest: input.onRequest ? r => input.onRequest!(guardTag(r)) : undefined,
    onRawOutput: input.onRawOutput ? r => input.onRawOutput!(guardTag(r)) : undefined,
  });
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/agent`
Expected: PASS (new file plus all existing adapter tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/agent/models/interface.ts lib/agent/models/anthropic.ts lib/agent/models/cerebras.ts lib/agent/models/gemini.ts lib/agent/interviewer.ts tests/agent/model-hooks.test.ts
git commit -m "feat(eval): model-layer hooks report each request body and raw reply (guard-B attempts tagged)"
```

---

### Task 3: `runTurn` emits a TurnRecord (`onTurnRecord`)

**Files:**
- Modify: `lib/orchestrator/session-runner.ts`
- Test: `tests/orchestrator/turn-record-runner.test.ts`

**Interfaces:**
- Consumes: `TurnRecorder`, `TurnRecord`, `TurnStateBefore` (Task 1); `InterviewerTurnInput.onRequest/onRawOutput` (Task 2); `promptContextFor` (`lib/orchestrator/prompt-context.ts`); `revealedValues` (`lib/orchestrator/data-ledger.ts`).
- Produces: `RunTurnOptions.onTurnRecord?: (r: TurnRecord) => void`.

- [ ] **Step 1: Write the failing test**

Copy the in-memory store and mocks from `tests/orchestrator/pressure-test-runner.test.ts` lines 1–58 (store, `vi.mock('@/db/client')`, analytics, distress, data-requests, factory, pressure-test mocks, `runTurn` import, `T`, `ask` helpers, `beforeEach`), changing the factory mock's `streamTurn` so it reports a request and raw output:

```ts
      streamTurn: (ctx: { turnSystem?: string; onRequest?: (r: unknown) => void; onRawOutput?: (r: unknown) => void }) => {
        ctx.onRequest?.({ attempt: 'first', model: 'fake-model', body: { turnSystem: ctx.turnSystem } });
        const t = modelQueue.shift();
        if (!t) throw new Error('model queue empty');
        ctx.onRawOutput?.({ attempt: 'first', text: JSON.stringify(t) });
        return eventsFromTurn(Promise.resolve(t));
      },
```

Then:

```ts
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

describe('runTurn onTurnRecord', () => {
  it('records state before, the exact request, raw output, checks and the delivered line', async () => {
    resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', reasks: 0, gatedTurns: 0 } });
    modelQueue.push(T({ say: 'Got it.', question: 'Which line moved most?' }));
    const records: TurnRecord[] = [];
    const r = await runTurn('s1', 'I think costs drove it.', { onTurnRecord: rec => records.push(rec) });
    expect(records).toHaveLength(1);
    const rec = records[0];
    expect(rec.stateBefore.phase).toBe('ANALYSIS');
    expect(rec.stateBefore.kind).toBe('model');
    expect(rec.stateBefore.promptContext?.currentPhase).toBe('ANALYSIS');
    expect(rec.requests.map(q => q.attempt)).toEqual(['first']);
    expect(rec.outputs).toHaveLength(1);
    expect(rec.checks.some(c => c.check === 'vetoes')).toBe(true);
    expect(rec.savedLine).toBe(r.interviewerText);
    expect(rec.delivered.length).toBeGreaterThan(0);
    expect(rec.parsedTurn?.question).toBe('Which line moved most?');
  });

  it('without onTurnRecord nothing changes (same interviewer text)', async () => {
    resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', reasks: 0, gatedTurns: 0 } });
    modelQueue.push(T({ say: 'Got it.', question: 'Which line moved most?' }));
    const a = await runTurn('s1', 'I think costs drove it.', {});
    resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', reasks: 0, gatedTurns: 0 } });
    modelQueue.push(T({ say: 'Got it.', question: 'Which line moved most?' }));
    const b = await runTurn('s1', 'I think costs drove it.', { onTurnRecord: () => {} });
    expect(b.interviewerText).toBe(a.interviewerText);
  });

  it('a throwing onTurnRecord does not fail the turn', async () => {
    resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', reasks: 0, gatedTurns: 0 } });
    modelQueue.push(T({ say: 'Got it.', question: 'Which line moved most?' }));
    const r = await runTurn('s1', 'I think costs drove it.', { onTurnRecord: () => { throw new Error('disk full'); } });
    expect(r.interviewerText).toContain('Which line moved most?');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestrator/turn-record-runner.test.ts`
Expected: FAIL — `records` has length 0.

- [ ] **Step 3: Implement in `lib/orchestrator/session-runner.ts`**

Add imports:

```ts
import { TurnRecorder, type TurnRecord, type TurnStateBefore } from './turn-record';
import { revealedValues } from './data-ledger';
```

Add to `RunTurnOptions`:

```ts
  // Evaluation runs (spec 2026-10-09 §2.1): one TurnRecord per turn, after
  // Settle. Production passes none. A throwing callback is logged and ignored.
  onTurnRecord?: (record: TurnRecord) => void;
```

Add a state helper above `runTurnBody`:

```ts
function stateBeforeOf(plan: ModelPlan): TurnStateBefore {
  const { ctx, state } = plan;
  return {
    phase: ctx.currentPhase,
    elapsedMs: state.elapsedMs,
    kind: state.kind,
    promptContext: promptContextFor(plan),
    revealedIds: Object.keys(revealedValues(state.ledger)),
    shownExhibitIds: [...state.shownExhibitIds],
    openDataRequests: state.openDataRequests.map(o => ({ ledgerItemId: o.ledgerItemId, what: o.what })),
    pressureTest: state.pressureTest,
    stallRung: state.stallDecision.intervene ? (state.stallDecision.rung ?? null) : null,
    verifiedFigures: [...state.verifiedNow],
    recomputeFlags: [...state.recomputeFlags],
    requestCues: [...state.requestCues],
  };
}
```

In `runTurnBody`, right after `const timer = new TurnTimer(turnStartMs);`:

```ts
  const rec = opts.onTurnRecord ? new TurnRecorder(turnStartMs) : null;
  let recordCtx: TurnCtx | null = null;
```

and replace the `done` helper with:

```ts
  const done = (value: TurnResult): TurnResult => {
    opts.onTiming?.({ ...timer.marks });
    if (rec && recordCtx) {
      try {
        opts.onTurnRecord!(rec.finish({
          sessionId, turnIndex: recordCtx.nextTurnIndex, candidateText, checks: recordCtx.checks.entries,
          savedLine: value.interviewerText, phaseAfter: value.phase, ended: value.ended, timing: { ...timer.marks },
        }));
      } catch (e) {
        console.warn('[runner] onTurnRecord failed (ignored):', e instanceof Error ? e.message : e);
      }
    }
    return value;
  };
```

(`done` is only ever called with a `TurnResult`; add `type TurnCtx` to the `./turn-types` import.)

After `const plan = planTurn(...)`, before the scripted branch:

```ts
  recordCtx = plan.ctx;
  if (rec) {
    rec.setState(plan.kind === 'scripted'
      ? { phase: plan.ctx.currentPhase, elapsedMs: null, kind: 'scripted', promptContext: null, revealedIds: [], shownExhibitIds: [],
          openDataRequests: [], pressureTest: null, stallRung: null, verifiedFigures: [], recomputeFlags: [], requestCues: [] }
      : stateBeforeOf(plan));
  }
```

In the scripted branch, record the scripted segment:

```ts
    if (sink) await sink({ text: plan.interviewerText, revealIds: [], kind: 'scripted' }).catch(() => {});
    rec?.segment({ text: plan.interviewerText, revealIds: [], kind: 'scripted' });
```

In `deliver`, after the sink resolves, add `rec?.segment(seg);`. In `offerPause` nothing extra (it uses `deliver`).

In the model branch's `streamInterviewerTurn({...})` call add:

```ts
      onRequest: rec ? r => rec.request(r.attempt, r.model, r.body) : undefined,
      onRawOutput: rec ? r => rec.output(r.attempt, r.text) : undefined,
```

and inside the existing `onUsage` callback add `rec?.usage(u);`. After `out` is assigned in both branches (code-written and model), add:

```ts
  rec?.setModelTurn(out.turn, out.validation);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/orchestrator`
Expected: PASS (new file and all existing runner tests).

- [ ] **Step 5: Commit**

```bash
git add lib/orchestrator/session-runner.ts tests/orchestrator/turn-record-runner.test.ts
git commit -m "feat(eval): runTurn emits a TurnRecord through optional onTurnRecord"
```

---

### Task 4: live-run writes the turn file (header, turns, end line)

**Files:**
- Create: `lib/eval/turn-file.ts`, `lib/eval/git-info.ts`
- Modify: `scripts/live-run.ts`, `.gitignore`
- Test: `tests/eval/turn-file.test.ts`

**Interfaces:**
- Consumes: `TurnRecord` (Task 1); `RunTurnOptions.onTurnRecord` (Task 3).
- Produces:
  - `type TurnFileHeader = { type: 'header'; batch: string | null; version: string | null; wave: string | null; runNumber: number | null; commit: string; dirty: boolean; models: Record<string, string>; persona: { id: number; name: string; brief: string } | null; sessionId: string; startedAt: string }`
  - `type TurnFileEnd = { type: 'end'; ended: boolean; budgetStopped: boolean; scoring: string; candidateUsage: { calls: number; input: number; output: number; usd: number } }`
  - `writeTurnFile(path: string, header: TurnFileHeader, turns: TurnRecord[], end: TurnFileEnd): void`
  - `readTurnFile(path: string): { header: TurnFileHeader; turns: TurnRecord[]; end: TurnFileEnd | null }`
  - `gitInfo(cwd?: string): { commit: string; dirty: boolean }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/eval/turn-file.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeTurnFile, readTurnFile, type TurnFileHeader } from '@/lib/eval/turn-file';
import { gitInfo } from '@/lib/eval/git-info';

const header: TurnFileHeader = { type: 'header', batch: 'batch-18', version: 'v1', wave: 'batch-18-oct-09-runs-1-2', runNumber: 1, commit: 'abc', dirty: false, models: { interviewer: 'claude-sonnet-5-5' }, persona: { id: 1, name: 'Maya', brief: 'b' }, sessionId: 's1', startedAt: '2026-10-09T00:00:00Z' };

describe('turn file', () => {
  it('round-trips header, turns and end line through gzip', () => {
    const p = path.join(mkdtempSync(path.join(tmpdir(), 'tf-')), 'x.turns.jsonl.gz');
    const turn = { type: 'turn', turnIndex: 0 } as never;
    writeTurnFile(p, header, [turn], { type: 'end', ended: true, budgetStopped: false, scoring: 'scored', candidateUsage: { calls: 1, input: 2, output: 3, usd: 0.1 } });
    const back = readTurnFile(p);
    expect(back.header).toEqual(header);
    expect(back.turns).toHaveLength(1);
    expect(back.end?.scoring).toBe('scored');
  });

  it('a file cut off before the end line reads with end = null', () => {
    const p = path.join(mkdtempSync(path.join(tmpdir(), 'tf-')), 'cut.turns.jsonl.gz');
    writeFileSync(p, gzipSync(JSON.stringify(header) + '\n' + JSON.stringify({ type: 'turn', turnIndex: 0 }) + '\n'));
    expect(readTurnFile(p).end).toBeNull();
  });

  it('gitInfo returns a 40-char commit and a dirty flag', () => {
    const g = gitInfo();
    expect(g.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof g.dirty).toBe('boolean');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/eval/turn-file.test.ts`
Expected: FAIL — cannot resolve `@/lib/eval/turn-file`.

- [ ] **Step 3: Implement**

```ts
// lib/eval/git-info.ts
// The code version a run used (spec 2026-10-09 §2.2 freeze).
import { execSync } from 'node:child_process';

export function gitInfo(cwd: string = process.cwd()): { commit: string; dirty: boolean } {
  const commit = execSync('git rev-parse HEAD', { cwd }).toString().trim();
  // Untracked run outputs don't make the code dirty; tracked changes do.
  const dirty = execSync('git status --porcelain --untracked-files=no', { cwd }).toString().trim().length > 0;
  return { commit, dirty };
}
```

```ts
// lib/eval/turn-file.ts
// <run>.turns.jsonl.gz: a header line, one line per TurnRecord, an end line
// (spec 2026-10-09 §2.1). A run that died has no end line.
import { writeFileSync, readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

export type TurnFileHeader = {
  type: 'header'; batch: string | null; version: string | null; wave: string | null; runNumber: number | null;
  commit: string; dirty: boolean; models: Record<string, string>;
  persona: { id: number; name: string; brief: string } | null; sessionId: string; startedAt: string;
};
export type TurnFileEnd = {
  type: 'end'; ended: boolean; budgetStopped: boolean; scoring: string;
  candidateUsage: { calls: number; input: number; output: number; usd: number };
};

export function writeTurnFile(p: string, header: TurnFileHeader, turns: TurnRecord[], end: TurnFileEnd): void {
  const lines = [header, ...turns, end].map(x => JSON.stringify(x)).join('\n') + '\n';
  writeFileSync(p, gzipSync(lines));
}

export function readTurnFile(p: string): { header: TurnFileHeader; turns: TurnRecord[]; end: TurnFileEnd | null } {
  const rows = gunzipSync(readFileSync(p)).toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { type: string });
  const header = rows.find(r => r.type === 'header') as TurnFileHeader | undefined;
  if (!header) throw new Error(`${p}: no header line`);
  return {
    header,
    turns: rows.filter(r => r.type === 'turn') as TurnRecord[],
    end: (rows.find(r => r.type === 'end') as TurnFileEnd | undefined) ?? null,
  };
}
```

`.gitignore` — append:

```
# per-turn evaluation records (spec 2026-10-09 §2.1) — large; summaries are committed
*.turns.jsonl.gz
```

`scripts/live-run.ts`:
1. Imports: `import { writeTurnFile, type TurnFileHeader } from '@/lib/eval/turn-file';`, `import { gitInfo } from '@/lib/eval/git-info';`, `import type { TurnRecord } from '@/lib/orchestrator/turn-record';`, `import { INTERVIEWER_MODEL_ID, SCORING_MODEL_ID } from '@/lib/models';`.
2. Flags after `NO_SCORE`: `const VERSION = flag('version') ?? null; const WAVE = flag('wave') ?? null; const RUN_NUMBER = flag('run-number') ? Number(flag('run-number')) : null; const BATCH_ID = flag('batch-id') ?? null;`
3. Module-level: `const turnRecords: TurnRecord[] = []; let turnHeader: TurnFileHeader | null = null;`
4. In `main()` after `startSession` and the session log line:

```ts
  const git = gitInfo();
  turnHeader = {
    type: 'header', batch: BATCH_ID, version: VERSION, wave: WAVE, runNumber: RUN_NUMBER, commit: git.commit, dirty: git.dirty,
    models: { interviewer: process.env.INTERVIEWER_PROVIDER ?? INTERVIEWER_MODEL_ID, scoring: SCORING_MODEL_ID, candidate: CANDIDATE_MODEL },
    persona: PERSONA ? { id: PERSONA.id, name: PERSONA.name, brief: PERSONA.brief } : null,
    sessionId, startedAt: new Date().toISOString(),
  };
```

5. The `runTurn` call becomes `runTurn(sessionId, candidateText, { defer: task => { background.push(task()); }, onTurnRecord: r => turnRecords.push(r) })`.
6. Pass `ended`, `budgetStopped`, `scoring.status` to `writeArtifacts` (new optional third parameter `run?: { ended: boolean; budgetStopped: boolean; scoring: string }`) and, inside `writeArtifacts` after `base` is computed:

```ts
  if (turnHeader && run) {
    writeTurnFile(path.join(OUT_DIR, `${base}.turns.jsonl.gz`), turnHeader, turnRecords, {
      type: 'end', ended: run.ended, budgetStopped: run.budgetStopped, scoring: run.scoring,
      candidateUsage: { calls: candidateUsage.calls, input: candidateUsage.input, output: candidateUsage.output, usd: candidateUsage.usd },
    });
  }
```

Call site in `main`: `await writeArtifacts(sessionId, caseData.title, { ended, budgetStopped, scoring: scoring.status });`. `finish()` keeps calling `writeArtifacts(sessionId, title)` (no turn file — that run's records are gone).

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/eval/turn-file.test.ts && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/eval/turn-file.ts lib/eval/git-info.ts scripts/live-run.ts .gitignore tests/eval/turn-file.test.ts
git commit -m "feat(eval): live-run writes <run>.turns.jsonl.gz (header with commit and persona, every TurnRecord, end line with simulator spend)"
```

---

### Task 5: Batch manifest, wave naming and the freeze

**Files:**
- Create: `lib/eval/batch-manifest.ts`
- Test: `tests/eval/batch-manifest.test.ts`

**Interfaces:**
- Produces:
  - `type PersonaEntry = { personaId: number; runNumber: number; status: 'pending' | 'done' | 'failed'; wave: string; version: string; runDir: string | null }`
  - `type Manifest = { batch: 'batch-18'; version: string; commit: string; bandsHash: string | null; severityHash: string | null; models: Record<string, string>; runs: PersonaEntry[] }`
  - `waveFolderName(date: Date, firstRun: number, lastRun: number): string` → `batch-18-oct-09-runs-1-10`
  - `planWave(m: Manifest | null, p: { personaIds: number[]; knownIds: number[]; commit: string; dirty: boolean; newVersion?: string; rerun?: boolean; date: Date; models: Record<string, string> }): { manifest: Manifest; wave: string; entries: PersonaEntry[] }` (throws on freeze violations; `knownIds` = the persona ids that exist, passed in by the script so `lib/` never imports `scripts/`)
  - `markWaveResults(m: Manifest, entries: PersonaEntry[], runJsonExists: (runDir: string) => boolean): Manifest`
  - `loadManifest(dir: string): Manifest | null`, `saveManifest(dir: string, m: Manifest): void`

- [ ] **Step 1: Write the failing test**

```ts
// tests/eval/batch-manifest.test.ts
import { describe, it, expect } from 'vitest';
import { waveFolderName, planWave, markWaveResults, type Manifest } from '@/lib/eval/batch-manifest';

const d = new Date('2026-10-09T15:00:00');
const base = { commit: 'c1', dirty: false, date: d, models: { interviewer: 'claude-sonnet-5-5' }, knownIds: Array.from({ length: 62 }, (_, i) => i + 1) };

describe('batch manifest', () => {
  it('names wave folders batch-18-<mon>-<dd>-runs-<x>-<y>', () => {
    expect(waveFolderName(d, 1, 10)).toBe('batch-18-oct-09-runs-1-10');
    expect(waveFolderName(new Date('2026-11-02T10:00:00'), 11, 11)).toBe('batch-18-nov-02-runs-11-11');
  });

  it('first wave creates the manifest and numbers runs in order', () => {
    const w = planWave(null, { ...base, personaIds: [5, 2, 9] });
    expect(w.wave).toBe('batch-18-oct-09-runs-1-3');
    expect(w.entries.map(e => [e.personaId, e.runNumber])).toEqual([[5, 1], [2, 2], [9, 3]]);
    expect(w.manifest.version).toBe('v1');
    expect(w.manifest.commit).toBe('c1');
  });

  it('continues run numbers in the next wave and skips personas already done', () => {
    let m: Manifest = planWave(null, { ...base, personaIds: [1, 2] }).manifest;
    m = markWaveResults(m, m.runs, () => true);
    const w = planWave(m, { ...base, personaIds: [2, 3] });
    expect(w.entries.map(e => [e.personaId, e.runNumber])).toEqual([[3, 3]]);
    expect(w.wave).toBe('batch-18-oct-09-runs-3-3');
  });

  it('refuses a dirty tree and a changed commit; --new-version allows the commit change and tags runs', () => {
    const m = planWave(null, { ...base, personaIds: [1] }).manifest;
    expect(() => planWave(m, { ...base, dirty: true, personaIds: [2] })).toThrow(/uncommitted/);
    expect(() => planWave(m, { ...base, commit: 'c2', personaIds: [2] })).toThrow(/commit/);
    const w = planWave(m, { ...base, commit: 'c2', newVersion: 'v2', personaIds: [2] });
    expect(w.entries[0].version).toBe('v2');
    expect(w.manifest.version).toBe('v2');
  });

  it('refuses more than 10 personas and unknown persona ids', () => {
    expect(() => planWave(null, { ...base, personaIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] })).toThrow(/10/);
    expect(() => planWave(null, { ...base, personaIds: [99] })).toThrow(/99/);
  });

  it('marks a persona failed when its run folder has no run JSON, and --rerun runs failed or done ones again', () => {
    let m = planWave(null, { ...base, personaIds: [1, 2] }).manifest;
    m = { ...m, runs: m.runs.map(r => ({ ...r, runDir: `dir-${r.personaId}` })) };
    m = markWaveResults(m, m.runs, dir => dir === 'dir-1');
    expect(m.runs.map(r => r.status)).toEqual(['done', 'failed']);
    const again = planWave(m, { ...base, personaIds: [2] });
    expect(again.entries.map(e => e.personaId)).toEqual([2]);       // failed ones run again without --rerun
    const re = planWave(m, { ...base, personaIds: [1], rerun: true });
    expect(re.entries.map(e => e.personaId)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/eval/batch-manifest.test.ts`
Expected: FAIL — cannot resolve `@/lib/eval/batch-manifest`.

- [ ] **Step 3: Implement**

```ts
// lib/eval/batch-manifest.ts
// Batch 18 manifest (spec 2026-10-09 §2.2): which personas ran, in which
// wave, on which commit. Waves are user-sized (≤10); the configuration is
// frozen — a dirty tree or a new commit needs --new-version, and a version's
// runs are never pooled with another's.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export type PersonaEntry = {
  personaId: number; runNumber: number; status: 'pending' | 'done' | 'failed';
  wave: string; version: string; runDir: string | null;
};
export type Manifest = {
  batch: 'batch-18'; version: string; commit: string; bandsHash: string | null; severityHash: string | null;
  models: Record<string, string>; runs: PersonaEntry[];
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const MAX_WAVE = 10;

export function waveFolderName(date: Date, firstRun: number, lastRun: number): string {
  return `batch-18-${MONTHS[date.getMonth()]}-${String(date.getDate()).padStart(2, '0')}-runs-${firstRun}-${lastRun}`;
}

export function planWave(m: Manifest | null, p: {
  personaIds: number[]; knownIds: number[]; commit: string; dirty: boolean; newVersion?: string; rerun?: boolean; date: Date; models: Record<string, string>;
  hashes?: { bands: string; severity: string };
}): { manifest: Manifest; wave: string; entries: PersonaEntry[] } {
  if (p.personaIds.length === 0) throw new Error('no personas given');
  if (p.personaIds.length > MAX_WAVE) throw new Error(`a wave runs at most ${MAX_WAVE} personas (got ${p.personaIds.length})`);
  const known = new Set(p.knownIds);
  const unknown = p.personaIds.filter(id => !known.has(id));
  if (unknown.length) throw new Error(`unknown persona ids: ${unknown.join(', ')}`);
  if (p.dirty) throw new Error('the working tree has uncommitted changes — commit them before a wave (freeze)');

  let manifest: Manifest = m ?? { batch: 'batch-18', version: p.newVersion ?? 'v1', commit: p.commit, bandsHash: null, severityHash: null, models: p.models, runs: [] };
  if (m && m.commit !== p.commit) {
    if (!p.newVersion) throw new Error(`commit changed since the batch started (${m.commit.slice(0, 7)} → ${p.commit.slice(0, 7)}); pass --new-version=<label>`);
    manifest = { ...m, version: p.newVersion, commit: p.commit, models: p.models };
  }
  const latest = new Map<number, PersonaEntry>();
  for (const r of manifest.runs) latest.set(r.personaId, r);
  const todo = p.personaIds.filter(id => p.rerun || latest.get(id)?.status !== 'done');
  if (todo.length === 0) throw new Error('every persona given has already run (use --rerun to run again)');
  const first = manifest.runs.reduce((n, r) => Math.max(n, r.runNumber), 0) + 1;
  const wave = waveFolderName(p.date, first, first + todo.length - 1);
  const entries: PersonaEntry[] = todo.map((personaId, i) => ({ personaId, runNumber: first + i, status: 'pending', wave, version: manifest.version, runDir: null }));
  return { manifest: { ...manifest, runs: [...manifest.runs, ...entries] }, wave, entries };
}

export function markWaveResults(m: Manifest, entries: PersonaEntry[], runJsonExists: (runDir: string) => boolean): Manifest {
  const done = new Map(entries.map(e => [e.runNumber, e]));
  return {
    ...m,
    runs: m.runs.map(r => {
      const e = done.get(r.runNumber);
      if (!e) return r;
      const runDir = e.runDir ?? r.runDir;
      return { ...r, runDir, status: runDir && runJsonExists(runDir) ? 'done' : 'failed' };
    }),
  };
}

export function loadManifest(dir: string): Manifest | null {
  const f = path.join(dir, 'manifest.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Manifest) : null;
}

export function saveManifest(dir: string, m: Manifest): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/eval/batch-manifest.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/eval/batch-manifest.ts tests/eval/batch-manifest.test.ts
git commit -m "feat(eval): batch-18 manifest — wave naming, run numbering, freeze, failed/rerun handling"
```

---

### Task 6: Wave launcher `scripts/persona-batch.ts`

**Files:**
- Create: `lib/eval/wave-commands.ts`, `scripts/persona-batch.ts`
- Test: `tests/eval/wave-commands.test.ts`

**Interfaces:**
- Consumes: `planWave`, `markWaveResults`, `loadManifest`, `saveManifest`, `PersonaEntry` (Task 5); `gitInfo` (Task 4).
- Produces: `liveRunArgs(e: PersonaEntry, p: { pace: 'human' | 'fast' }): string[]`; `findRunDir(waveDir: string, personaId: number): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/eval/wave-commands.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { liveRunArgs, findRunDir } from '@/lib/eval/wave-commands';

describe('wave commands', () => {
  it('builds the live-run arguments for one persona', () => {
    const args = liveRunArgs({ personaId: 7, runNumber: 12, status: 'pending', wave: 'batch-18-oct-09-runs-11-20', version: 'v1', runDir: null }, { pace: 'human' });
    expect(args).toEqual(['scripts/live-run.ts', 'prof-001', '--persona=7', '--batch=batch-18-oct-09-runs-11-20', '--pace=human',
      '--batch-id=batch-18', '--version=v1', '--wave=batch-18-oct-09-runs-11-20', '--run-number=12']);
  });

  it('finds the persona run folder by its two-digit id prefix', () => {
    const wave = mkdtempSync(path.join(tmpdir(), 'wave-'));
    mkdirSync(path.join(wave, '07-sam-the-something'));
    expect(findRunDir(wave, 7)).toBe(path.join(wave, '07-sam-the-something'));
    expect(findRunDir(wave, 8)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/eval/wave-commands.test.ts`
Expected: FAIL — cannot resolve `@/lib/eval/wave-commands`.

- [ ] **Step 3: Implement**

```ts
// lib/eval/wave-commands.ts
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { PersonaEntry } from './batch-manifest';

export function liveRunArgs(e: PersonaEntry, p: { pace: 'human' | 'fast' }): string[] {
  return ['scripts/live-run.ts', 'prof-001', `--persona=${e.personaId}`, `--batch=${e.wave}`, `--pace=${p.pace}`,
    '--batch-id=batch-18', `--version=${e.version}`, `--wave=${e.wave}`, `--run-number=${e.runNumber}`];
}

// live-run names a persona folder NN-<name> (scripts/live-run.ts OUT_DIR).
export function findRunDir(waveDir: string, personaId: number): string | null {
  if (!existsSync(waveDir)) return null;
  const prefix = `${String(personaId).padStart(2, '0')}-`;
  const hit = readdirSync(waveDir).find(d => d.startsWith(prefix));
  return hit ? path.join(waveDir, hit) : null;
}
```

```ts
// scripts/persona-batch.ts
// One wave of batch 18 (spec 2026-10-09 §2.2): the personas given, in
// parallel, each through scripts/live-run.ts, under one shared budget.
//
//   npx tsx scripts/persona-batch.ts --personas=1,2,3 --cap=65 [--pace=fast] [--new-version=v2] [--rerun] [--dry]
//
// Costs real money (≈ $0.77 per persona scored). --dry prints the plan only.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { planWave, markWaveResults, loadManifest, saveManifest } from '@/lib/eval/batch-manifest';
import { liveRunArgs, findRunDir } from '@/lib/eval/wave-commands';
import { gitInfo } from '@/lib/eval/git-info';
import { INTERVIEWER_MODEL_ID, SCORING_MODEL_ID } from '@/lib/models';
import { PERSONAS } from './personas';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const RUNS = 'Case Interview Runs/test runs';
const BATCH_DIR = path.join(RUNS, 'batch-18');
const PER_PERSONA_USD = 0.77;

async function main() {
  const personaIds = (arg('personas') ?? '').split(',').filter(Boolean).map(Number);
  const cap = Number(arg('cap'));
  if (!(cap > 0)) throw new Error('--cap=<USD> is required (the batch budget, shared across waves)');
  const pace = arg('pace') === 'fast' ? 'fast' : 'human';
  const git = gitInfo();
  const { manifest, wave, entries } = planWave(loadManifest(BATCH_DIR), {
    personaIds, knownIds: PERSONAS.map(x => x.id), commit: git.commit, dirty: git.dirty, newVersion: arg('new-version'), rerun: process.argv.includes('--rerun'),
    date: new Date(), models: { interviewer: process.env.INTERVIEWER_PROVIDER ?? INTERVIEWER_MODEL_ID, scoring: SCORING_MODEL_ID },
  });
  console.log(`[wave] ${wave}: ${entries.map(e => `#${e.runNumber}=persona ${e.personaId}`).join(', ')} · version ${manifest.version} · commit ${git.commit.slice(0, 7)} · pace ${pace}`);
  console.log(`[wave] estimate ≈ $${(entries.length * PER_PERSONA_USD).toFixed(2)} · batch cap $${cap} (ledger ${BATCH_DIR}/budget-ledger.jsonl)`);
  if (process.argv.includes('--dry')) return;
  saveManifest(BATCH_DIR, manifest);

  const env = { ...process.env, LLM_BUDGET_USD: String(cap), LLM_BUDGET_FILE: path.resolve(BATCH_DIR, 'budget-ledger.jsonl') };
  await Promise.all(entries.map(e => new Promise<void>(resolve => {
    const child = spawn('npx', ['tsx', '--env-file=.env.local', ...liveRunArgs(e, { pace })], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', d => process.stdout.write(`[#${e.runNumber} p${e.personaId}] ${d}`));
    child.stderr.on('data', d => process.stderr.write(`[#${e.runNumber} p${e.personaId}] ${d}`));
    child.on('close', code => { console.log(`[wave] #${e.runNumber} persona ${e.personaId} exited ${code}`); resolve(); });
  })));

  const waveDir = path.join(RUNS, wave);
  const located = entries.map(e => ({ ...e, runDir: findRunDir(waveDir, e.personaId) }));
  const updated = markWaveResults(loadManifest(BATCH_DIR)!, located,
    dir => existsSync(dir) && readdirSync(dir).some(f => f.endsWith('.json')));
  saveManifest(BATCH_DIR, updated);
  const results = updated.runs.filter(r => r.wave === wave);
  console.log(`[wave] done: ${results.filter(r => r.status === 'done').length} ok, ${results.filter(r => r.status === 'failed').length} failed`);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 4: Run tests and a dry wave**

Run: `npx vitest run tests/eval/wave-commands.test.ts && npx tsx scripts/persona-batch.ts --personas=1,2 --cap=65 --dry`
Expected: PASS; the dry run prints `[wave] batch-18-<today>-runs-1-2: #1=persona 1, #2=persona 2 …` and writes nothing (it fails with the freeze message if the tree is dirty — commit first).

- [ ] **Step 5: Commit**

```bash
git add lib/eval/wave-commands.ts scripts/persona-batch.ts tests/eval/wave-commands.test.ts
git commit -m "feat(eval): persona-batch wave launcher (parallel live-runs, shared ledger, manifest update)"
```

---

### Task 7: Scorecard extractor with code flags

**Files:**
- Create: `lib/eval/scorecard.ts`, `scripts/batch-scorecard.ts`
- Test: `tests/eval/scorecard.test.ts`

**Interfaces:**
- Consumes: `TurnRecord` (Task 1); `readTurnFile` (Task 4); `stageAdministration` (`lib/orchestrator/spoken-close.ts`); `isBareAcknowledgment` (`lib/orchestrator/stream-turn.ts`); `costOf`, `isPriced` (`lib/llm-pricing.ts`); `Manifest` (Task 5).
- Produces:
  - `type RunRecord = { session: { id: string; status: string }; turns: { turnIndex: number; role: string; text: string }[]; score: Record<string, unknown> | null; events: { category: string; subtype: string; turnIndex: number | null; payloadJsonb: Record<string, unknown> }[]; analytics: { eventType: string; payloadJsonb: Record<string, unknown> }[] }`
  - `type CodeFlag = { turnIndex: number | null; kind: 'question_withheld' | 'guard_double_miss' | 'model_unusable' | 'prefix_mismatch' | 'loop' | 'stage_skipped' | 'technical_failure' | 'slow_turn'; detail: string }`
  - `type ScorecardRow` (fields below)
  - `DIMENSIONS: readonly ['structure','quantitative','dataExhibit','judgment','creativity','communication','synthesis','pushback']`
  - `scorecardRow(p: { runId: string; run: RunRecord; turnFile: { header: TurnFileHeader; turns: TurnRecord[]; end: TurnFileEnd | null } | null }): ScorecardRow`
  - `firstRelevantMs(t: TurnRecord): number | null`
  - `maxSameQuestion(questions: string[]): number`

- [ ] **Step 1: Write the failing test**

```ts
// tests/eval/scorecard.test.ts
import { describe, it, expect } from 'vitest';
import { scorecardRow, firstRelevantMs, maxSameQuestion, type RunRecord } from '@/lib/eval/scorecard';
import { stageAdministration } from '@/lib/orchestrator/spoken-close';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

const turn = (i: number, over: Partial<TurnRecord> = {}): TurnRecord => ({
  type: 'turn', sessionId: 's', turnIndex: i, candidateText: 'c',
  stateBefore: { phase: 'ANALYSIS', elapsedMs: 0, kind: 'model', promptContext: null, revealedIds: [], shownExhibitIds: [], openDataRequests: [], pressureTest: null, stallRung: null, verifiedFigures: [], recomputeFlags: [], requestCues: [] },
  requests: [], outputs: [], parsedTurn: null, validation: null, checks: [],
  delivered: [{ kind: 'tail', text: 'Q?', revealIds: [], atMs: 1500 }], savedLine: 'Q?', phaseAfter: 'ANALYSIS', ended: false, timing: {}, usage: [], ...over,
});
const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  session: { id: 's', status: 'completed' },
  turns: [{ turnIndex: 0, role: 'interviewer', text: 'Your client…' }, { turnIndex: 1, role: 'candidate', text: 'c' }, { turnIndex: 2, role: 'interviewer', text: 'What would you brainstorm? What is the biggest risk? What is your recommendation?' }],
  score: { structureRating: 'meets_bar', quantitativeRating: 'strong' }, events: [], analytics: [], ...over,
});

describe('scorecard', () => {
  it('first relevant spoken text: a non-acknowledgment say sentence, else the data line, else the tail', () => {
    expect(firstRelevantMs(turn(0, { delivered: [{ kind: 'say', text: 'Got it.', revealIds: [], atMs: 400 }, { kind: 'data', text: 'COGS is 58%.', revealIds: ['cogs_pct'], atMs: 900 }, { kind: 'tail', text: 'Q?', revealIds: [], atMs: 1500 }] }))).toBe(900);
    expect(firstRelevantMs(turn(0, { delivered: [{ kind: 'say', text: 'You split it three ways.', revealIds: [], atMs: 600 }, { kind: 'tail', text: 'Q?', revealIds: [], atMs: 1500 }] }))).toBe(600);
    expect(firstRelevantMs(turn(0, { delivered: [] }))).toBeNull();
  });

  it('counts the same question asked again (near-identical wording)', () => {
    expect(maxSameQuestion(['Is that MECE — what is missing?', 'Is that MECE, what is missing?', 'Which branch first?', 'Is that MECE? What is missing?'])).toBe(3);
  });

  it('a run with a turn file: completion, stages, loop flag, performance and ratings', () => {
    const turns = [0, 1, 2, 3].map(i => turn(i, { savedLine: 'Is that MECE — what is missing?', delivered: [{ kind: 'tail', text: 'Is that MECE — what is missing?', revealIds: [], atMs: 1000 + i * 100 }] }));
    const row = scorecardRow({
      runId: 'r1', run: run(),
      turnFile: { header: { type: 'header', batch: 'batch-18', version: 'v1', wave: 'w', runNumber: 3, commit: 'c', dirty: false, models: {}, persona: { id: 18, name: 'Nikhil', brief: '' }, sessionId: 's', startedAt: '' }, turns, end: { type: 'end', ended: true, budgetStopped: false, scoring: 'scored', candidateUsage: { calls: 1, input: 1, output: 1, usd: 0.24 } } },
    });
    expect(row.completion).toBe('ended');
    expect(row.stuck).toBe(true);
    expect(row.codeFlags.some(f => f.kind === 'loop')).toBe(true);
    expect(row.stages).toEqual(stageAdministration(run().turns.filter(t => t.role === 'interviewer').map(t => t.text), false));
    expect(row.performance.firstRelevantMedianMs).toBe(1200);
    expect(row.performance.simulatorCostUsd).toBeCloseTo(0.24);
    expect(row.ratings.quantitative).toBe('strong');
    expect(row.ratings.pushback).toBeNull();
    expect(row.personaId).toBe(18);
    expect(row.scoringQa).toBeNull();
  });

  it('carries the numeric scoring-QA counters', () => {
    const row = scorecardRow({ runId: 'r', turnFile: null, run: run({ analytics: [{ eventType: 'scoring_qa', payloadJsonb: { verifierDrops: 2, evidenceStrips: 0, artifactTypes: [] } }] }) });
    expect(row.scoringQa).toEqual({ verifierDrops: 2, evidenceStrips: 0 });
  });

  it('a run without a turns file yields a row with nulls', () => {
    const row = scorecardRow({ runId: 'old', run: run(), turnFile: null });
    expect(row.performance.firstRelevantMedianMs).toBeNull();
    expect(row.stuck).toBeNull();
    expect(row.completion).toBe('ended');
  });

  it('a turn file with no end line is a technical failure', () => {
    const row = scorecardRow({ runId: 'r', run: run({ session: { id: 's', status: 'active' } }), turnFile: { header: { type: 'header', batch: null, version: null, wave: null, runNumber: null, commit: 'c', dirty: false, models: {}, persona: null, sessionId: 's', startedAt: '' }, turns: [turn(0)], end: null } });
    expect(row.completion).toBe('technical_failure');
    expect(row.codeFlags.some(f => f.kind === 'technical_failure')).toBe(true);
  });

  it('counts opportunities and repeated asks from events', () => {
    const ev = (subtype: string, turnIndex: number, payload: Record<string, unknown>, category = 'data_request') => ({ category, subtype, turnIndex, payloadJsonb: payload });
    const row = scorecardRow({ runId: 'r', turnFile: null, run: run({
      events: [
        ev('defer', 1, { explicit: true, ledgerItemIds: ['cogs_pct'], revealedByNow: false }),
        ev('release', 3, { explicit: true, ledgerItemIds: ['cogs_pct'], revealedByNow: false }),
        ev('explicit_ask', 1, {}, 'request_signal'), ev('explicit_ask', 3, {}, 'request_signal'),
        ev('recompute', 5, { decision: 'act' }, 'check'), ev('rung_delivery', 6, { decision: 'act', reason: 'rung delivered' }, 'check'),
      ],
      analytics: [{ eventType: 'exhibit_shown', payloadJsonb: {} }, { eventType: 'llm_usage', payloadJsonb: { model: 'claude-haiku-4-5', component: 'distress', inputTokens: 1_000_000, outputTokens: 0 } }],
    }) });
    expect(row.opportunities).toMatchObject({ explicitAsks: 2, ledgerItemsRequested: 1, mathChecks: 1, exhibitsShown: 1, stallRungs: 1 });
    expect(row.opportunities.recAsks).toBe(row.stages.recommendationAskCount);
    expect(row.effort.repeatedAsks).toBe(1);
    expect(row.performance.appCostUsd).toBeCloseTo(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/eval/scorecard.test.ts`
Expected: FAIL — cannot resolve `@/lib/eval/scorecard`.

- [ ] **Step 3: Implement**

```ts
// lib/eval/scorecard.ts
// One row per interview (spec 2026-10-09 §2.3). "auto" columns only: faults
// from the pre-screen and the human review are joined later (faults.jsonl).
import type { TurnRecord } from '@/lib/orchestrator/turn-record';
import type { TurnFileHeader, TurnFileEnd } from './turn-file';
import { stageAdministration } from '@/lib/orchestrator/spoken-close';
import { isBareAcknowledgment } from '@/lib/orchestrator/stream-turn';
import { costOf, isPriced } from '@/lib/llm-pricing';

export const DIMENSIONS = ['structure', 'quantitative', 'dataExhibit', 'judgment', 'creativity', 'communication', 'synthesis', 'pushback'] as const;
export type Dimension = typeof DIMENSIONS[number];

export type RunRecord = {
  session: { id: string; status: string };
  turns: { turnIndex: number; role: string; text: string }[];
  score: Record<string, unknown> | null;
  events: { category: string; subtype: string; turnIndex: number | null; payloadJsonb: Record<string, unknown> }[];
  analytics: { eventType: string; payloadJsonb: Record<string, unknown> }[];
};

export type CodeFlag = {
  turnIndex: number | null;
  kind: 'question_withheld' | 'guard_double_miss' | 'model_unusable' | 'prefix_mismatch' | 'loop' | 'stage_skipped' | 'technical_failure' | 'slow_turn';
  detail: string;
};

export type ScorecardRow = {
  runId: string; personaId: number | null; personaName: string | null; runNumber: number | null; version: string | null; wave: string | null;
  completion: 'ended' | 'abandoned' | 'terminated' | 'not_completed' | 'technical_failure';
  stuck: boolean | null;
  modelTurns: number;
  stages: ReturnType<typeof stageAdministration>;
  loops: { maxSameQuestion: number; longestNoProgress: number | null };
  codeFlags: CodeFlag[];
  effort: { repeatedAsks: number };
  opportunities: { explicitAsks: number; ledgerItemsRequested: number; mathChecks: number; exhibitsShown: number; stallRungs: number; recAsks: number };
  performance: { firstRelevantMedianMs: number | null; firstRelevantP90Ms: number | null; regenerations: number | null; vetoTurns: number; slowTurns: number | null; appCostUsd: number; simulatorCostUsd: number | null };
  scoring: string | null;
  ratings: Record<Dimension, string | null>;
  // The per-run scoring-QA counters (scoring_qa analytics event): verifier drops, evidence strips, reconcile merges, …
  scoringQa: Record<string, number> | null;
};

export const SLOW_TURN_MS = 5000;
const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const words = (q: string) => new Set(q.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean));
const jaccard = (a: Set<string>, b: Set<string>) => { const inter = [...a].filter(x => b.has(x)).length; return inter / (a.size + b.size - inter || 1); };
const questionOf = (line: string) => line.split(/(?<=[.!?])\s+/).filter(s => s.trim().endsWith('?')).join(' ') || line;

export function maxSameQuestion(questions: string[]): number {
  const sets = questions.map(words);
  return sets.reduce((best, s) => Math.max(best, sets.filter(t => jaccard(s, t) >= 0.8).length), 0);
}

export function firstRelevantMs(t: TurnRecord): number | null {
  const hit = t.delivered.find(s => (s.kind === 'say' && !isBareAcknowledgment(s.text)) || s.kind === 'data' || s.kind === 'tail' || s.kind === 'scripted');
  return hit ? hit.atMs : null;
}

function longestNoProgress(turns: TurnRecord[]): number {
  let run = 0, best = 0;
  for (const t of turns) {
    const progress = t.phaseAfter !== t.stateBefore.phase || t.delivered.some(s => s.revealIds.length > 0 || s.exhibitId);
    run = progress ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return best;
}

export function scorecardRow(p: { runId: string; run: RunRecord; turnFile: { header: TurnFileHeader; turns: TurnRecord[]; end: TurnFileEnd | null } | null }): ScorecardRow {
  const { run, turnFile } = p;
  const records = turnFile?.turns ?? null;
  const interviewerTexts = run.turns.filter(t => t.role === 'interviewer').map(t => t.text);
  const lastGate = [...run.events].reverse().find(e => e.category === 'check' && e.subtype === 'end_gate');
  const recReceived = Boolean((lastGate?.payloadJsonb?.detail as { recommendationReceived?: boolean } | undefined)?.recommendationReceived);
  const stages = stageAdministration(interviewerTexts, recReceived);
  const flags: CodeFlag[] = [];

  const status = run.session.status;
  let completion: ScorecardRow['completion'] =
    status === 'completed' ? 'ended' : status === 'abandoned' ? 'abandoned' : status === 'terminated' ? 'terminated' : 'not_completed';
  if (turnFile && turnFile.end === null) {
    completion = 'technical_failure';
    flags.push({ turnIndex: null, kind: 'technical_failure', detail: 'turn file has no end line — the run died' });
  }

  const questions = (records ? records.map(r => r.savedLine) : interviewerTexts.slice(1)).map(questionOf);
  const maxSame = maxSameQuestion(questions);
  if (maxSame >= 3) flags.push({ turnIndex: null, kind: 'loop', detail: `same question asked ${maxSame} times` });
  const noProgress = records ? longestNoProgress(records) : null;
  if (completion === 'ended' && (!stages.brainstormAsked || !stages.recommendationAsked)) {
    flags.push({ turnIndex: null, kind: 'stage_skipped', detail: `brainstorm asked: ${stages.brainstormAsked}, recommendation asked: ${stages.recommendationAsked}` });
  }

  for (const r of records ?? []) {
    const acted = (name: string) => r.checks.find(c => c.check === name && c.decision === 'act');
    const vetoes = acted('vetoes');
    const withheld = (vetoes?.detail as { withheld?: { field: string }[] } | undefined)?.withheld ?? [];
    if (withheld.some(w => w.field === 'question') && /Go on\.$/.test(r.savedLine)) flags.push({ turnIndex: r.turnIndex, kind: 'question_withheld', detail: 'whole question withheld — fallback "Go on."' });
    if (acted('request_guard') && (r.parsedTurn?.requests.length ?? 0) === 0) flags.push({ turnIndex: r.turnIndex, kind: 'guard_double_miss', detail: 'explicit ask; no request declared after the guard rewrite' });
    if (r.validation && (r.validation.unparsed || r.validation.emptyTurn || r.validation.refused)) flags.push({ turnIndex: r.turnIndex, kind: 'model_unusable', detail: JSON.stringify(r.validation) });
    if (acted('stream_prefix_mismatch')) flags.push({ turnIndex: r.turnIndex, kind: 'prefix_mismatch', detail: 'composed turn differed from delivered speech' });
    const rel = firstRelevantMs(r);
    if (rel !== null && rel > SLOW_TURN_MS) flags.push({ turnIndex: r.turnIndex, kind: 'slow_turn', detail: `${rel} ms to first relevant speech` });
  }

  const dr = run.events.filter(e => e.category === 'data_request' && e.payloadJsonb.explicit === true);
  const askTurns = new Map<string, Set<number>>();
  for (const e of dr) {
    if (e.payloadJsonb.revealedByNow) continue;
    for (const id of (e.payloadJsonb.ledgerItemIds as string[] | undefined) ?? []) {
      const s = askTurns.get(id) ?? new Set<number>(); if (e.turnIndex !== null) s.add(e.turnIndex); askTurns.set(id, s);
    }
  }
  const actedCheck = (sub: string) => run.events.filter(e => e.category === 'check' && e.subtype === sub && e.payloadJsonb.decision === 'act');
  const mathTurns = new Set([...actedCheck('recompute'), ...actedCheck('verified_figures')].map(e => e.turnIndex));
  const appCostUsd = run.analytics.filter(a => a.eventType === 'llm_usage' && isPriced(String(a.payloadJsonb.model ?? '')))
    .reduce((s, a) => s + costOf({ model: String(a.payloadJsonb.model), inputTokens: Number(a.payloadJsonb.inputTokens ?? 0), outputTokens: Number(a.payloadJsonb.outputTokens ?? 0), cacheReadTokens: Number(a.payloadJsonb.cacheReadTokens ?? 0), cacheWriteTokens: Number(a.payloadJsonb.cacheWriteTokens ?? 0) }), 0);
  const rel = (records ?? []).map(firstRelevantMs).filter((x): x is number => x !== null);
  const ratings = Object.fromEntries(DIMENSIONS.map(d => [d, (run.score?.[`${d}Rating`] as string | null | undefined) ?? null])) as Record<Dimension, string | null>;
  const scoringQa = run.analytics.find(a => a.eventType === 'scoring_complete');

  return {
    runId: p.runId,
    personaId: turnFile?.header.persona?.id ?? null, personaName: turnFile?.header.persona?.name ?? null,
    runNumber: turnFile?.header.runNumber ?? null, version: turnFile?.header.version ?? null, wave: turnFile?.header.wave ?? null,
    completion,
    stuck: records ? maxSame >= 3 || (noProgress ?? 0) >= 4 : null,
    modelTurns: records?.length ?? run.turns.filter(t => t.role === 'candidate').length,
    stages,
    loops: { maxSameQuestion: maxSame, longestNoProgress: noProgress },
    codeFlags: flags,
    effort: { repeatedAsks: [...askTurns.values()].filter(s => s.size >= 2).length },
    opportunities: {
      explicitAsks: run.events.filter(e => e.category === 'request_signal' && e.subtype === 'explicit_ask').length,
      ledgerItemsRequested: askTurns.size + dr.filter(e => e.payloadJsonb.revealedByNow).flatMap(e => (e.payloadJsonb.ledgerItemIds as string[]) ?? []).filter(id => !askTurns.has(id)).length,
      mathChecks: mathTurns.size,
      exhibitsShown: run.analytics.filter(a => a.eventType === 'exhibit_shown').length,
      stallRungs: actedCheck('rung_delivery').filter(e => e.payloadJsonb.reason === 'rung delivered').length,
      recAsks: stages.recommendationAskCount,
    },
    performance: {
      firstRelevantMedianMs: records ? pct(rel, 0.5) : null, firstRelevantP90Ms: records ? pct(rel, 0.9) : null,
      regenerations: records ? records.filter(r => r.requests.length > 1).length : null,
      vetoTurns: actedCheck('vetoes').length,
      slowTurns: records ? rel.filter(x => x > SLOW_TURN_MS).length : null,
      appCostUsd, simulatorCostUsd: turnFile?.end?.candidateUsage.usd ?? null,
    },
    scoring: turnFile?.end?.scoring ?? (scoringQa ? 'scored' : null),
    ratings,
    scoringQa: (() => {
      const q = run.analytics.find(a => a.eventType === 'scoring_qa')?.payloadJsonb;
      return q ? Object.fromEntries(Object.entries(q).filter(([, v]) => typeof v === 'number')) as Record<string, number> : null;
    })(),
  };
}
```

```ts
// scripts/batch-scorecard.ts
// Scorecard for batch 18 (or any run folders): scorecard.json/.csv/.md in
// Case Interview Runs/test runs/batch-18/. Free — reads files only.
//
//   npx tsx scripts/batch-scorecard.ts [--waves=batch-18-oct-09-runs-1-10,...]   (default: every wave in the manifest)
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { scorecardRow, DIMENSIONS, type RunRecord, type ScorecardRow } from '@/lib/eval/scorecard';
import { readTurnFile } from '@/lib/eval/turn-file';
import { loadManifest } from '@/lib/eval/batch-manifest';

const RUNS = 'Case Interview Runs/test runs';
const OUT = path.join(RUNS, 'batch-18');
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];

function runDirs(): string[] {
  const waves = arg('waves')?.split(',') ?? [...new Set((loadManifest(OUT)?.runs ?? []).map(r => r.wave))];
  return waves.flatMap(w => existsSync(path.join(RUNS, w)) ? readdirSync(path.join(RUNS, w)).map(d => path.join(RUNS, w, d)) : []);
}

const rows: ScorecardRow[] = [];
for (const dir of runDirs()) {
  const files = readdirSync(dir);
  const json = files.find(f => f.endsWith('.json'));
  if (!json) { console.warn(`[scorecard] ${dir}: no run JSON — skipped`); continue; }
  const tf = files.find(f => f.endsWith('.turns.jsonl.gz'));
  rows.push(scorecardRow({ runId: path.basename(dir), run: JSON.parse(readFileSync(path.join(dir, json), 'utf8')) as RunRecord, turnFile: tf ? readTurnFile(path.join(dir, tf)) : null }));
}
rows.sort((a, b) => (a.runNumber ?? 0) - (b.runNumber ?? 0));
writeFileSync(path.join(OUT, 'scorecard.json'), JSON.stringify(rows, null, 2));
const cols = ['runNumber', 'personaId', 'personaName', 'version', 'completion', 'stuck', 'modelTurns', 'firstRelevantMedianMs', 'firstRelevantP90Ms', 'regenerations', 'vetoTurns', 'slowTurns', 'codeFlags', 'repeatedAsks', 'explicitAsks', 'appCostUsd', 'simulatorCostUsd', ...DIMENSIONS];
const cell = (r: ScorecardRow, c: string): string => {
  const v = c in r ? (r as Record<string, unknown>)[c] : c in r.performance ? (r.performance as Record<string, unknown>)[c]
    : c === 'codeFlags' ? r.codeFlags.map(f => f.kind).join(' ') : c === 'repeatedAsks' ? r.effort.repeatedAsks
    : c === 'explicitAsks' ? r.opportunities.explicitAsks : (r.ratings as Record<string, unknown>)[c];
  return JSON.stringify(v ?? '');
};
writeFileSync(path.join(OUT, 'scorecard.csv'), [cols.join(','), ...rows.map(r => cols.map(c => cell(r, c)).join(','))].join('\n') + '\n');
const ended = rows.filter(r => r.completion === 'ended').length;
const qaTotals = rows.reduce<Record<string, number>>((m, r) => { for (const [k, v] of Object.entries(r.scoringQa ?? {})) m[k] = (m[k] ?? 0) + v; return m; }, {});
writeFileSync(path.join(OUT, 'scorecard.md'), [
  `# Batch 18 scorecard (auto columns)`, '',
  `Scoring-QA totals across ${rows.filter(r => r.scoringQa).length} scored runs: ${Object.entries(qaTotals).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}`, '',
  `${rows.length} runs · ended ${ended} · technical failures ${rows.filter(r => r.completion === 'technical_failure').length} · stuck ${rows.filter(r => r.stuck).length} · with code flags ${rows.filter(r => r.codeFlags.length).length}`, '',
  '| # | persona | completion | stuck | flags | first relevant p50/p90 | cost app/sim |', '|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.runNumber ?? ''} | ${r.personaId ?? ''} ${r.personaName ?? r.runId} | ${r.completion} | ${r.stuck ?? '-'} | ${r.codeFlags.map(f => f.kind).join(', ') || '-'} | ${r.performance.firstRelevantMedianMs ?? '-'}/${r.performance.firstRelevantP90Ms ?? '-'} | $${r.performance.appCostUsd.toFixed(2)}/${r.performance.simulatorCostUsd === null ? '-' : '$' + r.performance.simulatorCostUsd.toFixed(2)} |`),
].join('\n') + '\n');
console.log(`[scorecard] ${rows.length} rows → ${OUT}/scorecard.{json,csv,md}`);
```

- [ ] **Step 4: Run tests, then the extractor on an old batch (no turn files)**

Run: `npx vitest run tests/eval/scorecard.test.ts && npx tsx scripts/batch-scorecard.ts --waves=batch-13-oct-06`
Expected: PASS; the script writes 10 rows with `stuck` = null and no crash (it writes into `Case Interview Runs/test runs/batch-18/` — delete those three files afterwards: `rm "Case Interview Runs/test runs/batch-18/scorecard."*`).

- [ ] **Step 5: Commit**

```bash
git add lib/eval/scorecard.ts scripts/batch-scorecard.ts tests/eval/scorecard.test.ts
git commit -m "feat(eval): batch scorecard — completion, stages, loops, code flags, opportunities, performance, ratings"
```

---

### Task 8: Opus pre-screen with quote verification

**Files:**
- Create: `lib/eval/prescreen.ts`, `scripts/batch-prescreen.ts`
- Test: `tests/eval/prescreen.test.ts`

**Interfaces:**
- Consumes: `RunRecord` (Task 7); `TurnRecord` (Task 1); `readTurnFile` (Task 4); `buildPromptParts` (`lib/agent/prompts/system.ts`); `getCaseById` (`lib/cases/loader.ts`); `anthropicClient` (`lib/anthropic-client.ts`); `requireRunBudget` (`lib/llm-budget.ts`); `SCORING_MODEL_ID`, `FALLBACK_BETA`, `FALLBACKS` (`lib/models.ts`).
- Produces:
  - `ProposedFaultSchema` (zod) and `type ProposedFault = { turnIndex: number; category: 'requests'|'math'|'grounding'|'acknowledgment'|'conversation'|'administration'; severity: 'serious'|'moderate'|'minor'; quote: string; expected: string; rule: string; attribution: 'model'|'orchestrator'|'simulator'|'ambiguous_policy'|'evaluator_uncertain'; recovered: boolean }`
  - `type FaultRecord = ProposedFault & { id: string; runId: string; candidateText: string; context: string[]; rawOutput: string | null; codeChanges: string[]; delivered: string; source: 'prescreen' | 'code' | 'human'; status: 'proposed' | 'confirmed' | 'rejected'; note: string }`
  - `normaliseForQuote(s: string): string`, `verifyQuote(quote: string, delivered: string): boolean`
  - `buildPrescreenPrompt(p: { run: RunRecord; turns: TurnRecord[] | null; interviewerInstructions: string; caseFacts: string; severity: string }): string`
  - `toFaultRecords(runId: string, run: RunRecord, turns: TurnRecord[] | null, proposals: ProposedFault[]): { kept: FaultRecord[]; dropped: ProposedFault[] }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/eval/prescreen.test.ts
import { describe, it, expect } from 'vitest';
import { verifyQuote, normaliseForQuote, toFaultRecords, buildPrescreenPrompt, type ProposedFault } from '@/lib/eval/prescreen';
import type { RunRecord } from '@/lib/eval/scorecard';

const run: RunRecord = {
  session: { id: 's', status: 'completed' },
  turns: [
    { turnIndex: 0, role: 'interviewer', text: 'Your client is Brew & Bean.' },
    { turnIndex: 1, role: 'candidate', text: 'Can I get the cost breakdown?' },
    { turnIndex: 2, role: 'interviewer', text: "I don't have a cost breakdown by line item. Which branch first?" },
  ],
  score: null, events: [], analytics: [],
};
const p = (over: Partial<ProposedFault> = {}): ProposedFault => ({ turnIndex: 2, category: 'requests', severity: 'serious', quote: "I don't have a cost breakdown by line item.", expected: 'Release cogs_pct, labor_pct, overhead_pct.', rule: 'Rule 11', attribution: 'model', recovered: false, ...over });

describe('pre-screen', () => {
  it('verifies quotes after normalising curly quotes and whitespace, but rejects paraphrase', () => {
    const delivered = "I don't have a cost breakdown by line item.  Which branch first?";
    expect(verifyQuote('I don’t have a cost   breakdown by line item.', delivered)).toBe(true);
    expect(verifyQuote('I do not have the cost breakdown.', delivered)).toBe(false);
    expect(normaliseForQuote('“A”  —  b')).toBe('"a" - b');
  });

  it('keeps faults whose quote is in the interviewer line of that turn; drops the rest', () => {
    const { kept, dropped } = toFaultRecords('r1', run, null, [p(), p({ quote: 'Something never said.' }), p({ turnIndex: 1, quote: 'Can I get the cost breakdown?' })]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ runId: 'r1', turnIndex: 2, candidateText: 'Can I get the cost breakdown?', source: 'prescreen', status: 'proposed' });
    expect(kept[0].id).toMatch(/^r1-t2-/);
    expect(dropped).toHaveLength(2);
  });

  it('the prompt carries the instructions, case facts, severity and a numbered transcript', () => {
    const prompt = buildPrescreenPrompt({ run, turns: null, interviewerInstructions: 'INSTR', caseFacts: 'FACTS', severity: 'SEV' });
    for (const s of ['INSTR', 'FACTS', 'SEV', '[t1 candidate] Can I get the cost breakdown?', '[t2 interviewer]']) expect(prompt).toContain(s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/eval/prescreen.test.ts`
Expected: FAIL — cannot resolve `@/lib/eval/prescreen`.

- [ ] **Step 3: Implement**

```ts
// lib/eval/prescreen.ts
// Opus pre-screen for interviewer faults (spec 2026-10-09 §2.4): proposals
// only — a human confirms. Every proposal must quote the interviewer's line
// of that turn verbatim (after normalising quotes/whitespace), as the
// scoring evidence audit requires of the judge; unverifiable ones are dropped.
import { z } from 'zod';
import type { RunRecord } from './scorecard';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

export const ProposedFaultSchema = z.object({
  turnIndex: z.number().int(),
  category: z.enum(['requests', 'math', 'grounding', 'acknowledgment', 'conversation', 'administration']),
  severity: z.enum(['serious', 'moderate', 'minor']),
  quote: z.string(),
  expected: z.string(),
  rule: z.string(),
  attribution: z.enum(['model', 'orchestrator', 'simulator', 'ambiguous_policy', 'evaluator_uncertain']),
  recovered: z.boolean(),
});
export const PrescreenOutputSchema = z.object({ faults: z.array(ProposedFaultSchema) });
export type ProposedFault = z.infer<typeof ProposedFaultSchema>;

export type FaultRecord = ProposedFault & {
  id: string; runId: string; candidateText: string; context: string[]; rawOutput: string | null;
  codeChanges: string[]; delivered: string; source: 'prescreen' | 'code' | 'human';
  status: 'proposed' | 'confirmed' | 'rejected'; note: string;
};

export function normaliseForQuote(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function verifyQuote(quote: string, delivered: string): boolean {
  const q = normaliseForQuote(quote);
  return q.length >= 8 && normaliseForQuote(delivered).includes(q);
}

export function buildPrescreenPrompt(p: { run: RunRecord; turns: TurnRecord[] | null; interviewerInstructions: string; caseFacts: string; severity: string }): string {
  const byIndex = new Map((p.turns ?? []).map(t => [t.turnIndex + 1, t]));
  const transcript = [...p.run.turns].sort((a, b) => a.turnIndex - b.turnIndex).map(t => {
    const rec = t.role === 'interviewer' ? byIndex.get(t.turnIndex) : undefined;
    const vetoes = rec?.checks.find(c => c.check === 'vetoes' && c.decision === 'act')?.detail as { withheld?: { sentence: string; reason: string }[] } | undefined;
    const decisions = rec?.checks.find(c => c.check === 'data_decisions')?.detail;
    const notes = [
      rec && rec.stateBefore.kind !== 'model' ? `code-written turn: ${rec.stateBefore.kind}` : null,
      vetoes?.withheld?.length ? `withheld by code: ${vetoes.withheld.map(w => `"${w.sentence}" (${w.reason})`).join('; ')}` : null,
      decisions ? `data decided by code: ${JSON.stringify(decisions)}` : null,
    ].filter(Boolean);
    return `[t${t.turnIndex} ${t.role}] ${t.text}${notes.length ? `\n    (${notes.join(' | ')})` : ''}`;
  }).join('\n');
  return [
    'You are reviewing a mock case interview conducted by an AI interviewer, to find the interviewer\'s faults. The candidate was simulated. Report only faults of the INTERVIEWER (or of the code around it), not the candidate\'s performance.',
    '## The interviewer\'s instructions (what it was told to do)', p.interviewerInstructions,
    '## Case facts (ground truth — data values, answer key)', p.caseFacts,
    '## Severity definitions', p.severity,
    '## Transcript as delivered (interviewer lines are what the candidate actually received; notes in parentheses are what code did)', transcript,
    '## Output',
    'List every interviewer fault. For each: turnIndex of the INTERVIEWER line; category; severity per the definitions; quote = an exact excerpt (at least 8 characters) of that interviewer line; expected = what it should have done, citing the case fact where relevant; rule = the instruction or rule it breaks; attribution = model / orchestrator (code changed or wrote it) / simulator (the candidate broke character, so the interviewer was put in an impossible position) / ambiguous_policy / evaluator_uncertain; recovered = whether a later turn fixed it. If there are none, return an empty list. Do not report style preferences as faults.',
  ].join('\n\n');
}

export function toFaultRecords(runId: string, run: RunRecord, turns: TurnRecord[] | null, proposals: ProposedFault[]): { kept: FaultRecord[]; dropped: ProposedFault[] } {
  const line = (i: number) => run.turns.find(t => t.turnIndex === i);
  const kept: FaultRecord[] = []; const dropped: ProposedFault[] = [];
  proposals.forEach((f, n) => {
    const l = line(f.turnIndex);
    if (!l || l.role !== 'interviewer' || !verifyQuote(f.quote, l.text)) { dropped.push(f); return; }
    const rec = turns?.find(t => t.turnIndex + 1 === f.turnIndex) ?? null;
    const withheld = (rec?.checks.find(c => c.check === 'vetoes' && c.decision === 'act')?.detail as { withheld?: { sentence: string; reason: string }[] } | undefined)?.withheld ?? [];
    kept.push({
      ...f, id: `${runId}-t${f.turnIndex}-${n}`, runId,
      candidateText: line(f.turnIndex - 1)?.text ?? '',
      context: [f.turnIndex - 3, f.turnIndex - 2].map(line).filter(Boolean).map(t => `[${t!.role}] ${t!.text}`),
      rawOutput: rec?.outputs.at(-1)?.text ?? null,
      codeChanges: withheld.map(w => `withheld "${w.sentence}" (${w.reason})`),
      delivered: l.text, source: 'prescreen', status: 'proposed', note: '',
    });
  });
  return { kept, dropped };
}
```

```ts
// scripts/batch-prescreen.ts
// Opus 5.5 pre-screen of every batch-18 run (spec 2026-10-09 §2.4) → batch-18/faults.jsonl
// (proposals) and prescreen-dropped.jsonl. Costs real money (≈ $15–30 for 62 runs).
//
//   LLM_BUDGET_USD=30 npx tsx --env-file=.env.local scripts/batch-prescreen.ts [--runs=dirA,dirB] [--dry]
import { readFileSync, readdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { anthropicClient } from '@/lib/anthropic-client';
import { requireRunBudget } from '@/lib/llm-budget';
import { SCORING_MODEL_ID, FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { buildPromptParts } from '@/lib/agent/prompts/system';
import { getCaseById } from '@/lib/cases/loader';
import { readTurnFile } from '@/lib/eval/turn-file';
import { loadManifest } from '@/lib/eval/batch-manifest';
import { buildPrescreenPrompt, toFaultRecords, PrescreenOutputSchema } from '@/lib/eval/prescreen';
import type { RunRecord } from '@/lib/eval/scorecard';

const RUNS = 'Case Interview Runs/test runs';
const OUT = path.join(RUNS, 'batch-18');
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];

async function main() {
  const dirs = arg('runs')?.split(',') ?? (loadManifest(OUT)?.runs ?? []).filter(r => r.status === 'done' && r.runDir).map(r => r.runDir!);
  const caseData = getCaseById('prof-001');
  const caseFacts = JSON.stringify({ prompt: caseData.prompt, dataLedger: caseData.dataLedger, exhibits: caseData.exhibits.map(e => ({ id: e.id, title: e.title, data: e.data })), mathSteps: caseData.mathSteps }, null, 2);
  const severity = readFileSync('evals/severity.md', 'utf8');
  console.log(`[prescreen] ${dirs.length} runs · model ${SCORING_MODEL_ID}`);
  if (process.argv.includes('--dry')) return;
  requireRunBudget('batch-prescreen');
  const client = anthropicClient();
  for (const dir of dirs) {
    const files = readdirSync(dir);
    const run = JSON.parse(readFileSync(path.join(dir, files.find(f => f.endsWith('.json'))!), 'utf8')) as RunRecord;
    const tf = files.find(f => f.endsWith('.turns.jsonl.gz'));
    const turns = tf ? readTurnFile(path.join(dir, tf)).turns : null;
    const pc = turns?.find(t => t.stateBefore.promptContext)?.stateBefore.promptContext;
    const interviewerInstructions = pc ? buildPromptParts(pc).stable : '(not recorded)';
    const prompt = buildPrescreenPrompt({ run, turns, interviewerInstructions, caseFacts, severity });
    const msg = await client.beta.messages.stream({
      model: SCORING_MODEL_ID, max_tokens: 16000, thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: betaZodOutputFormat(PrescreenOutputSchema), effort: 'medium' },
      betas: [FALLBACK_BETA], fallbacks: FALLBACKS,
    } as never).finalMessage() as unknown as { parsed_output: { faults: unknown[] } | null; stop_reason: string };
    if (!msg.parsed_output) { console.warn(`[prescreen] ${dir}: no structured output (${msg.stop_reason}) — skipped`); continue; }
    const runId = path.basename(dir);
    const { kept, dropped } = toFaultRecords(runId, run, turns, PrescreenOutputSchema.parse(msg.parsed_output).faults);
    for (const f of kept) appendFileSync(path.join(OUT, 'faults.jsonl'), JSON.stringify(f) + '\n');
    for (const f of dropped) appendFileSync(path.join(OUT, 'prescreen-dropped.jsonl'), JSON.stringify({ runId, ...f }) + '\n');
    console.log(`[prescreen] ${runId}: ${kept.length} proposed, ${dropped.length} dropped (quote not verbatim)`);
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 4: Run tests and a dry run**

Run: `npx vitest run tests/eval/prescreen.test.ts && npm run typecheck`
Expected: PASS; no type errors. (The script's first real run is the smoke step in Task 12, after `evals/severity.md` exists.)

- [ ] **Step 5: Commit**

```bash
git add lib/eval/prescreen.ts scripts/batch-prescreen.ts tests/eval/prescreen.test.ts
git commit -m "feat(eval): Opus pre-screen of interviewer faults with verbatim-quote verification"
```

---

### Task 9: Review sheet round-trip

**Files:**
- Create: `lib/eval/review-sheet.ts`, `lib/eval/headline.ts`, `scripts/batch-review-sheet.ts`
- Test: `tests/eval/review-sheet.test.ts`, `tests/eval/headline.test.ts`

**Interfaces:**
- Consumes: `FaultRecord` (Task 8); `ScorecardRow` (Task 7).
- Also produces: `headline(rows: ScorecardRow[], faults: FaultRecord[]): { interviews: number; withSerious: number; turns: number; confirmedFaults: number; faultsPer100Turns: number; longestFaultyStretch: { runId: string; turns: number }[] }` — confirmed faults only; the stretch is the longest run of consecutive interviewer turns with ≥1 confirmed fault, per interview.
- Produces: `renderReviewSheet(faults: FaultRecord[], fullReads: string[]): string`; `parseReviewSheet(md: string): { verdicts: Map<string, { status: 'confirmed' | 'rejected'; severity?: 'serious' | 'moderate' | 'minor'; attribution?: FaultRecord['attribution']; note: string }>; unrecognised: string[] }`; `applyVerdicts(faults: FaultRecord[], v: ReturnType<typeof parseReviewSheet>['verdicts']): FaultRecord[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/eval/review-sheet.test.ts
import { describe, it, expect } from 'vitest';
import { renderReviewSheet, parseReviewSheet, applyVerdicts } from '@/lib/eval/review-sheet';
import { headline } from '@/lib/eval/headline';
import type { FaultRecord } from '@/lib/eval/prescreen';

const f = (id: string, severity: FaultRecord['severity'] = 'serious'): FaultRecord => ({
  id, runId: 'r', turnIndex: 2, category: 'requests', severity, quote: 'q', expected: 'e', rule: 'Rule 11', attribution: 'model', recovered: false,
  candidateText: 'c', context: [], rawOutput: null, codeChanges: [], delivered: 'd', source: 'prescreen', status: 'proposed', note: '',
});

describe('review sheet', () => {
  it('lists serious proposals and the runs to read in full, each with a verdict line', () => {
    const md = renderReviewSheet([f('a'), f('b', 'minor')], ['run-7']);
    expect(md).toContain('### a');
    expect(md).not.toContain('### b');          // only serious proposals are listed
    expect(md).toContain('verdict: ');
    expect(md).toContain('run-7');
  });

  it('parses verdicts case-insensitively, with optional severity/attribution changes and a note', () => {
    const md = ['### a', 'verdict: Confirmed', 'severity: moderate', 'note: real but recovered next turn', '### b', 'verdict: REJECT', '### c', 'verdict: maybe'].join('\n');
    const { verdicts, unrecognised } = parseReviewSheet(md);
    expect(verdicts.get('a')).toEqual({ status: 'confirmed', severity: 'moderate', note: 'real but recovered next turn' });
    expect(verdicts.get('b')?.status).toBe('rejected');
    expect(unrecognised).toEqual(['c: verdict "maybe"']);
  });

  it('applies verdicts; unreviewed faults stay proposed', () => {
    const out = applyVerdicts([f('a'), f('b')], new Map([['a', { status: 'confirmed' as const, severity: 'moderate' as const, note: 'n' }]]));
    expect(out.map(x => [x.id, x.status, x.severity])).toEqual([['a', 'confirmed', 'moderate'], ['b', 'proposed', 'serious']]);
  });
});
```

```ts
// tests/eval/headline.test.ts
import { describe, it, expect } from 'vitest';
import { headline } from '@/lib/eval/headline';
import type { ScorecardRow } from '@/lib/eval/scorecard';
import type { FaultRecord } from '@/lib/eval/prescreen';

const row = (runId: string, modelTurns: number) => ({ runId, modelTurns } as unknown as ScorecardRow);
const fault = (runId: string, turnIndex: number, severity: FaultRecord['severity'], status: FaultRecord['status'] = 'confirmed') => ({ runId, turnIndex, severity, status } as FaultRecord);

describe('headline', () => {
  it('counts interviews with a confirmed serious fault, faults per 100 turns and the longest faulty stretch', () => {
    const h = headline([row('a', 20), row('b', 30)], [
      fault('a', 4, 'serious'), fault('a', 6, 'moderate'), fault('a', 8, 'minor'), fault('a', 12, 'moderate'),
      fault('b', 2, 'serious', 'rejected'), fault('b', 10, 'moderate', 'proposed'),
    ]);
    expect(h.interviews).toBe(2);
    expect(h.withSerious).toBe(1);
    expect(h.confirmedFaults).toBe(4);
    expect(h.faultsPer100Turns).toBeCloseTo(8);         // 4 / 50 turns
    expect(h.longestFaultyStretch).toEqual([{ runId: 'a', turns: 3 }, { runId: 'b', turns: 0 }]); // turns 4, 6, 8 are consecutive interviewer turns
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/eval/review-sheet.test.ts tests/eval/headline.test.ts`
Expected: FAIL — cannot resolve `@/lib/eval/review-sheet`.

- [ ] **Step 3: Implement**

```ts
// lib/eval/review-sheet.ts
// The human confirmation step (spec 2026-10-09 §2.4): every proposed serious
// fault, plus runs to read in full, as a markdown sheet with verdict lines;
// parsed back into faults.jsonl. Unknown verdicts are reported, never dropped.
import type { FaultRecord } from './prescreen';

const VERDICTS: Record<string, 'confirmed' | 'rejected'> = { confirmed: 'confirmed', confirm: 'confirmed', yes: 'confirmed', y: 'confirmed', rejected: 'rejected', reject: 'rejected', no: 'rejected', n: 'rejected' };
const SEVERITIES = new Set(['serious', 'moderate', 'minor']);
const ATTRIBUTIONS = new Set(['model', 'orchestrator', 'simulator', 'ambiguous_policy', 'evaluator_uncertain']);

export function renderReviewSheet(faults: FaultRecord[], fullReads: string[]): string {
  const serious = faults.filter(f => f.severity === 'serious' && f.status === 'proposed');
  return [
    '# Batch 18 — fault review', '',
    'For each fault set `verdict:` to confirmed or rejected. Optional: `severity:` (serious/moderate/minor), `attribution:` (model/orchestrator/simulator/ambiguous_policy/evaluator_uncertain), `note:`.', '',
    `## Proposed serious faults (${serious.length})`, '',
    ...serious.flatMap(f => [
      `### ${f.id}`,
      `run ${f.runId} · turn ${f.turnIndex} · ${f.category} · attribution ${f.attribution} · recovered ${f.recovered}`, '',
      ...f.context.map(c => `> ${c}`), `> [candidate] ${f.candidateText}`, `> [interviewer, delivered] ${f.delivered}`, '',
      `- quote: "${f.quote}"`, `- expected: ${f.expected}`, `- rule: ${f.rule}`,
      ...(f.codeChanges.length ? [`- code: ${f.codeChanges.join('; ')}`] : []),
      ...(f.rawOutput ? [`- raw model output: \`${f.rawOutput.replace(/`/g, "'")}\``] : []), '',
      'verdict: ', 'note: ', '',
    ]),
    `## Read in full (${fullReads.length} runs with no flags — note any fault the pre-screen missed as a new "### <run>-t<turn>-human" entry)`, '',
    ...fullReads.map(r => `- ${r}`), '',
  ].join('\n');
}

export function parseReviewSheet(md: string) {
  const verdicts = new Map<string, { status: 'confirmed' | 'rejected'; severity?: FaultRecord['severity']; attribution?: FaultRecord['attribution']; note: string }>();
  const unrecognised: string[] = [];
  let id: string | null = null;
  let cur: { status?: 'confirmed' | 'rejected'; severity?: FaultRecord['severity']; attribution?: FaultRecord['attribution']; note: string } = { note: '' };
  const flush = () => { if (id && cur.status) verdicts.set(id, { status: cur.status, ...(cur.severity ? { severity: cur.severity } : {}), ...(cur.attribution ? { attribution: cur.attribution } : {}), note: cur.note }); };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const h = line.match(/^###\s+(\S+)/);
    if (h) { flush(); id = h[1]; cur = { note: '' }; continue; }
    if (!id) continue;
    const kv = line.match(/^(verdict|severity|attribution|note):\s*(.*)$/i);
    if (!kv) continue;
    const key = kv[1].toLowerCase(); const val = kv[2].trim();
    if (key === 'verdict') {
      if (!val) continue;
      const v = VERDICTS[val.toLowerCase()];
      if (v) cur.status = v; else unrecognised.push(`${id}: verdict "${val}"`);
    } else if (key === 'severity' && val) {
      if (SEVERITIES.has(val.toLowerCase())) cur.severity = val.toLowerCase() as FaultRecord['severity']; else unrecognised.push(`${id}: severity "${val}"`);
    } else if (key === 'attribution' && val) {
      if (ATTRIBUTIONS.has(val.toLowerCase())) cur.attribution = val.toLowerCase() as FaultRecord['attribution']; else unrecognised.push(`${id}: attribution "${val}"`);
    } else if (key === 'note') cur.note = val;
  }
  flush();
  return { verdicts, unrecognised };
}

export function applyVerdicts(faults: FaultRecord[], v: ReturnType<typeof parseReviewSheet>['verdicts']): FaultRecord[] {
  return faults.map(f => {
    const x = v.get(f.id);
    return x ? { ...f, status: x.status, severity: x.severity ?? f.severity, attribution: x.attribution ?? f.attribution, note: x.note } : f;
  });
}
```

```ts
// lib/eval/headline.ts
// Batch headline (spec 2026-10-09 §2.3): confirmed faults only, so a long
// loop in one interview is visible next to the averages.
import type { ScorecardRow } from './scorecard';
import type { FaultRecord } from './prescreen';

export function headline(rows: ScorecardRow[], faults: FaultRecord[]) {
  const confirmed = faults.filter(f => f.status === 'confirmed');
  const turns = rows.reduce((n, r) => n + r.modelTurns, 0);
  const longestFaultyStretch = rows.map(r => {
    // Interviewer lines sit at even turn indices 2, 4, 6, …: consecutive interviewer turns differ by 2.
    const idx = [...new Set(confirmed.filter(f => f.runId === r.runId).map(f => f.turnIndex))].sort((a, b) => a - b);
    let best = 0, cur = 0, prev = -10;
    for (const i of idx) { cur = i - prev === 2 ? cur + 1 : 1; best = Math.max(best, cur); prev = i; }
    return { runId: r.runId, turns: best };
  });
  return {
    interviews: rows.length,
    withSerious: new Set(confirmed.filter(f => f.severity === 'serious').map(f => f.runId)).size,
    turns,
    confirmedFaults: confirmed.length,
    faultsPer100Turns: turns ? (100 * confirmed.length) / turns : 0,
    longestFaultyStretch,
  };
}
```

```ts
// scripts/batch-review-sheet.ts
//   npx tsx scripts/batch-review-sheet.ts --write [--full-reads=8]   → batch-18/review-sheet.md
//   npx tsx scripts/batch-review-sheet.ts --apply                     → faults.jsonl updated from the sheet
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { renderReviewSheet, parseReviewSheet, applyVerdicts } from '@/lib/eval/review-sheet';
import type { FaultRecord } from '@/lib/eval/prescreen';
import type { ScorecardRow } from '@/lib/eval/scorecard';

const OUT = 'Case Interview Runs/test runs/batch-18';
const faultsPath = path.join(OUT, 'faults.jsonl');
const sheetPath = path.join(OUT, 'review-sheet.md');
const faults = existsSync(faultsPath) ? readFileSync(faultsPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as FaultRecord) : [];

if (process.argv.includes('--write')) {
  const n = Number(process.argv.find(a => a.startsWith('--full-reads='))?.split('=')[1] ?? 8);
  const rows = JSON.parse(readFileSync(path.join(OUT, 'scorecard.json'), 'utf8')) as ScorecardRow[];
  const flagged = new Set([...faults.map(f => f.runId), ...rows.filter(r => r.codeFlags.length).map(r => r.runId)]);
  const clean = rows.map(r => r.runId).filter(id => !flagged.has(id));
  const pick = clean.map(id => ({ id, k: Math.random() })).sort((a, b) => a.k - b.k).slice(0, n).map(x => x.id);
  writeFileSync(sheetPath, renderReviewSheet(faults, pick));
  console.log(`[review] ${sheetPath}: ${faults.filter(f => f.severity === 'serious').length} serious proposals, ${pick.length} full reads`);
} else if (process.argv.includes('--apply')) {
  const { verdicts, unrecognised } = parseReviewSheet(readFileSync(sheetPath, 'utf8'));
  const applied = applyVerdicts(faults, verdicts);
  writeFileSync(faultsPath, applied.map(f => JSON.stringify(f)).join('\n') + '\n');
  console.log(`[review] applied ${verdicts.size} verdicts`);
  const h = headline(JSON.parse(readFileSync(path.join(OUT, 'scorecard.json'), 'utf8')) as ScorecardRow[], applied);
  writeFileSync(path.join(OUT, 'headline.json'), JSON.stringify(h, null, 2));
  console.log(`[review] ${h.withSerious}/${h.interviews} interviews with a confirmed serious fault · ${h.faultsPer100Turns.toFixed(1)} confirmed faults per 100 turns · longest faulty stretch ${Math.max(0, ...h.longestFaultyStretch.map(x => x.turns))} turns`);
  if (unrecognised.length) console.warn(`[review] NOT applied — fix these lines in the sheet:\n  ${unrecognised.join('\n  ')}`);
} else {
  console.error('use --write or --apply');
  process.exit(1);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/eval/review-sheet.test.ts tests/eval/headline.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/eval/review-sheet.ts lib/eval/headline.ts scripts/batch-review-sheet.ts tests/eval/review-sheet.test.ts tests/eval/headline.test.ts
git commit -m "feat(eval): fault review sheet (render, parse, apply) and the batch headline from confirmed faults"
```

---

### Task 10: Persona bands schema and comparator

**Files:**
- Create: `lib/eval/bands.ts`, `scripts/batch-bands.ts`
- Test: `tests/eval/bands.test.ts`

**Interfaces:**
- Consumes: `DIMENSIONS`, `Dimension`, `ScorecardRow` (Task 7); `FaultRecord` (Task 8).
- Produces: `BandsFileSchema` (zod); `type BandCell = { expect: ('needs_work'|'meets_bar'|'strong')[] | 'not_assessed' | null; confidence: 'high'|'medium'; reason: string }`; `compareRating(cell: BandCell, rating: string | null): 'in_band' | 'one_off' | 'two_off' | 'unexpected_rating' | 'unexpected_not_assessed' | 'no_expectation'`; `bandsSummary(rows: ScorecardRow[], bands: BandsFile, excludedRuns: Set<string>)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/eval/bands.test.ts
import { describe, it, expect } from 'vitest';
import { compareRating, BandsFileSchema, bandsSummary, type BandCell } from '@/lib/eval/bands';
import type { ScorecardRow } from '@/lib/eval/scorecard';

const cell = (expect_: BandCell['expect'], confidence: 'high' | 'medium' = 'high'): BandCell => ({ expect: expect_, confidence, reason: 'brief says so' });

describe('persona bands', () => {
  it('compares a rating with the allowed set by steps on needs_work < meets_bar < strong', () => {
    expect(compareRating(cell(['strong']), 'strong')).toBe('in_band');
    expect(compareRating(cell(['strong']), 'meets_bar')).toBe('one_off');
    expect(compareRating(cell(['strong']), 'needs_work')).toBe('two_off');
    expect(compareRating(cell(['needs_work', 'meets_bar']), 'strong')).toBe('one_off');
    expect(compareRating(cell('not_assessed'), 'not_assessed')).toBe('in_band');
    expect(compareRating(cell('not_assessed'), 'meets_bar')).toBe('unexpected_rating');
    expect(compareRating(cell(['meets_bar']), 'not_assessed')).toBe('unexpected_not_assessed');
    expect(compareRating(cell(null), 'strong')).toBe('no_expectation');
  });

  it('validates the bands file: every persona has all 8 dimensions', () => {
    const dims = { structure: cell(['strong']), quantitative: cell(null), dataExhibit: cell(null), judgment: cell(null), creativity: cell(null), communication: cell(null), synthesis: cell(null), pushback: cell(null) };
    expect(BandsFileSchema.safeParse({ version: 'v1', personas: { '2': dims } }).success).toBe(true);
    const { pushback: _, ...missing } = dims;
    expect(BandsFileSchema.safeParse({ version: 'v1', personas: { '2': missing } }).success).toBe(false);
  });

  it('summarises agreement by confidence and excludes simulator-broken runs', () => {
    const dims = { structure: cell(['strong']), quantitative: cell(['needs_work'], 'medium'), dataExhibit: cell(null), judgment: cell(null), creativity: cell(null), communication: cell(null), synthesis: cell(null), pushback: cell(null) };
    const bands = BandsFileSchema.parse({ version: 'v1', personas: { '2': dims } });
    const row = (runId: string, structure: string, quantitative: string) => ({ runId, personaId: 2, ratings: { structure, quantitative } } as unknown as ScorecardRow);
    const s = bandsSummary([row('a', 'strong', 'meets_bar'), row('b', 'needs_work', 'needs_work')], bands, new Set(['b']));
    expect(s.high).toEqual({ in_band: 1, one_off: 0, two_off: 0, unexpected_rating: 0, unexpected_not_assessed: 0, cells: 1 });
    expect(s.medium.one_off).toBe(1);
    expect(s.excludedRuns).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/eval/bands.test.ts`
Expected: FAIL — cannot resolve `@/lib/eval/bands`.

- [ ] **Step 3: Implement**

```ts
// lib/eval/bands.ts
// Persona bands (spec 2026-10-09 §2.7): the rating each persona's brief
// implies, per dimension, written before the batch. A report is checked
// against them; runs where the simulator broke its brief are excluded.
import { z } from 'zod';
import { DIMENSIONS, type Dimension, type ScorecardRow } from './scorecard';

const Rating = z.enum(['needs_work', 'meets_bar', 'strong']);
export const BandCellSchema = z.object({
  expect: z.union([z.array(Rating).min(1), z.literal('not_assessed'), z.null()]),
  confidence: z.enum(['high', 'medium']),
  reason: z.string(),
});
export type BandCell = z.infer<typeof BandCellSchema>;
const PersonaBands = z.object(Object.fromEntries(DIMENSIONS.map(d => [d, BandCellSchema])) as Record<Dimension, typeof BandCellSchema>).strict();
export const BandsFileSchema = z.object({ version: z.string(), personas: z.record(z.string(), PersonaBands) });
export type BandsFile = z.infer<typeof BandsFileSchema>;

const ORDER: Record<string, number> = { needs_work: 0, meets_bar: 1, strong: 2 };
export type Comparison = 'in_band' | 'one_off' | 'two_off' | 'unexpected_rating' | 'unexpected_not_assessed' | 'no_expectation';

export function compareRating(cell: BandCell, rating: string | null): Comparison {
  if (cell.expect === null) return 'no_expectation';
  const notAssessed = rating === null || rating === 'not_assessed';
  if (cell.expect === 'not_assessed') return notAssessed ? 'in_band' : 'unexpected_rating';
  if (notAssessed) return 'unexpected_not_assessed';
  const steps = Math.min(...cell.expect.map(e => Math.abs(ORDER[e] - ORDER[rating!])));
  return steps === 0 ? 'in_band' : steps === 1 ? 'one_off' : 'two_off';
}

type Tally = { in_band: number; one_off: number; two_off: number; unexpected_rating: number; unexpected_not_assessed: number; cells: number };
const empty = (): Tally => ({ in_band: 0, one_off: 0, two_off: 0, unexpected_rating: 0, unexpected_not_assessed: 0, cells: 0 });

export function bandsSummary(rows: ScorecardRow[], bands: BandsFile, excludedRuns: Set<string>) {
  const high = empty(), medium = empty();
  const misses: { runId: string; personaId: number; dimension: Dimension; expected: BandCell['expect']; rating: string | null; result: Comparison; confidence: string }[] = [];
  for (const r of rows) {
    if (excludedRuns.has(r.runId) || r.personaId === null) continue;
    const pb = bands.personas[String(r.personaId)];
    if (!pb) continue;
    for (const d of DIMENSIONS) {
      const c = pb[d]; const res = compareRating(c, r.ratings[d]);
      if (res === 'no_expectation') continue;
      const t = c.confidence === 'high' ? high : medium;
      t[res] += 1; t.cells += 1;
      if (res !== 'in_band') misses.push({ runId: r.runId, personaId: r.personaId, dimension: d, expected: c.expect, rating: r.ratings[d], result: res, confidence: c.confidence });
    }
  }
  return { high, medium, misses, excludedRuns: [...excludedRuns] };
}
```

```ts
// scripts/batch-bands.ts
// Persona-band check of batch-18 reports (free): batch-18/bands.json + bands.md.
//   npx tsx scripts/batch-bands.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { BandsFileSchema, bandsSummary } from '@/lib/eval/bands';
import type { ScorecardRow } from '@/lib/eval/scorecard';
import type { FaultRecord } from '@/lib/eval/prescreen';

const OUT = 'Case Interview Runs/test runs/batch-18';
const bands = BandsFileSchema.parse(JSON.parse(readFileSync('evals/persona-bands.json', 'utf8')));
const rows = JSON.parse(readFileSync(path.join(OUT, 'scorecard.json'), 'utf8')) as ScorecardRow[];
const faultsPath = path.join(OUT, 'faults.jsonl');
const faults = existsSync(faultsPath) ? readFileSync(faultsPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as FaultRecord) : [];
const excluded = new Set(faults.filter(f => f.status === 'confirmed' && f.attribution === 'simulator').map(f => f.runId));
const s = bandsSummary(rows.filter(r => r.scoring === 'scored'), bands, excluded);
writeFileSync(path.join(OUT, 'bands.json'), JSON.stringify(s, null, 2));
const line = (name: string, t: typeof s.high) => `| ${name} | ${t.cells} | ${t.in_band} (${t.cells ? Math.round(100 * t.in_band / t.cells) : 0}%) | ${t.one_off} | ${t.two_off} | ${t.unexpected_rating} | ${t.unexpected_not_assessed} |`;
writeFileSync(path.join(OUT, 'bands.md'), [
  '# Batch 18 — reports vs persona bands', '', `Excluded (simulator broke its brief): ${s.excludedRuns.join(', ') || 'none'}`, '',
  '| confidence | cells | in band | one off | two off | rated, expected not assessed | not assessed, expected a rating |', '|---|---|---|---|---|---|---|',
  line('high', s.high), line('medium', s.medium), '', '## Misses', '',
  ...s.misses.map(m => `- ${m.runId} (persona ${m.personaId}) ${m.dimension}: expected ${JSON.stringify(m.expected)}, got ${m.rating} — ${m.result} (${m.confidence})`),
].join('\n') + '\n');
console.log(`[bands] high ${s.high.in_band}/${s.high.cells} in band · medium ${s.medium.in_band}/${s.medium.cells}`);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/eval/bands.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/eval/bands.ts scripts/batch-bands.ts tests/eval/bands.test.ts
git commit -m "feat(eval): persona bands schema and comparator (by confidence, simulator-broken runs excluded)"
```

---

### Task 11: Frozen evaluation files — severity definitions and drafted persona bands (user review)

**Files:**
- Create: `evals/severity.md`, `evals/persona-bands.json`
- Modify: `docs/superpowers/specs/2026-10-09-persona-batch-evaluation-design.md` (63 → 62 personas; ≈ $49 → ≈ $48)
- Test: `tests/eval/bands-file.test.ts`

**Interfaces:**
- Consumes: `BandsFileSchema` (Task 10); `PERSONAS` (`scripts/personas.ts`).
- Produces: the two frozen files whose SHA-256 hashes go into the manifest (`bandsHash`, `severityHash`) at the first wave.

- [ ] **Step 1: Write `evals/severity.md`** — the definitions from spec §2.5, verbatim:

```markdown
# Interviewer fault severity (batch 18, frozen at the first wave)

**Serious** — reaches the candidate and misleads or blocks:
- a wrong case figure, or a correct figure attached to the wrong quantity (both count against FR-4);
- unrequested release of gated data;
- false refusal of data the case holds;
- challenging correct math, or approving wrong work;
- an explicit ask ignored twice;
- the same probe asked three or more times;
- ending without a required stage.

**Moderate** — degrades the interview:
- a question ignored once; one repeated probe; premature advancement; an unasked offer;
- an acknowledgment mismatched to the turn (e.g. to a disclosure of distress).

**Minor** — wording.

Attribution: model / orchestrator (code changed or wrote it) / simulator (the candidate broke its brief) / ambiguous policy / evaluator uncertain.
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/eval/bands-file.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BandsFileSchema } from '@/lib/eval/bands';
import { PERSONAS } from '@/scripts/personas';

describe('evals/persona-bands.json', () => {
  const file = BandsFileSchema.parse(JSON.parse(readFileSync('evals/persona-bands.json', 'utf8')));
  it('covers every persona exactly once', () => {
    expect(Object.keys(file.personas).map(Number).sort((a, b) => a - b)).toEqual(PERSONAS.map(p => p.id).sort((a, b) => a - b));
  });
  it('every expectation has a reason quoting or paraphrasing the brief', () => {
    for (const [id, dims] of Object.entries(file.personas)) {
      for (const [d, c] of Object.entries(dims)) if (c.expect !== null) expect(c.reason.length, `${id}.${d}`).toBeGreaterThan(10);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/eval/bands-file.test.ts`
Expected: FAIL — `evals/persona-bands.json` does not exist.

- [ ] **Step 4: Draft `evals/persona-bands.json`**

Read every persona's `brief` in `scripts/personas.ts` (ids 1–62) and the rubric dimensions in `lib/scoring/rubric.ts`. For each persona write all 8 dimensions: an allowed set where the brief implies a level, `"not_assessed"` where the persona never reaches the stage (e.g. early finishers and brainstorm/pushback), otherwise `null`; `confidence` high only where the brief states the behaviour directly ("everything you eventually say is strong"), else medium; `reason` = the brief's words that imply it. Format (persona 2 shown complete):

```json
{
  "version": "v1",
  "personas": {
    "2": {
      "structure":     { "expect": ["strong"], "confidence": "high", "reason": "\"delivers tight, correct reasoning\"; \"Everything you eventually say is strong\"" },
      "quantitative":  { "expect": ["strong"], "confidence": "high", "reason": "\"Everything you eventually say is strong\"" },
      "dataExhibit":   { "expect": ["strong", "meets_bar"], "confidence": "medium", "reason": "pauses after each exhibit, then strong reasoning — exhibit reading implied, not stated" },
      "judgment":      { "expect": ["strong"], "confidence": "high", "reason": "\"Everything you eventually say is strong\"" },
      "creativity":    { "expect": null, "confidence": "medium", "reason": "" },
      "communication": { "expect": ["strong", "meets_bar"], "confidence": "medium", "reason": "tight answers, but 65–90s silences before each" },
      "synthesis":     { "expect": ["strong"], "confidence": "high", "reason": "pauses before the recommendation, then strong" },
      "pushback":      { "expect": null, "confidence": "medium", "reason": "" }
    }
  }
}
```

- [ ] **Step 5: Run the test, fix the spec count, commit, and STOP for user review**

Run: `npx vitest run tests/eval/bands-file.test.ts`
Expected: PASS.

In the spec, replace "63-persona" / "63 personas" / "63 ×" with 62 and "≈ $49" with "≈ $48".

```bash
git add evals/severity.md evals/persona-bands.json tests/eval/bands-file.test.ts docs/superpowers/specs/2026-10-09-persona-batch-evaluation-design.md
git commit -m "eval: severity definitions and drafted persona bands for batch 18 (for review); spec persona count 62"
```

Checkpoint: the user reviews `evals/persona-bands.json` and `evals/severity.md`; their corrections are committed. Only then is the freeze in place (the first wave records both files' hashes — Task 12).

---

### Task 12: Record the frozen-file hashes at the first wave; smoke run (paid — ask first)

**Files:**
- Modify: `lib/eval/batch-manifest.ts` (hashes), `scripts/persona-batch.ts`
- Test: `tests/eval/batch-manifest.test.ts` (one new test)

**Interfaces:**
- Consumes: `planWave` (Task 5).
- Produces: `fileHash(path: string): string`; `planWave` param `hashes?: { bands: string; severity: string }` — stored on first wave; a later wave with different hashes throws unless `--new-version`.

- [ ] **Step 1: Write the failing test** (append to `tests/eval/batch-manifest.test.ts`)

```ts
  it('stores the bands/severity hashes at the first wave and refuses changed files later', () => {
    const m = planWave(null, { ...base, personaIds: [1], hashes: { bands: 'b1', severity: 's1' } }).manifest;
    expect([m.bandsHash, m.severityHash]).toEqual(['b1', 's1']);
    expect(() => planWave(m, { ...base, personaIds: [2], hashes: { bands: 'b2', severity: 's1' } })).toThrow(/persona-bands/);
    expect(planWave(m, { ...base, personaIds: [2], hashes: { bands: 'b2', severity: 's1' }, newVersion: 'v2' }).manifest.bandsHash).toBe('b2');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/eval/batch-manifest.test.ts`
Expected: FAIL — `bandsHash` is null.

- [ ] **Step 3: Implement**

In `lib/eval/batch-manifest.ts` add `import { createHash } from 'node:crypto';` and:

```ts
export function fileHash(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}
```

`planWave` already accepts `hashes?` (Task 5 signature); after the commit check add:

```ts
  if (p.hashes) {
    if (!m) manifest = { ...manifest, bandsHash: p.hashes.bands, severityHash: p.hashes.severity };
    else if (m.bandsHash !== p.hashes.bands || m.severityHash !== p.hashes.severity) {
      if (!p.newVersion) throw new Error('evals/persona-bands.json or evals/severity.md changed since the batch started; pass --new-version=<label>');
      manifest = { ...manifest, version: p.newVersion, bandsHash: p.hashes.bands, severityHash: p.hashes.severity };
    }
  }
```

In `scripts/persona-batch.ts`, pass `hashes: { bands: fileHash('evals/persona-bands.json'), severity: fileHash('evals/severity.md') }` to `planWave` (import `fileHash`).

- [ ] **Step 4: Run all checks**

Run: `npm run typecheck && npm test && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/eval/batch-manifest.ts scripts/persona-batch.ts tests/eval/batch-manifest.test.ts
git commit -m "feat(eval): manifest records persona-bands / severity hashes at the first wave (changes need --new-version)"
```

- [ ] **Step 6: Smoke run — PAID, ask the user first (≈ $1.20, cap $2)**

After approval, with a clean tree:

```bash
npx tsx scripts/persona-batch.ts --personas=2 --cap=2
npx tsx scripts/batch-scorecard.ts
LLM_BUDGET_USD=1 npx tsx --env-file=.env.local scripts/batch-prescreen.ts
```

Expected: wave `batch-18-<today>-runs-1-1` with one run folder containing the run JSON and `live-run-…turns.jsonl.gz`; the turn file has a header (commit, persona 2), one record per candidate turn with non-empty `requests[0].body` and `outputs`, and an end line with the simulator spend; `batch-18/scorecard.md` has one row with non-null first-relevant timings; the pre-screen writes `faults.jsonl` (possibly empty) and reports its spend. Report the actual spend and anything missing to the user. This smoke run counts as batch-18 run #1 (persona 2), so the next wave continues at run #2.
