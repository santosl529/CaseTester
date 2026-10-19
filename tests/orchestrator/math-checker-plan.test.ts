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
import { pendingFinalChecks } from '@/lib/orchestrator/close-hold';
import type { VettedClaim } from '@/lib/orchestrator/math-checker';
import type { CheckerJob, VerdictPayload } from '@/lib/orchestrator/math-checker-live';
import type { VerifiedFigure } from '@/lib/orchestrator/recompute';
import { readsFixture } from './fixtures/turn-reads';
import { checkerClaim, codeFlagsOf } from './helpers/checker-claim';

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
// A vetted flag of the checker's on a figure (it releases code's line on that figure: the gate).
const flagOn = (candidateValue: string, correctValue: number, over: Partial<VettedClaim> = {}): VettedClaim => ({
  ...checkerClaim(candidateValue, { correctValue }), flag: true, probeLine: null, correctionLine: null, correctionFigure: null, pointerLine: null, vetNotes: [], ...over,
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
    // Message 3 also misquoted revenue growth, and the checker flagged that too: code's correction is released now.
    const MISQ = "Revenue grew about 19% over the period, so volume is clearly healthy — that's a decent sign demand isn't fragile.";
    const reads = readsFixture({ phase: 'ANALYSIS', revealed: COSTS,
      flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } },
      extraTurns: [{ role: 'candidate', text: `${CLAIM} ${MISQ}` }, { role: 'interviewer', text: 'What would you look at next?' }] });
    const row = verdict(3, { claims: [flagged, flagOn('about 19%', 15)], codeFlags: codeFlagsOf(MISQ, COSTS) });
    const p = modelState(planTurn(withVerdict(reads, [row]), 'Next I would look at competitors.', deps()));
    expect(p.state.misquote).not.toBeNull();
    expect(p.state.recomputeHint ?? '').not.toMatch(/MATH CHECK FLAG/);
    // The checker's flag on the price claim waits; its flag on the misquote is code's line (dedupe).
    expect((p.ctx.flags.mathChecker as { handled: string[] }).handled).toEqual(['3:1']);
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

// Lorenzo, 19 Oct (§15 o; review I1): a claim built on the flagged figure rides
// on its line — booked with it on a turn that says it, left waiting on one that doesn't.
describe('a claim built on the flagged figure rides on its line', () => {
  const built: VettedClaim = { ...flagged, span: 'so margin goes 6 + 5 = 11%', quantity: 'new margin', candidateValue: '11%', correctValue: 14.5, codeQuantity: { kind: 'new_margin', stepId: null, price: 10, target: null },
    probeLine: 'Walk me through how you got to 11%.', correctionLine: null, correctionFigure: null };
  it('a model turn: the root probed, the built claim derived and handled with it', () => {
    const p = modelState(planTurn(withVerdict(analysis(), [verdict(3, { claims: [flagged, built] })]), 'Next I would look at competitors.', deps()));
    expect(p.state.recomputeHint).toMatch(/Which cost lines did you include\?/);
    expect((p.ctx.flags.mathChecker as { handled: string[] }).handled).toEqual(['3:0', '3:1']);
    expect(p.ctx.events).toContainEqual(expect.objectContaining({ subtype: 'flag', payload: expect.objectContaining({ id: '3:1', outcome: 'derived', root: 'pricing:gain@5' }) }));
  });
  it('a code-written stage or time line: neither handled, no derived row', () => {
    const p = modelState(planTurn(withVerdict(analysis({}, 16 * 60 * 1000 + 30_000), [verdict(3, { claims: [flagged, built] })]), 'Next I would look at competitors.', deps()));
    expect(p.ctx.flags.mathChecker).toBeUndefined();
    expect(p.ctx.events).not.toContainEqual(expect.objectContaining({ subtype: 'flag', payload: expect.objectContaining({ outcome: 'derived' }) }));
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
    const p = modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { probed: [{ key: 'pricing:gain@5', at: 3 }] } } }), [verdict(7)]), RISK, deps()));
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
  // The probe answered message 5; message 7 is its redo.
  it('a redo still wrong at another value: its step had the probe — the close, the flag to the report', () => {
    const p = modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { probed: [{ key: 'pricing:gain@4', at: 5 }] } } }), [verdict(7)]), RISK, deps()));
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
  const SOFIA_T15 = 'COGS is 58 points of revenue, so variable contribution is roughly 42 points. And beans are 25% of COGS, so call that 25 points of revenue cushioning the downside.';
  const FIGURES = 'The biggest risk is volume loss: if traffic falls more than 10%, the rise stops paying.';
  const clean = () => verdict(7, { claims: [] });
  it('the follow-up\'s own answer is not waited on, and it is never asked twice in a row', () => {
    // Asked on message 7: message 9 answers it — its figures close the case, their verdict to the report.
    expect(modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { waits: [7] } } }), [clean()]), FIGURES, on())).state.kind).toBe('close');
    // …even with message 7's own verdict still out.
    expect(modelState(planTurn(endReads({ flags: { closeHold: { waits: [7] } } }), RISK, on())).state.kind).toBe('close');
  });
  it('a follow-up asked earlier does not use it up: a later reply with figures gets its own', () => {
    expect(modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { waits: [3] } } }), [clean()]), FIGURES, on())).state.kind).toBe('close_wait');
  });
  // Batch 28 Jasmine 2… t17 → t19: "22%" probed by code, "17–18%" in the redo — the case closes, the report has it.
  it('the redo of code\'s probe holds nothing and is not waited on', () => {
    // Code probed on message 5: message 7 is the redo — its flag holds nothing.
    const p = modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { probeTurns: [5] } } }), [verdict(7)]), RISK, on()));
    expect(p.state.kind).toBe('close');
    // Code probed on message 7: the closing message 9 is the redo — its figures are not waited on, nor its own deterministic flag raised.
    expect(modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { probeTurns: [7] } } }), [clean()]), FIGURES, on())).state.kind).toBe('close');
    expect(modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { probeTurns: [7] } } }), [clean()]), SOFIA_T15, deps())).state.kind).toBe('close');
  });
  // Lorenzo, 16 Oct: at most two wrap-up probes an interview; the recommendation's own figures first, then the largest error.
  it('two wrap-up probes said already: the close, the flag to the report, and no follow-up', () => {
    const p = modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { probeTurns: [1, 2] } } }), [verdict(7)]), RISK, deps()));
    expect(p.state.kind).toBe('close');
    expect(p.ctx.events).toContainEqual(expect.objectContaining({ payload: expect.objectContaining({ id: '7:0', outcome: 'unresolved_at_close' }) }));
    expect(modelState(planTurn(endReads({ flags: { closeHold: { probeTurns: [1, 2] } } }), RISK, on())).state.kind).toBe('close');
  });
  it('…nor the recommendation reply\'s own math probe', () => {
    // The reply (message 5) with a wrong pricing claim; the checker flagged it; message 7 is now.
    const REPLY = `My recommendation: raise prices. ${CLAIM}`;
    const recReads = (flags: Record<string, unknown> = {}) => readsFixture({ phase: 'RECOMMENDATION', elapsedMs: 15 * 60 * 1000, revealed: CORE,
      flags: { moves: { 4: 'brainstorm' }, stall: { recommendationDelivered: true }, stageEvidence: { ...INITIAL_STAGES, brainstorm: { delivered: true, deliveredAt: 4, outcome: 'answered' as const } }, ...flags },
      extraTurns: [{ role: 'candidate', text: 'Ideas.' }, { role: 'interviewer', text: 'What would you recommend to the CEO?' }, { role: 'candidate', text: REPLY }, { role: 'interviewer', text: 'What is the biggest risk?' }] });
    const row = verdict(5, { codeFlags: codeFlagsOf(REPLY, CORE) });
    expect(modelState(planTurn(withVerdict(recReads(), [row]), 'Volume loss.', deps())).state.kind).toBe('rec_math_probe');
    expect(modelState(planTurn(withVerdict(recReads({ closeHold: { probeTurns: [1, 2] } }), [row]), 'Volume loss.', deps())).state.kind).not.toBe('rec_math_probe');
    // Not on the reply itself: its verdict can't have landed (the gate).
    expect(modelState(planTurn(recReads(), REPLY, deps())).state.kind).not.toBe('rec_math_probe');
  });
  const BIG: VettedClaim = { ...flagged, span: 'the underlying pressure is about 40 points', quantity: 'underlying pressure', candidateValue: 'about 40 points', correctValue: 16, codeQuantity: { kind: 'none', stepId: null, price: null, target: null },
    probeLine: 'You said the underlying pressure is about 40 points. How did you get that?', correctionLine: null, correctionFigure: null, changesConclusion: false };
  const later = (flags: Record<string, unknown> = {}) => readsFixture({
    phase: 'RECOMMENDATION', elapsedMs: 17 * 60 * 1000, revealed: CORE,
    flags: { moves: { 4: 'brainstorm', 6: 'recommendation', 8: 'risk' }, stall: { recommendationDelivered: true }, stageEvidence: { ...INITIAL_STAGES, brainstorm: { delivered: true, deliveredAt: 4, outcome: 'answered' as const }, recommendation: { delivered: true, deliveredAt: 6, asks: 1, outcome: 'answered' as const }, risk: { delivered: true, deliveredAt: 8 } }, ...flags },
    extraTurns: [
      { role: 'candidate', text: 'Ideas.' }, { role: 'interviewer', text: 'What else could they do?' },
      { role: 'candidate', text: 'More ideas.' }, { role: 'interviewer', text: 'What do you recommend?' },
      { role: 'candidate', text: `My recommendation is to raise menu prices. ${CLAIM}` }, { role: 'interviewer', text: 'What is the biggest risk?' },
      { role: 'candidate', text: 'Volume loss; the underlying pressure is about 40 points.' }, { role: 'interviewer', text: 'How would you guard against that?' },
    ],
  });
  it('the recommendation reply\'s figure goes first, even against a larger error later', () => {
    const p = modelState(planTurn(withVerdict(later(), [verdict(7), verdict(9, { claims: [BIG] })]), 'A pilot in a few stores.', deps()));
    expect(p.state.recMathProbe).toEqual(expect.objectContaining({ checker: expect.objectContaining({ id: '7:0' }) }));
  });
  it('then the largest error', () => {
    const p = modelState(planTurn(withVerdict(later(), [verdict(7, { claims: [] }), verdict(9, { claims: [{ ...flagged, changesConclusion: true }, BIG] })]), 'A pilot in a few stores.', deps()));
    expect(p.state.recMathProbe).toEqual(expect.objectContaining({ checker: expect.objectContaining({ id: '9:1' }) }));
  });
  // A final answer (message 9) with a deterministic flag the checker also flagged; message 11 closes.
  const sofiaReads = (flags: Record<string, unknown> = {}) => readsFixture({
    phase: 'RECOMMENDATION', elapsedMs: 17 * 60 * 1000, revealed: CORE,
    flags: { moves: { 4: 'brainstorm', 6: 'recommendation', 8: 'risk' }, stall: { recommendationDelivered: true }, stageEvidence: { ...INITIAL_STAGES, brainstorm: { delivered: true, deliveredAt: 4, outcome: 'answered' as const }, recommendation: { delivered: true, deliveredAt: 6, asks: 1, outcome: 'answered' as const }, risk: { delivered: true, deliveredAt: 8 } }, closeHold: { waits: [3] }, ...flags },
    extraTurns: [
      { role: 'candidate', text: 'Ideas.' }, { role: 'interviewer', text: 'What else could they do?' },
      { role: 'candidate', text: 'More ideas.' }, { role: 'interviewer', text: 'What do you recommend?' },
      { role: 'candidate', text: `My recommendation is to raise menu prices. ${CLAIM}` }, { role: 'interviewer', text: 'What is the biggest risk?' },
      { role: 'candidate', text: SOFIA_T15 }, { role: 'interviewer', text: 'How would you guard against that?' },
    ],
  });
  const sofiaRow = () => verdict(9, { claims: [flagOn('25 points of revenue', 14.5, { errorType: 'unit' })], codeFlags: codeFlagsOf(SOFIA_T15, CORE) });
  it('the recommendation reply\'s checker flag goes before a later final answer\'s deterministic flag', () => {
    const p = modelState(planTurn(withVerdict(sofiaReads(), [verdict(7), sofiaRow()]), 'I would pilot it first.', deps()));
    expect(p.state.recMathProbe).toEqual(expect.objectContaining({ checker: expect.objectContaining({ id: '7:0' }) }));
  });
  it('never at time-up', () => {
    expect(modelState(planTurn(endReads({ elapsedMs: 21 * 60 * 1000, flags: { graceAskFired: true } }), RISK, on())).state.kind).toBe('close');
  });
  // Batch 28 Sofia 0a43682d t15: "beans are 25% of COGS, so call that 25 points of
  // revenue" — the unit check's flag blocks the checker's line that turn (one math
  // line a turn) and the checker defers to it, so code's own line holds the close.
  // With the gate (16 Oct) code's flag goes out once the checker flags the same claim: a turn later.
  it('a final answer\'s deterministic flag, released by the checker\'s: code\'s line holds the close once', () => {
    const p = modelState(planTurn(withVerdict(sofiaReads(), [verdict(7, { claims: [] }), sofiaRow()]), 'I would pilot it first.', deps()));
    expect(p.state.kind).toBe('rec_math_probe');
    expect(p.state.recMathProbe).toEqual(expect.objectContaining({ flag: expect.objectContaining({ kind: 'unit', candidateValue: 25 }) }));
    expect(p.state.closeHoldPlan).toMatchObject({ probeKey: 'unit:COGS@25', hold: true });
    expect(modelState(planTurn(withVerdict(sofiaReads({ closeHold: { waits: [3], probed: [{ key: 'unit:COGS@25', at: 9 }] } }), [verdict(7, { claims: [] }), sofiaRow()]), 'I would pilot it first.', deps())).state.kind).toBe('close');
    // The closing message's own flag has no verdict yet: not raised.
    expect(modelState(planTurn(withVerdict(endReads(), [verdict(7, { claims: [] })]), SOFIA_T15, deps())).state.recMathProbe ?? null).toBeNull();
  });
  it('a flag released from a message before the final answers holds no close', () => {
    // The recommendation was received at message 11 (deliveredAt 10): message 9 is no final answer.
    const stageEvidence = { ...INITIAL_STAGES, brainstorm: { delivered: true, deliveredAt: 4, outcome: 'answered' as const }, recommendation: { delivered: true, deliveredAt: 10, asks: 1, outcome: 'answered' as const }, risk: { delivered: true, deliveredAt: 10 } };
    const p = modelState(planTurn(withVerdict(sofiaReads({ stageEvidence }), [verdict(7, { claims: [] }), sofiaRow()]), 'I would pilot it first.', deps()));
    expect(p.state.closeHoldPlan.hold).toBe(false);
  });
  // Batch 28 Sofia: "5.8 points" in the recommendation (t13), "4.2 points" in the risk answer (t15) — the same step, two figures.
  it('the same step at another value, not the redo of its probe: another figure — probed once too', () => {
    const p = modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { probed: [{ key: 'pricing:gain@4', at: 9 }] } } }), [verdict(7)]), RISK, deps()));
    expect(p.state.kind).toBe('rec_math_probe');
    // The same figure under another key (a restatement, code's flag and the checker's): no second probe.
    expect(modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { probed: [{ key: 'pricing:gain@5.0', at: 9 }] } } }), [verdict(7)]), RISK, deps())).state.kind).toBe('close');
    expect(modelState(planTurn(withVerdict(endReads({ flags: { closeHold: { probed: [{ key: 'pricing:gain', at: 9 }] } } }), [verdict(7)]), RISK, deps())).state.kind).toBe('close');
  });
});

describe('a closed error said again in the recommendation (Lorenzo, 13 Oct; Jordan 099f33e9 t25)', () => {
  it("code's correction again, its figure licensed for the provenance audit", () => {
    // The reply (message 5) said the closed figure again; its verdict flags it (the gate); message 7 is now.
    const REPLY = 'My recommendation: raise prices. That gets about 5 points back.';
    const reads = readsFixture({
      phase: 'RECOMMENDATION', elapsedMs: 17 * 60 * 1000, revealed: COSTS,
      flags: { moves: { 4: 'brainstorm', 8: 'risk' }, stall: { recommendationDelivered: true }, stagesEnforced: { analysis: true, exhibit: true, brainstorm: true }, mathChecker: { handled: ['3:0'], keys: { 'pricing:gain': { figures: [5], since: 3 } }, closed: ['pricing:gain'] } },
      extraTurns: [{ role: 'candidate', text: CLAIM }, { role: 'interviewer', text: 'What would you recommend to the CEO?' }, { role: 'candidate', text: REPLY }, { role: 'interviewer', text: 'What is the biggest risk?' }],
    });
    const row = { id: 'f5', sessionId: 's1', category: 'math_checker', subtype: 'flag', turnIndex: 5, phase: 'ANALYSIS', payloadJsonb: { id: '3:0', outcome: 'correct', key: 'pricing:gain', candidateValue: 'about 5 points', line: flagged.correctionLine } };
    const agrees = verdict(5, { claims: [flagOn('about 5 points', 8.5)] });
    const p = modelState(planTurn({ ...reads, checkerEventRows: [row, agrees] } as unknown as TurnReads, 'Volume loss.', deps()));
    expect(p.state.kind).toBe('rec_math_probe');
    expect(p.state.recMathProbe).toEqual({ closed: { key: 'pricing:gain', said: '5 points', correction: flagged.correctionLine, n: 5 }, action: 'correct' });
    expect(p.state.derivedValueTexts).toContain('8.5');
    // The reply's verdict rates it correct (or hasn't landed): nothing.
    const clears = verdict(5, { claims: [{ ...flagOn('about 5 points', 5), flag: false, verdict: 'correct' }] });
    expect(modelState(planTurn({ ...reads, checkerEventRows: [row, clears] } as unknown as TurnReads, 'Volume loss.', deps())).state.kind).not.toBe('rec_math_probe');
    expect(modelState(planTurn({ ...reads, checkerEventRows: [row] } as unknown as TurnReads, 'Volume loss.', deps())).state.kind).not.toBe('rec_math_probe');
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

// close-hold.ts directly: which final answers the close still waits on.
describe('pendingFinalChecks', () => {
  const msgs = [{ index: 5, text: 'Ideas.' }, { index: 7, text: 'A 10% rise gives 5 points.' }, { index: 9, text: 'Pilot in 20 stores.' }, { index: 11, text: 'Start with dairy.' }];
  const row = (n: number, subtype = 'verdict') => ({ category: 'math_checker', subtype, payloadJsonb: { candidateTurnIndex: n } });
  const checked = (t: string) => /\d/.test(t);
  it('from the recommendation reply on, checked messages whose verdict or error has not landed', () => {
    expect(pendingFinalChecks({ messages: msgs, from: 7, memory: {}, rows: [], checked })).toEqual([7, 9]);
    expect(pendingFinalChecks({ messages: msgs, from: 7, memory: {}, rows: [row(7), row(9, 'error')], checked })).toEqual([]);
  });
  it('not the answer to the follow-up', () => {
    expect(pendingFinalChecks({ messages: msgs, from: 7, memory: { waits: [7] }, rows: [row(7)], checked })).toEqual([]);
  });
});

// Batch 29 Jordan ea27d1f6 t13 (Lorenzo, 16 Oct): "COGS rose 16 points … Would
// that change your recommendation at all?" before any recommendation — the
// turn before had a "recommendation" label code's probe had replaced. No
// "your recommendation" question goes out before one is received.
describe('no recommendation question before a recommendation is received (Jordan b29 t13)', () => {
  const CORRECTION = 'COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base.';
  const KEY = 'cogs_dollar_impact@38';
  const T13 = "Sure. Beans are 25% of COGS. COGS is now 58 points of revenue, so beans are about 0.25 × 58 ≈ 14.5 points of revenue.\n\nIf we win a 10% reduction on bean costs — which is aggressive for a commodity in a tight market — that's 0.10 × 14.5 ≈ 1.45 points of margin. Call it a point and a half.\n\nEven a 20% win is only about 3 points. And the other 75% of COGS — dairy, packaging, food — is 43.5 points of revenue; a 5% improvement there is about 2 points.\n\nSo realistically, stacking sourcing and waste initiatives together, you might recover 4 to 6 points of margin. Against roughly 38 to 40 points of gross COGS pressure, that's a sixth of the problem at best. It gets you from 6% to maybe 11%, not back to 24%.\n\nThat's why I keep landing on price. Prices have been flat for two years while inputs ran up nearly 40% — there's real headroom there.";
  const reads = (flags: Record<string, unknown> = {}) => readsFixture({
    phase: 'BRAINSTORM', elapsedMs: 11 * 60 * 1000, revealed: COSTS,
    flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false },
      moves: { 6: 'recommendation' }, mathChecker: { handled: ['3:0'], keys: { [KEY]: { figures: [38, 40], since: 3 } }, closed: [KEY] }, ...flags },
    extraTurns: [
      { role: 'candidate', text: "I'm reading that as a 38% increase on the 42 base, so roughly 38 points of margin pressure from COGS alone." },
      { role: 'interviewer', text: `${CORRECTION} What else could Brew & Bean do to restore its margin?` },
      { role: 'candidate', text: 'A few buckets. On COGS directly: renegotiate green coffee contracts, consolidate suppliers. On mix: push higher-margin items.' },
      { role: 'interviewer', text: 'Got it, a broad set of levers. Walk me through that calculation.' },
      { role: 'candidate', text: T13 },
      { role: 'interviewer', text: 'What would you look at next?' },
    ],
  });
  const rows = () => [
    { id: 'f5', sessionId: 's1', category: 'math_checker', subtype: 'flag', turnIndex: 5, phase: 'ANALYSIS', payloadJsonb: { id: '3:0', outcome: 'correct', key: KEY, candidateValue: '38-40 points', line: CORRECTION } },
    verdict(7, { claims: [flagOn('38-40 points', 16)] }),
  ];
  const plan = (flags?: Record<string, unknown>) => modelState(planTurn(withVerdict(reads(flags), rows() as never), 'I would look at dairy contracts next.', deps()));
  it('t13 replied to no recommendation ask (the label was a replaced question\'s), and no recommendation is in: no closed-error flag', () => {
    const p = plan();
    expect(p.state.kind).not.toBe('rec_math_probe');
    expect(p.state.recMathProbe).toBeNull();
  });
  it('with a recommendation received, the same reply gets the flag (the guard is what holds it)', () => {
    const p = plan({ stall: { recommendationDelivered: true } });
    expect(p.state.kind).toBe('rec_math_probe');
    expect(p.state.recMathProbe).toMatchObject({ closed: { key: KEY, correction: CORRECTION }, action: 'correct' });
  });
});

// The same guard on the recommendation reply's own lines: a misquote or a code
// flag released from a reply that gave no recommendation asks nothing about it.
describe('the reply\'s released lines ask about a recommendation only once one is in', () => {
  const MISQ = 'Revenue grew about 19% over the period, and COGS is the story.';
  const WRONG = 'A 10% price increase recovers about 5 points of margin.';
  const reads = (text: string, flags: Record<string, unknown> = {}) => readsFixture({
    phase: 'RECOMMENDATION', elapsedMs: 14 * 60 * 1000, revealed: COSTS,
    flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false }, moves: { 4: 'recommendation' }, ...flags },
    extraTurns: [{ role: 'candidate', text: 'Ideas.' }, { role: 'interviewer', text: 'What is your recommendation to the CEO?' }, { role: 'candidate', text }, { role: 'interviewer', text: 'What would you look at next?' }],
  });
  const at = (text: string, claims: VettedClaim[], flags?: Record<string, unknown>) =>
    modelState(planTurn(withVerdict(reads(text, flags), [verdict(5, { claims, codeFlags: codeFlagsOf(text, COSTS) })]), 'I would look at dairy contracts next.', deps())).state;
  it('a misquote: corrected, but no "does your recommendation change?" without a recommendation', () => {
    const none = at(MISQ, [flagOn('about 19%', 15)]);
    expect(none.misquote).not.toBeNull();
    expect(none.kind).not.toBe('rec_revision');
    expect(at(MISQ, [flagOn('about 19%', 15)], { stall: { recommendationDelivered: true } }).kind).toBe('rec_revision');
  });
  it('a code flag: no recommendation math probe without a recommendation', () => {
    expect(at(WRONG, [flagged]).kind).not.toBe('rec_math_probe');
    expect(at(WRONG, [flagged], { stall: { recommendationDelivered: true } }).kind).toBe('rec_math_probe');
  });
});

