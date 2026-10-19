// Picking the next case (docs/prd-drills.md "Picking the next case"). Pure
// code. The three rules are relaxed one at a time until a case qualifies, so
// a small library (one case today) still gets a suggestion and never loops:
//   1. a case type whose main skill area is the area of the most recently
//      Practiced or Mastered prescribed skill;
//   2. the student's last tier, or one higher if that case met the bar
//      (no dimension at needs_work, at least half strong);
//   3. a case the student hasn't taken.
// When every case has been taken, the one taken longest ago is offered again
// as a retake. No cases at all: no suggestion.
import type { CaseType } from '@/lib/case-types';
import { DRILLS_CONFIG } from '../config';

export interface LibraryCase { id: string; title: string; case_type: CaseType | null; tier: 1 | 2 | 3 }
export interface TakenCase { case_id: string; completed_at: Date; tier: number | null; rubric: Record<string, string> | null }

export interface NextCase {
  case_id: string;
  title: string;
  retake: boolean;
  // Which rules the pick satisfies, for the card's reason and analytics.
  matched: { area: boolean; tier: boolean };
}

export const DIFFICULTY_TIER = { easy: 1, medium: 2, hard: 3 } as const;

// "Meeting the bar" for a tier (Matt, 2026-10-11).
export function metTheBar(rubric: Record<string, string> | null): boolean {
  if (!rubric) return false;
  const ratings = Object.values(rubric);
  if (ratings.length === 0 || ratings.includes('needs_work')) return false;
  return ratings.filter(r => r === 'strong').length * 2 >= ratings.length;
}

export function pickNextCase(library: LibraryCase[], taken: TakenCase[], focusArea: string | null): NextCase | null {
  if (library.length === 0) return null;
  const areaOf = DRILLS_CONFIG.rules.case_type_to_skill_area as Record<string, string>;
  const takenIds = new Set(taken.map(t => t.case_id));
  const last = [...taken].sort((a, b) => b.completed_at.getTime() - a.completed_at.getTime())[0];
  const targetTier = last?.tier ? Math.min(3, last.tier + (metTheBar(last.rubric) ? 1 : 0)) : null;
  const areaOk = (c: LibraryCase) => focusArea !== null && c.case_type !== null && areaOf[c.case_type] === focusArea;
  const tierOk = (c: LibraryCase) => targetTier === null || c.tier === targetTier;

  const fresh = library.filter(c => !takenIds.has(c.id));
  for (const [needArea, needTier] of [[true, true], [false, true], [true, false], [false, false]] as const) {
    const hit = fresh.find(c => (!needArea || areaOk(c)) && (!needTier || tierOk(c)));
    if (hit) return { case_id: hit.id, title: hit.title, retake: false, matched: { area: areaOk(hit), tier: tierOk(hit) } };
  }
  // Everything taken: offer the case taken longest ago.
  const lastTaken = new Map<string, number>();
  for (const t of taken) lastTaken.set(t.case_id, Math.max(lastTaken.get(t.case_id) ?? 0, t.completed_at.getTime()));
  const oldest = [...library].sort((a, b) => (lastTaken.get(a.id) ?? 0) - (lastTaken.get(b.id) ?? 0))[0];
  return { case_id: oldest.id, title: oldest.title, retake: true, matched: { area: areaOk(oldest), tier: tierOk(oldest) } };
}
