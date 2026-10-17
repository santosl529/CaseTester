// End-to-end check of the D3 loop against the real database: a throwaway
// student's case result creates prescriptions; a prescribed set is the
// Construct test-out at tier 2; two passing sets reach Practiced; the transfer
// check reaches Mastered and gives credit down; a later case that flags the
// skill again drops it to Recognizes with a higher-priority prescription.
// Ingestion is idempotent, and dismissing works. QN-4 is scored by code, so
// this makes no AI calls. Deletes everything it wrote.
//
//   npm run drills:smoke:d3
import './smoke-log';
import { checkSmokeEvents } from './smoke-events';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, caseResults, drillAttempts, drillSets, drillTiers, gradingJobs, prescriptions, skillStateEvents,
  skillStates, studentDrillSettings,
} from '@/db/schema';
import { ingestCaseResult } from '@/lib/drills/progress/ingest';
import { dismissPrescription, skillProfile } from '@/lib/drills/progress/profile';
import { resolveItem, planOf } from '@/lib/drills/grading/jobs';
import { completeSet, fetchItem, setResults, startSet, submitAttempt } from '@/lib/drills/sets/service';
import type { StepResponse } from '@/lib/drills/sets/scoring';
import type { Tier } from '@/lib/drills/item-schema';

const student = randomUUID();
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/drills/case-results/market-entry-t2.json'), 'utf-8'));
const casePayload = (id: string, completedAt: string, findings = fixture.findings) =>
  ({ ...fixture, case_attempt_id: `smoke-${id}-${student}`, student_id: student, completed_at: completedAt, findings });

async function openRx(skillId: string) {
  const [rx] = await db.select().from(prescriptions)
    .where(and(eq(prescriptions.studentId, student), eq(prescriptions.skillId, skillId), eq(prescriptions.status, 'open')));
  return rx;
}

async function state(skillId: string) {
  const [s] = await db.select().from(skillStates).where(and(eq(skillStates.studentId, student), eq(skillStates.skillId, skillId)));
  return s;
}

// Answers every QN-4 item correctly from its key and completes the set.
async function runQn4Set(prescriptionId: string) {
  const { set_id } = await startSet(student, { prescription_id: prescriptionId });
  const [set] = await db.select().from(drillSets).where(eq(drillSets.id, set_id));
  for (let position = 0; position < set.size; position++) {
    await fetchItem(student, set_id, position);
    const item = await resolveItem(planOf(set)[position], set.tier as Tier);
    const steps: StepResponse[] = [
      { type: 'choice', option_id: item.options.find(o => o.correct)!.id },
      { type: 'numeric', value: String(item.numeric!.answer) },
    ];
    for (const [i, response] of steps.entries()) {
      await submitAttempt(student, set_id, { position, idempotency_key: `k-${set_id}-${position}-${i}`, step: i, response, skip: false, timed_out: false });
    }
  }
  await completeSet(student, set_id);
  return set;
}

async function main() {
  try {
    // A case flags a wrong formula (QN.setup, major) and a generic framework (PS.case_specific, minor).
    const first = await ingestCaseResult(casePayload('a', '2026-10-01T10:00:00Z'));
    check(first.status === 'ingested' && first.prescriptions === 2, `first case: ${JSON.stringify(first)}`);
    const again = await ingestCaseResult(casePayload('a', '2026-10-01T10:00:00Z'));
    check(again.status === 'duplicate', 'ingestion is not idempotent');

    const rx = await openRx('QN.setup');
    check(rx?.drillId === 'QN-4' && rx.stage === 'construct' && rx.tier === 2 && rx.priority === 2, `QN.setup prescription: ${JSON.stringify(rx)}`);
    check((await state('QN.setup'))?.state === 'learning', 'QN.setup should be Learning after its first prescription');

    // Test-out at tier 2, then a second passing set → Practiced.
    const s1 = await runQn4Set(rx.id);
    check(s1.tier === 2 && s1.source === 'prescription' && s1.stage === 'construct', `test-out set: tier ${s1.tier}, ${s1.source}, ${s1.stage}`);
    check((await state('QN.setup'))?.l2PassingStreak === 1, 'first passing set should count');
    const s2 = await runQn4Set(rx.id);
    check(s2.tier === 3, `second set should be tier 3, was ${s2.tier}`);
    const practiced = await state('QN.setup');
    check(practiced?.state === 'practiced' && practiced.transferDueAt !== null, `after two sets: ${practiced?.state}`);
    const r2 = await setResults(student, s2.id);
    check(r2.status === 'completed' && r2.skill_changes.some(c => c.skill_id === 'QN.setup' && c.to === 'practiced' && c.transfer_due_at),
      'results should show "now Practiced" with the transfer date');

    // Make the transfer check due, then pass it.
    await db.update(skillStates).set({ transferDueAt: new Date(Date.now() - 60_000) })
      .where(and(eq(skillStates.studentId, student), eq(skillStates.skillId, 'QN.setup')));
    const s3 = await runQn4Set(rx.id);
    check(s3.isTransferCheck && s3.tier === 2, `transfer set: transfer ${s3.isTransferCheck}, tier ${s3.tier}`);
    check((await state('QN.setup'))?.state === 'mastered', 'transfer check at 100% should reach Mastered');
    check((await state('QN.percentages'))?.state === 'recognizes', 'credit down: QN.percentages should be Recognizes');
    const [closed] = await db.select().from(prescriptions).where(eq(prescriptions.id, rx.id));
    check(closed.status === 'completed', `QN.setup prescription should be completed, is ${closed.status}`);

    // Profile and dismiss.
    const profile = await skillProfile(student);
    const qnSetup = profile.areas.flatMap(a => a.skills).find(s => s.id === 'QN.setup');
    check(qnSetup?.state === 'mastered' && qnSetup.next_review_at !== null, 'profile should show QN.setup Mastered with a review date');
    check(profile.prescriptions.map(p => p.skill_id).join() === 'PS.case_specific', `open prescriptions: ${profile.prescriptions.map(p => p.skill_id)}`);
    await dismissPrescription(student, profile.prescriptions[0].id);
    check((await skillProfile(student)).prescriptions.length === 0, 'dismissed prescription still listed');

    // A later case flags the wrong formula again: regression to Recognizes and
    // priority 2 (major) + 2 (flagged in the previous case) + 1 (regression).
    await ingestCaseResult(casePayload('b', '2026-10-20T10:00:00Z', [fixture.findings[0]]));
    check((await state('QN.setup'))?.state === 'recognizes', 'a flagged Mastered skill should drop to Recognizes');
    const rx2 = await openRx('QN.setup');
    check(rx2?.priority === 5, `regression prescription priority should be 5, is ${rx2?.priority}`);
    const events = await db.select().from(skillStateEvents).where(eq(skillStateEvents.studentId, student));
    // QN-4 also scores arithmetic and zeros-and-units, but only its primary
    // skill (QN.setup) moves.
    const history = events.map(e => `${e.skillId}:${e.toState}`).join(', ');
    check(history === [
      'QN.setup:learning', 'PS.case_specific:learning', 'QN.setup:practiced', 'QN.setup:mastered',
      'QN.percentages:recognizes', 'QN.setup:recognizes',
    ].join(', '), `state history: ${history}`);
  } finally {
    const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, student));
    const ids = sets.map(s => s.id);
    if (ids.length) {
      await db.delete(gradingJobs).where(inArray(gradingJobs.setId, ids));
      await db.delete(drillAttempts).where(inArray(drillAttempts.setId, ids));
      await db.delete(drillSets).where(inArray(drillSets.id, ids));
    }
    await db.delete(prescriptions).where(eq(prescriptions.studentId, student));
    await db.delete(skillStateEvents).where(eq(skillStateEvents.studentId, student));
    await db.delete(skillStates).where(eq(skillStates.studentId, student));
    await db.delete(caseResults).where(eq(caseResults.studentId, student));
    await db.delete(drillTiers).where(eq(drillTiers.studentId, student));
    await db.delete(studentDrillSettings).where(eq(studentDrillSettings.studentId, student));
    // Events are written after the response; give them a moment, then remove them.
    await new Promise(r => setTimeout(r, 1500));
    await checkSmokeEvents([student], failures);
    await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, student));
  }
  if (failures.length) {
    console.error(`D3 smoke FAILED:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('D3 smoke passed: case → prescriptions → test-out → Practiced → transfer → Mastered → regression; ingestion idempotent; dismiss works.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
