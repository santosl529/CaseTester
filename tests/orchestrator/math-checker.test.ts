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
  codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, actualShare: null,
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
    codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 24 },
  });

  it('keeps a probe and a correction that use only what the candidate has, and a correct derivation of it', () => {
    const [v] = vetCheckerClaims([fiona], ctx());
    expect(v.flag).toBe(true);
    expect(v.probeLine).toBe(fiona.probe);
    expect(v.correctionLine).toBe(fiona.correction);
  });

  it('a correction needing unrevealed data is dropped — the probe alone goes out', () => {
    // Code agrees on 23.7%, but the expression runs through unrevealed revenue ($480M).
    const revenue = claim({ ...fiona, correction: "It's closer to 23.7%, not 10–12%: $480M of revenue has to carry $451M of cost at a 24% margin.", correctExpression: '(480 * 0.94 / (480 * 0.76) - 1) * 100' });
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

// Lorenzo, 13 Oct (after the partial Sonnet run): a correction is spoken only
// when code computes the same quantity itself and agrees; a flag whose own
// correct value is within tolerance of the candidate's figure is dropped; word
// quantities get a margin.
describe('a correction needs code to compute the same quantity and agree', () => {
  const ctx = (): VetContext => ({ caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: ['Restoring the full 16 points would need roughly a 16% lift.'] });
  const lift = claim({
    span: 'restoring the full 16 points would need roughly a 16% lift', candidateValue: '16%', correctValue: 38.1,
    probe: 'You said a 16% lift restores the full 16 points. Walk me through how you sized that.',
    correction: "It's closer to 38%, not 16%, because COGS dollars stay fixed, so price must rise until COGS is 42% of revenue.",
    correctExpression: '(58 / 42 - 1) * 100',
  });

  it('batch 20 1c9184cf t18: "closer to 38%" — code computes 20.5% for 16 points (or 23.7% for 24%), so only the probe goes out', () => {
    for (const codeQuantity of [
      { kind: 'needed_for_gain' as const, stepId: null, price: null, target: 16 },
      { kind: 'needed_for_margin' as const, stepId: null, price: null, target: 24 },
      { kind: 'none' as const, stepId: null, price: null, target: null },
    ]) {
      const [v] = vetCheckerClaims([claim({ ...lift, codeQuantity })], ctx());
      expect(v.flag).toBe(true);
      expect(v.correctionLine).toBeNull();
      expect(v.probeLine).toBe(lift.probe);
    }
  });

  it('a correction code agrees with is spoken — a pricing answer and a math step', () => {
    const [fiona] = vetCheckerClaims([claim({
      span: 'roughly 10–12% on menu prices to restore margin', candidateValue: '10–12%', correctValue: 23.7, probe: 'How did you size 10–12%?',
      correction: "It's closer to 23.7%, not 10–12%.", correctExpression: '((58 + 22 + 14) / (100 - 24) - 1) * 100',
      codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 24 },
    })], { ...ctx(), candidateTexts: ['roughly 10–12% on menu prices to restore margin'] });
    expect(fiona.correctionLine).toBe("It's closer to 23.7%, not 10–12%.");
    const [sofia] = vetCheckerClaims([claim({
      span: '40% of 25%, which is 10 percentage points of revenue', candidateValue: '10 percentage points', correctValue: 4.2, unit: 'points', probe: 'How did you get 10 points?',
      correction: "It's closer to 4.2 points of revenue, not 10.", correctExpression: '0.25 * 42 * 0.40',
      codeQuantity: { kind: 'step', stepId: 'bean_points_added', price: null, target: null },
    })], { ...ctx(), candidateTexts: ['40% of 25%, which is 10 percentage points of revenue'] });
    expect(sofia.correctionLine).toBe("It's closer to 4.2 points of revenue, not 10.");
  });

  it("a math step whose inputs aren't revealed computes nothing: probe only", () => {
    const [v] = vetCheckerClaims([claim({
      span: '10 percentage points', candidateValue: '10 percentage points', correctValue: 4.2, probe: 'How did you get 10 points?',
      correction: "It's closer to 4.2 points of revenue, not 10.", correctExpression: '0.25 * 42 * 0.40',
      codeQuantity: { kind: 'step', stepId: 'bean_points_added', price: null, target: null },
    // The candidate said 40% themselves (so the expression's figures pass); the bean price change isn't released, so code has no step answer.
    })], { ...ctx(), revealedIds: ['cogs_pct', 'bean_share_of_cogs'], candidateTexts: ['If beans rose 40%, that is 40% of 25%, which is 10 percentage points'] });
    expect(v.correctionLine).toBeNull();
  });
});

describe('code-side tolerance filter', () => {
  const ctx = (texts: string[]): VetContext => ({ caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: texts });
  it('batch 20 eb9f0abb t18: "$48M … roughly 9 points" against 8.5 is within tolerance — no flag', () => {
    const [v] = vetCheckerClaims([claim({ span: 'is ~$48M of near-pure margin, roughly 9 points', candidateValue: 'roughly 9 points', correctValue: 8.5, codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null } })], ctx(['roughly 9 points']));
    expect(v.flag).toBe(false);
  });
  it('a range holding the correct value is no flag; one that misses stays', () => {
    expect(vetCheckerClaims([claim({ candidateValue: '7–10 points', correctValue: 8.5 })], ctx(['7–10 points']))[0].flag).toBe(false);
    expect(vetCheckerClaims([claim({ candidateValue: '10–12%', correctValue: 23.7 })], ctx(['10–12%']))[0].flag).toBe(true);
  });
  it('a real error stays: 5 points against 8.5', () => {
    expect(vetCheckerClaims([claim({ candidateValue: 'about 5 points', correctValue: 8.5 })], ctx(['about 5 points']))[0].flag).toBe(true);
  });
  it('an error with no figure to check is no flag', () => {
    expect(vetCheckerClaims([claim({ candidateValue: 'a lot', correctValue: null })], ctx(['a lot']))[0].flag).toBe(false);
  });
  it('word quantities get a margin: "over half" at 47% passes; "the whole 18 points" at 89% and "most of the gap" at 30% stay', () => {
    expect(vetCheckerClaims([claim({ span: "That's over half the gap from one lever.", candidateValue: 'over half', actualShare: 0.47 })], ctx(['over half']))[0].flag).toBe(false);
    expect(vetCheckerClaims([claim({ span: 'the whole 18-point margin decline sits in COGS', candidateValue: '18 points', correctValue: 16, actualShare: 0.89 })], ctx(['18 points']))[0].flag).toBe(true);
    expect(vetCheckerClaims([claim({ span: 'a 5-7% increase recovers most of the gap', candidateValue: 'most of the gap', actualShare: 0.3 })], ctx(['most of the gap']))[0].flag).toBe(true);
  });
});

describe("code's pricing math in the checker's input", () => {
  it('for the price changes and targets the message names, once every cost line is out', () => {
    const msg = 'A 10% price increase takes margin from 6% to about 11%, and getting back to 24% margin needs a bigger move; restoring the full 16 points needs more.';
    const u = buildCheckerUser(prof, { revealedIds: COSTS, shownExhibitIds: [], transcript: [], message: msg });
    expect(u).toMatch(/CODE'S PRICING MATH/);
    expect(u).toMatch(/a 10% price rise: margin gain 8\.5 points → new margin 14\.5%; break-even volume loss 19\.2% .* or 33\.3%/);
    expect(u).toMatch(/price rise needed for a 24% margin: 23\.7%/);
    expect(u).toMatch(/price rise needed to recover 16 points \(a 22% margin\): 20\.5%/);
  });
  it('not before the cost lines are revealed', () => {
    const u = buildCheckerUser(prof, { revealedIds: ['cogs_pct'], shownExhibitIds: [], transcript: [], message: 'A 10% price increase recovers 8 points.' });
    expect(u).not.toMatch(/CODE'S PRICING MATH/);
  });
});
