// The training program against the database (docs/prd-drills.md "Training
// program", "Training home"): onboarding, the active program and its plan,
// today's workout (built once per local day), weekly targets and milestones,
// and the next-case card. The rules live in ./plan.ts, ./workout.ts and
// ./next-case.ts; this module loads, saves and logs.
import 'server-only';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  caseResults, drillSets, prescriptions, sessions, skillStateEvents, studentDrillSettings, studentProfiles, studentPrograms,
  workouts,
} from '@/db/schema';
import { loadCases } from '@/lib/cases/loader';
import { DRILLS_CONFIG, getDrill, getMistakeTag, getSkill } from '../config';
import { logDrillEvent } from '../events';
import { isLiveDrill } from '../live';
import type { CaseResultPayload } from '../case-result';
import type { ProgressMap } from '../progress/engine';
import { createPlanPrescription, loadProgress, loadTiers, progressContext, type PendingEvent } from '../progress/store';
import {
  assignTrack, buildPlan, currentDay, currentWeek, daysBetween, localDate, offerSprint, type CasesDone, type Plan,
  type PlanWeek, type Track,
} from './plan';
import {
  buildWorkout, missedMilestoneSkills, planPrescriptionSkill, planReason, weekMilestones, type OpenPrescription,
  type WorkoutBlock,
} from './workout';
import { DIFFICULTY_TIER, pickNextCase, type NextCase } from './next-case';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;
export type ProgramRow = typeof studentPrograms.$inferSelect;
type WorkoutRow = typeof workouts.$inferSelect;

const programs = DRILLS_CONFIG.programs;

// ------------------------------------------------------------- the clock

const validZone = (tz: string | null | undefined) => {
  if (!tz) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
};

export async function studentToday(studentId: string, now = new Date()) {
  const [p] = await db.select({ timezone: studentProfiles.timezone }).from(studentProfiles).where(eq(studentProfiles.userId, studentId));
  return { timezone: p?.timezone ?? null, today: localDate(p?.timezone, now) };
}

// ------------------------------------------------------------- onboarding

export const OnboardingSchema = z.object({
  wants_plan: z.boolean(),
  interview_date: z.iso.date().nullable().default(null),
  cases_done: z.enum(['0', '1-5', '6+']),
  availability: z.string().optional(),
  // Captured from the browser, never asked.
  timezone: z.string().max(64).optional(),
});

export async function activeProgram(x: Exec, studentId: string): Promise<ProgramRow | null> {
  const [row] = await x.select().from(studentPrograms)
    .where(and(eq(studentPrograms.studentId, studentId), eq(studentPrograms.status, 'active')));
  return row ?? null;
}

const workoutsPerWeek = (availability?: string) =>
  (programs.availability.find(a => a.id === availability) ?? programs.availability.find(a => a.default)!).workouts_per_week;

export async function onboard(studentId: string, input: z.infer<typeof OnboardingSchema>) {
  const timezone = validZone(input.timezone);
  if (timezone) await db.update(studentProfiles).set({ timezone }).where(eq(studentProfiles.userId, studentId));
  const { today } = await studentToday(studentId);
  if (input.interview_date && input.interview_date < today) throw new ProgramError('bad_request', 'The interview date is in the past.');
  const track = assignTrack({ wants_plan: input.wants_plan, cases_done: input.cases_done as CasesDone, interview_date: input.interview_date }, today);
  const row = await openProgram(studentId, {
    track, startDate: today, interviewDate: input.interview_date, workoutsPerWeek: workoutsPerWeek(input.availability),
    casesDone: input.cases_done,
  }, 'onboarding');
  await logDrillEvent(studentId, 'onboarding_completed', {
    track_suggested: track, interview_days_out: input.interview_date ? daysBetween(today, input.interview_date) : null,
    cases_done: input.cases_done, workouts_per_week: row.workoutsPerWeek, wants_plan: input.wants_plan,
  });
  return { track, offer_sprint: track === 'self_directed' && offerSprint(input.interview_date, today) };
}

// Opens a program, closing the active one ("switched"). Skill states are kept.
async function openProgram(studentId: string, p: {
  track: Track; startDate: string; interviewDate: string | null; workoutsPerWeek: number; casesDone: string | null;
}, reason: string): Promise<ProgramRow> {
  const { row, switched } = await db.transaction(async tx => {
    const closed = await tx.update(studentPrograms).set({ status: 'switched', endedAt: new Date() })
      .where(and(eq(studentPrograms.studentId, studentId), eq(studentPrograms.status, 'active'))).returning({ id: studentPrograms.id });
    const [row] = await tx.insert(studentPrograms).values({
      studentId, track: p.track, planVersion: programs.version, startDate: p.startDate, interviewDate: p.interviewDate,
      workoutsPerWeek: p.workoutsPerWeek, casesDone: p.casesDone,
    }).returning();
    // Today's workout belonged to the old plan; tomorrow's is built from the new one.
    await tx.update(workouts).set({ status: 'expired' })
      .where(and(eq(workouts.studentId, studentId), eq(workouts.date, p.startDate), inArray(workouts.status, ['planned'])));
    return { row, switched: closed.length > 0 };
  });
  await logDrillEvent(studentId, switched ? 'program_switched' : 'program_assigned', { track: row.track, plan_version: row.planVersion, reason });
  return row;
}

export const ChangeProgramSchema = z.object({
  track: z.enum(['foundations', 'standard', 'sprint', 'self_directed']).optional(),
  interview_date: z.iso.date().nullable().optional(),
  availability: z.string().optional(),
});

// PUT /program: switch track, or change the interview date or availability.
// The plan is rebuilt from today. A new interview date 14 or fewer days away
// switches plan tracks to Sprint; self-directed students are only offered it.
export async function changeProgram(studentId: string, input: z.infer<typeof ChangeProgramSchema>) {
  const current = await activeProgram(db, studentId);
  if (!current) throw new ProgramError('no_program', 'Set up your training first.');
  const { today } = await studentToday(studentId);
  const interviewDate = input.interview_date === undefined ? current.interviewDate : input.interview_date;
  if (interviewDate && interviewDate < today) throw new ProgramError('bad_request', 'The interview date is in the past.');
  let track: Track = input.track ?? current.track;
  if (!input.track && input.interview_date !== undefined && track !== 'self_directed') {
    track = assignTrack({ wants_plan: true, cases_done: (current.casesDone ?? '1-5') as CasesDone, interview_date: interviewDate }, today);
    if (track !== 'sprint' && current.track !== 'sprint') track = current.track;
  }
  if (track === 'sprint' && !interviewDate) throw new ProgramError('bad_request', 'Sprint needs an interview date.');
  await openProgram(studentId, {
    track, startDate: today, interviewDate, workoutsPerWeek: input.availability ? workoutsPerWeek(input.availability) : (current.workoutsPerWeek ?? workoutsPerWeek()),
    casesDone: current.casesDone,
  }, input.track ? 'student_switched' : 'settings_changed');
  return programView(studentId);
}

// After the full diagnostic: a new Standard student scoring below 50% moves
// to Foundations (PRD "Tracks": "diagnostic overall score below 50%"). A
// student who chose or switched their track keeps it.
// Returns true when it moved the student.
export async function afterDiagnostic(studentId: string, overall: number): Promise<boolean> {
  if (overall >= programs.assignment.foundations_below_diagnostic - 1e-9) return false;
  const rows = await db.select().from(studentPrograms).where(eq(studentPrograms.studentId, studentId));
  const active = rows.find(r => r.status === 'active');
  if (!active || active.track !== 'standard' || rows.length !== 1) return false;
  await openProgram(studentId, {
    track: 'foundations', startDate: active.startDate, interviewDate: active.interviewDate,
    workoutsPerWeek: active.workoutsPerWeek ?? workoutsPerWeek(), casesDone: active.casesDone,
  }, 'diagnostic');
  return true;
}

export class ProgramError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

// ------------------------------------------------------------- the plan

export const planOf = (p: ProgramRow): Plan => buildPlan({
  track: p.track, start_date: p.startDate, interview_date: p.interviewDate, workouts_per_week: p.workoutsPerWeek ?? workoutsPerWeek(),
});

async function openRx(x: Exec, studentId: string): Promise<OpenPrescription[]> {
  const rows = await x.select().from(prescriptions)
    .where(and(eq(prescriptions.studentId, studentId), eq(prescriptions.status, 'open')));
  return rows.map(r => ({ id: r.id, skill_id: r.skillId, priority: r.priority, source: r.sourceType, reason: r.reasonText, created_at: r.createdAt }));
}

export async function programView(studentId: string, now = new Date()) {
  const program = await activeProgram(db, studentId);
  if (!program) return null;
  const { today } = await studentToday(studentId, now);
  const plan = planOf(program);
  const week = currentWeek(plan, today);
  const day = currentDay(plan, today);
  return {
    track: program.track, start_date: program.startDate, interview_date: program.interviewDate,
    interview_days_out: program.interviewDate ? daysBetween(today, program.interviewDate) : null,
    workouts_per_week: program.workoutsPerWeek, today, plan, week, day,
    total_weeks: plan.kind === 'weeks' ? plan.weeks.length - 1 : null,
    sprint_day_index: plan.kind === 'days' ? plan.days.findIndex(d => d.date === today) + 1 : null,
  };
}

// ------------------------------------------------------------- today's workout

const DAY_START = (d: string) => new Date(`${d}T00:00:00Z`);

// Builds today's workout once (one row per student per local date), creating
// the plan's own prescription first when the week's focus has none.
export async function todayWorkout(studentId: string, now = new Date()): Promise<WorkoutRow | null> {
  const program = await activeProgram(db, studentId);
  if (!program || program.track === 'self_directed') return null;
  const { today } = await studentToday(studentId, now);
  const [existing] = await db.select().from(workouts).where(and(eq(workouts.studentId, studentId), eq(workouts.date, today)));
  if (existing && existing.status !== 'expired') return existing;

  const plan = planOf(program);
  const week = currentWeek(plan, today);
  const day = currentDay(plan, today);
  // Week 0 and Sprint day 1 are the diagnostic and the baseline case.
  if ((plan.kind === 'weeks' && week?.week === 0) || (plan.kind === 'days' && (!day || day.workout_minutes === 0))) return null;

  const built = await db.transaction(async tx => {
    // Older unfinished workouts close at midnight.
    await tx.update(workouts).set({ status: 'expired' })
      .where(and(eq(workouts.studentId, studentId), inArray(workouts.status, ['planned', 'in_progress'])));
    const progress = await loadProgress(tx, studentId);
    const ctx = await progressContext(tx, studentId, now);
    let rx = await openRx(tx, studentId);
    const planSkill = planPrescriptionSkill(week, progress, rx, isLiveDrill);
    const events: PendingEvent[] = [];
    if (planSkill && week) {
      events.push(...await createPlanPrescription(tx, studentId, planSkill, programs.plan_prescription_priority, planReason(planSkill, week)));
      rx = await openRx(tx, studentId);
    }
    const [settings] = await tx.select({ m: studentDrillSettings.timeMultiplier }).from(studentDrillSettings).where(eq(studentDrillSettings.studentId, studentId));
    const workout = buildWorkout({
      track: program.track as Exclude<Track, 'self_directed'>, week, sprint_day: day,
      interview_days_out: program.interviewDate ? daysBetween(today, program.interviewDate) : null,
      progress, tiers: await loadTiers(tx, studentId), prescriptions: rx,
      missed_milestone_skills: plan.kind === 'weeks' ? missedMilestoneSkills(week, plan.weeks, progress) : [],
      time_multiplier: settings?.m ?? 1, ctx,
    });
    const values = { studentId, programId: program.id, programWeek: week?.week ?? null, date: today, targetMinutes: workout.target_minutes, blocks: workout.blocks, status: 'planned' as const };
    if (existing) {
      const [row] = await tx.update(workouts).set({ ...values, createdAt: new Date() }).where(eq(workouts.id, existing.id)).returning();
      return { row, workout, events };
    }
    const [row] = await tx.insert(workouts).values(values).onConflictDoNothing().returning();
    return { row, workout, events };
  });
  for (const e of built.events) await logDrillEvent(studentId, e.type, e.props);
  if (!built.row) {
    const [raced] = await db.select().from(workouts).where(and(eq(workouts.studentId, studentId), eq(workouts.date, today)));
    return raced ?? null;
  }
  await logDrillEvent(studentId, 'workout_built', {
    workout_id: built.row.id, blocks: built.workout.blocks.map(b => ({ slot: b.slot, drill_id: b.drill_id, skill_id: b.skill_id })),
    minutes_target: built.workout.target_minutes,
  });
  return built.row;
}

// Called when a set finishes (lib/drills/grading/jobs.ts finalizeSet): marks
// the workout complete once every block's set is done.
export async function markWorkoutProgress(tx: Tx, workoutId: string): Promise<{ studentId: string; props: Record<string, unknown> } | null> {
  const [w] = await tx.select().from(workouts).where(eq(workouts.id, workoutId)).for('update');
  if (!w || w.status === 'completed' || w.status === 'expired') return null;
  const blocks = w.blocks as WorkoutBlock[];
  const ids = blocks.map(b => b.set_id).filter((id): id is string => Boolean(id));
  const sets = ids.length ? await tx.select().from(drillSets).where(inArray(drillSets.id, ids)) : [];
  const done = sets.filter(s => s.status === 'completed');
  if (done.length < blocks.length) {
    if (w.status === 'planned') await tx.update(workouts).set({ status: 'in_progress' }).where(eq(workouts.id, w.id));
    return null;
  }
  const now = new Date();
  await tx.update(workouts).set({ status: 'completed', completedAt: now }).where(eq(workouts.id, w.id));
  const minutes = done.reduce((s, x) => s + ((x.completedAt?.getTime() ?? 0) - x.startedAt.getTime()), 0) / 60_000;
  return { studentId: w.studentId, props: { workout_id: w.id, blocks: blocks.length, minutes_target: w.targetMinutes, minutes_actual: Math.round(minutes) } };
}

export interface BlockStatus extends WorkoutBlock { status: 'todo' | 'in_progress' | 'grading' | 'done'; score: number | null }

export async function workoutWithStatus(w: WorkoutRow): Promise<{ id: string; status: WorkoutRow['status']; target_minutes: number; blocks: BlockStatus[] }> {
  const blocks = w.blocks as WorkoutBlock[];
  const ids = blocks.map(b => b.set_id).filter((id): id is string => Boolean(id));
  const sets = ids.length ? await db.select().from(drillSets).where(inArray(drillSets.id, ids)) : [];
  return {
    id: w.id, status: w.status, target_minutes: w.targetMinutes,
    blocks: blocks.map(b => {
      const s = sets.find(x => x.id === b.set_id);
      const status = !s ? 'todo' : s.status === 'completed' ? 'done' : s.status === 'grading' ? 'grading' : s.status === 'expired' ? 'todo' : 'in_progress';
      return { ...b, set_id: s?.status === 'expired' ? null : b.set_id, status, score: s?.setScore ?? null };
    }),
  };
}

// ------------------------------------------------------------- the week

// Cases a student completed, from the case product's sessions (case results
// only arrive once the case grader sends them).
async function completedCases(studentId: string) {
  const rows = await db.select({ caseId: sessions.caseId, completedAt: sessions.completedAt }).from(sessions)
    .where(and(eq(sessions.userId, studentId), eq(sessions.status, 'completed'), isNotNull(sessions.completedAt)));
  const results = await db.select().from(caseResults).where(eq(caseResults.studentId, studentId));
  return rows.map(r => {
    const graded = results.filter(c => c.caseId === r.caseId).sort((a, b) => Math.abs(a.completedAt.getTime() - r.completedAt!.getTime()) - Math.abs(b.completedAt.getTime() - r.completedAt!.getTime()))[0];
    return { case_id: r.caseId, completed_at: r.completedAt!, tier: graded?.difficultyTier ?? null, rubric: (graded?.rubricScores as Record<string, string> | undefined) ?? null };
  });
}

export async function weekStatus(studentId: string, program: ProgramRow, week: PlanWeek, plan: Plan, progress: ProgressMap, timezone: string | null) {
  if (plan.kind !== 'weeks') return null;
  const inWeek = (d: Date) => { const l = localDate(timezone, d); return l >= week.start && l <= week.end; };
  const done = await db.select({ date: workouts.date }).from(workouts)
    .where(and(eq(workouts.studentId, studentId), eq(workouts.status, 'completed'), gte(workouts.date, week.start)));
  const cases = (await completedCases(studentId)).filter(c => inWeek(c.completed_at));
  const rx = await openRx(db, studentId);
  // "3 skills with a tier 3 pass" (Week 5): skills with a passing tier 3 set this week.
  const t3 = await db.select({ drillId: drillSets.drillId, focus: drillSets.focusSkill, completedAt: drillSets.completedAt }).from(drillSets)
    .where(and(eq(drillSets.studentId, studentId), eq(drillSets.tier, 3), eq(drillSets.passed, true), gte(drillSets.completedAt, DAY_START(week.start))));
  const tier3Skills = new Set(t3.flatMap(s => s.focus ? [s.focus] : getDrill(s.drillId).primary_skills));
  const milestone = weekMilestones(week, plan.weeks, { progress, prescribed_skills: rx.map(r => r.skill_id), tier3_passes: tier3Skills.size, cases_this_week: cases.length });
  const milestoneSkills = [...new Set(week.milestones.flatMap(m => (m.type === 'skills' ? m.skills : [])).concat(milestone.skills))];
  return {
    workouts: { done: done.filter(d => d.date <= week.end).length, target: week.workouts_target },
    cases: { done: cases.length, target: week.cases_target },
    milestone_met: milestone.met,
    milestone_skills: milestoneSkills.map(id => ({ id, name: getSkill(id).name, state: progress.get(id)?.state ?? 'not_started' })),
  };
}

// Logs program_week_started once per new week.
export async function noteWeekRollover(program: ProgramRow, week: PlanWeek | null, metPrevious: boolean | null) {
  if (!week || week.week <= program.currentWeek) return;
  const [updated] = await db.update(studentPrograms).set({ currentWeek: week.week })
    .where(and(eq(studentPrograms.id, program.id), eq(studentPrograms.currentWeek, program.currentWeek))).returning({ id: studentPrograms.id });
  if (updated) await logDrillEvent(program.studentId, 'program_week_started', { week: week.week, milestones_met: metPrevious });
}

// ------------------------------------------------------------- the next case

// The area of the most recently Practiced or Mastered prescribed skill.
async function retestArea(studentId: string): Promise<string | null> {
  const rows = await db.select({ skillId: skillStateEvents.skillId }).from(skillStateEvents)
    .where(and(eq(skillStateEvents.studentId, studentId), inArray(skillStateEvents.toState, ['practiced', 'mastered'])))
    .orderBy(desc(skillStateEvents.createdAt)).limit(10);
  if (!rows.length) return null;
  const prescribed = new Set((await db.select({ s: prescriptions.skillId }).from(prescriptions).where(eq(prescriptions.studentId, studentId))).map(r => r.s));
  const hit = rows.find(r => prescribed.has(r.skillId));
  return hit ? getSkill(hit.skillId).area : null;
}

export async function nextCaseFor(studentId: string): Promise<NextCase | null> {
  const library = loadCases().map(c => ({ id: c.id, title: c.title, case_type: c.caseType ?? null, tier: DIFFICULTY_TIER[c.difficulty] }));
  return pickNextCase(library, await completedCases(studentId), await retestArea(studentId));
}

// ------------------------------------------------------------- evidence

// The latest quote behind a skill's mistakes: from a case finding if there is one.
export async function latestEvidence(studentId: string, skillId: string): Promise<string | null> {
  const rows = await db.select({ findings: caseResults.findings }).from(caseResults)
    .where(eq(caseResults.studentId, studentId)).orderBy(desc(caseResults.completedAt)).limit(5);
  for (const r of rows) {
    const f = (r.findings as CaseResultPayload['findings']).find(x => getMistakeTag(x.tag)?.skill === skillId);
    if (f) return f.evidence;
  }
  return null;
}

