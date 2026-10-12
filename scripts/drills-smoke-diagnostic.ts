// End-to-end check of the diagnostic against the real database, with two
// throwaway students. Student A answers everything right, stopping after 3
// parts (placed from those, then resumes the same diagnostic) and finishing:
// skills placed at the test-out, no tiers or streaks changed, track kept.
// Student B answers everything wrong: placed at Recognize, given diagnostic
// prescriptions, and moved from Standard to Foundations. Grades two written
// answers (about $0.01). Deletes everything it wrote.
//
//   npm run drills:smoke:diagnostic
import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, caseResults, diagnostics, drillAttempts, drillSets, drillTiers, gradingJobs, prescriptions,
  skillStateEvents, skillStates, studentDrillSettings, studentProfiles, studentPrograms, workouts,
} from '@/db/schema';
import { resolveItem, planOf } from '@/lib/drills/grading/jobs';
import { modelAnswerSteps } from '@/lib/drills/model-answers';
import { completeSet, fetchItem, startSet, submitAttempt } from '@/lib/drills/sets/service';
import type { StepResponse } from '@/lib/drills/sets/scoring';
import { onboard } from '@/lib/drills/program/store';
import { diagnosticView, skipDiagnostic } from '@/lib/drills/program/diagnostic-store';
import type { Item, Tier } from '@/lib/drills/item-schema';

const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const students: string[] = [];

function answers(item: Item, right: boolean): StepResponse[] | 'skip' {
  if (item.drill_id === 'PS-3' || item.drill_id === 'SY-2') return right ? modelAnswerSteps(item) : 'skip';
  const steps = item.input.steps ?? [{ type: item.input.type }];
  return steps.map(s => {
    if (s.type === 'numeric') return { type: 'numeric' as const, value: String(right ? item.numeric!.answer : item.numeric!.answer * 3 + 7) };
    const option = item.options.find(o => o.correct === right)!;
    return { type: 'choice' as const, option_id: option.id };
  });
}

async function runPart(student: string, index: number, right: boolean) {
  const { set_id } = await startSet(student, { diagnostic_part: index });
  const [set] = await db.select().from(drillSets).where(eq(drillSets.id, set_id));
  check(set.source === 'diagnostic' && set.tier === 2, `part ${index}: source ${set.source}, tier ${set.tier}`);
  for (let position = 0; position < set.size; position++) {
    await fetchItem(student, set_id, position);
    const item = await resolveItem(planOf(set)[position], set.tier as Tier);
    const a = answers(item, right);
    if (a === 'skip') {
      await submitAttempt(student, set_id, { position, idempotency_key: `k-${set_id}-${position}-skip`, step: 0, response: null, skip: true, timed_out: false });
      continue;
    }
    for (const [i, response] of a.entries()) {
      await submitAttempt(student, set_id, { position, idempotency_key: `k-${set_id}-${position}-${i}`, step: i, response, skip: false, timed_out: false });
    }
  }
  await completeSet(student, set_id);
}

async function newStudent() {
  const id = randomUUID();
  students.push(id);
  await db.insert(studentProfiles).values({ userId: id, orgId: 'smoke-test' });
  await onboard(id, { wants_plan: true, interview_date: null, cases_done: '1-5', availability: 'standard', timezone: 'America/Chicago' });
  return id;
}

async function main() {
  try {
    // Student A: all right; stops after 3 parts, then resumes.
    const a = await newStudent();
    for (const i of [0, 1, 2]) await runPart(a, i, true);
    await skipDiagnostic(a);
    let view = await diagnosticView(a);
    check(view?.status === 'skipped' && view.done === 3, `A after stopping: ${view?.status}, ${view?.done} done`);
    check(Boolean(view?.placements.some(p => p.skill_id === 'PS.mece' && p.place === 'test_out')), 'A should be placed from finished parts');
    const firstId = view!.id;
    for (let i = 3; i < 10; i++) await runPart(a, i, true);
    view = await diagnosticView(a);
    check(view?.id === firstId, 'resuming should continue the same diagnostic');
    check(view?.status === 'completed' && (view.overall_score ?? 0) > 0.9, `A finished: ${view?.status}, ${view?.overall_score}`);
    const statesA = await db.select().from(skillStates).where(eq(skillStates.studentId, a));
    check(statesA.length > 0 && statesA.every(s => s.state === 'learning' && s.l1PassingStreak === 0 && s.l2PassingStreak === 0 && s.lastPracticedAt === null),
      `A states: ${statesA.map(s => `${s.skillId}:${s.state}/${s.l1PassingStreak}/${s.stage}`).join(', ')}`);
    check(statesA.find(s => s.skillId === 'PS.mece')?.stage === null, 'A: PS.mece should start at the test-out');
    const tiersA = await db.select().from(drillTiers).where(eq(drillTiers.studentId, a));
    check(tiersA.length === 0, `A: diagnostic sets changed tiers: ${tiersA.map(t => `${t.drillId}=${t.currentTier}`)}`);
    const [progA] = await db.select().from(studentPrograms).where(and(eq(studentPrograms.studentId, a), eq(studentPrograms.status, 'active')));
    check(progA.track === 'standard', `A track: ${progA.track}`);

    // Student B: all wrong.
    const b = await newStudent();
    for (let i = 0; i < 10; i++) await runPart(b, i, false);
    const viewB = await diagnosticView(b);
    check(viewB?.status === 'completed' && (viewB.overall_score ?? 1) < 0.5, `B finished: ${viewB?.status}, ${viewB?.overall_score}`);
    check(Boolean(viewB?.placements.length) && viewB!.placements.every(p => p.place === 'recognize'), 'B should be placed at Recognize');
    const rxB = await db.select().from(prescriptions).where(eq(prescriptions.studentId, b));
    check(rxB.length > 0 && rxB.length <= 3 && rxB.every(r => r.sourceType === 'diagnostic'), `B prescriptions: ${rxB.map(r => `${r.skillId}/${r.sourceType}`)}`);
    const [progB] = await db.select().from(studentPrograms).where(and(eq(studentPrograms.studentId, b), eq(studentPrograms.status, 'active')));
    check(progB.track === 'foundations', `B track should be foundations, is ${progB.track}`);
    check((await diagnosticView(b))?.moved_to_track === 'foundations', 'B: the diagnostic should record the move to Foundations');
    check((await diagnosticView(a))?.moved_to_track === null, 'A: no track move expected');
    const pe = await db.select().from(drillTiers).where(and(eq(drillTiers.studentId, b), eq(drillTiers.drillId, 'PS-1')));
    check(pe[0]?.currentTier === 1, 'B: Recognize placement at tier 1');
  } finally {
    for (const s of students) {
      const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, s));
      const ids = sets.map(x => x.id);
      if (ids.length) {
        await db.delete(gradingJobs).where(inArray(gradingJobs.setId, ids));
        await db.delete(drillAttempts).where(inArray(drillAttempts.setId, ids));
        await db.delete(drillSets).where(inArray(drillSets.id, ids));
      }
      await db.delete(workouts).where(eq(workouts.studentId, s));
      await db.delete(studentPrograms).where(eq(studentPrograms.studentId, s));
      await db.delete(diagnostics).where(eq(diagnostics.studentId, s));
      for (const t of [prescriptions, skillStateEvents, skillStates, caseResults, drillTiers, studentDrillSettings]) await db.delete(t).where(eq(t.studentId, s));
      await db.delete(studentProfiles).where(eq(studentProfiles.userId, s));
    }
    await new Promise(r => setTimeout(r, 1500));
    for (const s of students) await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, s));
  }
  if (failures.length) {
    console.error(`Diagnostic smoke FAILED:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('Diagnostic smoke passed: stop and resume, placement without state changes, prescriptions, Foundations below 50%.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
