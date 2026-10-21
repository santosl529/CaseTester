// Units and scale in code-written correction lines and quotes (Lorenzo, 20 Oct, Task 40 / E3:
// "Unit/scale slips in code lines: false, not serious. \"$210\" for $210k counts too."). Test
// sentences are the batch 34/35 transcripts' own words. No model calls.
import { describe, it, expect } from 'vitest';
import { getCaseById } from '@/lib/cases/loader';
import { codeCorrection, vetCheckerClaims, type CheckerClaim, type VetContext } from '@/lib/orchestrator/math-checker';
import { checkerKey, lateProbe, claimFigures } from '@/lib/orchestrator/math-checker-live';
import { figureAsWritten } from '@/lib/orchestrator/recompute';
import { findStepSpans } from '@/lib/scoring/math-spans';
import { checkerClaim } from './helpers/checker-claim';
import { framedCorrection } from '@/lib/orchestrator/own-quantity';

const step = (stepId: string): CheckerClaim['codeQuantity'] => ({ kind: 'step', stepId, price: null, target: null });
const noVet = (caseId: string, candidateTexts: string[] = []): VetContext => ({ caseData: getCaseById(caseId), revealedIds: [], shownExhibitIds: [], candidateTexts });

describe('Hollis Bay Tyler 9:1: the million scale carries to both sides', () => {
  // "The $8.8 million is three line items." — the claim's value as the checker stored it: "8.8".
  const c = checkerClaim('8.8', { span: '$3.0 plus $4.3 plus $1.5 is $8.8 million', codeQuantity: step('launch_costs_total'), correctValue: 9 });
  it('says $9 million, not $8.8 million', () => {
    const w = codeCorrection(c, { value: 9, index: 0 }, noVet('launch-001'))!;
    expect(w.line).toMatch(/is about \$9 million, not \$8\.8 million\.$/);
    expect(w.figure).toBe('9');
  });
  it('a figure they said with its unit is kept as they said it', () => {
    const w = codeCorrection(checkerClaim('$8.8 million', { codeQuantity: step('launch_costs_total') }), { value: 9, index: 0 }, noVet('launch-001'))!;
    expect(w.line).toMatch(/is about \$9 million, not \$8\.8 million\.$/);
  });
});

describe('million scale: a "$" with no scale word still gets "million" on both sides (reviewer, fix round 2)', () => {
  const say = (v: string) => codeCorrection(checkerClaim(v, { codeQuantity: step('launch_costs_total') }), { value: 9, index: 0 }, noVet('launch-001'))!.line;
  it('"$8.8" at a million-scale step', () => expect(say('$8.8')).toMatch(/is about \$9 million, not \$8\.8 million\.$/));
  it('"$8,800,000" (STT) is already in units: both sides in units', () => expect(say('$8,800,000')).toMatch(/is about \$9,000,000, not \$8,800,000\.$/));
  it('"$8.8 mil" keeps its form, no "mil million"', () => expect(say('$8.8 mil')).toMatch(/is about \$9 mil, not \$8\.8 mil\.$/));
  it('"8.8mm" keeps its form, no "mm million"', () => expect(say('8.8mm')).toMatch(/is about \$?9mm, not 8\.8mm\.$/));
  it.each([['$8.8M', '$8.8M'], ['$8.8 million', '$8.8 million']])('"%s" keeps its own form', (v, form) => expect(say(v)).toMatch(new RegExp(`is about .*, not ${form.replace('$', '\\$').replace('.', '\\.')}\\.$`)));
});

describe('final review I1: a bare range at a money step is never "$NaN"; a bare unit figure gets separators', () => {
  const say = (v: string) => codeCorrection(checkerClaim(v, { codeQuantity: step('launch_costs_total') }), { value: 9, index: 0 }, noVet('launch-001'))!.line;
  it('"8 to 9" keeps its range, each end as money with the scale after', () => expect(say('8 to 9')).toMatch(/is about \$9 million, not \$8 to \$9 million\.$/));
  it('"8.5-9" keeps its range', () => expect(say('8.5-9')).toMatch(/is about \$9 million, not \$8\.5-\$9 million\.$/));
  it('no line says NaN', () => { for (const v of ['8 to 9', '8.5-9', '8.5 – 9', '8,800,000 to 9,000,000']) expect(say(v)).not.toMatch(/NaN/); });
  it('"8800000" (no separators) reads "$8,800,000", like the closer', () => expect(say('8800000')).toMatch(/is about \$9,000,000, not \$8,800,000\.$/));
  it('a bare range at unit scale gets "$" on each end', () => {
    const w = codeCorrection(checkerClaim('11000 to 12000', { codeQuantity: step('lakeport_contribution_fy2023') }), { value: 4200, index: 0 }, noVet('prof-002'))!;
    expect(w.line).toMatch(/is about \$4,200, not \$11,000 to \$12,000\.$/);
  });
});

describe('Quillpath Marcus 13:3: a ratio is said in times', () => {
  const said = 'Starter standalone: 40% cancelled in 12 months, call it 4% a month, a ~25-month life. 25 × $30 = $750 on $300 CAC = 2.5x. Fails — that\'s the CFO\'s number.';
  const base = checkerClaim('$750; 2.5x', {
    span: '25 × $30 = $750 on $300 CAC = 2.5x', codeQuantity: step('starter_ratio'), correctValue: 2, verdict: 'error', quantity: 'Starter standalone LTV/CAC',
  });
  it('the line is "about 2 times", no $', () => {
    const w = codeCorrection(base, { value: 2, index: 0 }, noVet('pricing-001'))!;
    expect(w.line).toBe('Starter standalone LTV/CAC is about 2 times, not 2.5 times.');
    expect(w.theirs).toBe('2.5 times');
    expect(w.line).not.toContain('$');
  });
  it('the vetted flag keys on the ratio, starter_ratio@2.5, not @750', () => {
    const ctx = { ...noVet('pricing-001', [said]), revealedIds: ['plan_prices_costs', 'starter_cohort', 'plan_cac'] };
    const [v] = vetCheckerClaims([base], ctx);
    expect(v.flag).toBe(true);
    expect(v.correctionLine).toMatch(/is about 2 times/);
    expect(checkerKey(v)).toBe('starter_ratio@2.5');
    expect(claimFigures(v)).toEqual([2.5]);
  });
  it('without the ratio stamp the first number would win (what the key did before)', () => {
    expect(checkerKey(base)).toBe('starter_ratio@750');
  });
  it('a ratio step finds "2.5x" and "2 times" in the words, and not a price', () => {
    const s = { id: 'starter_ratio', description: '', cues: ['ltv/cac', 'ratio'], unit: 'ratio' as const };
    expect(findStepSpans('The Starter LTV/CAC ratio is 2.5x.', s).map(m => m.value)).toEqual([2.5]);
    expect(findStepSpans('The Starter ratio is 2 times.', s).map(m => m.value)).toEqual([2]);
    expect(findStepSpans('The Starter ratio is $750.', s)).toEqual([]);
  });
});

describe('quotes keep their suffix', () => {
  it('Quillpath Tyler 25:7: "$210k" is quoted "$210k", not "$210"', () => {
    const message = 'Third, the price test resolves the tension: at $60 we recover 50 Pro signups a month and still take 830 Starter, worth roughly $210k a month more than today.';
    const r = lateProbe('How did you do that calculation?', { span: 'worth roughly $210k a month more than today', candidateValue: '$210k' }, message, { claim: 0, spoken: 3 });
    expect(r.line).toBe('You said “$210k” — how did you do that calculation?');
  });
  it.each([
    ['The launch will need $4.5M up front.', 4.5, '$4.5M'],
    ['The launch will need $4.5 million up front.', 4.5, '$4.5 million'],
    ['Lifetime value comes to $1.2bn.', 1.2, '$1.2bn'],
    ['Lifetime value comes to $210K a month.', 210, '$210K'],
    ['Worth roughly $210 thousand a month.', 210, '$210 thousand'],
  ])('%s', (message, n, written) => {
    const r = lateProbe('Walk me through that.', { span: message.replace(/\.$/, ''), candidateValue: written }, message, { claim: 0, spoken: 3 });
    expect(r.line.startsWith(`You said “${written}” —`)).toBe(true);
    expect(figureAsWritten(message, n)).toBe(written);
  });
});

// Round 6 Task 71 (audit M3; b37 Hollis Bay Tyler 442e37ff t5 → t6, verbatim): code's replacement
// question read "How did you get to $9?" — his "$9.0M" with the scale dropped.
describe('Task 71 M3: a figure written with ".0" before its scale keeps the scale', () => {
  const TYLER_B37H_T5 = "Let me set it up. Variable cost per bag: ingredients you said $0.75, packaging $0.30, roasting labor and energy $0.30, freight $0.20. That's 0.75 + 0.30 + 0.50 — sorry, 0.30 plus 0.20 is 0.50 — so 1.55 per bag total variable.\n\nPrice we receive is $3.00, so contribution margin is 3.00 − 1.55 = $1.45 a bag. That's just under half the revenue, which is healthy.\n\nFixed launch costs: roasting line $3.0M, marketing $4.5M, shelf fees $1.5M = $9.0M. Recipe development I'd exclude — $1.2M already spent, sunk, shouldn't drive a go/no-go.\n\nBreak-even volume = 9.0 / 1.45 ≈ 6.2 million bags.\n\nIn revenue that's about 6.2 × $3.00 ≈ $18.6M to Hollis Bay, so roughly 6% of current sales.\n\nDo we have a sense of how many bags of chips Hollis Bay moves a year? That'd tell me whether 6.2 million is a stretch for our distribution.";
  it('"$9.0M" with figure 9 is "$9.0M"', () => {
    expect(figureAsWritten(TYLER_B37H_T5, 9)).toBe('$9.0M');
    expect(figureAsWritten('The total is $3.00 million.', 3)).toBe('$3.00 million');
    // Without a scale the figure reads as before.
    expect(figureAsWritten('Break-even volume = 9.0 / 1.45', 9)).toBe('9');
  });
});

describe('prof-001 correction lines are byte-identical (points, percent, price rise)', () => {
  const ctx = noVet('prof-001');
  const line = (candidateValue: string, codeQuantity: CheckerClaim['codeQuantity'], value: number) =>
    codeCorrection(checkerClaim(candidateValue, { codeQuantity }), { value, index: 0 }, ctx)?.line;
  it('points: a 10% price rise lifts margin', () => expect(line('5 points', { kind: 'gain', stepId: null, price: 10, target: null }, 8.5)).toBe('A 10% price rise lifts margin about 8.5 points, not 5.'));
  it('percent: an 18% price rise takes margin to', () => expect(line('12%', { kind: 'new_margin', stepId: null, price: 18, target: null }, 20)).toBe('An 18% price rise takes margin to about 20%, not 12%.'));
  it('price rise: recovering 16 points', () => expect(line('38%', { kind: 'needed_for_gain', stepId: null, price: null, target: 16 }, 20.5)).toBe('Recovering 16 points of margin takes about a 20.5% price rise, not 38%.'));
});

describe('a bare not-X takes the unit for money and ratio, never for percent or points (controller ruling, 20 Oct)', () => {
  const prof = noVet('prof-001');
  it('a bare percent stays bare', () => {
    const w = codeCorrection(checkerClaim('11', { codeQuantity: { kind: 'new_margin', stepId: null, price: 18, target: null } }), { value: 20, index: 0 }, prof)!;
    expect(w.line).toBe('An 18% price rise takes margin to about 20%, not 11.');
  });
  it('a bare points figure stays bare', () => {
    const w = codeCorrection(checkerClaim('5', { codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null } }), { value: 8.5, index: 0 }, prof)!;
    expect(w.line).toBe('A 10% price rise lifts margin about 8.5 points, not 5.');
  });
  it('a bare money figure at unit scale gets "$" and separators', () => {
    const w = codeCorrection(checkerClaim('11429', { codeQuantity: step('lakeport_contribution_fy2023') }), { value: 4200, index: 0 }, noVet('prof-002'))!;
    expect(w.line).toMatch(/is about \$4,200, not \$11,429\.$/);
  });
});

describe('Quillpath Marcus 13:3 through framedCorrection', () => {
  const ctx = noVet('pricing-001', ['25 × $30 = $750 on $300 CAC = 2.5x.']);
  const c = checkerClaim('$750; 2.5x', { span: '25 × $30 = $750 on $300 CAC = 2.5x', codeQuantity: step('starter_ratio'), correctValue: 2 });
  const w = codeCorrection(c, { value: 2, index: 0 }, ctx)!;
  const flagged = { ...c, correctionLine: w.line, correctionFigure: w.figure };
  it('code\'s quantity stated: the line, "not 2.5 times" kept', () => {
    const r = framedCorrection(flagged, { kind: 'code', basis: 'test' } as never, ctx)!;
    expect(r.line).toBe('Starter standalone LTV/CAC is about 2 times, not 2.5 times.');
  });
  it('right on another reading or unstated: "not X" stripped by own-quantity\'s regex, leaving "about 2 times."', () => {
    const r = framedCorrection(flagged, { kind: 'unstated', rightOn: null } as never, ctx)!;
    expect(r.line).toBe('Starter standalone LTV/CAC is about 2 times.');
  });
});
