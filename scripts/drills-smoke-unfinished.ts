// One unfinished set at a time (Matt, 21 Nov: clicking a drill starts that drill) against the real database, as
// throwaway students. Every start path — today's workout, Browse (Practice and Start), a skill page, a lesson, Your
// progress, the report's next steps, Retry, the diagnostic — while another set is unfinished: refused with that set
// and the drill the click would start (never another set's id to open); "Start … instead" sets the unfinished set
// aside (answers kept, clock paused) and starts the clicked drill; Continue workout, a diagnostic part and Today's
// Resume pick a set-aside set up where it left off; the same drill opens without asking; two tabs racing still leave
// one set in progress; a set-aside set expires 24 hours after it started. Auto-checked drills only: free.
//
//   npm run drills:smoke:unfinished
import './smoke-log';
import { checkSmokeEvents } from './smoke-events';
import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, diagnostics, drillAttempts, drillCheckins, drillFeedback, drillItemReports, drillQuestionnaires, drillSets, drillTiers, gradingJobs,
  lessonViews, prescriptions, skillStateEvents, skillStates, studentDrillSettings, studentPrograms, studentProfiles, workouts,
} from '@/db/schema';
import { planOf, resolveItem } from '@/lib/drills/grading/jobs';
import type { Tier } from '@/lib/drills/item-schema';
import { DrillError, fetchItem, setAsideSets, startSet, submitAttempt } from '@/lib/drills/sets/service';
import { onboard, todayWorkout, workoutWithStatus } from '@/lib/drills/program/store';
import { submitQuestionnaire } from '@/lib/drills/program/plan-source';
import { homeView } from '@/lib/drills/program/home';
import type { WorkoutBlock } from '@/lib/drills/program/workout';
import { getDrill } from '@/lib/drills/config';

const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const students: string[] = [];

async function newStudent() {
  const id = randomUUID();
  students.push(id);
  await db.insert(studentProfiles).values({ userId: id, orgId: 'smoke-test' });
  await onboard(id, { wants_plan: true, interview_date: null, cases_done: '1-5', availability: 'standard', timezone: 'UTC' });
  await submitQuestionnaire(id, { interview_date: null, cases_done: '1-5', availability: 'standard', ratings: { structuring: 3, math: 2, charts: 5, recommendations: 4 }, hardest: 'math' });
  return id;
}

// Answers the next item right.
async function answerOne(student: string, setId: string) {
  const [set] = await db.select().from(drillSets).where(eq(drillSets.id, setId));
  const p = set.currentPosition;
  await fetchItem(student, setId, p);
  const item = await resolveItem(planOf(set)[p], set.tier as Tier);
  const steps = item.input.steps?.length ?? 1;
  for (let i = 0; i < steps; i++) {
    const type = item.input.steps?.[i].type ?? item.input.type;
    const response = type === 'numeric' ? { type: 'numeric' as const, value: String(item.numeric!.answer) } : { type: 'choice' as const, option_id: item.options.find(o => o.correct)!.id };
    await submitAttempt(student, setId, { position: p, idempotency_key: `un-${setId}-${p}-${i}`, step: i, response, skip: false, timed_out: false });
  }
}

// The refusal a start gets while another set is unfinished, or null if it started (or resumed) a set.
async function tryStart(student: string, body: Record<string, unknown>) {
  try {
    return { started: await startSet(student, body as never), refused: null };
  } catch (e) {
    if (e instanceof DrillError && e.code === 'set_in_progress') return { started: null, refused: e.data as Record<string, unknown> & { wanted: { drill_name: string } } };
    throw e;
  }
}
const statusOf = async (id: string) => (await db.select().from(drillSets).where(eq(drillSets.id, id)))[0];

async function main() {
  try {
    // ---------------------------------------------------------------- a plan student
    const a = await newStudent();
    const w = (await todayWorkout(a))!;
    const blocks = w.blocks as WorkoutBlock[];
    const first = getDrill(blocks[0].drill_id);
    const todays = (await startSet(a, { workout_id: w.id, block: 0 })).set_id;
    await answerOne(a, todays);
    await fetchItem(a, todays, 1);   // the next item is on the clock when the student leaves
    console.log(`today's block 0: ${first.name} (${first.id}), 1 answered`);

    // Every other start path is refused with the unfinished set and the clicked drill — never told to open it.
    // A prescription for another skill than today's block (the same skill would pick the same drill, which opens).
    const rx = (await db.select().from(prescriptions).where(and(eq(prescriptions.studentId, a), eq(prescriptions.status, 'open'))))
      .find(r => r.skillId !== blocks[0].skill_id);
    const paths: [string, Record<string, unknown>][] = [
      ['Browse → Start (pick exactly)', { drill_id: 'HY-1', skill_id: 'HY.form', tier: 1, browse: true }],
      ['Browse → Practice', { skill_id: 'EX.takeaway', quick_start: true, browse: true }],
      ['skill page → Practice this', { skill_id: 'SY.answer_first', quick_start: true, dashboard: 'detail' }],
      ['lesson → Try it', { skill_id: 'HY.form', quick_start: true }],
      ['set results → Retry this drill', { drill_id: 'PS-1', skill_id: 'PS.mece' }],
      ...(rx ? [
        ['Your progress → Practice', { prescription_id: rx.id, dashboard: 'focus' }],
        ["report's next steps → Start practice", { prescription_id: rx.id, report: { case_attempt_id: randomUUID(), skill_id: rx.skillId } }],
      ] as [string, Record<string, unknown>][] : []),
    ];
    for (const [what, body] of paths) {
      const r = await tryStart(a, body);
      if (r.started) { check(false, `${what}: started without asking (${r.started.set_id === todays ? "today's set" : 'a new set'})`); continue; }
      const wanted = r.refused!.wanted.drill_name;
      check(r.refused!.set_id === todays && r.refused!.drill_name === first.name && r.refused!.done === 1 && r.refused!.workout === true, `${what}: the refusal names today's set (${JSON.stringify(r.refused)})`);
      check(typeof wanted === 'string' && wanted.length > 0, `${what}: the refusal names the clicked drill`);
      console.log(`${what}: asks — "${r.refused!.drill_name} · ${r.refused!.done} of ${r.refused!.size} done" / "Start ${wanted} instead"`);
    }

    // The same drill from anywhere: opens the unfinished set without asking.
    const same = await tryStart(a, { drill_id: first.id, skill_id: blocks[0].skill_id });
    check(same.started?.set_id === todays, `same drill (${first.id}) opens the unfinished set without asking`);

    // Start … instead: today's set is set aside, its answer kept, its clock paused; the clicked drill starts.
    const hy = (await startSet(a, { drill_id: 'HY-1', skill_id: 'HY.form', tier: 1, browse: true, set_aside: todays })).set_id;
    const aside = await statusOf(todays);
    check(aside.status === 'set_aside', `set aside: today's set is ${aside.status}`);
    check(aside.currentPosition === 1, 'set aside: its answered item is kept');
    check(aside.untimed || aside.pausedAt !== null, "set aside: a timed set's clock is paused");
    check((await statusOf(hy)).status === 'in_progress', 'the clicked drill started');
    const ws = await workoutWithStatus((await todayWorkout(a))!);
    check(ws.blocks[0].status === 'in_progress' && ws.blocks[0].set_id === todays, "today's workout still holds its set (In progress)");
    check((await setAsideSets(a)).length === 0, "a workout set isn't listed as Unfinished (the workout picks it up)");

    // Continue workout while HY-1 is in progress: asks; "Start Mental math instead" brings today's set back as it was.
    const cont = await tryStart(a, { workout_id: w.id, block: 0 });
    check(cont.refused?.set_id === hy && cont.refused?.wanted.drill_name === first.name, 'Continue workout asks while another set is unfinished');
    const back = await startSet(a, { workout_id: w.id, block: 0, set_aside: hy });
    const resumed = await statusOf(todays);
    check(back.set_id === todays && resumed.status === 'in_progress', 'Continue workout picks today\'s set up (same set, in progress)');
    check(resumed.currentPosition === 1 && resumed.pausedAt === null, 'picked up where it left off, clock running again');
    check((await statusOf(hy)).status === 'set_aside', 'HY-1 is now set aside');
    const listed = await setAsideSets(a);
    check(listed.length === 1 && listed[0].set_id === hy && listed[0].drill_name === getDrill('HY-1').name, "Today's Unfinished row lists HY-1");
    const home = await homeView(a);
    check((home.unfinished ?? []).some(u => u.set_id === hy), 'the home view carries the Unfinished row');

    // Today's Resume on HY-1 while today's set runs: asks; then brings HY-1 back and sets today's set aside.
    const res1 = await tryStart(a, { resume_set_id: hy });
    check(res1.refused?.set_id === todays, 'Resume asks while another set is unfinished');
    const res2 = await startSet(a, { resume_set_id: hy, set_aside: todays });
    check(res2.set_id === hy && (await statusOf(hy)).status === 'in_progress' && (await statusOf(todays)).status === 'set_aside', 'Resume brings HY-1 back; today\'s set is set aside');

    // Two tabs racing "Start … instead" for different drills: one set in progress afterwards, never two.
    const race = await Promise.allSettled([
      startSet(a, { drill_id: 'PS-1', skill_id: 'PS.mece', set_aside: hy }),
      startSet(a, { skill_id: 'EX.takeaway', quick_start: true, set_aside: hy }),
    ]);
    const running = await db.select().from(drillSets).where(and(eq(drillSets.studentId, a), eq(drillSets.status, 'in_progress')));
    check(running.length === 1, `race: ${running.length} sets in progress`);
    console.log(`race: ${race.map(r => r.status === 'fulfilled' ? 'started' : (r.reason as DrillError).code).join(', ')}; one set in progress`);

    // A set-aside set expires 24 hours after it started, like any unfinished set (answers kept).
    await db.update(drillSets).set({ startedAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(drillSets.id, hy));
    check((await setAsideSets(a)).every(u => u.set_id !== hy), 'a set-aside set past 24 hours leaves the Unfinished rows');
    check((await statusOf(hy)).status === 'expired', 'and is expired');

    // ---------------------------------------------------------------- the diagnostic
    const b = randomUUID();
    students.push(b);
    await db.insert(studentProfiles).values({ userId: b, orgId: 'smoke-test' });
    await onboard(b, { wants_plan: true, interview_date: null, cases_done: '1-5', availability: 'standard', timezone: 'UTC' });
    const part = (await startSet(b, { diagnostic_part: 0 })).set_id;
    await answerOne(b, part);
    const bro = await tryStart(b, { drill_id: 'HY-1', skill_id: 'HY.form', tier: 1, browse: true });
    check(bro.refused?.set_id === part && bro.refused?.diagnostic === true && bro.refused?.workout === false, 'a diagnostic part: the refusal says so');
    const partDrill = (await statusOf(part)).drillId;
    const samePart = await tryStart(b, { drill_id: partDrill });
    check(samePart.refused?.set_id === part, "the diagnostic part's own drill from Browse still asks (a diagnostic part shows no feedback)");
    await startSet(b, { drill_id: 'HY-1', skill_id: 'HY.form', tier: 1, browse: true, set_aside: part });
    check((await setAsideSets(b)).some(u => u.set_id === part), 'a set-aside diagnostic part is on Today');
    const bp = await startSet(b, { diagnostic_part: 0, set_aside: (await db.select().from(drillSets).where(and(eq(drillSets.studentId, b), eq(drillSets.status, 'in_progress'))))[0].id });
    check(bp.set_id === part && (await statusOf(part)).status === 'in_progress' && (await statusOf(part)).currentPosition === 1, 'Continue part picks the diagnostic part up where it left off');
    const diag = await db.select().from(diagnostics).where(eq(diagnostics.studentId, b));
    check((diag[0].parts as { set_id?: string }[])[0].set_id === part, 'the diagnostic still holds its part');

    console.log('unfinished: every start path asks, set aside keeps answers, Continue/Resume pick up, same drill opens, race, expiry, diagnostic');
  } finally {
    for (const s of students) {
      for (const t of [drillFeedback, drillItemReports, drillCheckins]) await db.delete(t).where(eq(t.studentId, s));
      const ids = (await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, s))).map(x => x.id);
      if (ids.length) {
        await db.delete(gradingJobs).where(inArray(gradingJobs.setId, ids));
        await db.delete(drillAttempts).where(inArray(drillAttempts.setId, ids));
        await db.delete(drillSets).where(inArray(drillSets.id, ids));
      }
      await db.delete(workouts).where(eq(workouts.studentId, s));
      await db.delete(diagnostics).where(eq(diagnostics.studentId, s));
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

main().catch(e => { console.error(e); process.exit(1); });
