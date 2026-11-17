// The pilot reports' case side (Matt, 17 Nov, pre-pilot audit M6): interviews by case and week, the post-case survey,
// sign-ups per week and activation. Pure: case-side-load.ts reads the rows (test clubs and the evaluation accounts left
// out), these count them. Weeks start on Monday (UTC) and are named by that Monday.
export type CaseSessionRow = { userId: string; caseId: string; status: 'active' | 'completed' | 'abandoned'; startedAt: Date; completedAt: Date | null };
export type RatingRow = { caseId: string; realism: number; usefulness: number };
export type CommentRow = { at: Date; text: string; where: string };
export type StudentRow = { id: string; signedUpAt: Date };
// The first time each student did each thing (null: never).
export type FirstsRow = { userId: string; planAt: Date | null; setAt: Date | null; fullCaseAt: Date | null };

const DAY = 86_400_000;
export const ACTIVATION_DAYS = 7;

export function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return new Date(x.getTime() - ((x.getUTCDay() + 6) % 7) * DAY);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const weekLabel = (monday: Date) => `${MONTHS[monday.getUTCMonth()]} ${monday.getUTCDate()}`;

// Every week from the one holding `from` to the one holding `to`.
export function weeksBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let w = weekStart(from); w <= to; w = new Date(w.getTime() + 7 * DAY)) out.push(w);
  return out;
}

// Interviews started in each week, by case: how many, and how they stand now. "Not finished" is still open (an
// interview left mid-case keeps that status until its time runs out and it's ended).
export function interviewsByCaseAndWeek(rows: CaseSessionRow[], title: (caseId: string) => string) {
  const keyOf = (r: CaseSessionRow) => `${weekStart(r.startedAt).getTime()}|${r.caseId}`;
  const groups = new Map<string, CaseSessionRow[]>();
  for (const r of rows) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);
  return [...groups.entries()]
    .map(([k, rs]) => ({ week: new Date(Number(k.split('|')[0])), caseId: k.split('|')[1], rs }))
    .sort((a, b) => b.week.getTime() - a.week.getTime() || title(a.caseId).localeCompare(title(b.caseId)))
    .map(({ week, caseId, rs }) => ({
      week: weekLabel(week), case: title(caseId), started: rs.length,
      completed: rs.filter(r => r.status === 'completed').length,
      abandoned: rs.filter(r => r.status === 'abandoned').length,
      notFinished: rs.filter(r => r.status === 'active').length,
    }));
}

// The post-case survey: answers, averages and the spread of each 1–5 rating, overall and by case.
export function surveySummary(rows: RatingRow[], title: (caseId: string) => string) {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const spread = (xs: number[]) => [1, 2, 3, 4, 5].map(n => xs.filter(x => x === n).length);
  const line = (rs: RatingRow[]) => ({
    answers: rs.length, realism: avg(rs.map(r => r.realism)), usefulness: avg(rs.map(r => r.usefulness)),
    realismSpread: spread(rs.map(r => r.realism)), usefulnessSpread: spread(rs.map(r => r.usefulness)),
  });
  const byCase = [...new Set(rows.map(r => r.caseId))].map(c => ({ case: title(c), ...line(rows.filter(r => r.caseId === c)) }))
    .sort((a, b) => b.answers - a.answers);
  return { all: line(rows), byCase };
}

export function signUpsByWeek(students: StudentRow[], weeks: Date[]) {
  return weeks.map(w => ({
    week: weekLabel(w),
    signUps: students.filter(s => s.signedUpAt >= w && s.signedUpAt < new Date(w.getTime() + 7 * DAY)).length,
  }));
}

// Activation (Matt, 17 Nov): within 7 days of signing up, the student gets a plan and completes one drill set or one
// full case (not the 7-minute demo). By sign-up week; students signed up under 7 days ago and not yet active are
// "still in their first week", not counted as failures.
export function activated(s: StudentRow, f: FirstsRow | undefined): boolean {
  if (!f) return false;
  const by = s.signedUpAt.getTime() + ACTIVATION_DAYS * DAY;
  const within = (d: Date | null) => d !== null && d.getTime() <= by;
  return within(f.planAt) && (within(f.setAt) || within(f.fullCaseAt));
}
export function activationByWeek(students: StudentRow[], firsts: FirstsRow[], weeks: Date[], now: Date) {
  const of = new Map(firsts.map(f => [f.userId, f]));
  return weeks.map(w => {
    const cohort = students.filter(s => s.signedUpAt >= w && s.signedUpAt < new Date(w.getTime() + 7 * DAY));
    const active = cohort.filter(s => activated(s, of.get(s.id)));
    const pending = cohort.filter(s => !active.includes(s) && now.getTime() - s.signedUpAt.getTime() < ACTIVATION_DAYS * DAY);
    const decided = cohort.length - pending.length;
    return { week: weekLabel(w), signedUp: cohort.length, activated: active.length, firstWeek: pending.length, rate: decided ? active.length / decided : null };
  });
}
