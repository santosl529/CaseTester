// Lorenzo, 13 Oct (Step-4 rulings, 4a; Sofia 3f57efeb: "you said a 18% price
// rise breaks even at a 15% volume loss"): code-written lines say "an" before
// a figure spoken with a vowel sound — an 8%, an 11%, an 18%, an 80%.
import { describe, it, expect } from 'vitest';
import { flagsFromPricing, recMathLine } from '@/lib/orchestrator/recompute';
import { codeCorrection, type CheckerClaim, type VetContext } from '@/lib/orchestrator/math-checker';
import type { PricingClaim } from '@/lib/orchestrator/pricing-check';
import { getCaseById } from '@/lib/cases/loader';

const pricing = (over: Partial<PricingClaim>): PricingClaim => ({ kind: 'gain', price: 10, stated: 5, expected: [8.5], verdict: 'incorrect', span: '', ...over });
const probe = (c: PricingClaim) => recMathLine(flagsFromPricing([c])[0], 'probe');

describe('the recommendation probe on a pricing claim', () => {
  it('Sofia 3f57efeb: "an 18% price rise breaks even at a 15% volume loss"', () => {
    expect(probe(pricing({ kind: 'breakeven', price: 18, stated: 15, expected: [25] }))).toBe('Before we wrap up — you said an 18% price rise breaks even at a 15% volume loss. Walk me through how you sized that.');
  });
  it('a / an by the figure, every kind', () => {
    expect(probe(pricing({ price: 8 }))).toContain('an 8% price rise recovers 5 points');
    expect(probe(pricing({ kind: 'new_margin', price: 11, stated: 12, expected: [14] }))).toContain('an 11% price rise takes margin to 12%');
    expect(probe(pricing({ kind: 'needed', price: 80, stated: 80, expected: [24] }))).toContain('an 80% price rise reaches');
    expect(probe(pricing({ kind: 'dollars', price: 7, stated: 30, expected: [40] }))).toContain('a 7% price rise is worth $30M');
    expect(probe(pricing({ kind: 'breakeven', price: 10, stated: 8, expected: [20] }))).toContain('a 10% price rise breaks even at an 8% volume loss');
  });
});

describe("code's correction from the checker's quantity", () => {
  const prof = getCaseById('prof-001');
  const ctx: VetContext = { caseData: prof, revealedIds: [], shownExhibitIds: [], candidateTexts: [] };
  const claim = (codeQuantity: CheckerClaim['codeQuantity']): CheckerClaim => ({
    span: '', quantity: '', candidateValue: '30%', assumptions: '', verdict: 'error', correctValue: null, correctLow: null, correctHigh: null,
    unit: 'percent', derivation: '', errorType: 'conceptual', changesConclusion: true, confidence: 'high', probe: '', pointer: '', codeQuantity, actualShare: null,
  });
  const line = (q: CheckerClaim['codeQuantity'], value: number) => codeCorrection(claim(q), { value, index: 0 }, ctx)?.line;
  it.each([
    [{ kind: 'gain', stepId: null, price: 8, target: null }, 6, /^An 8% price rise lifts margin/],
    [{ kind: 'new_margin', stepId: null, price: 18, target: null }, 20, /^An 18% price rise takes margin/],
    [{ kind: 'needed_for_margin', stepId: null, price: null, target: 18 }, 11, /^Getting back to an 18% margin takes about an 11% price rise/],
    [{ kind: 'needed_for_gain', stepId: null, price: null, target: 6 }, 8.5, /takes about an 8\.5% price rise/],
    [{ kind: 'breakeven', stepId: null, price: 11, target: null }, 18, /an 11% price rise breaks even at about an 18% volume loss/],
    [{ kind: 'gain', stepId: null, price: 10, target: null }, 7, /^A 10% price rise lifts margin/],
  ] as const)('%o', (q, value, re) => expect(line(q as CheckerClaim['codeQuantity'], value)).toMatch(re));
});
