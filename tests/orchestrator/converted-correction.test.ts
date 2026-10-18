// The conversion in the checker's plan (Lorenzo, 17 Oct; session 9ccf0836
// T24, batch 30 Noor t16): a flagged figure right on the candidate's own
// quantity, or stated in none, gets code's figure without "not X", and its
// step closes — reopened only by a figure stated in code's quantity or unit.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({
  db: new Proxy({}, { get: (_t, prop) => () => { throw new Error(`db.${String(prop)} used in plan`); } }),
}));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));
const { checkMathClaims } = vi.hoisted(() => ({ checkMathClaims: vi.fn(() => new Promise(() => {})) }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims }));

import { planCheckerFlags, closedErrorRestated, MATH_CHECKER_CATEGORY, type CheckerPlanInput, type VerdictPayload } from '@/lib/orchestrator/math-checker-live';
import { codeCorrection, type CheckerClaim, type VettedClaim } from '@/lib/orchestrator/math-checker';
import { formatCheckerSection } from '@/lib/scoring/checker-record';
import { planTurn, type TurnReads } from '@/lib/orchestrator/plan-turn';
import { getCaseById } from '@/lib/cases/loader';
import { readsFixture } from './fixtures/turn-reads';
import { challengeVerdict } from '@/lib/orchestrator/probe-guard';

const prof = getCaseById('prof-001');
const COSTS = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'menu_price_change', 'bean_price_change', 'non_bean_input_change', 'revenue_total', 'avg_ticket', 'stores_count'];
const BEANS: CheckerClaim['codeQuantity'] = { kind: 'step', stepId: 'bean_points_added', price: null, target: null };

function vetted(candidateValue: string, span: string, over: Partial<VettedClaim> = {}): VettedClaim {
  const c: CheckerClaim = {
    span, quantity: 'bean contribution', candidateValue, assumptions: '', verdict: 'error', correctValue: 4.2, correctLow: null, correctHigh: null,
    unit: 'points of revenue', derivation: '', errorType: 'conceptual', changesConclusion: false, confidence: 'high', probe: '', pointer: '',
    codeQuantity: BEANS, actualShare: null, ...over,
  };
  const w = codeCorrection(c, { value: 4.2, index: 0 }, { caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: [] })!;
  return { ...c, flag: true, probeLine: 'Walk me through that calculation.', correctionLine: w.line, correctionFigure: w.figure, pointerLine: null, vetNotes: [] };
}
type CheckerRow = { category: string; subtype: string; turnIndex: number | null; payloadJsonb: unknown };
const row = (n: number, claims: VettedClaim[]): CheckerRow => ({
  category: MATH_CHECKER_CATEGORY, subtype: 'verdict', turnIndex: n,
  payloadJsonb: { candidateTurnIndex: n, latencyMs: 5000, model: 'claude-sonnet-5-5', claims, codeFlags: [], stamps: [] } satisfies VerdictPayload,
});
const T21 = "I'm saying it's ten points of the thirty seven point five percent. increasing COGS.";
const T23 = 'Well, I was just looking at cogs. and to get the specific amount of points that each contributing factor was raising COGS, you just have to look at how much each factor is raising and then multiply it by its share of COGS.';
const t21 = vetted('10 points of a 37.5% COGS increase', T21);
const input = (over: Partial<CheckerPlanInput> = {}): CheckerPlanInput => ({
  rows: [row(21, [t21])], handled: [],
  turnRows: [
    { turnIndex: 0, role: 'interviewer', text: 'Your client is Brew & Bean.' },
    { turnIndex: 21, role: 'candidate', text: T21 },
    { turnIndex: 22, role: 'interviewer', text: 'You said each of the four costs is around nine point three. How did you get that?' },
  ],
  candidateText: T23, candidateTurnIndex: 23,
  // Attempt 2: the probe was spent on T17's "ten percent of the increase".
  currentFlags: [], attempts: { 'bean_points_added@10': 1 }, underTimePressure: false, candidateFigures: [10, 9.3],
  caseData: prof, revealedIds: COSTS,
  ...over,
});

describe('9ccf0836 T24 replayed through the plan', () => {
  it('the conversion, not "about 4.2 points, not 10"', () => {
    const p = planCheckerFlags(input());
    expect(p.selected).toMatchObject({ action: 'correct', converted: true, line: "In revenue terms, that's about 4.2 points.", derived: ['4.2'] });
    expect(p.decisions).toContainEqual(expect.objectContaining({ id: '21:0', outcome: 'converted', reason: expect.stringMatching(/right on their own quantity/) }));
  });
  it('stated in revenue points, wrong: today\'s correction', () => {
    const text = 'Beans add about 6 points of revenue.';
    const p = planCheckerFlags(input({ rows: [row(21, [vetted('6 points of revenue', text)])], turnRows: [{ turnIndex: 21, role: 'candidate', text }], attempts: { 'bean_points_added@6': 1 }, candidateText: 'Next, labor.' }));
    expect(p.selected).toMatchObject({ action: 'correct', line: "Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points, not 6." });
    expect(p.selected?.converted).toBeUndefined();
  });
});

describe('the step a conversion closed', () => {
  const closed = ['bean_points_added@10', 'converted:bean_points_added'];
  const later = (value: string, text: string) => input({
    rows: [row(27, [vetted(value, text)])], closed, keys: { 'bean_points_added@10': { figures: [10], since: 17 } },
    turnRows: [{ turnIndex: 27, role: 'candidate', text }], candidateText: 'Wait, let me think about the base.', candidateTurnIndex: 29, attempts: {},
  });
  it('a later figure on it, no unit: left for the report (27\'s "five point eight")', () => {
    const p = planCheckerFlags(later('5.8', "So fifty eight percent times the ten percent. That's five point eight."));
    expect(p.selected).toBeNull();
    expect(p.decisions).toContainEqual(expect.objectContaining({ outcome: 'unresolved', reason: expect.stringMatching(/closed by a conversion/) }));
    expect(p.flaggedFigures).not.toContain(5.8);
  });
  it('a later figure stated in revenue points reopens it: one probe', () => {
    const p = planCheckerFlags(later('5.8 points of revenue', "So that's five point eight points of revenue."));
    expect(p.selected).toMatchObject({ action: 'probe' });
  });
  it('a restatement in the recommendation is no closed error to raise again', () => {
    const flagRow: CheckerRow = { category: MATH_CHECKER_CATEGORY, subtype: 'flag', turnIndex: 23, payloadJsonb: { id: '21:0', candidateTurnIndex: 21, outcome: 'converted', reason: 'attempt 2; a conversion: right on their own quantity', span: T21, candidateValue: '10 points of a 37.5% COGS increase', key: 'bean_points_added@10', changesConclusion: false, line: "In revenue terms, that's about 4.2 points." } };
    expect(closedErrorRestated('Beans add 10 points, the rest is other inputs.', closed, { 'bean_points_added@10': { figures: [10], since: 21 } }, [flagRow])).toBeNull();
  });
});

describe('the report', () => {
  const flag = (reason: string): CheckerRow => ({ category: MATH_CHECKER_CATEGORY, subtype: 'flag', turnIndex: 23, payloadJsonb: { id: '21:0', candidateTurnIndex: 21, outcome: 'converted', reason, span: T21, candidateValue: '10', key: 'bean_points_added@10', changesConclusion: false, line: 'L.' } });
  it('right on their own quantity: no error listed', () => expect(formatCheckerSection([row(21, [t21]), flag('attempt 2; a conversion: right on their own quantity')])).toBe(''));
  it('no quantity stated: listed, with code\'s figure', () => expect(formatCheckerSection([row(21, [t21]), flag('attempt 2; a conversion: no quantity stated')])).toMatch(/No unit was stated; code gave its own figure: "L\."/));
});

describe('planTurn: the conversion closes the step for code\'s probes too', () => {
  it('closed keys carry the step marker after the turn', () => {
    const reads = readsFixture({
      phase: 'ANALYSIS', revealed: COSTS,
      flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false }, recomputeAttempts: { 'bean_points_added@10': 1 } },
      extraTurns: [{ role: 'candidate', text: T21 }, { role: 'interviewer', text: 'What does thirty seven point five percent measure?' }],
    });
    const n = reads.turnRows.find(t => t.text === T21)!.turnIndex;
    const withRows = { ...reads, checkerEventRows: [{ ...row(n, [t21]), id: 'ev', sessionId: 's1', phase: 'ANALYSIS' }] } as unknown as TurnReads;
    const p = planTurn(withRows, T23, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    expect(p.state.recomputeHint).toContain("\"In revenue terms, that's about 4.2 points.\"");
    expect((p.ctx.flags.mathChecker as { closed: string[] }).closed).toEqual(expect.arrayContaining(['converted:bean_points_added']));
    // His "10" is a case figure too (25% × 40%), so no key keeps it: memory does, for the closed figures.
    expect((p.ctx.flags.mathChecker as { convertedFigures: number[] }).convertedFigures).toEqual([10]);
  });
  it('the next turn: his figure is closed — a doubt on it is withheld', () => {
    const reads = readsFixture({
      phase: 'ANALYSIS', revealed: COSTS,
      flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false },
        mathChecker: { handled: ['21:0'], closed: ['bean_points_added', 'converted:bean_points_added'], convertedFigures: [10] } },
    });
    const p = planTurn(reads, 'Where did you get four point two?', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    expect(p.state.closedFigures).toContain(10);
    expect(p.state.flaggedFigures).not.toContain(10);
  });
});

describe('after the conversion, the model\'s own doubts on the figure are withheld (9ccf0836 T26, T30)', () => {
  it.each([
    'Take beans at 25 percent of COGS and 40 percent inflation, then COGS as a share of revenue two years ago from the exhibit. Does ten points carry through to the revenue base?',
    'Ten points of COGS convert to revenue using one share of revenue. Which one applies, and what does the bean contribution come to?',
  ])('%s', sentence => {
    const v = challengeVerdict(sentence, { verified: [], alreadyProbed: new Set(), flaggedThisTurn: false, flagged: [], closed: [10], candidateFigures: [10, 9.3] });
    expect(v).toMatchObject({ test: 'closed_to_report' });
  });
});
