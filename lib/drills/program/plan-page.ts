// What Your plan shows (Matt, 13 Nov: one job, the schedule). Pure, so the
// rules that hide or show its parts are tested (tests/drills/plan-page.test.ts).

// The line under the title. A completed full case makes the plan's source
// "case" (plan-source.ts), but until case results reach drills
// (CASE_RESULTS_WIRED) the placements still come from the diagnostic or the
// questionnaire, so "Built from your first full case." would be wrong: no line.
const SOURCE = {
  case: 'Built from your first full case.',
  diagnostic: 'Built from your diagnostic.',
  questionnaire: 'Built from your answers. Self-ratings are a rough start, so your first workouts include short checks that adjust where each skill starts. A diagnostic or a full case later makes the plan more accurate.',
} as const;

export function planSourceLine(source: string | null, caseResultsWired: boolean): string | null {
  if (!source || !(source in SOURCE)) return null;
  if (source === 'case' && !caseResultsWired) return null;
  return SOURCE[source as keyof typeof SOURCE];
}

// The six-week track: weeks before this one are done, this one is current.
export type SegmentState = 'done' | 'current' | 'upcoming';
export function segmentState(week: number, current: number | null): SegmentState {
  if (current === null) return 'upcoming';
  return week < current ? 'done' : week === current ? 'current' : 'upcoming';
}

// A schedule cell: past and current weeks show what was done against the
// target ("2 / 3", met once it reaches it); future weeks show the target.
// Over the target it's "✓ 32 done" rather than "32 / 0"; a past week below
// its target is "0 / 3 · missed" (Matt, 13 Nov). The ✓ is drawn by the view.
export type Cell = { text: string; met: boolean; missed: boolean };
export function scheduleCell(week: number, current: number | null, target: number, done: number | undefined): Cell {
  const state = segmentState(week, current);
  if (state === 'upcoming') return { text: String(target), met: false, missed: false };
  const n = done ?? 0;
  if (n > target) return { text: `${n} done`, met: true, missed: false };
  if (state === 'done' && n < target) return { text: `${n} / ${target} · missed`, met: false, missed: true };
  return { text: `${n} / ${target}`, met: target > 0 && n >= target, missed: false };
}

// "Your first workout": only until a workout has been completed, and only
// while today's workout has a set to start.
export function showFirstWorkout(anyWorkoutDone: boolean, blocks: number, next: number): boolean {
  return !anyWorkoutDone && blocks > 0 && next >= 0;
}
