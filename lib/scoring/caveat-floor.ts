import type { RubricScores } from './judge';
import { RUBRIC_DIMENSION_KEYS, type RubricDimensionKey } from './rubric';

// Rule 9 (docs/interviewer-behavior.md v4.3): a caveat constrains the rating,
// not just the prose. A dimension carrying a coverageCaveat — a stage the
// interviewer never administered, or data it withheld — cannot be rated
// below meets_bar on that basis. The judge prompt already said so and Maya's
// report (c230fe12) still rated both caveated dimensions needs_work, so the
// floor is applied in code after the judge. Dimensions the judge marked
// notAssessed are left alone: they carry no rating.
export function applyCaveatFloor(rubric: RubricScores): { rubric: RubricScores; floored: RubricDimensionKey[] } {
  const out = structuredClone(rubric);
  const floored: RubricDimensionKey[] = [];
  for (const key of RUBRIC_DIMENSION_KEYS) {
    const dim = out[key];
    if (dim.notAssessed || !dim.coverageCaveat?.trim()) continue;
    if (dim.rating === 'needs_work') {
      dim.rating = 'meets_bar';
      floored.push(key);
    }
  }
  return { rubric: out, floored };
}
