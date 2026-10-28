import type { RubricScores } from './judge';
import { capStrongOverall } from './strong-gate';
import { RUBRIC_DIMENSION_KEYS, type RubricDimensionKey } from './rubric';

// Rule 9 (docs/interviewer-behavior.md v4.3): a caveat constrains the rating,
// not just the prose. A dimension carrying a coverageCaveat — a stage the
// interviewer never administered, or data it withheld — cannot be rated
// below meets_bar on that basis. The judge prompt already said so and Maya's
// report (c230fe12) still rated both caveated dimensions needs_work, so the
// floor is applied in code after the judge. Dimensions the judge marked
// notAssessed are left alone: they carry no rating.
//
// v4.10 (round-3): the floor is not a rating of its own. A caveated
// needs_work dimension is raised to meets_bar only when the evidence left
// supports it (quoted strengths, no quoted weakness — the low rating rested on
// the gap); with quoted weaknesses that survived the audits it stays
// needs_work (rated on evidence, not on the gap); with no evidence at all it
// is not assessed. "Missing evidence" never becomes "meets bar".
//
// Lorenzo, 19 Oct (R4: "any dimension"; batch 32 Aldermoor Marisol's Creativity
// — caveated, meets_bar, no quote): the no-evidence rule is not limited to a
// caveated needs_work. Any assessed dimension with no quote in wentWell or
// needsWork is not assessed, whatever its rating and caveat. A rating needs a
// quote behind it. The overall was set by the judge before this runs, so a
// strong overall is re-checked against the dimensions still assessed.
const quoted = (items: { quotes: string[] }[]) => items.some(i => i.quotes.some(q => q.trim().length > 0));

export function applyCaveatFloor(rubric: RubricScores): { rubric: RubricScores; floored: RubricDimensionKey[]; unassessed: RubricDimensionKey[] } {
  const out = structuredClone(rubric);
  const floored: RubricDimensionKey[] = [];
  const unassessed: RubricDimensionKey[] = [];
  for (const key of RUBRIC_DIMENSION_KEYS) {
    const dim = out[key];
    if (dim.notAssessed) continue;
    if (!quoted(dim.wentWell) && !quoted(dim.needsWork)) {
      dim.notAssessed = true;
      unassessed.push(key);
      continue;
    }
    if (!dim.coverageCaveat?.trim() || dim.rating !== 'needs_work' || quoted(dim.needsWork)) continue;
    dim.rating = 'meets_bar';
    floored.push(key);
  }
  if (unassessed.length > 0) capStrongOverall(out);
  return { rubric: out, floored, unassessed };
}
