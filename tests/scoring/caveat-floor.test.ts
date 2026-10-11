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
  // v4.10: evidence decides, never the gap alone.
  const q = (point: string) => [{ point, quotes: ['a real quote'] }];
  it("raises a caveated needs_work dimension to meets_bar when only strengths are quoted (Maya c230fe12's Synthesis)", () => {
    const r = rubric({ synthesis: dim('needs_work', { coverageCaveat: 'The candidate was never asked for a recommendation.', wentWell: q('Clear lead') }) });
    const { rubric: out, floored } = applyCaveatFloor(r);
    expect(out.synthesis.rating).toBe('meets_bar');
    expect(floored).toEqual(['synthesis']);
  });

  it('keeps needs_work when a quoted weakness survived the audits (rated on evidence, not on the gap)', () => {
    const r = rubric({ synthesis: dim('needs_work', { coverageCaveat: 'Never asked.', needsWork: q('No answer first') }) });
    expect(applyCaveatFloor(r).rubric.synthesis.rating).toBe('needs_work');
  });

  it('with no evidence at all the dimension is not assessed — never an automatic meets_bar', () => {
    const r = rubric({ synthesis: dim('needs_work', { coverageCaveat: 'Never asked.' }) });
    const { rubric: out, floored, unassessed } = applyCaveatFloor(r);
    expect(out.synthesis.notAssessed).toBe(true);
    expect(floored).toEqual([]);
    expect(unassessed).toEqual(['synthesis']);
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
