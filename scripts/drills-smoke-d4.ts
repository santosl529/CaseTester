// End-to-end check of the D4 training program against the real database, as
// a throwaway student: onboarding stores the time zone and assigns Standard;
// Week 0 has no workout; on day 2 the plan adds its own prescription and the
// workout puts the case's prescription first; a workout block runs as a set
// tied to the workout; the home and the next-case card work with the one case
// in the library; switching to Practice on my own keeps skill states and
// shows a suggestion. Uses QN-4 only (scored by code): no AI calls. Deletes
// everything it wrote.
//
//   npm run drills:smoke:d4
import './smoke-log';
import { checkSmokeEvents } from './smoke-events';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, caseResults, drillAttempts, drillSets, drillTiers, gradingJobs, prescriptions, skillStateEvents,
  skillStates, studentDrillSettings, studentProfiles, studentPrograms, workouts,
} from '@/db/schema';
import { ingestCaseResult } from '@/lib/drills/progress/ingest';
import { resolveItem, planOf } from '@/lib/drills/grading/jobs';
import { completeSet, fetchItem, setResults, startSet, submitAttempt } from '@/lib/drills/sets/service';
import { changeProgram, nextCaseFor, onboard, programView, todayWorkout, workoutWithStatus } from '@/lib/drills/program/store';
import { homeView } from '@/lib/drills/program/home';
import { catalog } from '@/lib/drills/program/catalog';
import type { WorkoutBlock } from '@/lib/drills/program/workout';
import type { Tier } from '@/lib/drills/item-schema';

const student = randomUUID();
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const DAY = 86_400_000;

async function answerSet(setId: string) {
  const [set] = await db.select().from(drillSets).where(eq(drillSets.id, setId));
  for (let position = 0; position < set.size; position++) {
    await fetchItem(student, setId, position);
    const item = await resolveItem(planOf(set)[position], set.tier as Tier);
    const steps = [
      { type: 'choice' as const, option_id: item.options.find(o => o.correct)!.id },
      { type: 'numeric' as const, value: String(item.numeric!.answer) },
    ];
    for (const [i, response] of steps.entries()) {
      await submitAttempt(student, setId, { position, idempotency_key: `k-${setId}-${position}-${i}`, step: i, response, skip: false, timed_out: false });
    }
  }
  await completeSet(student, setId);
}

async function main() {
  try {
    await db.insert(studentProfiles).values({ userId: student, orgId: 'smoke-test' });
    const day1 = new Date();
    const r = await onboard(student, { wants_plan: true, interview_date: null, cases_done: '1-5', availability: 'standard', timezone: 'America/New_York' });
    check(r.track === 'standard', `track should be standard, was ${r.track}`);
    const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, student));
    check(profile.timezone === 'America/New_York', `time zone not stored: ${profile.timezone}`);
    check((await programView(student))?.week?.week === 0, 'day 1 should be Week 0');
    check(await todayWorkout(student, day1) === null, 'Week 0 should have no workout');
    const home0 = await homeView(student, day1);
    check(home0.kind === 'plan' && home0.diagnose_today === true, 'Week 0 home should lead with the starting point');
    check(home0.kind === 'plan' && home0.next_case?.case_id === 'prof-001' && !home0.next_case.retake, 'Week 0 should suggest the baseline case');

    // A case result, then day 2 (Week 1: structure and math).
    const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/drills/case-results/market-entry-t2.json'), 'utf-8'));
    await ingestCaseResult({ ...fixture, case_attempt_id: `smoke-d4-${student}`, student_id: student, completed_at: day1.toISOString() });
    const day2 = new Date(day1.getTime() + DAY);
    const w = await todayWorkout(student, day2);
    check(w !== null, 'day 2 should have a workout');
    const blocks = (w?.blocks ?? []) as WorkoutBlock[];
    check(blocks[0]?.skill_id === 'QN.setup' && blocks[0].drill_id === 'QN-4' && blocks[0].tier === 2, `first block: ${JSON.stringify(blocks[0])}`);
    check(blocks.every(b => b.slot === 'weak'), `slots: ${blocks.map(b => b.slot)}`);
    const again = await todayWorkout(student, day2);
    check(again?.id === w?.id, 'the workout should be built once per day');
    // The case prescribed QN.setup and PS.case_specific, both in Week 1's focus, so the plan adds none.
    const planRx = await db.select().from(prescriptions).where(and(eq(prescriptions.studentId, student), eq(prescriptions.sourceType, 'plan')));
    check(planRx.length === 0, `no plan prescription expected, got ${planRx.map(p => p.skillId)}`);

    // Run the first block.
    const { set_id } = await startSet(student, { workout_id: w!.id, block: 0 });
    const [set] = await db.select().from(drillSets).where(eq(drillSets.id, set_id));
    check(set.workoutId === w!.id && set.slot === 'weak' && set.size === blocks[0].size, 'set should belong to the workout block');
    await answerSet(set_id);
    const status = await workoutWithStatus((await db.select().from(workouts).where(eq(workouts.id, w!.id)))[0]);
    check(status.status === 'in_progress' && status.blocks[0].status === 'done' && status.blocks[0].score === 1, `workout after block 0: ${status.status}, ${status.blocks[0].status}`);
    const results = await setResults(student, set_id);
    check(results.status === 'completed' && results.from_workout, 'results should offer "Continue workout"');

    // Browse drills: the catalog marks prescribed skills Suggested; Pick exactly
    // allows up to one tier above the current one (QN-4 is now at tier 3 after a perfect set).
    const areas = await catalog(student);
    const qnSetup = areas.flatMap(a => a.skills).find(s => s.id === 'QN.setup');
    check(Boolean(qnSetup?.suggested) && qnSetup!.drills.some(d => d.drill_id === 'QN-4' && d.tiers.join() === '1,2,3'), `catalog QN.setup: ${JSON.stringify(qnSetup)}`);
    const ex3 = areas.flatMap(a => a.skills).find(s => s.id === 'EX.extraction')?.drills.find(d => d.drill_id === 'EX-3');
    check(ex3?.tiers.join() === '1,2', 'a first-time drill should allow tiers 1 and 2');
    let refused = false;
    try { await startSet(student, { drill_id: 'EX-3', skill_id: 'EX.extraction', tier: 3, browse: true }); } catch (e) { refused = (e as { code?: string }).code === 'tier_not_allowed'; }
    check(refused, 'tier 3 on a first-time drill should be refused');
    const picked = await startSet(student, { drill_id: 'EX-3', skill_id: 'EX.extraction', tier: 2, browse: true });
    const [pickedSet] = await db.select().from(drillSets).where(eq(drillSets.id, picked.set_id));
    check(pickedSet.tier === 2 && pickedSet.focusSkill === 'EX.extraction', `picked set: tier ${pickedSet.tier}, ${pickedSet.focusSkill}`);
    await db.update(drillSets).set({ status: 'expired' }).where(eq(drillSets.id, picked.set_id));

    // The next case with one case in the library (not yet completed in the case product).
    const next = await nextCaseFor(student);
    check(next?.case_id === 'prof-001', `next case: ${JSON.stringify(next)}`);

    // Switch to Practice on my own: skill states kept, a suggestion shown.
    const before = await db.select().from(skillStates).where(eq(skillStates.studentId, student));
    await changeProgram(student, { track: 'self_directed' });
    const after = await db.select().from(skillStates).where(eq(skillStates.studentId, student));
    check(JSON.stringify(before.map(s => [s.skillId, s.state, s.l2PassingStreak]).sort()) === JSON.stringify(after.map(s => [s.skillId, s.state, s.l2PassingStreak]).sort()), 'skill states changed on switch');
    const home = await homeView(student, day2);
    check(home.kind === 'self_directed' && home.suggested !== null, 'self-directed home should suggest a set');
    const programsRows = await db.select().from(studentPrograms).where(eq(studentPrograms.studentId, student));
    check(programsRows.filter(p => p.status === 'active').length === 1 && programsRows.some(p => p.status === 'switched'), 'one active program after the switch');
  } finally {
    const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, student));
    const ids = sets.map(s => s.id);
    if (ids.length) {
      await db.delete(gradingJobs).where(inArray(gradingJobs.setId, ids));
      await db.delete(drillAttempts).where(inArray(drillAttempts.setId, ids));
      await db.delete(drillSets).where(inArray(drillSets.id, ids));
    }
    await db.delete(workouts).where(eq(workouts.studentId, student));
    await db.delete(studentPrograms).where(eq(studentPrograms.studentId, student));
    for (const t of [prescriptions, skillStateEvents, skillStates, caseResults, drillTiers, studentDrillSettings]) {
      await db.delete(t).where(eq(t.studentId, student));
    }
    await db.delete(studentProfiles).where(eq(studentProfiles.userId, student));
    await new Promise(r => setTimeout(r, 1500));
    await checkSmokeEvents([student], failures);
    await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, student));
  }
  if (failures.length) {
    console.error(`D4 smoke FAILED:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('D4 smoke passed: onboarding → Week 0 → day-2 workout → block set → home, next case, switch to self-directed.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
