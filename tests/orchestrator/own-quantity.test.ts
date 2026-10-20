// "Not X" only on code's own quantity (Lorenzo, 17 Oct; session 9ccf0836 T24,
// batch 30 Noor t16): how the candidate framed a flagged figure decides the
// line code says. No model calls.
import { describe, it, expect } from 'vitest';
import { getCaseById } from '@/lib/cases/loader';
import { codeCorrection, type CheckerClaim, type VetContext } from '@/lib/orchestrator/math-checker';
import { frameOfClaim, framedCorrection, claimWindow, readingsOf } from '@/lib/orchestrator/own-quantity';
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
    expect(lineFor(c, claimWindow(c.span, t21, [t23]))).toMatchObject({ line: "In revenue terms, that's about 4.2 points.", derived: ['4.2'], converted: true });
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
      .toMatchObject({ line: "From today's 6% margin, recovering 16 points of margin takes about a 20.5% price rise.", derived: ['20.5'], converted: true });
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
    ['6 revenue points', 'Beans add 6 revenue points.'],
  ])('%s', (value, text) => {
    const c = beans(value, text);
    expect(frameOfClaim(c, text, ctx)).toMatchObject({ kind: 'code', basis: 'revenue or margin units attached' });
    expect(lineFor(c, text)).toMatchObject({ line: c.correctionLine, derived: ['4.2'], converted: false });
  });
  it('a margin gain in points, named or bare (no other points reading)', () => {
    const c = flagged('about 5 points', 'A 10% price increase recovers about 5 points of margin', { kind: 'gain', stepId: null, price: 10, target: null }, 8.5);
    expect(frameOfClaim(c, 'A 10% price increase recovers about 5 points of margin.', ctx).kind).toBe('code');
    const bare = flagged('about 5 points', 'A 10% price increase recovers about 5 points', { kind: 'gain', stepId: null, price: 10, target: null }, 8.5);
    expect(frameOfClaim(bare, 'A 10% price increase recovers about 5 points.', ctx)).toMatchObject({ kind: 'code', basis: 'bare points (a margin gain)' });
  });
  // Lorenzo, 17 Oct (ruling c): on a share-base step a bare "points" is ambiguous — the 9ccf0836 shape.
  it('a bare "points" on the bean step is no unit of code\'s', () => {
    const c = beans('6 points', 'beans add about 6 points');
    expect(frameOfClaim(c, 'Beans add about 6 points.', ctx)).toEqual({ kind: 'unstated', rightOn: null });
    expect(lineFor(c, 'Beans add about 6 points.')).toMatchObject({ line: "Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points.", converted: false });
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
    expect(lineFor(c, 'Beans add 15 points of COGS.')).toMatchObject({
      line: "In COGS terms, bean inflation's contribution to the COGS increase is about 10 points, not 15.", derived: ['10'], converted: false,
    });
  });
});

// Lorenzo, 17 Oct (ruling b): the step closes only when the figure is right on a reading code computes.
describe('no quantity stated: code\'s figure, without "not"', () => {
  it('wrong on every reading: no "not X", the step stays open', () => {
    const c = beans('about 6', 'beans add about 6');
    expect(frameOfClaim(c, 'Beans add about 6.', ctx)).toEqual({ kind: 'unstated', rightOn: null });
    expect(lineFor(c, 'Beans add about 6.')).toMatchObject({ line: "Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points.", derived: ['4.2'], converted: false });
  });
  it('right on a share-base reading (10 = 25% × 40% of COGS): the conversion line, the step closes', () => {
    const c = beans('about 10', 'beans add about 10');
    expect(frameOfClaim(c, 'Beans add about 10.', ctx)).toMatchObject({ kind: 'unstated', rightOn: { quantity: 'points of COGS' } });
    expect(lineFor(c, 'Beans add about 10.')).toMatchObject({ line: "In revenue terms, that's about 4.2 points.", converted: true });
  });
  it('a price rise right on a cost line back to its prior level (58/42 − 1), unstated: converted', () => {
    const c = flagged('38%', 'prices need to go up about 38%', { kind: 'needed_for_gain', stepId: null, price: null, target: 16 }, 20.5);
    expect(frameOfClaim(c, 'Prices need to go up about 38%.', ctx)).toMatchObject({ kind: 'unstated', rightOn: { quantity: 'COGS back to 42% of revenue' } });
  });
});

describe('the readings code computes for a claim', () => {
  it('the bean step: revenue points, points of COGS, a share of the COGS increase', () => {
    const r = readingsOf(beans('6', 'x'), ctx).map(x => [x.quantity, Math.round(x.value * 10) / 10]);
    expect(r).toEqual([["code's quantity", 4.2], ['points of COGS', 10], ['a share of the COGS increase', 26.3]]);
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

// Lorenzo, 19 Oct (round 4, ruling 1; batch 33 Marisol 31e33506 t14): "points
// of the N-point COGS increase" is revenue points; "points of revenue" with
// their figure wins over a COGS reading; the "In COGS terms … not X" line only
// when every mention of their figure with a unit names the COGS base —
// otherwise the checker's own revenue-terms line.
describe('batch 33 Marisol 31e33506: her 5.8 was revenue points — the revenue-terms line, no "In COGS terms"', () => {
  const t9 = "You're right to push — that was a stretch. Overhead is rent, corporate, admin; packaging sits in COGS. There's no reason one line's drift tells me anything about a component of another. I was pattern-matching on the number 2 because it was convenient. Scratch it.\n\nLet me use the actual figures. Beans are 25% of COGS, and COGS is currently 58 points of revenue, so beans are 0.25 × 58 = 14.5 points. The other inputs are the remaining 43.5 points. Now apply the growth: beans up 40%, so 14.5 × 0.40 = 5.8 points of increase. Everything else up 37.5%, but that's spread across dairy, packaging, and food — three separate inputs, so call it roughly 2 points each.\n\nSo beans at 5.8 points is the single largest contributor by a wide margin, more than double any other line, and it has the steepest growth rate at 40%. Coffee beans are driving the COGS increase. That's the one to attack.";
  const t11 = "Two things, in order.\n\nFirst, I'd size what fixing beans buys us. Beans are 5.8 points of the 16-point COGS increase. If we could hold bean costs at the old level, margin goes from 6% to roughly 11.8% — so call it 12%. That's meaningful but it doesn't get us back to 24, which tells me beans are the driver but not the whole fix, and I'd want to be honest with the CEO about that gap.\n\nSecond, procurement. I'd look at how they buy green coffee — spot versus forward contracts, how many suppliers, contract length. A 40% run-up over two years with flat menu prices suggests they're exposed to spot and never hedged.\n\nThen the pricing side, since prices have been flat for two years. I'd want elasticity — how much can a specialty chain pass through before volume moves?\n\nDo we have transaction volume by store over the period? Want to be sure same-store traffic is steady before I recommend a price increase.";
  const t13 = "Sure. Beans were 25% of COGS. I took the current COGS line, 58 points of revenue, and multiplied: 0.25 × 58 = 14.5 points of revenue sitting in beans today. Then beans rose 40% over the two years, so the increase is 14.5 × 0.40 = 5.8 points of revenue.\n\nAnd the transaction figure actually reinforces the pricing story. Average ticket is $6.80 now versus $6.20 two years ago — so a cup of coffee effectively goes for $6.80. If beans run at 14.5% of revenue, that's about $0.99 of bean cost in that $6.80 cup, up from roughly $0.71 before the run-up. So customers are absorbing nothing, because menu prices held flat — the whole $0.28 landed on us.\n\nA 5% price increase on $6.80 is about $0.34, which more than covers the bean inflation per cup. That's a clean, small ask of the customer.";
  const REVENUE_LINE = "Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points, not 5.8.";
  const c11 = beans('5.8 points', 'Beans are 5.8 points of the 16-point COGS increase.');
  it('the checker\'s line is in revenue terms', () => expect(c11.correctionLine).toBe(REVENUE_LINE));
  it('t11 alone: "5.8 points of the 16-point COGS increase" is revenue points — code\'s unit, the checker\'s line', () => {
    const w = claimWindow(c11.span, t11, []);
    expect(frameOfClaim(c11, w, ctx).kind).toBe('code');
    expect(lineFor(c11, w)).toMatchObject({ line: REVENUE_LINE, derived: ['4.2'], converted: false });
  });
  it('the live window (t11, then t13 "5.8 points of revenue"): the checker\'s line, never "In COGS terms"', () => {
    const w = claimWindow(c11.span, t11, [t13]);
    expect(frameOfClaim(c11, w, ctx).kind).toBe('code');
    expect(lineFor(c11, w)?.line).toBe(REVENUE_LINE);
  });
  // The guard: one mention names COGS, another ("5.8 points of increase", her t9) doesn't.
  // Neither base established (controller ruling, Task 27 review): code's figure, no "not X".
  it('t9 then "5.8 points of COGS": not every mention names the COGS base — code\'s figure, no "not 5.8"', () => {
    const c9 = beans('5.8 points', 'beans up 40%, so 14.5 × 0.40 = 5.8 points of increase');
    const w = claimWindow(c9.span, t9, ['To be clear about my units, beans are 5.8 points of COGS.']);
    expect(frameOfClaim(c9, w, ctx)).toEqual({ kind: 'unstated', rightOn: null });
    expect(lineFor(c9, w)).toMatchObject({ line: "Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points.", converted: false });
  });
  it('"points of revenue" with their figure wins over a COGS reading it is right on', () => {
    const c = beans('10 points', 'beans are 10 points of COGS');
    const w = 'Beans are 10 points of COGS, so 10 points of revenue.';
    expect(frameOfClaim(c, w, ctx).kind).toBe('code');
    expect(lineFor(c, w)?.line).toBe("Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points, not 10.");
  });
  // Controller ruling (19 Oct, Task 27 review): Lorenzo's words only — the N-point form with N the COGS change (16).
  it('"5.8 points of the COGS increase" (no N) names no base: code\'s figure, no "not 5.8"', () => {
    const c = beans('5.8 points', 'beans are 5.8 points of the COGS increase');
    expect(lineFor(c, 'Beans are 5.8 points of the COGS increase.')).toMatchObject({ line: "Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points.", converted: false });
  });
  it.each([
    'Beans are 10 points of the COGS increase.',
    'Beans are 10 points of COGS growth.',
    'Beans are 10 points of the COGS rise.',
    'Beans are 10 points of the 37.5-point COGS increase.',
  ])('%s — right on the COGS-growth reading: the conversion, no "not 10"', w => {
    const c = beans('10 points', w.replace(/\.$/, '').toLowerCase());
    expect(frameOfClaim(c, w, ctx)).toMatchObject({ kind: 'own_right', quantity: 'points of COGS' });
    expect(lineFor(c, w)).toMatchObject({ line: "In revenue terms, that's about 4.2 points.", converted: true });
  });
  it('"26% of the COGS increase" names no COGS base: right as a share of the increase — the conversion line', () => {
    const c = beans('26%', 'beans are about 26% of the COGS increase');
    const w = 'Beans are about 26% of the COGS increase.';
    expect(frameOfClaim(c, w, ctx)).toMatchObject({ kind: 'unstated', rightOn: { quantity: 'a share of the COGS increase' } });
    expect(lineFor(c, w)).toMatchObject({ line: "In revenue terms, that's about 4.2 points.", converted: true });
  });
  // The guard: a mention names the base only as the object of its own "of / in" phrase,
  // with no change word before it and no change after it. Otherwise code's figure, no "not X".
  const NO_NOT = "Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points.";
  it.each([
    ['5.8', 'Beans are 5.8 points of increase, which is most of the COGS jump.'],
    ['5.8', 'Beans are 5.8 points of increase. COGS went from 42 to 58.'],
    ['5.8', 'Beans are 5.8 points of increase. I meant 5.8 points of COGS.'],
    ['5.8', 'Beans are 5.8 points of increase — most of the COGS jump.'],
    ['5.8', 'Beans are 5.8 points of increase—most of the COGS jump.'],
    ['5.8', 'Beans are 5.8 points of increase, so most of the COGS jump.'],
    ['5.8', 'Beans are 5.8 points of increase, but most of the COGS jump.'],
    ['5.8', 'Beans are 5.8 points of increase: most of the COGS jump.'],
    ['5.8', 'Beans are 5.8 points of increase (most of the COGS jump).'],
    ['5.8', 'Beans are 5.8 points of increase and most of the COGS jump.'],
    ['5.8', 'Beans are 5.8 points of increase, that is most of the COGS jump.'],
    ['5.8', 'Beans are 5.8 points of increase, mostly COGS.'],
    ['5.8', 'Beans are 5.8 points of the increase in COGS.'],
    ['5.8', 'Beans are 5.8 points of the rise in COGS.'],
    ['5.8', 'Beans are 5.8 points of increase in COGS.'],
    ['5.8', 'Beans are 5.8 points of COGS inflation.'],
    ['15', 'Beans are 15 points of — sorry — COGS.'],
    ['15', 'Beans are 15 points of the total: COGS, I mean.'],
  ])('%s: "%s" — no COGS base established: code\'s figure, no "not X"', (x, w) => {
    const c = beans(`${x} points`, w.replace(/\.$/, '').toLowerCase());
    expect(lineFor(c, w)).toMatchObject({ line: NO_NOT, converted: false });
  });
  // The 9ccf0836 STT shape with a wrong figure: never the revenue line's "not 12".
  it.each([
    "I'm saying it's twelve points of the thirty seven point five percent. increasing COGS.",
    "I'm saying it's 12 points of the 37.5 percent. increasing COGS.",
  ])('%s — no revenue "not 12"', w => {
    const c = beans('12 points', w);
    expect(lineFor(c, w)).toMatchObject({ line: NO_NOT, converted: false });
  });
  // The allowlist (controller ruling, Task 27 review, 20 Oct): only the base's level after it, only
  // the / old / current / today's / total / prior / our / its / two years ago's before it.
  it.each([
    'Beans are 5.8 points of the COGS delta.',
    'Beans are 5.8 points of the COGS move.',
    'Beans are 5.8 points of the COGS hike.',
    'Beans are 5.8 points of the COGS spike.',
    'Beans are 5.8 points of the COGS bump.',
    'Beans are 5.8 points of the COGS gap.',
    'Beans are 5.8 points of the COGS run-up.',
    'Beans are 5.8 points of COGS going up.',
    'Beans are 5.8 points of the extra COGS.',
    'Beans are 5.8 points of the additional COGS.',
    'Beans are 5.8 points of the incremental COGS.',
    'Beans are 5.8 points of the higher COGS.',
    'Beans are 5.8 points of the uh COGS.',
    'Beans are 5.8 points of the COGS line increase.',
    'Beans are 5.8 points in COGS.',
    'Beans are 5.8 points of COGS, which went up 16 points.',
  ])('"%s" — not on the allowlist: code\'s figure, no "not 5.8"', w => {
    const c = beans('5.8 points', w.replace(/\.$/, '').toLowerCase());
    expect(lineFor(c, w)).toMatchObject({ line: NO_NOT, converted: false });
  });
  it.each([
    ['5.8 points', 'Beans are 5.8 points of the 16 points of COGS.'],
    ['5.8', 'Beans are 5.8 of the 16 points COGS went up.'],
    ['5.8 points', 'Beans are 5.8 points of the 58 points of COGS.'],
    ['5.8 points', 'Beans are 5.8 points of the 42 points of COGS.'],
    ['5.8 points', 'Beans are 5.8 points of revenue.'],
    ['5.8 points', 'Beans are 5.8 points of margin.'],
    ['5.8 points', 'Beans are five point eight points of the sixteen point COGS increase.'],
    ['5.8 points', 'Beans are 5.8 points of the 16-point COGS increase. That is 5.8 points of COGS.'],
  ])('%s: "%s" — revenue points: the checker\'s line, "not 5.8"', (v, w) => {
    const c = beans(v, w.split('. ')[0].replace(/\.$/, '').toLowerCase());
    expect(lineFor(c, w)).toMatchObject({ line: REVENUE_LINE, converted: false });
  });
  it.each([
    ['5.8 points', 'Beans are 5.8 points of COGS.', 'about 10 points, not 5.8.'],
    ['15 points', 'Beans are 15 points of COGS.', 'about 10 points, not 15.'],
    ['15%', 'Beans are 15% of the COGS base.', 'about 10%, not 15.'],
    ['15 points', 'Beans are 15 points of the old COGS.', 'about 10 points, not 15.'],
    ['5.8 points', 'Beans are 5.8 points of the COGS line — most of the jump.', 'about 10 points, not 5.8.'],
  ])('%s: "%s" — on the allowlist: the "In COGS terms" line', (v, w, end) => {
    const c = beans(v, w.replace(/\.$/, '').toLowerCase());
    expect(lineFor(c, w)?.line).toBe(`In COGS terms, bean inflation's contribution to the COGS increase is ${end}`);
  });
  it('"5.8 points of the COGS line\'s 16-point increase" is revenue points: the checker\'s line (the b33 t14 shape)', () => {
    const c = beans('5.8 points', "beans are 5.8 points of the cogs line's 16-point increase");
    const w = "Beans are 5.8 points of the COGS line's 16-point increase.";
    expect(frameOfClaim(c, w, ctx).kind).toBe('code');
    expect(lineFor(c, w)?.line).toBe("Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points, not 5.8.");
  });
  it('"5.8 points of the COGS line — most of the jump": the base named before the dash, the "In COGS terms" line', () => {
    const c = beans('5.8 points of COGS', 'beans are 5.8 points of the COGS line');
    expect(lineFor(c, 'Beans are 5.8 points of the COGS line — most of the jump.')?.line).toBe("In COGS terms, bean inflation's contribution to the COGS increase is about 10 points, not 5.8.");
  });
  it('"5.8 points of COGS": the "In COGS terms" line', () => {
    const c = beans('5.8 points of COGS', 'beans are 5.8 points of COGS');
    expect(lineFor(c, 'Beans are 5.8 points of COGS.')?.line).toBe("In COGS terms, bean inflation's contribution to the COGS increase is about 10 points, not 5.8.");
  });
  it('"26% of the 16-point COGS increase" names no COGS base: right as a share — the conversion line', () => {
    const c = beans('26%', 'beans are about 26% of the 16-point COGS increase');
    const w = 'Beans are about 26% of the 16-point COGS increase.';
    expect(frameOfClaim(c, w, ctx)).toMatchObject({ kind: 'unstated', rightOn: { quantity: 'a share of the COGS increase' } });
    expect(lineFor(c, w)).toMatchObject({ line: "In revenue terms, that's about 4.2 points.", converted: true });
  });
  it('every mention with a unit names COGS: the "In COGS terms" line stays', () => {
    const c = beans('15 points of COGS', 'beans add 15 points of COGS');
    const w = 'Beans add 15 points of COGS. So beans are 15 percent of COGS.';
    expect(lineFor(c, w)?.line).toBe("In COGS terms, bean inflation's contribution to the COGS increase is about 10 points, not 15.");
  });
});

describe('batch 30 Noor a35507dc t9/t13, verbatim: right on her own quantity — no "not 38%"', () => {
  const t9 = "That confirms it — zero pass-through. Input costs up roughly 38% blended, prices flat, so the entire inflation hit landed on margin. And since COGS went from 42 to 58 points while revenue per unit was unchanged, the 15% revenue growth has to be coming from volume or store count, not price.\n\nWhat does it take to fix? If they want to recover the 16 points, a rough cut: raise prices so that the new COGS of 58 falls back toward 42 as a share. Revenue would need to go up by 58/42, about 38% — which makes sense, it's just the input inflation. That's a big number, so realistically they'd phase it and take some of it back on overhead too.\n\nSo I'd focus the client on pricing first. Two years of flat menu prices in a specialty category with real brand equity is money left on the table. Secondary focus is procurement — renegotiating dairy and packaging contracts, since those are the bigger share of the increase.";
  const t13 = "I held COGS dollars constant and asked what revenue would have to be for COGS to fall back to 42% of it. Right now COGS is 58% of revenue. If I index revenue at 100, COGS dollars are 58. For 58 to equal 42% of revenue, revenue has to be 58 ÷ 0.42 = 138. So revenue rises 38%.\n\nTwo caveats I should flag. First, that's a pure price increase with volume held constant — in reality a 38% price hike would cost them volume, so the realized recovery is less and I'd want elasticity data. Second, it only restores COGS; labor and overhead are also fixed dollars in that scenario, so they'd actually fall as a share of revenue and margin would overshoot 24%. So 38% is the ceiling, not the target. A smaller increase gets you most of the way.";
  const c = flagged('38%', 'Revenue would need to go up by 58/42, about 38% ... to recover the 16 points', { kind: 'needed_for_gain', stepId: null, price: null, target: 16 }, 20.5);
  it('the claim with her redo (t13) in the window: converted, no "not 38%"', () => {
    const w = claimWindow(c.span, t9, [t13]);
    expect(frameOfClaim(c, w, ctx)).toMatchObject({ kind: 'own_right', quantity: 'COGS back to 42% of revenue' });
    expect(lineFor(c, w)).toMatchObject({ line: "From today's 6% margin, recovering 16 points of margin takes about a 20.5% price rise.", converted: true });
  });
});
