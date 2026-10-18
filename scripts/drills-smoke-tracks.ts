// End-to-end check of the Foundations and Sprint tracks against the real
// database (PRD D4 gate: "scripted Foundations, Standard and Sprint students
// get the plans and workouts defined"; Standard is in drills:smoke:d4).
//   Foundations: 0 practice cases → Foundations; day 2 the plan prescribes
//     Week 1's first focus skill (MECE structure) at Recognize tier 1.
//   Sprint: interview in 10 days → Sprint; day 1 has no workout; day 2 is a
//     30-minute workout at tier 2+ with no Recognize; with no weak spots yet
//     the workout is empty (the home then points to the diagnostic).
// No AI calls. Deletes everything it wrote.
//
//   npm run drills:smoke:tracks
import './smoke-log';
import { checkSmokeEvents } from './smoke-events';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, caseResults, diagnostics, drillTiers, lessonViews, prescriptions, skillStateEvents, skillStates,
  studentDrillSettings, studentProfiles, studentPrograms, workouts, drillQuestionnaires,
} from '@/db/schema';
import { ingestCaseResult } from '@/lib/drills/progress/ingest';
import { onboard, programView, todayWorkout } from '@/lib/drills/program/store';
import { homeView } from '@/lib/drills/program/home';
import { recordPlanSource, submitQuestionnaire } from '@/lib/drills/program/plan-source';
import { recordLessonView } from '@/lib/drills/program/lessons-store';
import { INTRO_LESSON_ID, loadIntroLesson } from '@/lib/drills/lessons';
import type { WorkoutBlock } from '@/lib/drills/program/workout';

const DAY = 86_400_000;
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const students: string[] = [];
const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/drills/case-results/market-entry-t2.json'), 'utf-8'));

async function newStudent() {
  const id = randomUUID();
  students.push(id);
  await db.insert(studentProfiles).values({ userId: id, orgId: 'smoke-test' });
  return id;
}
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

async function main() {
  try {
    // Foundations.
    const f = await newStudent();
    const rf = await onboard(f, { wants_plan: true, interview_date: null, cases_done: '0', availability: 'light', timezone: 'UTC' });
    check(rf.track === 'foundations', `F track: ${rf.track}`);
    const viewF = await programView(f);
    check(viewF?.workouts_per_week === 3 && viewF.plan.kind === 'weeks' && viewF.plan.weeks[1].cases_target === 0, 'F: 3 workouts a week, no case in week 1');
    // No plan yet: no workout, and the home offers the three ways to get one.
    check(await todayWorkout(f, new Date(Date.now() + DAY)) === null, 'F: a workout before any plan source');
    const homeF0 = await homeView(f);
    check(homeF0.kind === 'plan' && homeF0.plan.source === null, 'F home should have no plan yet');
    // The questionnaire makes the plan: week 1 starts today, led by a quick check.
    await submitQuestionnaire(f, { interview_date: null, cases_done: '0', availability: 'light', ratings: { structuring: 1, math: 3, charts: 4, recommendations: 4 }, hardest: 'structuring' });
    const viewF1 = await programView(f);
    check(viewF1?.plan_source === 'questionnaire' && viewF1.week?.week === 1, `F plan: ${viewF1?.plan_source}, week ${viewF1?.week?.week}`);
    const wf = await todayWorkout(f);
    const bf = (wf?.blocks ?? []) as WorkoutBlock[];
    check(bf[0]?.skill_id === 'PS.mece' && bf[0].drill_id === 'PS-1' && bf[0].tier === 1 && bf[0].stage === 'recognize' && bf[0].check === true,
      `F first workout: ${JSON.stringify(bf[0])}`);
    const [qRx] = await db.select().from(prescriptions).where(and(eq(prescriptions.studentId, f), eq(prescriptions.sourceType, 'questionnaire'), eq(prescriptions.skillId, 'PS.mece')));
    check(qRx !== undefined, 'F: no questionnaire prescription for the hardest area');
    // "How a case interview works" leads the Foundations home until it's read.
    const homeF = await homeView(f);
    check(homeF.kind === 'plan' && homeF.intro_first, 'F home should lead with "How a case interview works"');
    check(homeF.kind === 'plan' && homeF.plan.source === 'questionnaire' && !homeF.plan.seen, 'F home should offer the new plan');
    await recordLessonView(f, INTRO_LESSON_ID, { version: loadIntroLesson()!.version, source: 'auto', seconds_open: 60, skipped: false });
    const homeF2 = await homeView(f);
    check(homeF2.kind === 'plan' && !homeF2.intro_first, 'F home still leads with the intro after it was read');

    // Sprint, no weak spots yet: day 2's workout is empty and the home says what to do.
    const s = await newStudent();
    const rs = await onboard(s, { wants_plan: true, interview_date: inDays(10), cases_done: '6+', timezone: 'UTC' });
    check(rs.track === 'sprint', `S track: ${rs.track}`);
    const viewS = await programView(s);
    check(viewS?.plan.kind === 'days' && viewS.plan.days.map(d => d.day).join() === '1,2,3,4,5,2,3,4,6,7', `S days: ${viewS?.plan.kind === 'days' ? viewS.plan.days.map(d => d.day) : '-'}`);
    check(await todayWorkout(s) === null, 'S day 1: no workout');
    // A completed case (no findings yet) makes the plan: today is day 2.
    await recordPlanSource(s, 'case');
    const empty = await todayWorkout(s);
    check(empty !== null && (empty.blocks as WorkoutBlock[]).length === 0, 'S day 2 with no weak spots: an empty workout');
    const homeEmpty = await homeView(s);
    check(homeEmpty.kind === 'plan' && homeEmpty.workout?.blocks.length === 0, 'S home should show the empty workout state');
    check(homeEmpty.kind === 'plan' && !homeEmpty.intro_first, 'S home should not lead with the intro (Foundations only)');

    // Sprint with a case result: day 3 has a 15-minute workout (case day) at tier 2+.
    await ingestCaseResult({ ...fixture, case_attempt_id: `smoke-tracks-${s}`, student_id: s, completed_at: new Date().toISOString() });
    const ws = await todayWorkout(s, new Date(Date.now() + DAY));
    const bs = (ws?.blocks ?? []) as WorkoutBlock[];
    check(ws?.targetMinutes === 15, `S day 3 target: ${ws?.targetMinutes}`);
    check(bs.length > 0 && bs.every(b => b.tier >= 2 && b.stage !== 'recognize'), `S day 3 blocks: ${bs.map(b => `${b.drill_id}/T${b.tier}/${b.stage}`)}`);
  } finally {
    for (const id of students) {
      await db.delete(workouts).where(eq(workouts.studentId, id));
      await db.delete(studentPrograms).where(eq(studentPrograms.studentId, id));
      await db.delete(diagnostics).where(eq(diagnostics.studentId, id));
      for (const t of [prescriptions, skillStateEvents, skillStates, caseResults, drillTiers, studentDrillSettings, lessonViews, drillQuestionnaires]) await db.delete(t).where(eq(t.studentId, id));
      await db.delete(studentProfiles).where(eq(studentProfiles.userId, id));
    }
    await new Promise(r => setTimeout(r, 1500));
    await checkSmokeEvents(students, failures);
    for (const id of students) await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, id));
  }
  if (failures.length) {
    console.error(`Tracks smoke FAILED:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('Tracks smoke passed: Foundations starts at Recognize tier 1; Sprint days, empty workout, 15-minute tier 2+ case-day workout.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
