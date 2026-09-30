import { describe, it, expect } from 'vitest';
import { RubricScoresSchema, JUDGE_OUTPUT_FORMAT, readJudgeOutput } from '@/lib/scoring/judge';
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

// Run 2 (Tobias, 30 Sep) crashed scoring: the judge opened with prose ("Let me
// work through the candidate's math…") before its JSON. The judge now asks the
// API for structured output, which constrains decoding to this schema.
describe('judge structured output', () => {
  it('round-trips a complete judge response through the output format', () => {
    expect(JUDGE_OUTPUT_FORMAT.parse(JSON.stringify(validScores()))).toEqual(validScores());
  });

  it('returns the parsed rubric', () => {
    const scores = RubricScoresSchema.parse(validScores());
    expect(readJudgeOutput({ parsed_output: scores, stop_reason: 'end_turn' })).toBe(scores);
  });

  it('names the stop reason when nothing parsed (refusal, empty reply)', () => {
    expect(() => readJudgeOutput({ parsed_output: null, stop_reason: 'refusal' })).toThrow(/refusal/);
  });
});
