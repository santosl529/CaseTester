import { describe, it, expect } from 'vitest';
import {
  statesQuantitativeClaim, buildCheckerSystem, buildCheckerUser, evalExpression, vetCheckerClaims, isActionable,
  CheckerOutputSchema, type CheckerClaim, type VetContext,
} from '@/lib/orchestrator/math-checker';
import { MATH_CHECKER_CONFIGS } from '@/lib/models';
import { getCaseById } from '@/lib/cases/loader';

const prof = getCaseById('prof-001');
const COSTS = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'menu_price_change', 'bean_price_change', 'non_bean_input_change'];

const claim = (over: Partial<CheckerClaim>): CheckerClaim => ({
  span: '', quantity: '', candidateValue: '', assumptions: '', verdict: 'error', correctValue: null, correctLow: null, correctHigh: null,
  unit: 'percent', derivation: '', errorType: 'conceptual', changesConclusion: true, confidence: 'high', probe: '', correction: '', correctExpression: '',
  ...over,
});

describe('the gate', () => {
  it.each([
    ['a figure', 'COGS went from 42 to 58.'],
    ['a word quantity', 'A modest price rise gets most of the gap back.'],
    ['a multiple in words', 'The burden is roughly three to four times the gap.'],
    ['restore', 'Pricing alone should restore the margin.'],
  ])('passes %s', (_what, text) => expect(statesQuantitativeClaim(text)).toBe(true));

  it.each([
    'Do we have any data on competitor pricing?',
    "I'd structure this as revenue and costs.",
  ])('skips a message with no quantity: %s', text => expect(statesQuantitativeClaim(text)).toBe(false));
});

describe('the input — the full case, server-side', () => {
  const system = buildCheckerSystem(prof);
  it('carries every ledger value, exhibit, math step answer and the pricing model — generic over the case', () => {
    for (const d of prof.dataLedger) expect(system).toContain(d.value);
    expect(system).toContain('exhibit-a');
    for (const s of prof.mathSteps) expect(system).toContain(`${s.id}`);
    expect(system).toContain('43.3');
    expect(system).toMatch(/PRICING MODEL: cost lines cogs_pct, labor_pct, overhead_pct/);
    expect(system).toContain('SHARE BASES');
  });

  it('builds for every case on file (four new cases have no labels yet)', () => {
    for (const id of ['prof-002', 'entry-001', 'pricing-001', 'launch-001']) {
      const c = getCaseById(id);
      const s = buildCheckerSystem(c);
      expect(s).toContain(c.prompt);
      for (const d of c.dataLedger) expect(s).toContain(d.value);
    }
  });

  it('the message part names what is revealed, the transcript and the message', () => {
    const u = buildCheckerUser(prof, { revealedIds: ['cogs_pct'], shownExhibitIds: [], transcript: [{ role: 'interviewer', text: 'Go on.' }], message: 'COGS is up 16 points.' });
    expect(u).toMatch(/REVEALED TO THE CANDIDATE SO FAR: cogs_pct/);
    expect(u).toContain('INTERVIEWER: Go on.');
    expect(u).toContain('COGS is up 16 points.');
  });

  it('two arms, adaptive thinking at effort medium (the request sets thinking; the configs carry model and effort)', () => {
    expect(MATH_CHECKER_CONFIGS['sonnet55-medium']).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' });
    expect(MATH_CHECKER_CONFIGS['opus55-medium']).toEqual({ model: 'claude-opus-5-5', effort: 'medium' });
  });

  it('the output schema takes one entry per claim with the fields the flag needs', () => {
    const ok = CheckerOutputSchema.safeParse({ claims: [claim({ span: 'x' })] });
    expect(ok.success).toBe(true);
  });
});

describe('evalExpression (no eval)', () => {
  it.each([
    ['(110 - 94) / 110 * 100', 14.545],
    ['94 / 0.76', 123.68],
    ['25% × 42', 10.5],
    ['1 - 42 / 52', 0.1923],
    ['31.5 * 1.375 - 31.5', 11.8125],
  ])('%s', (expr, value) => expect(evalExpression(expr)!.value).toBeCloseTo(value, 2));

  it('records intermediate results as derivations', () => {
    expect(evalExpression('(58 + 22 + 14) / (100 - 24)')!.steps.map(x => Math.round(x * 10) / 10)).toEqual(expect.arrayContaining([94, 76, 1.2]));
  });

  it("a correction's expression must start from figures the candidate has, not derived ones stated as given", () => {
    // 94 and 76 aren't figures the candidate was given; 58 + 22 + 14 and 100 − 24 are.
    expect(evalExpression('94 / 76')!.numbers).toEqual([94, 76]);
  });

  it.each(['process.exit()', '2 +', 'abc', '', '(1 + 2'])('rejects %s', expr => expect(evalExpression(expr)).toBeNull());
});

describe('FR-4: what a flag may put in the interviewer\'s mouth', () => {
  const ctx = (over: Partial<VetContext> = {}): VetContext => ({
    caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: ['To get back to 24% margin I need roughly 10–12% on menu prices.'], ...over,
  });
  const fiona = claim({
    span: 'roughly 10–12% on menu prices to restore margin', candidateValue: '10–12%', correctValue: 23.7,
    probe: 'You said 10–12% restores the 24% margin. Walk me through how you sized that.',
    correction: "It's closer to 23.7%, not 10–12%: costs are 94 of today's 100, and they need to be 76% of revenue.",
    correctExpression: '((58 + 22 + 14) / (100 - 24) - 1) * 100',
  });

  it('keeps a probe and a correction that use only what the candidate has, and a correct derivation of it', () => {
    const [v] = vetCheckerClaims([fiona], ctx());
    expect(v.flag).toBe(true);
    expect(v.probeLine).toBe(fiona.probe);
    expect(v.correctionLine).toBe(fiona.correction);
  });

  it('a correction needing unrevealed data is dropped — the probe alone goes out', () => {
    const revenue = claim({ ...fiona, correction: "That's about $114M on $480M of revenue, not 10–12%.", correctExpression: '480 * 0.237' , correctValue: 113.8 });
    const [v] = vetCheckerClaims([revenue], ctx());
    expect(v.correctionLine).toBeNull();
    expect(v.probeLine).toBe(fiona.probe);
    expect(v.vetNotes.join(' ')).toMatch(/doesn't have/);
  });

  it("a correction whose expression doesn't give its figure is dropped", () => {
    const [v] = vetCheckerClaims([claim({ ...fiona, correctValue: 30 })], ctx());
    expect(v.correctionLine).toBeNull();
    const [w] = vetCheckerClaims([claim({ ...fiona, correctExpression: '94 / 76' })], ctx());
    expect(w.correctionLine).toBeNull();
  });

  it('a correction stating a figure the expression does not license is dropped', () => {
    const [v] = vetCheckerClaims([claim({ ...fiona, correction: "It's closer to 23.7%, not 10–12%, and revenue is $480M." })], ctx());
    expect(v.correctionLine).toBeNull();
  });

  it('a probe carrying an unrevealed figure is replaced by a neutral one in the candidate\'s words', () => {
    const [v] = vetCheckerClaims([claim({ ...fiona, probe: 'On $480M of revenue, how does 10–12% get you there?' })], ctx());
    expect(v.probeLine).toBe('Walk me through how you got to 10–12%.');
  });

  it('a probe stating a false case fact is replaced', () => {
    // Every figure in it is revealed (provenance passes); the pairing is false.
    const [v] = vetCheckerClaims([claim({ ...fiona, probe: 'Given overhead at 22% of revenue, how did you get 10–12%?' })], ctx());
    expect(v.probeLine).toBe('Walk me through how you got to 10–12%.');
  });

  it('correct, unverifiable and low-confidence claims raise no flag and carry no lines', () => {
    const vs = vetCheckerClaims([claim({ verdict: 'correct', probe: 'x' }), claim({ verdict: 'unverifiable' }), claim({ confidence: 'low' })], ctx());
    expect(vs.map(v => v.flag)).toEqual([false, false, false]);
    expect(vs.every(v => v.probeLine === null && v.correctionLine === null)).toBe(true);
    expect(isActionable(claim({ confidence: 'medium' }))).toBe(true);
  });
});
