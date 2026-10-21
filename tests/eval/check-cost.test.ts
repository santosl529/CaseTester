// tests/eval/check-cost.test.ts — the data-request check's per-session cost and added latency.
import { describe, it, expect } from 'vitest';
import { checkCostOf, totalCheckCost, checkCostMarkdown, checkCostLine, type CheckCostRun } from '@/lib/eval/check-cost';

const rec = (turnIndex: number, detail: Record<string, unknown>) =>
  ({ category: 'check', subtype: 'itemless_defer', turnIndex, payloadJsonb: { decision: 'act', detail } });
const dropped = (turnIndex: number) =>
  ({ category: 'check', subtype: 'partial_dropped', turnIndex, payloadJsonb: { decision: 'act', detail: { what: 'waste rates', item: 'x', why: 'whole_ask' } } });
const usage = (payload: Record<string, unknown>) => ({ eventType: 'llm_usage', payloadJsonb: { model: 'claude-haiku-4-5', inputTokens: 1000, outputTokens: 100, ...payload } });

const run: CheckCostRun = {
  events: [
    rec(5, { what: 'a', mapped: true, latencyMs: 700 }),
    rec(9, { what: 'b', mapped: null, latencyMs: 1503, timedOut: true }),
    rec(12, { what: 'c', mapped: false, latencyMs: 400 }),
    dropped(12),
    { category: 'check', subtype: 'other', turnIndex: 3, payloadJsonb: { detail: { latencyMs: 9999 } } },
  ],
  analytics: [
    usage({ component: 'ask_check', ask: 'a' }),
    usage({ component: 'ask_check', ask: 'b', late: true, inputTokens: 2000 }),
    usage({ component: 'ask_check', ask: 'c' }),
    usage({ component: 'interviewer', inputTokens: 5000 }),
  ],
};

describe('check cost', () => {
  it('counts calls, timeouts, late rows, partial_dropped, and added latency (sum, max, count)', () => {
    const s = checkCostOf(run);
    expect(s.calls).toBe(3);
    expect(s.timeouts).toBe(1);
    expect(s.lateRows).toBe(1);
    expect(s.usageRows).toBe(3);
    expect(s.partialDropped).toBe(1);
    expect(s.latency).toEqual({ sum: 2603, max: 1503, count: 3 });
  });

  it('costs every ask_check row, the late one included, and no other component', () => {
    const s = checkCostOf(run);
    // haiku-4-5 rates are fixed in lib/llm-pricing.ts: price the same rows by hand through costOf.
    const one = checkCostOf({ events: [], analytics: [usage({ component: 'ask_check' })] }).costUsd;
    const late = checkCostOf({ events: [], analytics: [usage({ component: 'ask_check', inputTokens: 2000, late: true })] }).costUsd;
    expect(one).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(one);
    expect(s.costUsd).toBeCloseTo(2 * one + late, 10);
    expect(s.lateCostUsd).toBeCloseTo(late, 10);
  });

  it('a run that predates the ask_check component: records but no usage rows, cost 0', () => {
    const s = checkCostOf({ events: [rec(5, { what: 'a', latencyMs: 600 })], analytics: [usage({ component: 'data_request' })] });
    expect(s).toMatchObject({ calls: 1, usageRows: 0, costUsd: 0 });
  });

  it('a run with no check at all is all zeros', () => {
    expect(checkCostOf({ events: [], analytics: [] })).toMatchObject({ calls: 0, costUsd: 0, latency: { sum: 0, max: 0, count: 0 } });
  });

  it('a record without a latency does not count as a wait', () => {
    expect(checkCostOf({ events: [rec(1, { what: 'a' })], analytics: [] }).latency.count).toBe(0);
  });

  it('totals add the sessions, the max is the max of maxes', () => {
    const a = checkCostOf(run);
    const b = checkCostOf({ events: [rec(2, { what: 'z', latencyMs: 900 })], analytics: [usage({ component: 'ask_check' })] });
    const t = totalCheckCost([a, b]);
    expect(t.calls).toBe(4);
    expect(t.latency).toEqual({ sum: 3503, max: 1503, count: 4 });
    expect(t.costUsd).toBeCloseTo(a.costUsd + b.costUsd, 10);
    expect(t.partialDropped).toBe(1);
  });

  it('markdown has a row per session and a total; the line reads for a grader', () => {
    const a = checkCostOf(run);
    const md = checkCostMarkdown([{ id: 'quillpath/07-raj', summary: a }]);
    expect(md).toContain('quillpath/07-raj');
    expect(md).toContain('**Total**');
    expect(checkCostLine(a)).toMatch(/3 calls.*late 1 rows.*1 timed out.*max 1503 ms.*partial_dropped 1/);
  });
});

// Round 6 Task 76 (c) (Lorenzo, 21 Oct, round 6 rulings, 2: "Row 11's classifier call: allowed, as long as all three
// hold: it fires only on that cue; it fires on no more than ~2% of turns in the replay corpus; it adds no more than
// 1.5 s on the turns where it fires. Report its cost and latency in the check-cost log."): the message classifier's
// usage rows tagged `cue: 'want_is'` (turn-data.ts classifyMessage), and the turn's wait on `uncovered_asks`.
describe('row 11\'s classifier call (cue want_is)', () => {
  const uncovered = (turnIndex: number, detail: Record<string, unknown>) =>
    ({ category: 'check', subtype: 'uncovered_asks', turnIndex, payloadJsonb: { decision: 'act', detail } });
  const turns = (n: number) => Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? 'candidate' : 'interviewer' }));
  const cueRun: CheckCostRun = {
    events: [
      uncovered(9, { sentences: ["What I'd want is distribution math: …"], cue: 'want_is', waitMs: 820, latencyMs: 815 }),
      uncovered(15, { sentences: ["What I'd want is the velocity."], cue: 'want_is', waitMs: 0, latencyMs: null }),
      uncovered(21, { sentences: ['Do we have the store count?'], waitMs: 600 }),   // an addressed ask: not row 11's
    ],
    analytics: [
      usage({ component: 'data_request', cue: 'want_is', latencyMs: 815 }),
      usage({ component: 'data_request', cue: 'want_is', latencyMs: 1210 }),
      usage({ component: 'data_request' }),
      usage({ component: 'ask_check' }),
    ],
    turns: turns(40),
  };
  it('counts the tagged calls, their cost and latency, and the turns waited with the wait (sum, max)', () => {
    const s = checkCostOf(cueRun).wantIs;
    const one = checkCostOf({ events: [], analytics: [usage({ component: 'data_request', cue: 'want_is' })] }).wantIs.costUsd;
    expect(one).toBeGreaterThan(0);
    expect(s.calls).toBe(2);
    expect(s.costUsd).toBeCloseTo(2 * one, 10);
    expect(s.latency).toEqual({ sum: 2025, max: 1210, count: 2 });
    expect(s.waited).toEqual({ turns: 1, sum: 820, max: 820 });
    expect(s.candidateTurns).toBe(20);
  });
  it('the check\'s own numbers are untouched by row 11\'s rows', () => {
    expect(checkCostOf(cueRun)).toMatchObject({ calls: 0, usageRows: 1 });
  });
  it('totals add the sessions; the markdown reports the section with the share of candidate turns', () => {
    const a = checkCostOf(cueRun);
    const b = checkCostOf({ events: [], analytics: [usage({ component: 'data_request', cue: 'want_is', latencyMs: 400 })], turns: turns(60) });
    const t = totalCheckCost([a, b]);
    expect(t.wantIs).toMatchObject({ calls: 3, candidateTurns: 50, latency: { sum: 2425, max: 1210, count: 3 }, waited: { turns: 1, sum: 820, max: 820 } });
    const md = checkCostMarkdown([{ id: 'hollisbay/04-marcus', summary: a }, { id: 'hollisbay/07-raj', summary: b }]);
    expect(md).toContain("## Row 11's classifier call (cue want_is)");
    expect(md).toMatch(/\| hollisbay\/04-marcus \| 2 \| \$\d+\.\d{4} \| 2025 \| 1210 \| 1 \| 820 \| 820 \| 20 \| 10\.0% \|/);
    expect(md).toMatch(/\| \*\*Total\*\* \| 3 \| .* \| 50 \| 6\.0% \|/);
  });
  it('a run with no tagged call reports zero calls (and no share without turns)', () => {
    expect(checkCostOf(run).wantIs).toMatchObject({ calls: 0, costUsd: 0, candidateTurns: 0 });
  });
});
