// D6 pilot feedback end to end against the real database, as a throwaway
// student: the feedback button attaches the item in play, Report a problem
// links the attempt, check-ins follow their rules (once a week; the open
// questions once each), answers and dismissals stick, the review queue takes
// labels, the daily limit holds, and the reports page sees it all. Free.
//
//   npm run drills:smoke:feedback
import './smoke-log';
import { checkSmokeEvents } from './smoke-events';
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, drillAttempts, drillCheckins, drillFeedback, drillItemReports, drillSets, drillTiers, gradingJobs, lessonViews, prescriptions,
  sessions, skillStateEvents, skillStates, studentDrillSettings, studentPrograms, studentProfiles, workouts,
} from '@/db/schema';
import { planOf, resolveItem } from '@/lib/drills/grading/jobs';
import type { Tier } from '@/lib/drills/item-schema';
import { completeSet, fetchItem, startSet, submitAttempt } from '@/lib/drills/sets/service';
import { onboard } from '@/lib/drills/program/store';
import { answerCheckin, FEEDBACK_PER_DAY, homeCheckin, reportProblem, reportQueue, reviewReport, setCheckin, submitFeedback } from '@/lib/drills/feedback';
import { feedbackReports, loadFeedback } from '@/lib/drills/reports/feedback';

const student = randomUUID();
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const DAY = 86_400_000;

async function answerSet(setId: string) {
  const [set] = await db.select().from(drillSets).where(eq(drillSets.id, setId));
  for (let p = 0; p < set.size; p++) {
    await fetchItem(student, setId, p);
    const item = await resolveItem(planOf(set)[p], set.tier as Tier);
    const steps = item.input.steps?.length ?? 1;
    for (let i = 0; i < steps; i++) {
      const type = item.input.steps?.[i].type ?? item.input.type;
      const response = type === 'numeric' ? { type: 'numeric' as const, value: String(item.numeric!.answer) } : { type: 'choice' as const, option_id: item.options.find(o => o.correct)!.id };
      await submitAttempt(student, setId, { position: p, idempotency_key: `fb-${setId}-${p}-${i}`, step: i, response, skip: false, timed_out: false });
    }
  }
  await completeSet(student, setId);
}

async function main() {
  try {
    await db.insert(studentProfiles).values({ userId: student, orgId: 'smoke-test', timezone: 'America/New_York' });
    await onboard(student, { wants_plan: false, interview_date: null, cases_done: '1-5', timezone: 'America/New_York' });

    // The feedback button on an item: the item in play is attached.
    const { set_id } = await startSet(student, { drill_id: 'PS-1' });
    await fetchItem(student, set_id, 0);
    await submitFeedback(student, { category: 'broken', comment: 'The timer froze', page: `/drills/sets/${set_id}`, set_id, device: 'smoke' });
    const [fb] = await db.select().from(drillFeedback).where(eq(drillFeedback.studentId, student));
    const [set] = await db.select().from(drillSets).where(eq(drillSets.id, set_id));
    const ref = planOf(set)[0];
    check(fb?.position === 0 && fb.itemId === (ref.kind === 'authored' ? ref.item_id : null), `feedback: item in play not attached (${fb?.itemId}, position ${fb?.position})`);
    check(fb?.appVersion !== null && fb?.device === 'smoke', 'feedback: app version or device missing');

    // Report a problem: before answering (no attempt), then after (attempt linked).
    await reportProblem(student, set_id, { position: 0, reason: 'question_confusing', comment: null, screen: 'item' });
    await answerSet(set_id);
    await reportProblem(student, set_id, { position: 0, reason: 'answer_key_wrong', comment: 'B is also right', screen: 'results' });
    const reports = await db.select().from(drillItemReports).where(eq(drillItemReports.studentId, student));
    check(reports.length === 2, `reports: ${reports.length} saved`);
    check(reports.some(r => r.reason === 'question_confusing' && r.attemptId === null), 'reports: a report before answering should have no attempt');
    check(reports.some(r => r.reason === 'answer_key_wrong' && r.attemptId !== null), 'reports: a report after answering should link the attempt');
    try {
      await reportProblem(student, set_id, { position: 99, reason: 'other', comment: null, screen: 'results' });
      failures.push('reports: a position outside the set was accepted');
    } catch { /* expected */ }

    // The review queue takes Matt's decision.
    const queued = (await reportQueue()).filter(q => q.report.studentId === student);
    check(queued.length === 2, `queue: ${queued.length} of this student's reports`);
    await reviewReport(reports[0].id, 'smoke', { status: 'resolved', notes: 'Key checked' });
    const [reviewed] = await db.select().from(drillItemReports).where(eq(drillItemReports.id, reports[0].id));
    check(reviewed.status === 'resolved' && reviewed.reviewerNotes === 'Key checked', 'queue: review not saved');

    // Usefulness check-in: shown after a completed set, again on a refresh,
    // then not for another set in the same week.
    const first = await setCheckin(student, set_id);
    check(first?.kind === 'set_usefulness', 'check-in: not shown after the first completed set');
    check((await setCheckin(student, set_id))?.id === first?.id, 'check-in: a refresh should show the same check-in');
    const { set_id: second } = await startSet(student, { drill_id: 'PS-1' });
    await answerSet(second);
    check(await setCheckin(student, second) === null, 'check-in: shown twice in one week');
    try {
      await answerCheckin(student, first!.id, { action: 'answer', comment: null });
      failures.push('check-in: answered without a rating');
    } catch { /* expected */ }
    await answerCheckin(student, first!.id, { action: 'answer', rating: 4, comment: 'Good mix' });
    check(await setCheckin(student, set_id) === null, 'check-in: shown again after it was answered');
    // A week later, the next completed set asks again.
    await db.update(drillCheckins).set({ createdAt: new Date(Date.now() - 8 * DAY) }).where(eq(drillCheckins.id, first!.id));
    const { set_id: third } = await startSet(student, { drill_id: 'PS-1' });
    await answerSet(third);
    const again = await setCheckin(student, third);
    check(again !== null, 'check-in: not asked again after a week');
    if (again) await answerCheckin(student, again.id, { action: 'dismiss' });

    // Home check-ins: none yet; the first full case; then the end of week 1.
    check(await homeCheckin(student) === null, 'home check-in: shown with no case and no week done');
    await db.insert(sessions).values({ userId: student, caseId: 'prof-001', status: 'completed', completedAt: new Date() });
    const caseCheckin = await homeCheckin(student);
    check(caseCheckin?.kind === 'first_case', `home check-in: expected first_case, got ${caseCheckin?.kind}`);
    check((await homeCheckin(student))?.id === caseCheckin?.id, 'home check-in: should stay until answered or dismissed');
    await answerCheckin(student, caseCheckin!.id, { action: 'answer', comment: 'More market sizing' });
    check(await homeCheckin(student) === null, 'home check-in: week 1 asked before 7 days');
    await db.update(studentPrograms).set({ startedAt: new Date(Date.now() - 8 * DAY) }).where(eq(studentPrograms.studentId, student));
    const week = await homeCheckin(student);
    check(week?.kind === 'week_1', `home check-in: expected week_1, got ${week?.kind}`);
    await answerCheckin(student, week!.id, { action: 'dismiss' });
    check(await homeCheckin(student) === null, 'home check-in: shown again after dismissal');

    // The daily limit.
    const sent = 1 + 2;
    for (let i = sent; i < FEEDBACK_PER_DAY; i++) await submitFeedback(student, { category: 'idea', comment: null, page: '/drills' });
    try {
      await submitFeedback(student, { category: 'idea', comment: null, page: '/drills' });
      failures.push(`limit: feedback number ${FEEDBACK_PER_DAY + 1} was accepted`);
    } catch { /* expected */ }

    // The reports page sees it.
    const fbr = feedbackReports(await loadFeedback('smoke-test'), {});
    const mine = new Set(reports.map(r => `${r.itemId}@${r.itemVersion}`));
    check(fbr.reported.some(r => mine.has(r.item)), 'reports page: reported item missing');
    check(fbr.feed.entries.some(e => e.comment === 'The timer froze'), 'reports page: feedback missing');
    check(fbr.weeks.some(w => w.answered >= 1), 'reports page: check-in week missing');
    console.log(`feedback: ${FEEDBACK_PER_DAY} messages and reports, ${reports.length} reports, check-ins once a week and once each`);
  } finally {
    // Feedback rows reference sets: delete them first.
    for (const t of [drillFeedback, drillItemReports, drillCheckins]) await db.delete(t).where(eq(t.studentId, student));
    await db.delete(sessions).where(eq(sessions.userId, student));
    const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, student));
    const ids = sets.map(s => s.id);
    if (ids.length) {
      await db.delete(gradingJobs).where(inArray(gradingJobs.setId, ids));
      await db.delete(drillAttempts).where(inArray(drillAttempts.setId, ids));
      await db.delete(drillSets).where(inArray(drillSets.id, ids));
    }
    await db.delete(workouts).where(eq(workouts.studentId, student));
    await db.delete(studentPrograms).where(eq(studentPrograms.studentId, student));
    for (const t of [prescriptions, skillStateEvents, skillStates, drillTiers, studentDrillSettings, lessonViews]) await db.delete(t).where(eq(t.studentId, student));
    await db.delete(studentProfiles).where(eq(studentProfiles.userId, student));
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

main().catch(e => {
  console.error(e);
  process.exit(1);
});
