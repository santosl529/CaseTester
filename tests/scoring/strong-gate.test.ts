import { describe, it, expect } from 'vitest';
import { applyStrongGate } from '@/lib/scoring/strong-gate';
import { STRONG_ELEMENTS, RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { RubricScores, DimensionFeedback } from '@/lib/scoring/judge';

const SAID = ['I would split this into revenue and costs, and start with costs because margin fell while revenue grew.'];
type El = { element: string; status: 'met' | 'not_met' | 'no_occasion'; quote: string };
const met = (k: keyof typeof STRONG_ELEMENTS): El[] => STRONG_ELEMENTS[k].map(element => ({ element, status: 'met', quote: 'start with costs because margin fell' }));
const dim = (over: Partial<DimensionFeedback> = {}): DimensionFeedback => ({ rating: 'strong', wentWell: [], needsWork: [], missedOpportunities: [], ...over });

function rubric(over: Partial<RubricScores> = {}): RubricScores {
  const base = Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, dim({ strongElements: met(k) })]));
  return { ...base, overallRating: 'strong', topFix: 'x', ...over } as RubricScores;
}

describe('strong gate (round-3 fix 3)', () => {
  it('keeps a strong rating the checklist fully supports', () => {
    const out = applyStrongGate(rubric(), SAID);
    expect(out.downgraded).toEqual([]);
    expect(out.rubric.overallRating).toBe('strong');
  });

  it('lowers strong with an element not met', () => {
    const els = met('synthesis'); els[2] = { element: els[2].element, status: 'not_met', quote: '' };
    const out = applyStrongGate(rubric({ synthesis: dim({ strongElements: els }) }), SAID);
    expect(out.rubric.synthesis.rating).toBe('meets_bar');
    expect(out.downgraded[0].reason).toMatch(/not met: Names the key risk/);
  });

  it('lowers strong with no checklist or a fabricated quote', () => {
    expect(applyStrongGate(rubric({ judgment: dim() }), SAID).rubric.judgment.rating).toBe('meets_bar');
    const fake = met('creativity').map(e => ({ ...e, quote: 'a lower-cost commodity blend' }));
    expect(applyStrongGate(rubric({ creativity: dim({ strongElements: fake }) }), SAID).downgraded[0].reason).toMatch(/quote not found/);
  });

  it('allows no_occasion but needs half the elements met', () => {
    const els = met('pushback').map((e, i) => (i === 0 ? e : { ...e, status: 'no_occasion' as const, quote: '' }));
    expect(applyStrongGate(rubric({ pushback: dim({ strongElements: els }) }), SAID).rubric.pushback.rating).toBe('meets_bar');
    const two = met('pushback').map((e, i) => (i < 2 ? e : { ...e, status: 'no_occasion' as const, quote: '' }));
    expect(applyStrongGate(rubric({ pushback: dim({ strongElements: two }) }), SAID).rubric.pushback.rating).toBe('strong');
  });

  it('caps the overall rating when strong dimensions are a minority or any needs work', () => {
    const r = rubric(Object.fromEntries(['structure', 'quantitative', 'dataExhibit', 'judgment', 'creativity'].map(k => [k, dim({ rating: 'meets_bar' })])));
    expect(applyStrongGate(r, SAID).overallCapped).toEqual({ from: 'strong', to: 'meets_bar' });
    expect(applyStrongGate(rubric({ synthesis: dim({ rating: 'needs_work' }) }), SAID).rubric.overallRating).toBe('meets_bar');
  });

  it('leaves meets_bar and needs_work alone', () => {
    const out = applyStrongGate(rubric({ structure: dim({ rating: 'needs_work' }), judgment: dim({ rating: 'meets_bar' }) }), SAID);
    expect(out.rubric.structure.rating).toBe('needs_work');
    expect(out.rubric.judgment.rating).toBe('meets_bar');
  });
});
