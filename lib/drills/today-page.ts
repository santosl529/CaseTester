// What the Today page writes from the data (Matt, 13 Nov). Pure, so it's
// tested (tests/drills/today-page.test.ts).
import { STATE_LABEL } from './progress/dashboard';

export const lowerFirst = (name: string) => (/^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name);

// "5 mistakes" when the mistake's name just repeats the skill's ("Arithmetic ·
// arithmetic error"), else the mistake by name. Counted over the last 30 days.
export function mistakeLine(w: { skill_name: string; mistake: string; count: number }) {
  const repeats = w.mistake.toLowerCase().includes(w.skill_name.toLowerCase().split(' ')[0]);
  return repeats
    ? `${w.count} ${w.count === 1 ? 'mistake' : 'mistakes'} in the last 30 days`
    : `${w.mistake}, ${w.count}× in the last 30 days`;
}

// "9 skills in focus this week · 8 learning, 1 not started", furthest along first.
const LADDER = ['validated', 'mastered', 'practiced', 'recognizes', 'learning', 'not_started'] as const;
export function focusLine(states: string[]) {
  const counts = LADDER.map(st => [st, states.filter(x => x === st).length] as const).filter(([, n]) => n > 0);
  return `${states.length} ${states.length === 1 ? 'skill' : 'skills'} in focus this week · ${counts.map(([st, n]) => `${n} ${STATE_LABEL[st].toLowerCase()}`).join(', ')}`;
}


// "Score 90% · pass mark 80%" (Matt, 13 Nov), from a set's score and its
// drill's pass bar.
export const scoreLine = (score: number, passBar: number) => `Score ${Math.round(score * 100)}% · pass mark ${Math.round(passBar * 100)}%`;

// Today's layout once the workout is finished (Matt, 13 Nov): the workout
// becomes a done card, and the set in progress, the quick fix and the extra
// sets go under "Optional", in that order. Before then the set in progress is
// the banner at the top and the order is unchanged.
export type OptionalItem = 'resume' | 'quick_fix' | 'extra';
export function todaySections(input: { workoutDone: boolean; resume: boolean; quickFix: boolean; extra: boolean }): { resumeTop: boolean; optional: OptionalItem[] } {
  if (!input.workoutDone) return { resumeTop: input.resume, optional: [] };
  const optional: OptionalItem[] = [];
  if (input.resume) optional.push('resume');
  if (input.quickFix) optional.push('quick_fix');
  if (input.extra) optional.push('extra');
  return { resumeTop: false, optional };
}

// "How CasePace works" shows in the student's first plan week: week 0 or 1
// of a weekly plan; otherwise (Sprint, Practice on my own) the first 7 days
// since the program started.
const DAY = 86_400_000;
export function isFirstWeek(plan: { kind: 'weeks' | 'days' | 'none'; week: number | null }, startedAt: Date | null, now: Date): boolean {
  if (plan.kind === 'weeks') return (plan.week ?? 0) <= 1;
  return startedAt !== null && now.getTime() - startedAt.getTime() < 7 * DAY;
}
