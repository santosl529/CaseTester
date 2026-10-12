// The training program's plans (docs/prd-drills.md "Training program"):
// track assignment, the six-week plan with compression, and the Sprint day
// plan. Pure code; dates are the student's local calendar dates (YYYY-MM-DD).
import { DRILLS_CONFIG, type Programs } from '../config';

const programs = DRILLS_CONFIG.programs;

export type Track = 'foundations' | 'standard' | 'sprint' | 'self_directed';
export type CasesDone = '0' | '1-5' | '6+';
export type Milestone = Programs['weeks'][number]['milestone'];

// ------------------------------------------------------------- dates

const DAY = 86_400_000;
const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(toUtc(d) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY);

// Today's date in the student's time zone (UTC if unknown or invalid).
export function localDate(timezone: string | null | undefined, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

// ------------------------------------------------------------- tracks

export interface OnboardingAnswers {
  wants_plan: boolean;
  cases_done: CasesDone;
  interview_date: string | null;
  diagnostic_score?: number | null;
}

// First rule that applies (PRD "Tracks"): interview in 14 days or fewer →
// Sprint; no practice cases or a diagnostic below 50% → Foundations;
// otherwise Standard. Students who don't want a plan practice on their own.
export function assignTrack(a: OnboardingAnswers, today: string): Track {
  if (!a.wants_plan) return 'self_directed';
  const a2 = programs.assignment;
  if (a.interview_date && daysBetween(today, a.interview_date) <= a2.sprint_within_days) return 'sprint';
  if (a.cases_done === '0' || (a.diagnostic_score != null && a.diagnostic_score < a2.foundations_below_diagnostic - 1e-9)) return 'foundations';
  return 'standard';
}

// Self-directed students with an interview 14 or fewer days away are offered
// Sprint, never switched to it.
export function offerSprint(interviewDate: string | null, today: string): boolean {
  return interviewDate !== null && daysBetween(today, interviewDate) <= programs.assignment.sprint_within_days && daysBetween(today, interviewDate) >= 0;
}

// ------------------------------------------------------------- six weeks

export interface PlanWeek {
  week: number;                 // 0 = the diagnose day; 1.. = plan weeks
  start: string;
  end: string;
  theme: string;
  source_weeks: number[];       // the PRD weeks this one covers (merged when compressed)
  focus_areas: string[];
  focus_skills: string[];
  milestones: Milestone[];
  cases_target: number;
  workouts_target: number;
  prefer_tier?: number;
  transfer_all?: boolean;
}

export interface SprintDay {
  date: string;
  day: number;                  // 1–7, the PRD's Sprint day this one follows
  activities: Programs['sprint_days'][number]['activities'];
  workout_minutes: number;
  cases: number;
}

export type Plan =
  | { kind: 'weeks'; track: 'foundations' | 'standard'; weeks: PlanWeek[] }
  | { kind: 'days'; track: 'sprint'; days: SprintDay[] }
  | { kind: 'none'; track: 'self_directed' };

export interface PlanInput {
  track: Track;
  start_date: string;
  interview_date: string | null;
  workouts_per_week: number;
}

export function buildPlan(input: PlanInput): Plan {
  if (input.track === 'self_directed') return { kind: 'none', track: 'self_directed' };
  if (input.track === 'sprint') return { kind: 'days', track: 'sprint', days: sprintDays(input.start_date, input.interview_date) };
  return { kind: 'weeks', track: input.track, weeks: sixWeeks(input) };
}

function sixWeeks({ track, start_date, interview_date, workouts_per_week }: PlanInput): PlanWeek[] {
  const t = programs.tracks[track as 'foundations' | 'standard'];
  const source = programs.weeks;
  const week = (w: number, groups: number[]): Omit<PlanWeek, 'week' | 'start' | 'end'> => {
    const ws = groups.map(g => source[g]);
    return {
      theme: ws.map(x => x.theme).join(' + '),
      source_weeks: groups,
      focus_areas: [...new Set(ws.flatMap(x => x.focus_areas))],
      focus_skills: [...new Set(ws.flatMap(x => x.focus_skills))],
      milestones: ws.map(x => x.milestone),
      cases_target: Math.max(...groups.map(g => t.cases_per_week[g])),
      workouts_target: w === 0 ? 0 : workouts_per_week,
      ...(ws.some(x => x.prefer_tier) && { prefer_tier: Math.max(...ws.map(x => x.prefer_tier ?? 0)) }),
      ...(ws.some(x => x.transfer_all) && { transfer_all: true }),
    };
  };

  // Week groups after Week 0: the plan as written, compressed when the
  // interview is 15–41 days away, extended with Readiness weeks beyond 6 weeks.
  const last = t.length_weeks;                          // 6
  let groups: number[][] = Array.from({ length: last }, (_, i) => [i + 1]);
  if (interview_date) {
    const available = Math.floor((daysBetween(start_date, interview_date) - 1) / 7);
    if (available < last) {
      // Keep Week 5 and Week 6; split weeks 1–4 evenly, in order, across the rest.
      const middle = Math.max(0, available - 2);
      const early = [1, 2, 3, 4];
      const split: number[][] = [];
      let i = 0;
      for (let g = 0; g < middle; g++) {
        const size = Math.floor(early.length / middle) + (g < early.length % middle ? 1 : 0);
        split.push(early.slice(i, i + size));
        i += size;
      }
      groups = [...split, [5], [6]];
    } else {
      for (let extra = last; extra < available; extra++) groups.push([6]);
    }
  }

  const out: PlanWeek[] = [{ week: 0, start: start_date, end: start_date, ...week(0, [0]) }];
  groups.forEach((g, i) => {
    const start = addDays(start_date, 1 + 7 * i);
    out.push({ week: i + 1, start, end: addDays(start, 6), ...week(i + 1, g) });
  });
  return out;
}

// The Sprint plan (PRD "Sprint plan"): day 1, then days 2–5 (repeated when
// more than 7 days remain, cut short when fewer), then days 6 and 7, ending
// the day before the interview.
function sprintDays(start: string, interview: string | null): SprintDay[] {
  const total = interview ? daysBetween(start, interview) : programs.tracks.sprint.length_days;
  if (total <= 0) return [];
  const d = programs.sprint_days;
  let order: number[];
  if (total === 1) order = [1];
  else if (total === 2) order = [1, 7];
  else {
    const middle = Array.from({ length: total - 3 }, (_, i) => 2 + (i % 4));
    order = [1, ...middle, 6, 7];
  }
  return order.map((n, i) => ({ date: addDays(start, i), day: n, ...pick(d[n - 1]) }));
}

const pick = ({ activities, workout_minutes, cases }: Programs['sprint_days'][number]) => ({ activities, workout_minutes, cases });

// ------------------------------------------------------------- where we are

export function currentWeek(plan: Plan, today: string): PlanWeek | null {
  if (plan.kind !== 'weeks') return null;
  const found = plan.weeks.find(w => today >= w.start && today <= w.end);
  if (found) return found;
  return today > plan.weeks[plan.weeks.length - 1].end ? plan.weeks[plan.weeks.length - 1] : plan.weeks[0];
}

export function currentDay(plan: Plan, today: string): SprintDay | null {
  if (plan.kind !== 'days') return null;
  return plan.days.find(d => d.date === today) ?? null;
}

export function planFinished(plan: Plan, today: string): boolean {
  if (plan.kind === 'weeks') return today > plan.weeks[plan.weeks.length - 1].end;
  if (plan.kind === 'days') return plan.days.length === 0 || today > plan.days[plan.days.length - 1].date;
  return false;
}
