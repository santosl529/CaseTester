import { describe, it, expect } from 'vitest';
import { applyCaveatFloor } from '@/lib/scoring/caveat-floor';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { RubricScores } from '@/lib/scoring/judge';

const dim = (rating: 'needs_work' | 'meets_bar' | 'strong', extra = {}) =>
  ({ rating, wentWell: [], needsWork: [], missedOpportunities: [], ...extra });

function rubric(overrides: Partial<Record<string, unknown>>): RubricScores {
  const base = Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, dim('strong', { wentWell: [{ point: 'p', quotes: ['a real quote'] }] })]));
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

  it('leaves an uncaveated, evidenced needs_work dimension alone', () => {
    const { rubric: out, floored } = applyCaveatFloor(rubric({ synthesis: dim('needs_work', { needsWork: q('No answer first') }) }));
    expect(out.synthesis.rating).toBe('needs_work');
    expect(floored).toEqual([]);
  });

  it('leaves a not-assessed dimension alone', () => {
    const { floored } = applyCaveatFloor(rubric({ creativity: dim('needs_work', { coverageCaveat: 'No brainstorm.', notAssessed: true }) }));
    expect(floored).toEqual([]);
  });

  // Lorenzo, 19 Oct (R4: "any dimension"; batch 32 Aldermoor Marisol's Creativity — caveated, meets_bar, no quote).
  describe('no rating without evidence', () => {
    const cav = 'The brainstorm stage was never administered.';
    it('a caveated meets_bar with empty quotes is not assessed', () => {
      const { rubric: out, floored, unassessed } = applyCaveatFloor(rubric({ creativity: dim('meets_bar', { coverageCaveat: cav }) }));
      expect(out.creativity.notAssessed).toBe(true);
      expect(floored).toEqual([]);
      expect(unassessed).toEqual(['creativity']);
    });
    it('a caveated strong with empty quotes is not assessed', () => {
      const { rubric: out, unassessed } = applyCaveatFloor(rubric({ creativity: dim('strong', { coverageCaveat: cav }) }));
      expect(out.creativity.notAssessed).toBe(true);
      expect(unassessed).toEqual(['creativity']);
    });
    it('a caveated meets_bar with one wentWell quote is unchanged', () => {
      const { rubric: out, unassessed } = applyCaveatFloor(rubric({ creativity: dim('meets_bar', { coverageCaveat: cav, wentWell: q('Good idea') }) }));
      expect(out.creativity.notAssessed).toBeUndefined();
      expect(out.creativity.rating).toBe('meets_bar');
      expect(unassessed).toEqual([]);
    });
    it('an uncaveated meets_bar with empty quotes is not assessed', () => {
      const { rubric: out, unassessed } = applyCaveatFloor(rubric({ creativity: dim('meets_bar') }));
      expect(out.creativity.notAssessed).toBe(true);
      expect(unassessed).toEqual(['creativity']);
    });
    it('an uncaveated meets_bar with one needsWork quote is unchanged', () => {
      const { rubric: out, unassessed } = applyCaveatFloor(rubric({ creativity: dim('meets_bar', { needsWork: q('Thin') }) }));
      expect(out.creativity.notAssessed).toBeUndefined();
      expect(unassessed).toEqual([]);
    });
    it('blank quotes are no evidence', () => {
      const r = rubric({ creativity: dim('meets_bar', { wentWell: [{ point: 'x', quotes: ['  '] }] }) });
      expect(applyCaveatFloor(r).rubric.creativity.notAssessed).toBe(true);
    });
    it('an overall of strong is capped when the remaining assessed dimensions no longer carry it', () => {
      // 4 strong of 8 carries a strong overall; losing one strong to "not assessed" leaves 3 of 7, which does not.
      const keys = [...RUBRIC_DIMENSION_KEYS];
      const base = Object.fromEntries(keys.map((k, i) => [k, dim(i < 4 ? 'strong' : 'meets_bar', { wentWell: q('ok') })]));
      const r = { ...base, [keys[0]]: dim('strong'), overallRating: 'strong', topFix: 'x' } as unknown as RubricScores;
      expect(applyCaveatFloor(r).rubric.overallRating).toBe('meets_bar');
    });
  });
});
