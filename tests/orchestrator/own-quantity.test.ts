// "Not X" only on code's own quantity (Lorenzo, 17 Oct; session 9ccf0836 T24,
// batch 30 Noor t16): how the candidate framed a flagged figure decides the
// line code says. No model calls.
import { describe, it, expect } from 'vitest';
import { getCaseById } from '@/lib/cases/loader';
import { codeCorrection, type CheckerClaim, type VetContext } from '@/lib/orchestrator/math-checker';
import { frameOfClaim, framedCorrection, claimWindow } from '@/lib/orchestrator/own-quantity';
import { buildFactBase, findFalseFacts } from '@/lib/orchestrator/fact-check';
import { checkerClaim } from './helpers/checker-claim';

const prof = getCaseById('prof-001');
const COSTS = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'menu_price_change', 'bean_price_change', 'non_bean_input_change'];
const ctx: VetContext = { caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: [] };

// A flagged claim with code's correction, as the vetting writes it.
function flagged(candidateValue: string, span: string, codeQuantity: CheckerClaim['codeQuantity'], value: number) {
  const c = checkerClaim(candidateValue, { span, codeQuantity, correctValue: value, errorType: 'conceptual' });
  const written = codeCorrection(c, { value, index: 0 }, ctx)!;
  return { ...c, correctionLine: written.line, correctionFigure: written.figure };
}
const beans = (candidateValue: string, span: string) => flagged(candidateValue, span, { kind: 'step', stepId: 'bean_points_added', price: null, target: null }, 4.2);
const lineFor = (c: ReturnType<typeof beans>, window: string) => framedCorrection(c, frameOfClaim(c, window, ctx), ctx);

describe('9ccf0836 T24: his figure right on a COGS base — the conversion line, no "not"', () => {
  const t21 = "I'm saying it's ten points of the thirty seven point five percent. increasing COGS.";
  const t23 = 'Well, I was just looking at cogs. and to get the specific amount of points that each contributing factor was raising COGS, you just have to look at how much each factor is raising and then multiply it by its share of COGS.';
  const c = beans('10 points of a 37.5% COGS increase', t21);
  it('today\'s line says "not 10"', () => expect(c.correctionLine).toBe("Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points, not 10."));
  it('read on the claim and his next message: right on his own quantity (25% × 40% = 10 points of COGS)', () => {
    expect(frameOfClaim(c, claimWindow(c.span, t21, [t23]), ctx)).toMatchObject({ kind: 'own_right', quantity: 'points of COGS' });
    expect(lineFor(c, claimWindow(c.span, t21, [t23]))).toEqual({ line: "In revenue terms, that's about 4.2 points.", derived: ['4.2'], converted: true });
  });
  it('"ten percent of the increase" (T17) reads as COGS growth too', () => {
    const c17 = beans('10% of the increase', 'the ten percent of the increase is from is from the coffee beans');
    expect(frameOfClaim(c17, 'So the ten percent of the increase is from is from the coffee beans.', ctx).kind).toBe('own_right');
  });
  it('"I was saying in points of COGS, not in points of revenue" names his units', () => {
    const c10 = beans('10', 'beans are ten');
    expect(frameOfClaim(c10, 'Beans are ten. I was saying in points of COGS, not in points of revenue.', ctx).kind).toBe('own_right');
  });
});

describe('batch 30 Noor t9: the rise that takes COGS back to 42% — the conversion line', () => {
  const t9 = 'If they want to recover the 16 points, a rough cut: raise prices so that the new COGS of 58 falls back toward 42 as a share. Revenue would need to go up by 58/42, about 38% — which makes sense, it\'s just the input inflation.';
  const c = flagged('38%', 'Revenue would need to go up by 58/42, about 38% ... to recover the 16 points', { kind: 'needed_for_gain', stepId: null, price: null, target: 16 }, 20.5);
  it('today\'s line says "not 38%"', () => expect(c.correctionLine).toBe("From today's 6% margin, recovering 16 points of margin takes about a 20.5% price rise, not 38%."));
  it('right on her own quantity (58/42 − 1 = 38.1%): code\'s figure, stated without "not"', () => {
    expect(frameOfClaim(c, claimWindow(c.span, t9, []), ctx)).toMatchObject({ kind: 'own_right', quantity: 'COGS back to 42% of revenue' });
    expect(lineFor(c, claimWindow(c.span, t9, [])))
      .toEqual({ line: "From today's 6% margin, recovering 16 points of margin takes about a 20.5% price rise.", derived: ['20.5'], converted: true });
  });
  it('wrong on her own quantity: corrected on it', () => {
    const w = flagged('45%', 'we need about a 45% price rise', { kind: 'needed_for_gain', stepId: null, price: null, target: 16 }, 20.5);
    const window = 'To get COGS back to 42% we need about a 45% price rise.';
    expect(frameOfClaim(w, window, ctx).kind).toBe('own_wrong');
    expect(lineFor(w, window)?.line).toBe('Getting COGS back to 42% of revenue takes about a 38.1% price rise, not 45%.');
  });
});

describe('code\'s quantity or unit, said: today\'s correction', () => {
  it.each([
    ['6 points of revenue', 'Beans add about 6 points of revenue.'],
    ['6 points', 'Beans add about 6 points.'],
    ['6 revenue points', 'Beans add 6 revenue points.'],
  ])('%s', (value, text) => {
    const c = beans(value, text);
    expect(frameOfClaim(c, text, ctx).kind).toBe('code');
    expect(lineFor(c, text)).toEqual({ line: c.correctionLine, derived: ['4.2'], converted: false });
  });
  it('a margin gain in points', () => {
    const c = flagged('about 5 points', 'A 10% price increase recovers about 5 points of margin', { kind: 'gain', stepId: null, price: 10, target: null }, 8.5);
    expect(frameOfClaim(c, 'A 10% price increase recovers about 5 points of margin.', ctx).kind).toBe('code');
  });
  it('"not in points of revenue" is no use of code\'s unit', () => {
    const c = beans('6', 'beans are 6');
    expect(frameOfClaim(c, 'Beans are 6, not 6 points of revenue.', ctx).kind).not.toBe('code');
  });
});

describe('wrong on their own stated base: the correction, on their quantity', () => {
  it('"15 points of COGS"', () => {
    const c = beans('15 points of COGS', 'beans add 15 points of COGS');
    expect(frameOfClaim(c, 'Beans add 15 points of COGS.', ctx)).toMatchObject({ kind: 'own_wrong', quantity: 'points of COGS' });
    expect(lineFor(c, 'Beans add 15 points of COGS.')).toEqual({
      line: "In COGS terms, bean inflation's contribution to the COGS increase is about 10 points, not 15.", derived: ['10'], converted: false,
    });
  });
});

describe('no quantity stated: code\'s figure, without "not"', () => {
  it('a bare figure', () => {
    const c = beans('about 6', 'beans add about 6');
    expect(frameOfClaim(c, 'Beans add about 6.', ctx).kind).toBe('unstated');
    expect(lineFor(c, 'Beans add about 6.')).toEqual({ line: "Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points.", derived: ['4.2'], converted: true });
  });
});

describe('the lines are true statements of the case', () => {
  const fb = buildFactBase(prof as never);
  it.each([
    "In revenue terms, that's about 4.2 points.",
    "From today's 6% margin, recovering 16 points of margin takes about a 20.5% price rise.",
    "In COGS terms, bean inflation's contribution to the COGS increase is about 10 points, not 15.",
    'Getting COGS back to 42% of revenue takes about a 38.1% price rise, not 45%.',
  ])('%s', line => expect(findFalseFacts(line, fb, new Set(COSTS))).toEqual([]));
});
