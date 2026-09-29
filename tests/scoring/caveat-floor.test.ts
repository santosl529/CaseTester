import { describe, it, expect } from 'vitest';
import { applyCaveatFloor } from '@/lib/scoring/caveat-floor';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { RubricScores } from '@/lib/scoring/judge';

const dim = (rating: 'needs_work' | 'meets_bar' | 'strong', extra = {}) =>
  ({ rating, wentWell: [], needsWork: [], missedOpportunities: [], ...extra });

function rubric(overrides: Partial<Record<string, unknown>>): RubricScores {
  const base = Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, dim('strong')]));
  return { ...base, ...overrides, overallRating: 'meets_bar', topFix: 'x' } as RubricScores;
}

describe('applyCaveatFloor (Rule 9, v4.3)', () => {
  it("raises a caveated needs_work dimension to meets_bar (Maya c230fe12's Synthesis)", () => {
    const r = rubric({ synthesis: dim('needs_work', { coverageCaveat: 'The candidate was never asked for a recommendation.' }) });
    const { rubric: out, floored } = applyCaveatFloor(r);
    expect(out.synthesis.rating).toBe('meets_bar');
    expect(floored).toEqual(['synthesis']);
  });

  it('leaves an uncaveated needs_work dimension alone', () => {
    const { rubric: out, floored } = applyCaveatFloor(rubric({ synthesis: dim('needs_work') }));
    expect(out.synthesis.rating).toBe('needs_work');
    expect(floored).toEqual([]);
  });

  it('leaves a not-assessed dimension alone', () => {
    const { floored } = applyCaveatFloor(rubric({ creativity: dim('needs_work', { coverageCaveat: 'No brainstorm.', notAssessed: true }) }));
    expect(floored).toEqual([]);
  });
});
