// Phase 1 Stream 3 task 2 — the stale drop (`staleProbeDrop`, with the worksheet). Lorenzo: "Before any probe or
// correction is spoken: drop it if the worksheet holds a newer value for that quantity." b38 Larkspur Marisol f80d981c
// verbatim (hand-grading.md: "t16, a stale probe" and "t24, a stale correction", both firm moderate).
import { describe, it, expect, vi, afterEach } from 'vitest';

type Row = Record<string, unknown>;
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/db/client', () => ({
  db: {
    query: { sessions: { findFirst: async () => ({ status: 'active' }) } },
    insert: () => ({ values: async () => {} }),
    update: () => ({ set: (v: Row) => ({ where: async () => { void v; } }) }),
  },
}));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import { planCheckerFlags, type CheckerDecision } from '@/lib/orchestrator/math-checker-live';
import { getCaseById } from '@/lib/cases/loader';
import { MARISOL, readsAt, textOf, handledBefore, verdictOf } from './fixtures/phase1-s3-runs';

const PT = { ...INITIAL_PRESSURE_TEST, state: 'satisfied' as const, satisfiedAt: 3 };
const ON = 'prof-002=worksheet,staleProbeDrop';
const plan = (n: number, flags: Record<string, unknown>) =>
  planTurn(readsAt(MARISOL, n, { pressureTest: PT, ...flags }), textOf(MARISOL, n), { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} }) as ModelPlan;
const flagRows = (p: ModelPlan) => p.ctx.events.filter(e => e.category === 'math_checker' && e.subtype === 'flag').map(e => e.payload as CheckerDecision);
const checkOf = (p: ModelPlan, name: string) => p.ctx.checks.entries.find(c => c.check === name);

afterEach(() => { vi.unstubAllEnvs(); });

describe('b38 Marisol 11:4 — "less $9,000 = $1,800 positive", then t13 "it\'s $11,000 per flight, not $9,000"', () => {
  const at13 = () => plan(13, { mathChecker: { handled: handledBefore(MARISOL, 11) } });
  it('the claim, and the withdrawal in the next message', () => {
    expect(verdictOf(MARISOL, 11)!.claims[4]).toMatchObject({ flag: true, candidateValue: '1800' });
    expect(verdictOf(MARISOL, 11)!.claims[4].span).toContain('less $9,000 = $1,800 positive');
    expect(textOf(MARISOL, 13)).toContain('it\'s $11,000 per flight, not $9,000');
  });
  it('switches off: 11:4 is probed (the run\'s t16 line, planned from t13 on)', () => {
    vi.stubEnv('ENGINE_SWITCHES', '');
    const p = at13();
    expect(p.state.checkerLine).toMatchObject({ id: '11:4', action: 'probe' });
    expect(checkOf(p, 'stale_drop')).toBeUndefined();
  });
  it('on: dropped — built on the $9,000 she withdrew — logged as stale_drop; no line', () => {
    vi.stubEnv('ENGINE_SWITCHES', ON);
    const p = at13();
    expect(p.state.checkerLine).toBeNull();
    expect(flagRows(p)).toContainEqual(expect.objectContaining({ id: '11:4', outcome: 'stale', reason: expect.stringMatching(/^stale_drop: built on 9000, withdrawn at message 13/) }));
    expect(checkOf(p, 'stale_drop')).toMatchObject({ decision: 'act', detail: { dropped: [expect.objectContaining({ kind: 'checker', id: '11:4' })] } });
  });
  it('the worksheet alone drops nothing', () => {
    vi.stubEnv('ENGINE_SWITCHES', 'prof-002=worksheet');
    expect(at13().state.checkerLine).toMatchObject({ id: '11:4', action: 'probe' });
  });
});

describe('b38 Marisol 15:2 — "$15.8M of contribution" — corrected at t24 after her t21 "the swing is … = $11.8M"', () => {
  // The run's memory at message 23: every claim before message 21 decided (15:2 probed at t20, its key raised), 21's
  // verdict just landed — its 21:0 ("$14.0M minus -$1.8M = $15.8M", rated correct) reopens 15:2 (disagrees_with_code).
  const at23 = () => plan(23, { mathChecker: { handled: handledBefore(MARISOL, 21), keys: { 'network_improvement@15.8': { figures: [15.8], since: 15 } } }, recomputeAttempts: { 'network_improvement@15.8': 1 } });
  it('switches off: the correction "about $11.8M, not $15.8M"', () => {
    vi.stubEnv('ENGINE_SWITCHES', '');
    expect(at23().state.checkerLine).toMatchObject({ id: '15:2', action: 'correct', line: expect.stringContaining('$11.8M, not $15.8M') });
  });
  it('on: dropped — the worksheet holds network_improvement at 11.8 (message 21, right) since', () => {
    vi.stubEnv('ENGINE_SWITCHES', ON);
    const p = at23();
    expect(p.state.checkerLine).toBeNull();
    expect(flagRows(p)).toContainEqual(expect.objectContaining({ id: '15:2', outcome: 'stale', reason: expect.stringMatching(/^stale_drop: step:network_improvement restated at 11.8 \(message 21\)/) }));
  });
});

describe('planCheckerFlags: a stale entry gives the turn to the next one', () => {
  const v = verdictOf(MARISOL, 15)!;
  const input = (staleDrop?: (e: { id: string }) => string | null) => planCheckerFlags({
    rows: [{ category: 'math_checker', subtype: 'verdict', turnIndex: 15, payloadJsonb: v }], handled: [],
    turnRows: MARISOL.turns.filter(t => t.turnIndex < 17), candidateText: textOf(MARISOL, 17), candidateTurnIndex: 17,
    currentFlags: [], attempts: {}, underTimePressure: false, candidateFigures: [], caseData: getCaseById('prof-002'), revealedIds: MARISOL.records['17'].revealed,
    shownExhibitIds: MARISOL.records['17'].shown, ...(staleDrop ? { staleDrop } : {}),
  });
  it('without the predicate the first flag is selected; with it dropped, the next one is', () => {
    const before = input();
    expect(before.selected?.id).toBeDefined();
    const first = before.selected!.id;
    const after = input(e => (e.id === first ? 'restated since' : null));
    expect(after.decisions).toContainEqual(expect.objectContaining({ id: first, outcome: 'stale', reason: 'stale_drop: restated since' }));
    expect(after.handledNow).toContain(first);
    expect(after.selected?.id).toBeDefined();
    expect(after.selected!.id).not.toBe(first);
  });
});
