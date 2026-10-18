// Feedback timing end to end against the real database: a first-timer
// starts on Immediate; At the end holds auto-checked feedback (no verdict or
// key in any reply) until the results and becomes the default; the choice is
// fixed once the first item is served; Immediate grades a written answer as
// it is submitted (with the real grader) and returns the same feedback as the
// results, after the follow-up when there is one; At the end grades written
// answers with the set; the set's job leaves an answer a live per-answer job
// is grading, and the results page's poll picks it up if that job dies;
// answer_graded is logged. Deletes everything it wrote.
//
//   npm run drills:smoke:feedback-timing     (a few Haiku calls, about $0.05)
import './smoke-log';
import { checkSmokeEvents } from './smoke-events';
import { printSmokeSpend } from './smoke-spend';
import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, drillAttempts, drillItems, drillSets, drillTiers, gradingJobs, prescriptions, skillStateEvents, skillStates, studentDrillSettings,
} from '@/db/schema';
import { withDefend } from '@/lib/drills/defend';
import type { Item, Tier } from '@/lib/drills/item-schema';
import type { ItemRef } from '@/lib/drills/sets/plan';
import { modelAnswerSteps } from '@/lib/drills/model-answers';
import { kickGrading, planOf, resolveItem, runGradingJob, enqueueGrading } from '@/lib/drills/grading/jobs';
import type { CallModel } from '@/lib/drills/grading/grader';
import {
  answerFeedback, completeSet, fetchItem, setResults, setTimer, setView, settingsFor, startSet, submitAttempt, type ItemFeedback, type StepReply,
} from '@/lib/drills/sets/service';

const student = randomUUID();
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
// Nothing that says right or wrong may reach the client in an At the end set.
const leaks = (v: unknown) => {
  const f = v as Record<string, unknown>;
  return Boolean(f.correct) || Boolean(f.correct_option_id) || Boolean(f.feedback) || Boolean(f.explanation) || (f.correct_answer !== undefined && f.correct_answer !== '' && !f.drivers)
    || Array.isArray(f.mistakes) && f.mistakes.length > 0 || f.grading !== undefined || f.model_answer !== undefined;
};

// Every auto-checked item answered: even positions right, odd wrong.
async function answerAuto(setId: string) {
  const [set] = await db.select().from(drillSets).where(eq(drillSets.id, setId));
  let right = 0;
  const replies: unknown[] = [];
  for (let p = 0; p < set.size; p++) {
    await fetchItem(student, setId, p);
    const item = await resolveItem(planOf(set)[p], set.tier as Tier);
    const option = item.options.find(o => o.correct === (p % 2 === 0))!;
    if (p % 2 === 0) right++;
    replies.push(await submitAttempt(student, setId, { position: p, idempotency_key: `ft-${setId}-${p}`, step: 0, response: { type: 'choice', option_id: option.id }, skip: false, timed_out: false }));
  }
  return { replies, expected: right / set.size };
}

// A CL-3 set of `n` items with follow-ups (tier 2), answered with the model
// answers; returns the final reply of each item.
async function writtenSet(feedback: 'immediate' | 'end', n: number) {
  const { set_id } = await startSet(student, { drill_id: 'CL-3', tier: 2, browse: true });
  const rows = await db.select().from(drillItems).where(and(eq(drillItems.drillId, 'CL-3'), eq(drillItems.status, 'live')));
  const picked = rows.filter(r => (r.payload as Item).defend).slice(0, n);
  const plan: ItemRef[] = picked.map(r => ({ kind: 'authored', item_id: r.itemId, version: r.version, defend: true }));
  await db.update(drillSets).set({ itemPlan: plan, size: plan.length }).where(eq(drillSets.id, set_id));
  await setTimer(student, set_id, { feedback, at_start: true });
  const finals: (ItemFeedback | StepReply)[] = [];
  for (let p = 0; p < plan.length; p++) {
    await fetchItem(student, set_id, p);
    const item = withDefend(picked[p].payload as Item);
    const answers = modelAnswerSteps(item);
    let reply: ItemFeedback | StepReply | null = null;
    for (const [i, response] of answers.entries()) {
      reply = await submitAttempt(student, set_id, { position: p, idempotency_key: `ft-${set_id}-${p}-${i}`, step: i, response, skip: false, timed_out: false });
      // Follow-ups first: no feedback before the reply.
      if (i < answers.length - 1) check(reply.done === false && !('grading' in (reply as StepReply).step), 'a step before the follow-up carried feedback');
    }
    finals.push(reply!);
  }
  return { setId: set_id, finals, size: plan.length };
}

async function main() {
  try {
    // A first-timer: Immediate.
    check((await settingsFor(student)).feedbackMode === 'immediate', 'a first-timer should default to Immediate');

    // At the end, auto-checked (PS-1): nothing about right or wrong until the results.
    const { set_id: auto } = await startSet(student, { drill_id: 'PS-1' });
    check((await setView(student, auto)).feedback_mode === 'immediate', 'the set should start from the default');
    await setTimer(student, auto, { feedback: 'end', at_start: true });
    check((await setView(student, auto)).feedback_mode === 'end', 'the intro choice was not saved');
    await fetchItem(student, auto, 0);
    await setTimer(student, auto, { feedback: 'immediate' });
    check((await setView(student, auto)).feedback_mode === 'end', 'the choice changed after the first item was served');
    const { replies, expected } = await answerAuto(auto);
    check(replies.every(r => (r as ItemFeedback).held === true && !leaks(r)), `held replies leak: ${JSON.stringify(replies[1])}`);
    await completeSet(student, auto);
    const autoResults = await setResults(student, auto);
    check(autoResults.status === 'completed' && Math.abs((autoResults.score ?? -1) - expected) < 1e-6, `At the end results: ${autoResults.status === 'completed' ? autoResults.score : autoResults.status}, expected ${expected}`);
    check(autoResults.status === 'completed' && autoResults.items.every(i => !i.feedback.held && i.feedback.explanation !== ''), 'the results should show full feedback');
    check((await settingsFor(student)).feedbackMode === 'end', 'the last choice should become the default');
    console.log(`At the end (PS-1): held every reply; results ${Math.round(expected * 100)}%`);

    // Immediate, written with follow-ups (CL-3, real grader): graded as submitted.
    const imm = await writtenSet('immediate', 2);
    check(imm.finals.every(f => (f as ItemFeedback).grading_now === true), 'Immediate written answers should come back grading');
    for (let p = 0; p < imm.size; p++) {
      const fb = await answerFeedback(student, imm.setId, p);
      check(fb.status === 'ready' && Boolean(fb.feedback.grading?.checks.length) && Boolean(fb.feedback.grading?.defend), `item ${p}: ${fb.status}${fb.status === 'ready' ? `, ${fb.feedback.grading?.checks.length ?? 0} checks, follow-up ${Boolean(fb.feedback.grading?.defend)}` : ''}`);
    }
    const jobs = await db.select().from(gradingJobs).where(eq(gradingJobs.setId, imm.setId));
    check(jobs.filter(j => j.attemptId).length === imm.size, `per-answer jobs: ${jobs.filter(j => j.attemptId).length}`);
    await completeSet(student, imm.setId);
    const immResults = await setResults(student, imm.setId);
    check(immResults.status === 'completed', `Immediate set after completion: ${immResults.status}`);
    if (immResults.status === 'completed') {
      const live = await Promise.all(Array.from({ length: imm.size }, (_, p) => answerFeedback(student, imm.setId, p)));
      check(live.every((f, p) => f.status === 'ready' && JSON.stringify(f.feedback) === JSON.stringify(immResults.items[p].feedback)), 'the item screen and results show different feedback');
    }
    console.log(`Immediate (CL-3, follow-ups): ${imm.size} answers graded as submitted; results ${immResults.status === 'completed' ? Math.round((immResults.score ?? 0) * 100) : '?'}%`);

    // At the end, written: graded with the set, nothing per answer.
    const end = await writtenSet('end', 1);
    check(end.finals.every(f => (f as ItemFeedback).pending === true && !(f as ItemFeedback).grading_now), 'At the end written answers should just be saved');
    check((await answerFeedback(student, end.setId, 0)).status === 'delayed', 'At the end should show nothing per answer');
    check((await db.select().from(gradingJobs).where(eq(gradingJobs.setId, end.setId))).every(j => !j.attemptId), 'At the end made a per-answer job');
    await completeSet(student, end.setId);
    check((await setResults(student, end.setId)).status === 'completed', 'At the end written set not graded');
    console.log('At the end (CL-3): graded with the set');

    // A live per-answer job: the set's job leaves its answer; once it dies, the poll grades it.
    const stub: CallModel = async (_s, user) => ({
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      output: { items: [{ item_key: 'answer', checks: [...user.matchAll(/check_id "([^"]+)"/g)].map(m => ({ check_id: m[1], reason: '', pass: false, evidence: '' })), red_flags: [...user.matchAll(/- id "([^"]+)"/g)].map(m => ({ id: m[1], present: false, evidence: '' })), hypothesis_family: null, backup_family: null, injection_suspected: false }] },
    });
    const race = await writtenSet('end', 1);
    const [att] = await db.select().from(drillAttempts).where(eq(drillAttempts.setId, race.setId));
    const [live] = await db.insert(gradingJobs).values({ setId: race.setId, attemptId: att.id, status: 'running', startedAt: new Date() }).returning();
    const setJob = await enqueueGrading(race.setId);
    await runGradingJob(setJob, stub);
    const [still] = await db.select().from(drillAttempts).where(eq(drillAttempts.id, att.id));
    check(still.gradingStatus === 'pending', `the set's job graded an answer a live per-answer job had (${still.gradingStatus})`);
    await db.update(gradingJobs).set({ startedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(gradingJobs.id, live.id));
    await kickGrading(race.setId, stub);
    const [after] = await db.select().from(drillSets).where(eq(drillSets.id, race.setId));
    check(after.status === 'completed', `after the per-answer job died, the poll didn't finish the set (${after.status})`);
    console.log('a live per-answer job is left alone; a dead one is picked up by the poll');

    // answer_graded, per answer, with the job that graded it.
    await new Promise(r => setTimeout(r, 1500));
    const graded = (await db.select().from(analyticsEvents).where(and(eq(analyticsEvents.userId, student), eq(analyticsEvents.eventType, 'answer_graded'))))
      .map(e => e.payloadJsonb as { job: string; grading_ms: number; feedback_mode: string });
    check(graded.some(g => g.job === 'answer' && g.feedback_mode === 'immediate' && g.grading_ms > 0) && graded.some(g => g.job === 'set'), `answer_graded: ${JSON.stringify(graded.slice(0, 3))}`);
    const ms = graded.filter(g => g.job === 'answer').map(g => g.grading_ms);
    console.log(`answer_graded: ${graded.length} events; Immediate grading ${ms.map(x => `${(x / 1000).toFixed(1)} s`).join(', ')}`);
  } finally {
    await printSmokeSpend([student]);
    const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, student));
    const ids = sets.map(s => s.id);
    if (ids.length) {
      await db.delete(gradingJobs).where(inArray(gradingJobs.setId, ids));
      await db.delete(drillAttempts).where(inArray(drillAttempts.setId, ids));
      await db.delete(drillSets).where(inArray(drillSets.id, ids));
    }
    for (const t of [drillTiers, prescriptions, skillStateEvents, skillStates, studentDrillSettings]) await db.delete(t).where(eq(t.studentId, student));
    await new Promise(r => setTimeout(r, 1500));
    await checkSmokeEvents([student], failures);
    await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, student));
    console.log(`cleaned up test student ${student}`);
  }
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
