// Case to case (Matt, 15 Nov; proposal §2.9): each rubric dimension against the
// student's previous case at the same level, on the report and on Your
// progress. Pure, so the rules are tested (tests/drills/case-compare.test.ts):
//   - the previous case is the latest earlier one at the same difficulty that
//     was neither a retake nor ended early; on a retake, the earlier attempt of
//     the same case ("last time on this case");
//   - a dimension that went up, with drill sets on its skills completed between
//     the two cases, gets "You practiced this in N drill sets since your last
//     case." Nothing is added when it went down.
import { DRILLS_CONFIG, getDrill } from './config';
import { RUBRIC_DIMENSION_KEYS, type RubricDimensionKey } from '@/lib/scoring/rubric';

export type ComparedCase = { sessionId: string; caseId: string; tier: number; completedAt: Date; ratings: Record<string, string>; partial: boolean };
export type CompareRow = { dimension: RubricDimensionKey; before: string; after: string; move: -1 | 0 | 1; sets: number };
export type Comparison = { kind: 'same_level' | 'same_case'; previous: ComparedCase; rows: CompareRow[] };

const RANK: Record<string, number> = { needs_work: 0, meets_bar: 1, strong: 2 };

// A retake: an earlier completed session of the same case.
export const isRetake = (c: ComparedCase, all: ComparedCase[]) =>
  all.some(o => o.caseId === c.caseId && o.completedAt < c.completedAt);

export function previousCase(current: ComparedCase, history: ComparedCase[]): { kind: Comparison['kind']; previous: ComparedCase } | null {
  const earlier = history.filter(h => h.sessionId !== current.sessionId && h.completedAt < current.completedAt)
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  if (isRetake(current, history)) {
    const same = earlier.find(h => h.caseId === current.caseId);
    return same ? { kind: 'same_case', previous: same } : null;
  }
  const prev = earlier.find(h => h.tier === current.tier && !h.partial && !isRetake(h, history));
  return prev ? { kind: 'same_level', previous: prev } : null;
}

// The rubric dimension a drill set trains: its skill's area's dimension.
const dimensionOfSkill = (skillId: string) => {
  const area = DRILLS_CONFIG.taxonomy.skills.find(s => s.id === skillId)!.area;
  return DRILLS_CONFIG.taxonomy.areas.find(a => a.code === area)!.rubric_dimension;
};

export function compareCases(current: ComparedCase, history: ComparedCase[], sets: { drillId: string; focus: string | null; completedAt: Date }[]): Comparison | null {
  const found = previousCase(current, history);
  if (!found) return null;
  const { previous } = found;
  const between = sets.filter(s => s.completedAt > previous.completedAt && s.completedAt < current.completedAt);
  const setsOn = (dim: RubricDimensionKey) => between.filter(s => (s.focus ? [s.focus] : getDrill(s.drillId).primary_skills).some(id => dimensionOfSkill(id) === dim)).length;
  const rows = RUBRIC_DIMENSION_KEYS.flatMap(dim => {
    const before = previous.ratings[dim], after = current.ratings[dim];
    if (!before || !after) return [];
    const move = Math.sign(RANK[after] - RANK[before]) as -1 | 0 | 1;
    return [{ dimension: dim, before, after, move, sets: move > 0 ? setsOn(dim) : 0 }];
  });
  return { kind: found.kind, previous, rows };
}
