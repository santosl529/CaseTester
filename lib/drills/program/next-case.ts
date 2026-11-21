// Picking the next case (docs/prd-drills.md "Picking the next case"). Pure
// code. The three rules are relaxed one at a time until a case qualifies, so
// a small library (one case today) still gets a suggestion and never loops:
//   1. a case type whose main skill area is the area of the most recently
//      Practiced or Mastered prescribed skill;
//   2. the student's last tier, or one higher if that case met the bar
//      (no dimension at needs_work, at least half strong);
//   3. a case the student hasn't taken.
// Never a retake (Matt, 15 Nov, proposal §2.8): when every case has been
// taken, the card says so and the student chooses one to retake from Cases
// (`retake: true`, no case). No cases at all: no suggestion.
import type { CaseType } from '@/lib/case-types';
import { loadCases } from '@/lib/cases/loader';
import { LISTED_CASE_IDS } from '@/lib/cases/listed';
import { DRILLS_CONFIG, getSkill } from '../config';

export interface LibraryCase { id: string; title: string; case_type: CaseType | null; tier: 1 | 2 | 3 }
export interface TakenCase { case_id: string; completed_at: Date; tier: number | null; rubric: Record<string, string> | null }

export interface NextCase {
  // null when every case has been taken (`retake`).
  case_id: string | null;
  title: string | null;
  retake: boolean;
  // Which rules the pick satisfies, for the card's reason and analytics.
  matched: { area: boolean; tier: boolean };
}

export const DIFFICULTY_TIER = { easy: 1, medium: 2, hard: 3 } as const;

// The cases a next-case card may recommend: only the full cases students can
// start from Cases (LISTED_CASE_IDS) — never the 7-minute demo or an unlisted
// case such as Aldermoor, which every case file in /cases would include
// (bug found 15 Nov; Matt: fix it with shadow mode).
export function caseLibrary(): LibraryCase[] {
  const listed = new Set(LISTED_CASE_IDS);
  return loadCases().filter(c => listed.has(c.id))
    .map(c => ({ id: c.id, title: c.title, case_type: c.caseType ?? null, tier: DIFFICULTY_TIER[c.difficulty] }));
}

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
  // Everything taken: no pick; the student chooses a retake.
  return { case_id: null, title: null, retake: true, matched: { area: false, tier: false } };
}

// The skill area practiced most (completed sets by their skill's area), the
// latest set breaking a tie; no sets: no preference (store.ts practicedArea).
export function mostPracticedArea(sets: { skill: string | undefined; at: Date | null }[]): string | null {
  const byArea = new Map<string, { n: number; latest: number }>();
  for (const s of sets) {
    if (!s.skill) continue;
    const area = getSkill(s.skill).area;
    const prior = byArea.get(area) ?? { n: 0, latest: 0 };
    byArea.set(area, { n: prior.n + 1, latest: Math.max(prior.latest, s.at?.getTime() ?? 0) });
  }
  return [...byArea].sort((a, b) => b[1].n - a[1].n || b[1].latest - a[1].latest)[0]?.[0] ?? null;
}
