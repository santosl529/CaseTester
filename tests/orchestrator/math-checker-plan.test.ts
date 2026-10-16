// The math checker in the Plan stage (step 3, 13 Oct): what a landed verdict
// does to the turn, and when the check starts. No database, no model calls.
import { describe, it, expect, vi } from 'vitest';
import { INITIAL_STAGES } from '@/lib/orchestrator/stage-evidence';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({
  db: new Proxy({}, { get: (_t, prop) => () => { throw new Error(`db.${String(prop)} used in plan`); } }),
}));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));
const { checkMathClaims } = vi.hoisted(() => ({ checkMathClaims: vi.fn(() => new Promise(() => {})) }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims }));

import { planTurn, type TurnReads } from '@/lib/orchestrator/plan-turn';
import { planCheckerFlags } from '@/lib/orchestrator/math-checker-live';
import { getCaseById } from '@/lib/cases/loader';
import type { VettedClaim } from '@/lib/orchestrator/math-checker';
import type { CheckerJob, VerdictPayload } from '@/lib/orchestrator/math-checker-live';
import type { VerifiedFigure } from '@/lib/orchestrator/recompute';
import { readsFixture } from './fixtures/turn-reads';

const COSTS = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'menu_price_change', 'bean_price_change', 'non_bean_input_change', 'revenue_total', 'avg_ticket', 'stores_count'];
const CLAIM = 'A 10% price increase recovers about 5 points of margin.';
const flagged: VettedClaim = {
  span: 'A 10% price increase recovers about 5 points of margin', quantity: 'margin gain', candidateValue: 'about 5 points', assumptions: '',
  verdict: 'error', correctValue: 8.5, correctLow: null, correctHigh: null, unit: 'points', derivation: '', errorType: 'conceptual',
  changesConclusion: true, confidence: 'high', probe: '', pointer: '', codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null }, actualShare: null,
  flag: true, probeLine: 'You said a 10% price rise recovers about 5 points. Which cost lines did you include?',
  correctionLine: 'A 10% price rise lifts margin about 8.5 points, not 5.', correctionFigure: '8.5', pointerLine: null, vetNotes: [],
};
const verdict = (candidateTurnIndex: number, extra: Partial<VerdictPayload> = {}) => ({
  id: `ev${candidateTurnIndex}`, sessionId: 's1', category: 'math_checker', subtype: 'verdict', turnIndex: candidateTurnIndex, phase: 'ANALYSIS',
  payloadJsonb: { candidateTurnIndex, latencyMs: 6000, model: 'claude-sonnet-5-5', claims: [flagged], codeFlags: [], stamps: [], ...extra },
});
const withVerdict = (reads: TurnReads, rows: ReturnType<typeof verdict>[]) => ({ ...reads, checkerEventRows: rows } as unknown as TurnReads);
const deps = (background?: (j: CheckerJob) => void) => ({ sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {}, background });
const modelState = (p: ReturnType<typeof planTurn>) => { if (p.kind !== 'model') throw new Error('expected a model plan'); return p; };

// The claim at message 3, answered at 4; message 5 is now.
const analysis = (flags: Record<string, unknown> = {}, elapsedMs?: number) => readsFixture({
  phase: 'ANALYSIS', revealed: COSTS, elapsedMs,
  flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false }, ...flags },
  extraTurns: [{ role: 'candidate', text: CLAIM }, { role: 'interviewer', text: 'What would you look at next?' }],
});

describe('a landed verdict on a model turn', () => {
  it('becomes a RECOMPUTE-style flag: the hint, Rule 14 counted, the claim handled, the event logged', () => {
    const p = modelState(planTurn(withVerdict(analysis(), [verdict(3)]), 'Next I would look at competitors.', deps()));
    expect(p.state.kind).toBe('model');
    expect(p.state.recomputeHint).toMatch(/MATH CHECK FLAG[\s\S]*Which cost lines did you include\?/);
    expect(p.state.recomputeAttempts['pricing:gain@5']).toBe(1);
    expect((p.ctx.flags.mathChecker as { handled: string[] }).handled).toEqual(['3:0']);
    expect(p.ctx.events).toContainEqual(expect.objectContaining({ category: 'math_checker', subtype: 'flag', payload: expect.objectContaining({ id: '3:0', outcome: 'probe' }) }));
    // A doubt on the figure is licensed now (probe-guard.ts).
    expect(p.state.flaggedFigures).toContain(5);
  });

  it('past the probe: code\'s correction, its figure licensed for the provenance audit', () => {
    const p = modelState(planTurn(withVerdict(analysis({ recomputeAttempts: { 'pricing:gain@5': 1 } }), [verdict(3)]), 'Next I would look at competitors.', deps()));
    expect(p.state.recomputeHint).toContain('"A 10% price rise lifts margin about 8.5 points, not 5."');
    expect(p.state.derivedValueTexts).toContain('8.5');
  });

  // Lorenzo, 13 Oct (Larkspur review, item 1): a deterministic flag past its
  // probe says nothing, so it doesn't hold the checker's correction back.
  it('a silent deterministic flag on this message does not hold the checker\'s correction', () => {
    const p = modelState(planTurn(withVerdict(analysis({ recomputeAttempts: { 'pricing:gain@5': 1, 'arith:58 / 42@1.6': 1 } }), [verdict(3)]), 'So 58 divided by 42 is 1.6.', deps()));
    expect(p.state.recomputeHint).toContain('"A 10% price rise lifts margin about 8.5 points, not 5."');
    expect(p.state.recomputeHint).not.toMatch(/RECOMPUTE FLAG/);
  });

  it('held while code corrects a misquote this turn — one math line a turn', () => {
    const p = modelState(planTurn(withVerdict(analysis(), [verdict(3)]), "Revenue grew about 19% over the period, so volume is clearly healthy — that's a decent sign demand isn't fragile.", deps()));
    expect(p.state.misquote).not.toBeNull();
    expect(p.state.recomputeHint ?? '').not.toMatch(/MATH CHECK FLAG/);
    expect(p.ctx.flags.mathChecker).toBeUndefined();
  });

  it('not raised again once handled', () => {
    const p = modelState(planTurn(withVerdict(analysis({ mathChecker: { handled: ['3:0'] } }), [verdict(3)]), 'Next I would look at competitors.', deps()));
    expect(p.state.recomputeHint ?? '').not.toMatch(/MATH CHECK FLAG/);
  });

  it('a stamp on the figure from the last message is dropped', () => {
    const stamp: VerifiedFigure = { stepId: 'arith:58 / 110', scope: 'arithmetic', value: 5, span: 'recovers about 5 points', workShown: true, operands: [] };
    const p = modelState(planTurn(withVerdict(analysis({ lastVerified: [stamp] }), [verdict(3, { stamps: [{ stepId: stamp.stepId, value: 5, span: stamp.span }] })]), 'Next I would look at competitors.', deps()));
    expect(p.state.verifiedPrev).toEqual([]);
    expect(p.ctx.events).toContainEqual(expect.objectContaining({ category: 'math_checker', subtype: 'stamp_dropped' }));
  });
});

describe('on a code-written turn other than the close, the flag waits', () => {
  it('a code-written stage or time line: no hint, not handled', () => {
    const late = 16 * 60 * 1000 + 30_000;
    const p = modelState(planTurn(withVerdict(analysis({}, late), [verdict(3)]), 'Next I would look at competitors.', deps()));
    expect(['model', 'rec_ask', 'close', 'rec_math_probe']).not.toContain(p.state.kind);
    expect(p.ctx.flags.mathChecker).toBeUndefined();
  });
});

describe('the close holds one turn for an unresolved conclusion-changing flag', () => {
  const CORE = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change', 'menu_price_change'];
  const endReads = (o: { flags?: Record<string, unknown>; elapsedMs?: number } = {}) => readsFixture({
    phase: 'RECOMMENDATION', elapsedMs: o.elapsedMs ?? 17 * 60 * 1000, revealed: CORE,
    flags: { moves: { 4: 'brainstorm', 6: 'recommendation', 8: 'risk' }, stall: { recommendationDelivered: true }, stageEvidence: { ...INITIAL_STAGES, brainstorm: { delivered: true, deliveredAt: 4, outcome: 'answered' as const }, recommendation: { delivered: true, deliveredAt: 6, asks: 1, outcome: 'answered' as const }, risk: { delivered: true, deliveredAt: 8 }, pending: 'risk' as const }, ...o.flags },
    extraTurns: [
      { role: 'candidate', text: 'Ideas.' }, { role: 'interviewer', text: 'What else could they do?' },
      { role: 'candidate', text: 'More ideas.' }, { role: 'interviewer', text: 'What do you recommend?' },
      { role: 'candidate', text: `My recommendation is to raise menu prices. ${CLAIM}` }, { role: 'interviewer', text: 'What is the biggest risk?' },
    ],
  });
  const RISK = 'The biggest risk is volume loss; I would pilot it first.';

  it('code says the checker\'s line in place of the close', () => {
    const p = modelState(planTurn(withVerdict(endReads(), [verdict(7)]), RISK, deps()));
    expect(p.state.kind).toBe('rec_math_probe');
    expect(p.state.recMathProbe).toEqual(expect.objectContaining({ action: 'probe', checker: expect.objectContaining({ id: '7:0' }) }));
    expect((p.ctx.flags.mathChecker as { handled: string[] }).handled).toContain('7:0');
  });

  // Lorenzo, 16 Oct (close-hold.ts): a flag in the final answers — the
  // recommendation reply and every reply after it — holds the close whatever its
  // rating and whatever the once-a-case counter, once per figure.
  it('a final answer\'s flag holds the close even with the recommendation math probe spent', () => {
    const p = modelState(planTurn(withVerdict(endReads({ flags: { recMathProbed: true } }), [verdict(7)]), RISK, deps()));
    expect(p.state.kind).toBe('rec_math_probe');
    expect(p.state.closeHoldPlan).toEqual({ from: 7, probeKey: 'pricing:gain@5', hold: true });
  });
  it('once per figure: probed already, the close goes ahead and the flag goes to the report', () => {
    const p = modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { probed: ['pricing:gain@5'] } } }), [verdict(7)]), RISK, deps()));
    expect(p.state.kind).toBe('close');
    expect(p.ctx.events).toContainEqual(expect.objectContaining({ category: 'math_checker', payload: expect.objectContaining({ id: '7:0', outcome: 'unresolved_at_close' }) }));
  });

  it('time up: the close, the flag to the report', () => {
    const p = modelState(planTurn(withVerdict(endReads({ elapsedMs: 21 * 60 * 1000, flags: { graceAskFired: true } }), [verdict(7)]), RISK, deps()));
    expect(p.state.kind).toBe('close');
    expect(p.ctx.events).toContainEqual(expect.objectContaining({ payload: expect.objectContaining({ outcome: 'unresolved_at_close', reason: 'time up' }) }));
  });

  it('a minor flag in the final answers holds the close too', () => {
    const minor = verdict(7, { claims: [{ ...flagged, changesConclusion: false }] });
    const p = modelState(planTurn(withVerdict(endReads(), [minor]), RISK, deps()));
    expect(p.state.kind).toBe('rec_math_probe');
    expect(p.state.recMathProbe).toEqual(expect.objectContaining({ action: 'probe', checker: expect.objectContaining({ id: '7:0' }) }));
  });
  it('…and under time pressure it is not shed', () => {
    const minor = verdict(7, { claims: [{ ...flagged, changesConclusion: false }] });
    expect(modelState(planTurn(withVerdict(endReads({ elapsedMs: 19 * 60 * 1000 }), [minor]), RISK, deps())).state.kind).toBe('rec_math_probe');
  });
  it('…nor expired, however many messages since', () => {
    const turnRows = [9, 11].map(i => ({ turnIndex: i, role: 'candidate', text: 'I would pilot it first.' }));
    const caseData = getCaseById('prof-001');
    const planAt = (finalAnswer?: (n: number) => boolean) => planCheckerFlags({ rows: [verdict(7)] as never, handled: [], turnRows, candidateText: 'And watch traffic.', candidateTurnIndex: 13, currentFlags: [], attempts: {}, underTimePressure: false, candidateFigures: [], caseData, revealedIds: CORE, finalAnswer });
    expect(planAt().decisions).toContainEqual(expect.objectContaining({ id: '7:0', outcome: 'expired' }));
    expect(planAt(n => n >= 7).selected).toMatchObject({ id: '7:0' });
  });
  it('a redo still wrong at another value: its step had the probe — the close, the flag to the report', () => {
    const p = modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { probed: ['pricing:gain@4'] } } }), [verdict(7)]), RISK, deps()));
    expect(p.state.kind).toBe('close');
    expect(p.ctx.events).toContainEqual(expect.objectContaining({ payload: expect.objectContaining({ id: '7:0', outcome: 'unresolved_at_close' }) }));
  });

  // Before the recommendation the earlier rules stand (Lorenzo, 13–15 Oct).
  const preRec = (flags: Record<string, unknown> = {}) => readsFixture({
    phase: 'RECOMMENDATION', elapsedMs: 17 * 60 * 1000, revealed: CORE,
    flags: { moves: { 4: 'brainstorm', 6: 'recommendation', 8: 'risk' }, stall: { recommendationDelivered: true }, stageEvidence: { ...INITIAL_STAGES, brainstorm: { delivered: true, deliveredAt: 4, outcome: 'answered' as const }, recommendation: { delivered: true, deliveredAt: 6, asks: 1, outcome: 'answered' as const }, risk: { delivered: true, deliveredAt: 8 }, pending: 'risk' as const }, ...flags },
    extraTurns: [
      { role: 'candidate', text: 'Ideas.' }, { role: 'interviewer', text: 'What else could they do?' },
      { role: 'candidate', text: CLAIM }, { role: 'interviewer', text: 'What do you recommend?' },
      { role: 'candidate', text: 'My recommendation is to raise menu prices.' }, { role: 'interviewer', text: 'What is the biggest risk?' },
    ],
  });
  it('before the recommendation, a conclusion-changing flag holds the close once a case', () => {
    expect(modelState(planTurn(withVerdict(preRec(), [verdict(5)]), RISK, deps())).state.kind).toBe('rec_math_probe');
    const p = modelState(planTurn(withVerdict(preRec({ recMathProbed: true }), [verdict(5)]), RISK, deps()));
    expect(p.state.kind).toBe('close');
    expect(p.ctx.events).toContainEqual(expect.objectContaining({ category: 'math_checker', payload: expect.objectContaining({ id: '5:0', outcome: 'unresolved_at_close' }) }));
  });
  it('before the recommendation, a minor flag does not hold the close', () => {
    const minor = verdict(5, { claims: [{ ...flagged, changesConclusion: false }] });
    expect(modelState(planTurn(withVerdict(preRec(), [minor]), RISK, deps())).state.kind).toBe('close');
  });

  // A final answer whose verdict hasn't landed: the follow-up, not the close (checker on).
  const on = () => deps(() => {});
  it('the recommendation reply\'s verdict still out: the stage\'s follow-up instead of the close', () => {
    const p = modelState(planTurn(endReads(), RISK, on()));
    expect(p.state.kind).toBe('close_wait');
    expect(p.ctx.checks.entries.find(c => c.check === 'close_hold')?.detail).toMatchObject({ finalFrom: 7, pending: [7] });
  });
  it('the closing message states figures: its own check has only started — the follow-up', () => {
    const clean = verdict(7, { claims: [] });
    expect(modelState(planTurn(withVerdict(endReads(), [clean]), 'The biggest risk is volume loss: if traffic falls more than 10%, the rise stops paying.', on())).state.kind).toBe('close_wait');
  });
  it('every final answer checked (or nothing to check): the close', () => {
    const clean = verdict(7, { claims: [] });
    expect(modelState(planTurn(withVerdict(endReads(), [clean]), RISK, on())).state.kind).toBe('close');
  });
  it('an error row counts as returned', () => {
    const err = { ...verdict(7), subtype: 'error', payloadJsonb: { candidateTurnIndex: 7, error: 'overloaded', timedOut: false, latencyMs: 30000 } };
    expect(modelState(planTurn(withVerdict(endReads(), [err as never]), RISK, on())).state.kind).toBe('close');
  });
  it('once an interview; never at time-up', () => {
    expect(modelState(planTurn(endReads({ flags: { closeHold: { waited: true } } }), RISK, on())).state.kind).toBe('close');
    expect(modelState(planTurn(endReads({ elapsedMs: 21 * 60 * 1000, flags: { graceAskFired: true } }), RISK, on())).state.kind).toBe('close');
  });
  // Batch 28 Sofia 0a43682d t15: "beans are 25% of COGS, so call that 25 points of
  // revenue" — the unit check's flag blocks the checker's line that turn (one math
  // line a turn) and the checker defers to it, so code's own line holds the close.
  const SOFIA_T15 = 'COGS is 58 points of revenue, so variable contribution is roughly 42 points. And beans are 25% of COGS, so call that 25 points of revenue cushioning the downside.';
  it('the closing message\'s own deterministic flag, in the final answers: code\'s line holds the close once', () => {
    const p = modelState(planTurn(withVerdict(endReads(), [verdict(7, { claims: [] })]), SOFIA_T15, deps()));
    expect(p.state.kind).toBe('rec_math_probe');
    expect(p.state.recMathProbe).toEqual(expect.objectContaining({ flag: expect.objectContaining({ kind: 'unit', candidateValue: 25 }) }));
    expect(p.state.closeHoldPlan).toMatchObject({ probeKey: 'unit:COGS@25', hold: true });
    expect(modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { probed: ['unit:COGS@25'] } } }), [verdict(7, { claims: [] })]), SOFIA_T15, deps())).state.kind).toBe('close');
  });
});

describe('a closed error said again in the recommendation (Lorenzo, 13 Oct; Jordan 099f33e9 t25)', () => {
  it("code's correction again, its figure licensed for the provenance audit", () => {
    const reads = readsFixture({
      phase: 'RECOMMENDATION', elapsedMs: 17 * 60 * 1000, revealed: COSTS,
      flags: { moves: { 4: 'brainstorm', 8: 'risk' }, stagesEnforced: { analysis: true, exhibit: true, brainstorm: true }, mathChecker: { handled: ['3:0'], keys: { 'pricing:gain': { figures: [5], since: 3 } }, closed: ['pricing:gain'] } },
      extraTurns: [{ role: 'candidate', text: CLAIM }, { role: 'interviewer', text: 'What would you recommend to the CEO?' }],
    });
    const row = { id: 'f5', sessionId: 's1', category: 'math_checker', subtype: 'flag', turnIndex: 5, phase: 'ANALYSIS', payloadJsonb: { id: '3:0', outcome: 'correct', key: 'pricing:gain', candidateValue: 'about 5 points', line: flagged.correctionLine } };
    const p = modelState(planTurn({ ...reads, checkerEventRows: [row] } as unknown as TurnReads, 'My recommendation: raise prices. That gets about 5 points back.', deps()));
    expect(p.state.kind).toBe('rec_math_probe');
    expect(p.state.recMathProbe).toEqual({ closed: { key: 'pricing:gain', said: '5 points', correction: flagged.correctionLine }, action: 'correct' });
    expect(p.state.derivedValueTexts).toContain('8.5');
  });
});

describe('the check starts on a gated message, beside the model call', () => {
  it('handed to the background channel with the message index; the plan does not wait for it', () => {
    const jobs: CheckerJob[] = [];
    checkMathClaims.mockClear();
    const p = planTurn(analysis(), 'So a 10% price rise gives back about 5 points.', deps(j => jobs.push(j)));
    expect(p.kind).toBe('model');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].candidateTurnIndex).toBe(5);
    expect(checkMathClaims).toHaveBeenCalledTimes(1);   // started now, still pending
  });
  it('not on a message with no quantitative claim, nor without a background channel (a re-plan)', () => {
    const jobs: CheckerJob[] = [];
    planTurn(analysis(), 'I would look at competitors next.', deps(j => jobs.push(j)));
    planTurn(analysis(), 'So a 10% price rise gives back about 5 points.', deps());
    expect(jobs).toHaveLength(0);
  });
  it('not when switched off', () => {
    const jobs: CheckerJob[] = [];
    vi.stubEnv('MATH_CHECKER_CONFIG', 'off');
    try { planTurn(analysis(), 'So a 10% price rise gives back about 5 points.', deps(j => jobs.push(j))); } finally { vi.unstubAllEnvs(); }
    expect(jobs).toHaveLength(0);
  });
});
