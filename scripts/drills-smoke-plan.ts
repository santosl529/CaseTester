// D6 round 2 end to end against the real database, as throwaway students:
// the questionnaire makes the plan (week 1 today, conservative placement,
// prescriptions, quick checks first), a check set re-places its skill, a
// better source updates the plan, timer options (timed/untimed fixed at the
// first item, hide any time) and pauses (excluded from the item's time).
// Self-directed students get a quick check as their suggestion. Free.
//
//   npm run drills:smoke:plan
import './smoke-log';
import { checkSmokeEvents } from './smoke-events';
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, drillAttempts, drillCheckins, drillFeedback, drillItemReports, drillQuestionnaires, drillSets, drillTiers, gradingJobs,
  lessonViews, prescriptions, skillStateEvents, skillStates, studentDrillSettings, studentPrograms, studentProfiles, workouts,
} from '@/db/schema';
import { planOf, resolveItem } from '@/lib/drills/grading/jobs';
import type { Tier } from '@/lib/drills/item-schema';
import { completeSet, fetchItem, pauseTimer, setResults, setTimer, setView, startSet, submitAttempt } from '@/lib/drills/sets/service';
import { onboard, programView, todayWorkout } from '@/lib/drills/program/store';
import { homeView } from '@/lib/drills/program/home';
import { pendingChecks, recordPlanSource, submitQuestionnaire } from '@/lib/drills/program/plan-source';
import type { WorkoutBlock } from '@/lib/drills/program/workout';

const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const students: string[] = [];

async function newStudent(wantsPlan: boolean) {
  const id = randomUUID();
  students.push(id);
  await db.insert(studentProfiles).values({ userId: id, orgId: 'smoke-test' });
  await onboard(id, { wants_plan: wantsPlan, interview_date: null, cases_done: '1-5', availability: 'standard', timezone: 'UTC' });
  return id;
}

// Every answer right (auto-checked drills).
async function answerAll(student: string, setId: string) {
  const [set] = await db.select().from(drillSets).where(eq(drillSets.id, setId));
  for (let p = 0; p < set.size; p++) {
    await fetchItem(student, setId, p);
    const item = await resolveItem(planOf(set)[p], set.tier as Tier);
    const steps = item.input.steps?.length ?? 1;
    for (let i = 0; i < steps; i++) {
      const type = item.input.steps?.[i].type ?? item.input.type;
      const response = type === 'numeric' ? { type: 'numeric' as const, value: String(item.numeric!.answer) } : { type: 'choice' as const, option_id: item.options.find(o => o.correct)!.id };
      await submitAttempt(student, setId, { position: p, idempotency_key: `pl-${setId}-${p}-${i}`, step: i, response, skip: false, timed_out: false });
    }
  }
  await completeSet(student, setId);
}

async function main() {
  try {
    // A plan student: the questionnaire makes the plan.
    const a = await newStudent(true);
    check((await todayWorkout(a)) === null, 'no workout before a plan source');
    await submitQuestionnaire(a, { interview_date: null, cases_done: '1-5', availability: 'standard', ratings: { structuring: 3, math: 2, charts: 5, recommendations: 4 }, hardest: 'math' });
    const view = await programView(a);
    check(view?.plan_source === 'questionnaire' && view.week?.week === 1, `plan: ${view?.plan_source}, week ${view?.week?.week}`);
    const states = await db.select().from(skillStates).where(eq(skillStates.studentId, a));
    check(states.length > 0 && states.every(s => s.state === 'learning' && s.stage !== null), `placement: ${states.map(s => `${s.skillId}:${s.stage}`).join(', ')}`);
    const rx = await db.select().from(prescriptions).where(eq(prescriptions.studentId, a));
    check(rx.length > 0 && rx.length <= 3 && rx.every(r => r.sourceType === 'questionnaire'), `prescriptions: ${rx.map(r => `${r.skillId}/${r.sourceType}`)}`);
    const checks = await pendingChecks(a);
    check(checks.length === 4 && checks[0].startsWith('QN.'), `checks: ${checks}`);
    const w = await todayWorkout(a);
    const blocks = (w?.blocks ?? []) as WorkoutBlock[];
    check(blocks.length >= 2 && blocks.slice(0, 2).every(b => b.check === true), `first workout: ${blocks.map(b => `${b.drill_id}${b.check ? '(check)' : ''}`)}`);

    // The first check set: all right re-places its skill (80%+: Construct test-out).
    const first = blocks.findIndex(b => b.check);
    const { set_id: checkSet } = await startSet(a, { workout_id: w!.id, block: first });
    const [cs] = await db.select().from(drillSets).where(eq(drillSets.id, checkSet));
    check(cs.isPlacementCheck, 'a check block should start a placement check set');
    await answerAll(a, checkSet);
    const [placed] = await db.select().from(skillStates).where(eq(skillStates.studentId, a)).then(r => r.filter(s => s.skillId === blocks[first].skill_id));
    check(placed?.stage === null || placed?.state !== 'learning', `check re-placement: ${placed?.skillId} ${placed?.state}/${placed?.stage}`);
    check(!(await pendingChecks(a)).includes(blocks[first].skill_id), 'a checked skill should leave the pending checks');

    // A better source updates the plan; a worse one never overrides it.
    check(await recordPlanSource(a, 'case'), 'a case should update a questionnaire plan');
    check(!(await recordPlanSource(a, 'questionnaire')), 'a questionnaire must not override a case');
    check((await pendingChecks(a)).length === 0, 'checks should stop once a case arrives');

    // Timer options: hide any time; timed/untimed fixed once the first item is served.
    const b = await newStudent(true);
    await recordPlanSource(b, 'diagnostic');
    const { set_id: timed } = await startSet(b, { drill_id: 'PS-1' });
    await setTimer(b, timed, { untimed: false, hidden: true, at_start: true });
    let v = await setView(b, timed);
    check(!v.untimed && v.timer_hidden && v.timer_choice_open, `timer at start: untimed ${v.untimed}, hidden ${v.timer_hidden}`);
    await fetchItem(b, timed, 0);
    const servedAt = Date.now();
    await setTimer(b, timed, { untimed: true });
    v = await setView(b, timed);
    check(!v.untimed && !v.timer_choice_open, 'timed/untimed changed after the first item');
    await setTimer(b, timed, { hidden: false });
    check(!(await setView(b, timed)).timer_hidden, 'show timer mid-set');

    // A pause is left out of the item's time.
    await pauseTimer(b, timed, { action: 'pause', reason: 'report' });
    await new Promise(r => setTimeout(r, 2500));
    const resumed = await pauseTimer(b, timed, { action: 'resume', reason: 'report' });
    check('remaining_ms' in resumed && (resumed.remaining_ms as number) > 0, 'resume should return the clock');
    const [afterPause] = await db.select().from(drillSets).where(eq(drillSets.id, timed));
    check(afterPause.pausedAt === null && afterPause.pausedMs >= 2000, `paused ms: ${afterPause.pausedMs}`);
    await answerAll(b, timed);
    const [firstAttempt] = await db.select().from(drillAttempts).where(eq(drillAttempts.setId, timed)).then(r => r.filter(x => x.position === 0));
    const wall = firstAttempt.submittedAt.getTime() - servedAt;
    check(firstAttempt.timeMs <= wall - 2000, `item time should leave out the pause: ${firstAttempt.timeMs} ms of ${wall} ms`);
    check((await setResults(b, timed)).status === 'completed', 'the paused set should complete');
    // The student's last choices become the defaults.
    const [settings] = await db.select().from(studentDrillSettings).where(eq(studentDrillSettings.studentId, b));
    check(settings?.hideTimer === false && settings?.untimed === false, `defaults: hide ${settings?.hideTimer}, untimed ${settings?.untimed}`);

    // Practice on my own: the questionnaire's first quick check is the suggestion.
    const c = await newStudent(false);
    await submitQuestionnaire(c, { interview_date: null, cases_done: '1-5', ratings: { structuring: 2, math: 4, charts: 4, recommendations: 4 }, hardest: null });
    const home = await homeView(c);
    check(home.kind === 'self_directed' && home.suggested?.check === true, `self-directed suggestion: ${home.kind === 'self_directed' ? JSON.stringify(home.suggested) : home.kind}`);
    console.log('plan: questionnaire, quick checks, source priority; timer options and pauses; self-directed checks');
  } finally {
    for (const s of students) {
      for (const t of [drillFeedback, drillItemReports, drillCheckins]) await db.delete(t).where(eq(t.studentId, s));
      const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, s));
      const ids = sets.map(x => x.id);
      if (ids.length) {
        await db.delete(gradingJobs).where(inArray(gradingJobs.setId, ids));
        await db.delete(drillAttempts).where(inArray(drillAttempts.setId, ids));
        await db.delete(drillSets).where(inArray(drillSets.id, ids));
      }
      await db.delete(workouts).where(eq(workouts.studentId, s));
      await db.delete(studentPrograms).where(eq(studentPrograms.studentId, s));
      for (const t of [prescriptions, skillStateEvents, skillStates, drillTiers, studentDrillSettings, lessonViews, drillQuestionnaires]) await db.delete(t).where(eq(t.studentId, s));
      await db.delete(studentProfiles).where(eq(studentProfiles.userId, s));
    }
    await new Promise(r => setTimeout(r, 1500));
    await checkSmokeEvents(students, failures);
    for (const s of students) await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, s));
    console.log(`cleaned up ${students.length} test students`);
  }
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
