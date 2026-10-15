// Lorenzo, 13 Oct (Larkspur rulings, c; Jordan 9ab76a39's "the four routes
// absorb half" probed three times under three wordings): at most two probes
// per step per interview, whatever the value. A step is the bound math step,
// the pricing claim's kind or the arithmetic expression — the value left out;
// a claim bound to none is its own error, and a word quantity ("half", "a
// fifth") identifies its restatements the way a figure does.
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: new Proxy({}, { get: (_t, prop) => () => { throw new Error(`db.${String(prop)} used in plan`); } }) }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: () => new Promise(() => {}) }));
import { planCheckerFlags, stepOfKey, wordFigures, STEP_PROBE_CAP, MATH_CHECKER_CATEGORY, type CheckerPlanInput, type CheckerRow, type VerdictPayload } from '@/lib/orchestrator/math-checker-live';
import type { VettedClaim } from '@/lib/orchestrator/math-checker';
import { planTurn } from '@/lib/orchestrator/plan-turn';
import { getCaseById } from '@/lib/cases/loader';
import { readsFixture } from './fixtures/turn-reads';

const prof = getCaseById('prof-001');
const COSTS = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'menu_price_change', 'bean_price_change', 'non_bean_input_change'];
const NONE = { kind: 'none' as const, stepId: null, price: null, target: null };
const claim = (over: Partial<VettedClaim> = {}): VettedClaim => ({
  span: 'a 10% price increase recovers about 5 points', quantity: 'margin gain from a 10% price rise', candidateValue: 'about 5 points', assumptions: '',
  verdict: 'error', correctValue: 8.5, correctLow: null, correctHigh: null, unit: 'points', derivation: '', errorType: 'conceptual',
  changesConclusion: true, confidence: 'high', probe: '', pointer: '', codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null }, actualShare: null,
  flag: true, probeLine: 'You said a 10% price rise recovers about 5 points. Which cost lines did you include?',
  correctionLine: null, correctionFigure: null, pointerLine: null, vetNotes: [], ...over,
});
const row = (n: number, claims: VettedClaim[]): CheckerRow => ({
  category: MATH_CHECKER_CATEGORY, subtype: 'verdict', turnIndex: n,
  payloadJsonb: { candidateTurnIndex: n, latencyMs: 6000, model: 'claude-sonnet-5-5', claims, codeFlags: [], stamps: [] } satisfies VerdictPayload,
});
const input = (over: Partial<CheckerPlanInput> = {}): CheckerPlanInput => ({
  rows: [row(3, [claim()])], handled: [],
  turnRows: [{ turnIndex: 0, role: 'interviewer', text: 'Your client is Brew & Bean.' }, { turnIndex: 3, role: 'candidate', text: 'A 10% price increase recovers about 5 points.' }, { turnIndex: 4, role: 'interviewer', text: 'What next?' }],
  candidateText: 'Next I would look at competitors.', candidateTurnIndex: 5,
  currentFlags: [], attempts: {}, underTimePressure: false, candidateFigures: [5, 10], caseData: prof, revealedIds: COSTS, ...over,
});

describe('the step of a key: the value left out', () => {
  it.each([
    ['op_profit_swing@48', 'op_profit_swing'], ['pricing:gain@5', 'pricing:gain'], ['arith:26.4 / 2000@13.2', 'arith:26.4 / 2000'], ['checker:roughly half', 'checker:roughly half'],
  ])('%s → %s', (key, step) => expect(stepOfKey(key)).toBe(step));
  it('the cap is two', () => expect(STEP_PROBE_CAP).toBe(2));
});

describe('a new value on a step that has had two probes', () => {
  it('gets no probe: with nothing code can say it goes to the report, and its flag closes', () => {
    const p = planCheckerFlags(input({ stepProbes: { 'pricing:gain': 2 } }));
    expect(p.selected).toBeNull();
    expect(p.decisions).toEqual([expect.objectContaining({ id: '3:0', outcome: 'unresolved', key: 'pricing:gain@5', reason: expect.stringMatching(/two probes on this step/) })]);
    expect(p.closedNow).toEqual(['pricing:gain@5']);
  });
  it("a correction code can write is no probe: it's said", () => {
    const line = 'A 10% price rise lifts margin about 8.5 points, not 5.';
    const p = planCheckerFlags(input({ rows: [row(3, [claim({ correctionLine: line, correctionFigure: '8.5' })])], stepProbes: { 'pricing:gain': 2 } }));
    expect(p.selected).toMatchObject({ action: 'correct', line });
  });
  it('one probe spent on the step: the new value still gets its probe', () => {
    expect(planCheckerFlags(input({ stepProbes: { 'pricing:gain': 1 } })).selected).toMatchObject({ action: 'probe', attempt: 1 });
  });
  it('another step is not capped', () => {
    expect(planCheckerFlags(input({ stepProbes: { 'pricing:breakeven': 2 } })).selected).toMatchObject({ action: 'probe' });
  });
  it('the pointer and the hint are probes too', () => {
    const p = planCheckerFlags(input({ rows: [row(3, [claim({ pointerLine: 'How does 5 fit with COGS at 58%?' })])], attempts: { 'pricing:gain@5': 1 }, stepProbes: { 'pricing:gain': 2 } }));
    expect(p.selected).toBeNull();
    expect(p.decisions[0]).toMatchObject({ outcome: 'unresolved' });
  });
});

describe('word quantities identify a restated error (Jordan 9ab76a39)', () => {
  it.each([
    ['roughly half', [0.5]], ['about half of the damage (about $24M)', [0.5]], ['about a fifth', [0.2]], ['a third', [1 / 3]], ['a quarter of it', [0.25]], ['twice the swing', [2]], ['double', [2]], ['$48M', []],
  ])('%s → %o', (text, figs) => expect(wordFigures(text)).toEqual(figs));
  const half = (value: string) => claim({ span: `${value} of the two-route damage is absorbed`, candidateValue: value, quantity: 'share of the damage absorbed', codeQuantity: NONE, probeLine: 'Walk me through that calculation.' });
  it('"about half of the damage (about $24M)" after "roughly half" was probed: the same error, its second attempt — nothing code can say, so the report', () => {
    const p = planCheckerFlags(input({
      rows: [row(9, [half('roughly half')]), row(11, [half('about half of the damage (about $24M)')])], handled: ['9:0'],
      attempts: { 'checker:roughly half': 1 }, keys: { 'checker:roughly half': { figures: [0.5], since: 9 } }, stepProbes: { 'checker:roughly half': 1 },
      turnRows: [{ turnIndex: 9, role: 'candidate', text: 'Roughly half is absorbed.' }, { turnIndex: 10, role: 'interviewer', text: 'Walk me through that calculation.' }, { turnIndex: 11, role: 'candidate', text: 'About half of the damage, about $24M.' }],
      candidateTurnIndex: 12, candidateText: 'So the routes matter.', candidateFigures: [24],
    }));
    expect(p.selected).toBeNull();
    expect(p.decisions).toEqual([expect.objectContaining({ id: '11:0', key: 'checker:roughly half', outcome: 'unresolved' })]);
    expect(p.closedNow).toEqual(['checker:roughly half']);
  });
  it('a word-quantity flag is kept in the registry by its word figure', () => {
    const p = planCheckerFlags(input({ rows: [row(9, [half('roughly half')])], turnRows: [{ turnIndex: 9, role: 'candidate', text: 'Roughly half.' }], candidateTurnIndex: 10, candidateFigures: [] }));
    expect(p.selected).toMatchObject({ key: 'checker:roughly half', action: 'probe' });
    expect(p.keys['checker:roughly half']).toEqual({ figures: [0.5], since: 9 });
  });
});

describe('in a turn: probes counted per step, and the deterministic flags capped too', () => {
  const PT = { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
  const WRONG = 'The COGS increase is costing us about $95M a year.';
  const plan = (flags: Record<string, unknown>) => {
    const p = planTurn(readsFixture({ phase: 'ANALYSIS', revealed: ['cogs_pct', 'revenue_total'], flags: { ...PT, ...flags } }), WRONG, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    return p;
  };
  it("code's step flag probes and is counted for its step", () => {
    const p = plan({});
    expect(p.state.recomputeHint).toMatch(/RECOMPUTE FLAG/);
    expect(p.ctx.flags.stepProbes).toEqual({ cogs_dollar_impact: 1 });
  });
  it('with two probes spent on the step, a new value is not probed — logged', () => {
    const p = plan({ stepProbes: { cogs_dollar_impact: 2 } });
    expect(p.state.recomputeHint ?? '').not.toMatch(/RECOMPUTE FLAG/);
    expect(p.ctx.flags.stepProbes).toEqual({ cogs_dollar_impact: 2 });
    expect(p.ctx.checks.entries.find(x => x.check === 'step_probe_cap')).toMatchObject({ decision: 'act', detail: { capped: [expect.objectContaining({ step: 'cogs_dollar_impact', value: 95 })] } });
  });
});

describe("in a turn: the checker's probe is counted, and a capped step gets none", () => {
  const PT = { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
  const plan = (flags: Record<string, unknown>) => {
    const reads = readsFixture({ phase: 'ANALYSIS', revealed: COSTS, flags: { ...PT, ...flags } });
    reads.checkerEventRows = [{ ...row(1, [claim()]), id: 'v1', phase: 'ANALYSIS', sessionId: 's1', createdAt: new Date() } as NonNullable<typeof reads.checkerEventRows>[number]];
    const p = planTurn(reads, 'Next I would look at the competitive response.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    return p;
  };
  it('the probe goes out and its step is counted', () => {
    const p = plan({});
    expect(p.state.recomputeHint).toMatch(/MATH CHECK FLAG/);
    expect(p.ctx.flags.stepProbes).toEqual({ 'pricing:gain': 1 });
  });
  it('two probes on the step already: no probe, the flag closes', () => {
    const p = plan({ stepProbes: { 'pricing:gain': 2 } });
    expect(p.state.recomputeHint ?? '').not.toMatch(/MATH CHECK FLAG/);
    expect((p.ctx.flags.mathChecker as { closed?: string[] }).closed).toEqual(['pricing:gain@5']);
  });
});

// Lorenzo, 14 Oct (batch-24 ruling 4): restated misreads under different
// framings share one count. Tyler 4228be02 read COGS as "about 54%" (58%); code
// corrects the misquote, and the checker's framings of it — "twelve points",
// "54% (12 points)", "two-thirds (12/18)", "about 67%" — are the same error, not
// five more probes.
describe('framings of a misread code corrects share its count', () => {
  const misquoteRow = (n: number, claims: VettedClaim[]): CheckerRow => ({
    category: MATH_CHECKER_CATEGORY, subtype: 'verdict', turnIndex: n,
    payloadJsonb: { candidateTurnIndex: n, latencyMs: 6000, model: 'claude-sonnet-5-5', claims, codeFlags: [{ key: 'misquote:cogs_pct', value: 54, span: 'it goes from 42% to about 54% today' }], stamps: [] } satisfies VerdictPayload,
  });
  const c = (span: string, value: string) => claim({ span, candidateValue: value, quantity: 'COGS change', codeQuantity: NONE, correctionLine: null, probeLine: `You said ${value}. How did you get there?` });
  const TURNS = [
    { turnIndex: 5, role: 'candidate', text: 'COGS is the story: it goes from 42% to about 54% today, so roughly twelve points of margin, which is most of the eighteen-point decline.' },
    { turnIndex: 6, role: 'interviewer', text: 'To correct one figure: COGS is 58% of revenue today, up from 42% two years ago. How did you get to that figure?' },
    { turnIndex: 7, role: 'candidate', text: 'Against an eighteen-point margin drop that is about two-thirds of it. Twelve over eighteen is about 67%.' },
    { turnIndex: 8, role: 'interviewer', text: 'What would you look at next?' },
  ];
  it('the framings get no probe of their own; an unrelated claim still does', () => {
    const p = planCheckerFlags(input({
      rows: [misquoteRow(5, [c('so roughly twelve points of margin', 'twelve points')]),
        row(7, [c('that is about two-thirds of it', 'two-thirds (12/18)'), c('Twelve over eighteen is about 67%', 'about 67%')])],
      turnRows: TURNS, candidateTurnIndex: 9, candidateText: 'Next I would look at menu prices.', candidateFigures: [54, 12, 67],
    }));
    expect(p.selected).toBeNull();
    expect(p.decisions.map(d => [d.id, d.outcome])).toEqual([['5:0', 'dedupe'], ['7:0', 'dedupe'], ['7:1', 'dedupe']]);
    // Turns later, with those framings handled: the next framing still joins ("that twelve-point swing is two-thirds" — t15).
    const later = planCheckerFlags(input({
      rows: [misquoteRow(5, [c('so roughly twelve points of margin', 'twelve points')]),
        row(7, [c('that is about two-thirds of it', 'two-thirds (12/18)')]), row(15, [c('That twelve-point swing is two-thirds of the decline', '12 points, two-thirds')])],
      handled: ['5:0', '7:0'], turnRows: [...TURNS, { turnIndex: 15, role: 'candidate', text: 'That twelve-point swing is two-thirds of the decline.' }, { turnIndex: 16, role: 'interviewer', text: 'Go on.' }],
      candidateTurnIndex: 17, candidateText: 'Next.', candidateFigures: [12],
    }));
    expect(later.decisions).toEqual([expect.objectContaining({ id: '15:0', outcome: 'dedupe' })]);
    const other = planCheckerFlags(input({ rows: [misquoteRow(5, [c('so roughly twelve points of margin', 'twelve points')]), row(7, [claim()])], turnRows: TURNS, candidateTurnIndex: 9, candidateText: 'Next.', candidateFigures: [5, 10] }));
    expect(other.selected).toMatchObject({ id: '7:0', action: 'probe' });
  });
});
