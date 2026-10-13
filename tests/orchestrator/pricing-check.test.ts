import { describe, it, expect } from 'vitest';
import { checkPricingClaims, pricingValues } from '@/lib/orchestrator/pricing-check';
import { getCaseById } from '@/lib/cases/loader';

const ALL = new Set(['cogs_pct', 'labor_pct', 'overhead_pct', 'revenue_total']);
const v = pricingValues(getCaseById('prof-001') as never, ALL)!;
const verdicts = (t: string) => checkPricingClaims(t, v).map(c => `${c.kind}:${c.verdict}`);

describe('pricing values (prof-001)', () => {
  it('cost base 94, margin 6, contribution 42 (COGS variable) or 20 (COGS and labor)', () => {
    expect(v).toEqual({ costBase: 94, margin: 6, contributions: [42, 20], revenue: 480 });
  });
  it('needs the cost lines revealed', () => {
    expect(pricingValues(getCaseById('prof-001') as never, new Set(['cogs_pct']))).toBeNull();
  });
});

describe('pricing claims (batch 20 D6 grades)', () => {
  it.each([
    ["A 10% price increase on flat volume: revenue goes to 110, COGS stays at 58 in absolute terms, so COGS falls to about 53% of revenue — that's five points of margin back immediately.", ['gain:incorrect']],
    ['Rough sizing: if a price increase lifts revenue per ticket about 10% with volume flat, and costs are fixed in dollars, COGS falls from 58 to about 53 points of revenue — call it five points of margin back, going from 6% to roughly 11%.', ['gain:incorrect', 'new_margin:incorrect']],
    ['A 10% price increase at current volumes recovers roughly six to seven points of margin.', ['gain:incorrect']],
    ["They've passed through zero against 38-40% inflation. Even a 10% increase recovers maybe 5-6 points of margin almost immediately.", ['gain:incorrect']],
    ['My recommendation: raise menu prices roughly 10% immediately. That restores about 14 points of margin on its own, taking us from 6% toward 14%+.', ['gain:incorrect', 'new_margin:correct']],
    ["A 10% price rise lifts margin per transaction to roughly 47%, so I can afford to lose about 10% of transactions before I'm worse off.", ['breakeven:incorrect']],
    ["If an 8% price increase costs more than 8% of transactions, we've made it worse.", ['breakeven:incorrect']],
    ["If we price up 16% and lose more than roughly 16% of cups, we're worse off on gross profit dollars.", ['breakeven:incorrect']],
    ["To get back to 24% they need roughly 18 points, about $86M. With volume held flat, they'd need about an 18% price rise.", ['needed:incorrect']],
    ['At 58% COGS: 58/42 ≈ 1.38, so ~38% price increase holds margin fully.', ['needed:incorrect']],
  ])('%s', (text, expected) => expect(verdicts(text)).toEqual(expected));

  it('a stated volume loss is checked at that volume (R10 t16: 5 points after a 7% drop is still short)', () => {
    const c = checkPricingClaims("Say we take a 10% price increase. At -0.7 elasticity that's a 7% volume drop, so revenue index is 1.10 × 0.93 = 1.02. That recovers about 5 points of margin.", v);
    expect(c).toMatchObject([{ kind: 'gain', verdict: 'incorrect', expected: [6.1, 7.6] }]);
  });

  it.each([
    ['A 10% price increase recovers about 8.5 points of margin, from 6% to about 14.5%.', ['gain:correct', 'new_margin:correct']],
    ["A 10% price increase lets us lose about 19% of volume before we're worse off.", ['breakeven:correct']],
    ['At $2.4M per store, a 10% price increase is $240K per store, or $48M across 200 stores.', ['dollars:correct']],
    ['To get back to 24% margin they would need about a 24% price increase.', ['needed:correct']],
    ['Prices should go up in the range of 8 to 12% and be phased.', []],
    ['Revenue grew 15% while COGS rose 16 points.', []],
  ])('correct or not a pricing claim: %s', (text, expected) => expect(verdicts(text)).toEqual(expected));
});

describe('pricing claims — bindings and hedges', () => {
  it.each([
    // a cost's price is not the menu's (batch 20 R19 t12)
    ['Scale for 15% volume and 40% price: 10.5 × 1.15 × 1.4 = 16.9. So beans add about 6.4 points, not the ~20 I\'d implied.', []],
    // profit after the change is not the price gain (R01 t14)
    ['If we raise prices ~19%, revenue goes from $480M to $571M, costs stay at ~$451M, so profit is $120M on $571M — about 21%.', []],
    // a hedged round figure rounds the true one (R29 t36)
    ["Sizing it roughly: a 10% price increase, if volume held, would add about 10 points of margin on today's revenue.", ['gain:correct']],
  ])('%s', (text, expected) => expect(verdicts(text)).toEqual(expected));
});

// D6 flags read outside batch 20 (12 Oct): correct or not pricing claims.
describe('pricing claims — false alarms read outside batch 20', () => {
  const P = 'A 24% price increase would be needed for the full gap.';
  it.each([
    // "~10" is hedged like "about 10" (Ines b1)
    ['Math: a 10% price increase on flat volume adds ~10 points of margin, taking 6% to roughly 15-16%.', ['gain:correct']],
    // the margin lost is no gain; a share of COGS is no margin (Camila b1, b18)
    [`${P} 16 of the 18 points of margin loss are COGS, and within that, beans more than doubled — from 25% to 35% of COGS.`, []],
    [`${P} The support: of the 18 points of margin lost, 16 came from COGS.`, []],
    // a volume loss "up to about 9%" is no new margin; revenue break-even is P/(1+P) (Ines b18, Lena b14, Owen b19, Nikhil b9)
    ['A 10% price increase survives volume loss up to about 9% — below that, revenue per store is flat or up and margin still improves.', []],
    ["Roughly, if a 15% price rise costs more than about 13% of volume, revenue falls and I've made it worse.", ['breakeven:correct']],
    ['Concretely, at an 11% price increase I can afford to lose up to roughly 10% of transactions and still hold revenue flat, and because the lost cups also carry input cost, gross profit would actually still be up.', ['breakeven:correct']],
    // a sentence with its own percentage borrows no price from before (Wei b18, Arjun b18, Hugo b17, Micah b2)
    [`${P} A 10.0000% increase yields revenue 126.5000, profit 18.4000, margin 14.5455% — recovering 8.5455 points, roughly 47.4747% of the gap.`, ['gain:correct']],
    [`${P} A full pass-through of input inflation would be closer to 38%, which would overshoot to roughly a 32% margin.`, []],
    [`${P} Cleaner rule: every 1% of price adds a bit under 1 point of margin at these cost levels.`, []],
    // a hypothetical target, and a break-even left open, are no claims (Camila b19, Daniel b18)
    ['A 38% price increase closes it. If we get back 8 of the 16 points, that\'s $38.4M.', []],
    ["If I raise price 10% and lose 10% of volume, I'm worse on traffic but the per-unit economics improve, so the net depends on where the breakeven elasticity sits.", []],
  ])('%s', (text, expected) => expect(verdicts(text)).toEqual(expected));

  it.each([
    // still errors: gross-profit break-even, unhedged 10 points, from 6% to 16%
    ["Roughly, if a 10% price increase costs more than about 10% of transactions, I'm net worse off on gross profit dollars.", ['breakeven:incorrect']],
    ["Price is the lever. It's the only lever sized to the problem — 10 points of margin from a 10% increase, versus one or 2 points from waste.", ['gain:incorrect']],
    ['A 10% price increase is the lever. That takes them from 6% to 16%.', ['new_margin:incorrect']],
  ])('still an error: %s', (text, expected) => expect(verdicts(text)).toEqual(expected));
});
