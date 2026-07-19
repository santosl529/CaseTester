import { describe, it, expect } from 'vitest';
import { RubricScoresSchema } from '@/lib/scoring/judge';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';

const validDimension = {
  rating: 'strong',
  wentWell: [{ point: 'Good structure.', quotes: ['My structure: 1...'] }],
  needsWork: [],
  missedOpportunities: [{ moment: 'At the exhibit.', betterResponse: 'I would check the axes first.' }],
};

function validScores() {
  return {
    ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, validDimension])),
    overallRating: 'meets_bar',
    topFix: 'Derive numbers out loud.',
  };
}

describe('RubricScoresSchema', () => {
  it('accepts a complete judge response', () => {
    expect(RubricScoresSchema.safeParse(validScores()).success).toBe(true);
  });

  it('rejects a missing dimension', () => {
    const scores = validScores() as Record<string, unknown>;
    delete scores.creativity;
    expect(RubricScoresSchema.safeParse(scores).success).toBe(false);
  });

  it('rejects an invalid rating value', () => {
    const scores = validScores();
    scores.overallRating = 'adequate'; // display label, not the enum value
    expect(RubricScoresSchema.safeParse(scores).success).toBe(false);
  });

  it('rejects the legacy flat-evidence format', () => {
    const legacy = {
      ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, {
        rating: 'strong', evidence: ['quote'], guidance: 'do better',
      }])),
      overallRating: 'strong',
      topFix: 'x',
    };
    expect(RubricScoresSchema.safeParse(legacy).success).toBe(false);
  });
});
