import type { RubricScores, Rating } from './judge';
import { RUBRIC_DIMENSION_KEYS, STRONG_ELEMENTS, type RubricDimensionKey } from './rubric';

// Strong-rating gate (round-3 fix 3). The rubric already said "strong
// requires EVERY element of the strong anchor"; batch 3 still rated 8 of 9
// sessions strong overall, including a candidate written to do only adequate
// analysis. The judge now fills a per-dimension checklist; this pass keeps a
// "strong" only when the checklist supports it:
//   - one entry per element, none "not_met";
//   - at least half "met";
//   - every "met" quote actually appears in the candidate's turns.
// Otherwise the dimension becomes meets_bar. The overall rating may then be
// "strong" only if no assessed dimension is needs_work and at least half are
// strong. Runs after reconciliation, before the caveat floor.

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
}

export function applyStrongGate(
  rubric: RubricScores,
  candidateTexts: string[],
): { rubric: RubricScores; downgraded: { dimension: RubricDimensionKey; reason: string }[]; overallCapped: { from: Rating; to: Rating } | null } {
  const out = structuredClone(rubric);
  const said = norm(candidateTexts.join(' '));
  const downgraded: { dimension: RubricDimensionKey; reason: string }[] = [];

  for (const key of RUBRIC_DIMENSION_KEYS) {
    const dim = out[key];
    if (dim.notAssessed || dim.rating !== 'strong') continue;
    const expected = STRONG_ELEMENTS[key].length;
    const items = dim.strongElements ?? [];
    let reason: string | null = null;
    if (items.length < expected) reason = `checklist incomplete (${items.length}/${expected})`;
    else if (items.some(i => i.status === 'not_met')) reason = `not met: ${items.filter(i => i.status === 'not_met').map(i => i.element).join('; ')}`;
    else if (items.filter(i => i.status === 'met').length < Math.ceil(expected / 2)) reason = 'fewer than half the elements evidenced';
    else {
      const unverified = items.filter(i => i.status === 'met' && (norm(i.quote).length < 6 || !said.includes(norm(i.quote))));
      if (unverified.length > 0) reason = `quote not found for: ${unverified.map(i => i.element).join('; ')}`;
    }
    if (reason) {
      dim.rating = 'meets_bar';
      downgraded.push({ dimension: key, reason });
    }
  }

  let overallCapped: { from: Rating; to: Rating } | null = null;
  const assessed = RUBRIC_DIMENSION_KEYS.filter(k => !out[k].notAssessed);
  const strongCount = assessed.filter(k => out[k].rating === 'strong').length;
  const anyNeedsWork = assessed.some(k => out[k].rating === 'needs_work');
  if (out.overallRating === 'strong' && (anyNeedsWork || strongCount * 2 < assessed.length)) {
    overallCapped = { from: 'strong', to: 'meets_bar' };
    out.overallRating = 'meets_bar';
  }
  return { rubric: out, downgraded, overallCapped };
}
