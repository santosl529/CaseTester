// The training home (docs/prd-drills.md "Training home", "Practice on my
// own"): everything the home screen shows, for plan students and for
// self-directed ones.
import 'server-only';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillSets, skillStateEvents, studentDrillSettings } from '@/db/schema';
import { getDrill, getSkill } from '../config';
import { logDrillEvent } from '../events';
import { newProgress, stateRank, type SkillStateName } from '../progress/engine';
import { loadProgress, loadTiers, progressContext } from '../progress/store';
import { openPrescriptions, skillProfile } from '../progress/profile';
import { inProgressSet } from '../sets/service';
import { DIAGNOSTIC_PARTS, diagnosticView } from './diagnostic-store';
import { hasSeenLesson, introLesson, lessonForSkill } from './lessons-store';
import { INTRO_LESSON_ID } from '../lessons';
import { blockFor, buildWorkout, planPrescriptionSkill, type WorkoutBlock } from './workout';
import { buildPlan, daysBetween, localDate } from './plan';
import { pendingChecks, planFromCase, type PlanSource } from './plan-source';
import { healDiagnostic } from '../grading/jobs';
import { isLiveDrill } from '../live';
import {
  activeProgram, latestEvidence, nextCaseFor, noteWeekRollover, programView, studentToday, todayWorkout, weekStatus,
  workoutWithStatus,
} from './store';

const DAY = 86_400_000;

async function weakestSkill(studentId: string, profile: Awaited<ReturnType<typeof skillProfile>>) {
  const top = profile.top_mistakes[0];
  if (!top) return null;
  const skillId = profile.areas.flatMap(a => a.skills).find(s => s.name === top.skill_name)?.id ?? null;
  return { skill_name: top.skill_name, mistake: top.label, count: top.count, evidence: skillId ? await latestEvidence(studentId, skillId) : null };
}

export async function homeView(studentId: string, now = new Date()) {
  if (!(await activeProgram(db, studentId))) return { kind: 'onboarding' as const };
  // A diagnostic part that finished unrecorded, and a completed case, both
  // make the plan before the home is built.
  await healDiagnostic(studentId);
  await planFromCase(studentId);
  const program = (await activeProgram(db, studentId))!;
  // No plan yet: the home offers the diagnostic, the questionnaire or a case.
  // A plan the student hasn't opened yet: the home leads with it.
  const plan = { source: program.planSource as PlanSource | null, seen: program.planSeenAt !== null };
  const [view, current, profile] = await Promise.all([programView(studentId, now), inProgressSet(studentId), skillProfile(studentId, now)]);
  const resume = current && current.source !== 'diagnostic' ? { set_id: current.id, drill_name: getDrill(current.drillId).name } : null;
  const weakest = await weakestSkill(studentId, profile);
  const d = await diagnosticView(studentId);
  const diagnostic = { status: d?.status ?? 'not_started', done: d?.done ?? 0, of: DIAGNOSTIC_PARTS };

  if (program.track === 'self_directed') return { kind: 'self_directed' as const, resume, weakest, diagnostic, plan, ...(await selfDirected(studentId, profile, view!, now)) };

  const progress = await loadProgress(db, studentId);
  const { timezone } = await studentToday(studentId, now);
  const week = view!.week;
  const status = week ? await weekStatus(studentId, program, week, view!.plan, progress, timezone) : null;
  if (week && view!.plan.kind === 'weeks') {
    const prev = view!.plan.weeks.find(w => w.week === week.week - 1);
    const prevStatus = prev ? await weekStatus(studentId, program, prev, view!.plan, progress, timezone) : null;
    await noteWeekRollover(program, week, prevStatus?.milestone_met ?? null);
  }
  const workoutRow = await todayWorkout(studentId, now);
  const workout = workoutRow ? await workoutWithStatus(workoutRow) : null;
  // Foundations: the lesson opens before the first set of each skill.
  const nextBlock = workout?.blocks.find(b => b.status === 'todo');
  let lessonFirst = false;
  if (program.track === 'foundations' && nextBlock) {
    const lesson = await lessonForSkill(nextBlock.skill_id);
    lessonFirst = Boolean(lesson && !(await hasSeenLesson(studentId, lesson.lesson_id)));
  }
  // Foundations reads "How a case interview works" first, before week 1
  // (Matt, 2026-10-17): until it's seen, the home leads with it.
  const introFirst = program.track === 'foundations' && introLesson() !== null && !(await hasSeenLesson(studentId, INTRO_LESSON_ID));
  const rx = await openPrescriptions(studentId);
  const allPracticed = rx.length > 0 && rx.every(r => stateRank(progress.get(r.skill_id)?.state ?? 'not_started') >= stateRank('practiced'));
  const caseLeft = status ? status.cases.done < status.cases.target : (view!.day?.cases ?? 0) > 0;
  const nextCase = caseLeft || allPracticed ? await nextCaseFor(studentId) : null;
  if (nextCase) await logDrillEvent(studentId, 'next_case_card_shown', { recommended_case_id: nextCase.case_id, retake: nextCase.retake });
  await logDrillEvent(studentId, 'drills_home_viewed', {
    track: program.track, week: week?.week ?? null, sprint_day: view!.day?.day ?? null, open_prescriptions: rx.length, interview_days_out: view!.interview_days_out,
  });

  return {
    kind: 'plan' as const, resume, weakest, diagnostic, plan, program: view!, week_status: status, workout, lesson_first: lessonFirst, intro_first: introFirst,
    estimated_minutes: workout ? Math.round(workout.blocks.reduce((s, b) => s + b.minutes, 0)) : null,
    diagnose_today: !workout && ((view!.plan.kind === 'weeks' && week?.week === 0) || (view!.plan.kind === 'days' && view!.day?.day === 1)),
    next_case: nextCase,
  };
}

// Practice on my own: one suggestion chosen by the workout's slot rules, the
// top weaknesses, recent progress, what's due, a Sprint offer and the Monday recap.
async function selfDirected(studentId: string, profile: Awaited<ReturnType<typeof skillProfile>>, view: NonNullable<Awaited<ReturnType<typeof programView>>>, now: Date) {
  const [progress, tiers, ctx, rx] = await Promise.all([loadProgress(db, studentId), loadTiers(db, studentId), progressContext(db, studentId, now), openPrescriptions(studentId)]);
  await logDrillEvent(studentId, 'drills_home_viewed', { track: 'self_directed', week: null, open_prescriptions: rx.length, interview_days_out: view.interview_days_out });
  const [settings] = await db.select({ m: studentDrillSettings.timeMultiplier }).from(studentDrillSettings).where(eq(studentDrillSettings.studentId, studentId));
  const input = {
    track: 'standard' as const, week: null, sprint_day: null, interview_days_out: view.interview_days_out, progress, tiers,
    prescriptions: rx.map(r => ({ id: r.id, skill_id: r.skill_id, priority: r.priority, source: r.source, reason: r.reason, created_at: new Date(0) })),
    missed_milestone_skills: [], time_multiplier: settings?.m ?? 1, ctx, checks: await pendingChecks(studentId),
  };
  const workout = buildWorkout(input);
  const order: WorkoutBlock['slot'][] = ['weak', 'unfamiliar', 'review'];
  let pick: WorkoutBlock | null = [...workout.blocks].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot))[0] ?? null;
  // A plan source but nothing prescribed yet (a case with no findings):
  // start where week 1 of a plan would.
  if (!pick && view.plan_source) {
    const weekOne = buildPlan({ track: 'standard', start_date: view.today, interview_date: null, workouts_per_week: 4 });
    const skill = weekOne.kind === 'weeks' ? planPrescriptionSkill(weekOne.weeks[1], progress, input.prescriptions, isLiveDrill) : null;
    const b = skill ? blockFor(progress.get(skill) ?? newProgress(skill), input, 'weak') : null;
    if (b) pick = { ...b, slot: 'weak', reason: `A good first step: ${getSkill(b.skill_id).name}.`, prescription_id: null, set_id: null };
  }
  const suggested = pick && { skill_id: pick.skill_id, skill_name: getSkill(pick.skill_id).name, drill_name: getDrill(pick.drill_id).name, reason: pick.reason, minutes: Math.round(pick.minutes), kind: pick.kind, slot: pick.slot, check: pick.check === true };
  if (suggested) await logDrillEvent(studentId, 'suggestion_shown', { drill_id: pick!.drill_id, skill_id: pick!.skill_id, reason: pick!.reason, source: pick!.slot });

  const weaknesses = profile.top_mistakes.slice(0, 3);
  const since = new Date(now.getTime() - 7 * DAY);
  const moves = await db.select().from(skillStateEvents)
    .where(and(eq(skillStateEvents.studentId, studentId), gte(skillStateEvents.createdAt, since))).orderBy(desc(skillStateEvents.createdAt));
  // Moving up means reaching Recognizes or higher; Learning is just a start.
  const movedUp = [...new Map(moves.filter(e => stateRank(e.toState) > stateRank(e.fromState) && stateRank(e.toState) >= stateRank('recognizes')).map(e => [e.skillId, e])).values()]
    .map(e => ({ skill_name: getSkill(e.skillId).name, state: e.toState as SkillStateName }));
  const states = [...progress.values()];
  const due = states.flatMap((p): { skill_id: string; skill_name: string; what: 'transfer check' | 'review' }[] => {
    if (p.state === 'practiced' && p.transfer_due_at && p.transfer_due_at <= now) return [{ skill_id: p.skill_id, skill_name: getSkill(p.skill_id).name, what: 'transfer check' }];
    if ((p.state === 'mastered' || p.state === 'validated') && p.next_review_at && p.next_review_at <= now) return [{ skill_id: p.skill_id, skill_name: getSkill(p.skill_id).name, what: 'review' }];
    return [];
  });

  // Every Monday (the student's time zone): a recap of the last 7 days.
  const { timezone, today } = await studentToday(studentId, now);
  const monday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
  let summary = null;
  if (monday) {
    const sets = await db.select({ id: drillSets.id }).from(drillSets)
      .where(and(eq(drillSets.studentId, studentId), inArray(drillSets.status, ['completed']), gte(drillSets.completedAt, since)));
    summary = {
      sets: sets.length,
      cases: profile.history.filter(h => h.kind === 'case' && localDate(timezone, h.at) >= localDate(timezone, since)).length,
      moved_up: movedUp, weakest: weaknesses[0]?.skill_name ?? null,
    };
    await logDrillEvent(studentId, 'weekly_summary_viewed', { week: today });
  }

  return {
    suggested, weaknesses, moved_up: movedUp,
    counts: { practiced: states.filter(p => stateRank(p.state) >= stateRank('practiced')).length, mastered: states.filter(p => stateRank(p.state) >= stateRank('mastered')).length },
    rubric_trends: profile.rubric_trends, due, summary,
    offer_sprint: view.interview_days_out !== null && view.interview_days_out >= 0 && view.interview_days_out <= 14,
    interview_days_out: view.interview_days_out,
    days_on_program: daysBetween(view.start_date, today),
  };
}
