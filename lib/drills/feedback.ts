// D6 pilot feedback (docs/prd-drills.md "Pilot feedback"): the feedback
// button, "Report a problem" (grade disputes included) and check-ins. Plain
// storage, no AI calls. The set and item in play are resolved here from the
// student's own set, so the page sends only the set id.
import 'server-only';
import { and, count, desc, eq, gte, inArray, isNotNull, min, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { drillAttempts, drillCheckins, drillFeedback, drillItemReports, drillSets, sessions, studentPrograms } from '@/db/schema';
import { APP_VERSION, logDrillEvent } from './events';
import { planOf } from './grading/jobs';
import { DrillError } from './sets/service';
import { programView } from './program/store';

const DAY = 86_400_000;
export const COMMENT_MAX = 500;
// Feedback and reports per student per day: generous for real use, a stop
// for a stuck key or a script.
export const FEEDBACK_PER_DAY = 30;

const comment = z.string().trim().max(COMMENT_MAX).optional().transform(s => (s ? s : null));

export const FeedbackSchema = z.object({
  category: z.enum(['broken', 'confusing', 'idea']),
  comment,
  page: z.string().max(200).regex(/^\/drills(\/|$)/),
  set_id: z.uuid().optional(),
  device: z.string().max(300).optional(),
});

export const ReportSchema = z.object({
  position: z.number().int().nonnegative(),
  reason: z.enum(['answer_key_wrong', 'question_confusing', 'grade_unfair', 'other']),
  comment,
  screen: z.enum(['item', 'results']),
});

async function underDailyLimit(studentId: string) {
  const since = new Date(Date.now() - DAY);
  const [f] = await db.select({ n: count() }).from(drillFeedback).where(and(eq(drillFeedback.studentId, studentId), gte(drillFeedback.createdAt, since)));
  const [r] = await db.select({ n: count() }).from(drillItemReports).where(and(eq(drillItemReports.studentId, studentId), gte(drillItemReports.createdAt, since)));
  if (f.n + r.n >= FEEDBACK_PER_DAY) throw new DrillError('too_many', 429, "You've sent a lot of feedback today. Thank you! Please try again tomorrow.");
}

async function ownSet(studentId: string, setId: string) {
  const [set] = await db.select().from(drillSets).where(and(eq(drillSets.id, setId), eq(drillSets.studentId, studentId)));
  if (!set) throw new DrillError('not_found', 404, 'Set not found');
  return set;
}

const refColumns = (ref: ReturnType<typeof planOf>[number] | undefined) => ref
  ? (ref.kind === 'authored' ? { itemId: ref.item_id, itemVersion: ref.version, templateId: null } : { itemId: null, itemVersion: null, templateId: ref.template_id })
  : { itemId: null, itemVersion: null, templateId: null };

// ------------------------------------------------------------ feedback button

export async function submitFeedback(studentId: string, body: z.infer<typeof FeedbackSchema>) {
  await underDailyLimit(studentId);
  let set: Awaited<ReturnType<typeof ownSet>> | null = null;
  if (body.set_id) set = await ownSet(studentId, body.set_id).catch(() => null);
  // The item in play: the one being answered (an unfinished set) or none.
  const position = set && set.status === 'in_progress' && set.currentPosition < set.size ? set.currentPosition : null;
  const [row] = await db.insert(drillFeedback).values({
    studentId, category: body.category, comment: body.comment, page: body.page, setId: set?.id ?? null, position,
    ...refColumns(set && position !== null ? planOf(set)[position] : undefined),
    device: body.device ?? null, appVersion: APP_VERSION,
  }).returning({ id: drillFeedback.id });
  await logDrillEvent(studentId, 'feedback_submitted', { feedback_id: row.id, category: body.category, page: body.page });
  return { ok: true };
}

// ---------------------------------------------------------- report a problem

export async function reportProblem(studentId: string, setId: string, body: z.infer<typeof ReportSchema>) {
  await underDailyLimit(studentId);
  const set = await ownSet(studentId, setId);
  if (body.position >= set.size) throw new DrillError('bad_request', 400, 'No such item in this set');
  const [attempt] = await db.select({ id: drillAttempts.id }).from(drillAttempts)
    .where(and(eq(drillAttempts.setId, set.id), eq(drillAttempts.position, body.position)));
  const [row] = await db.insert(drillItemReports).values({
    studentId, setId: set.id, position: body.position, attemptId: attempt?.id ?? null, ...refColumns(planOf(set)[body.position]),
    screen: body.screen, reason: body.reason, comment: body.comment,
  }).returning({ id: drillItemReports.id, itemId: drillItemReports.itemId });
  await logDrillEvent(studentId, 'item_report_submitted', {
    report_id: row.id, reason: body.reason, screen: body.screen, item_id: row.itemId, attempt_id: attempt?.id ?? null,
  });
  return { ok: true };
}

// ------------------------------------------------------------------ check-ins

export type CheckinKind = 'set_usefulness' | 'first_case' | 'week_1';
export interface Checkin { id: string; kind: CheckinKind }

async function shown(studentId: string, kind: CheckinKind, setId: string | null): Promise<Checkin | null> {
  const [row] = await db.insert(drillCheckins).values({ studentId, kind, setId }).onConflictDoNothing().returning({ id: drillCheckins.id });
  if (!row) return null;
  await logDrillEvent(studentId, 'checkin_shown', { kind });
  return { id: row.id, kind };
}

// After a completed set: "How useful was today's practice?", at most once a
// week. Shown again on a refresh of the same set's results until answered or
// dismissed; never on a diagnostic part.
export async function setCheckin(studentId: string, setId: string, now = new Date()): Promise<Checkin | null> {
  const [own] = await db.select({ id: drillCheckins.id, status: drillCheckins.status }).from(drillCheckins)
    .where(and(eq(drillCheckins.studentId, studentId), eq(drillCheckins.kind, 'set_usefulness'), eq(drillCheckins.setId, setId)));
  if (own) return own.status === 'shown' ? { id: own.id, kind: 'set_usefulness' } : null;
  const [recent] = await db.select({ id: drillCheckins.id }).from(drillCheckins)
    .where(and(eq(drillCheckins.studentId, studentId), eq(drillCheckins.kind, 'set_usefulness'), gte(drillCheckins.createdAt, new Date(now.getTime() - 7 * DAY))));
  if (recent) return null;
  const set = await ownSet(studentId, setId);
  if (set.status !== 'completed' || set.source === 'diagnostic') return null;
  return shown(studentId, 'set_usefulness', setId);
}

// On the training home: "What would make this more useful?" after the first
// full case, and at the end of week 1 (week 2 reached on a weekly plan;
// otherwise 7 days after the first program started). One at a time, each
// shown until answered or dismissed.
export async function homeCheckin(studentId: string, now = new Date()): Promise<Checkin | null> {
  const rows = await db.select({ id: drillCheckins.id, kind: drillCheckins.kind, status: drillCheckins.status }).from(drillCheckins)
    .where(and(eq(drillCheckins.studentId, studentId), inArray(drillCheckins.kind, ['first_case', 'week_1'])));
  const waiting = rows.find(r => r.status === 'shown');
  if (waiting) return { id: waiting.id, kind: waiting.kind };
  const asked = new Set(rows.map(r => r.kind));
  if (!asked.has('first_case')) {
    const [c] = await db.select({ n: count() }).from(sessions)
      .where(and(eq(sessions.userId, studentId), eq(sessions.status, 'completed'), isNotNull(sessions.completedAt)));
    if (c.n > 0) return shown(studentId, 'first_case', null);
  }
  if (!asked.has('week_1')) {
    const view = await programView(studentId, now);
    const [first] = await db.select({ at: min(studentPrograms.startedAt) }).from(studentPrograms).where(eq(studentPrograms.studentId, studentId));
    const due = view?.plan.kind === 'weeks'
      ? (view.week?.week ?? 0) >= 2
      : first?.at !== null && first?.at !== undefined && now.getTime() - first.at.getTime() >= 7 * DAY;
    if (due) return shown(studentId, 'week_1', null);
  }
  return null;
}

export const CheckinAnswerSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('answer'), rating: z.number().int().min(1).max(5).optional(), comment }),
  z.object({ action: z.literal('dismiss') }),
]);

export async function answerCheckin(studentId: string, id: string, body: z.infer<typeof CheckinAnswerSchema>) {
  if (!z.uuid().safeParse(id).success) throw new DrillError('not_found', 404, 'Check-in not found');
  const [row] = await db.select().from(drillCheckins).where(and(eq(drillCheckins.id, id), eq(drillCheckins.studentId, studentId)));
  if (!row) throw new DrillError('not_found', 404, 'Check-in not found');
  if (row.status !== 'shown') return { ok: true };
  if (body.action === 'dismiss') {
    await db.update(drillCheckins).set({ status: 'dismissed', answeredAt: new Date() }).where(eq(drillCheckins.id, id));
    await logDrillEvent(studentId, 'checkin_dismissed', { kind: row.kind });
    return { ok: true };
  }
  // The usefulness check-in needs a rating; the open questions need an answer.
  if (row.kind === 'set_usefulness' && !body.rating) throw new DrillError('bad_request', 400, 'Pick a number from 1 to 5');
  if (row.kind !== 'set_usefulness' && !body.comment) throw new DrillError('bad_request', 400, 'Write an answer, or choose Not now');
  await db.update(drillCheckins).set({
    status: 'answered', rating: row.kind === 'set_usefulness' ? body.rating! : null, comment: body.comment, answeredAt: new Date(),
  }).where(eq(drillCheckins.id, id));
  await logDrillEvent(studentId, 'checkin_answered', { kind: row.kind, rating: row.kind === 'set_usefulness' ? body.rating! : null });
  return { ok: true };
}

// ------------------------------------------------- review queue (local dev)

export const ReviewSchema = z.object({
  status: z.enum(['open', 'labeled', 'resolved', 'dismissed']),
  labels: z.record(z.string(), z.boolean()).optional(),
  red_flags: z.record(z.string(), z.boolean()).optional(),
  notes: z.string().max(2000).optional(),
});

export async function reviewReport(id: string, reviewer: string, body: z.infer<typeof ReviewSchema>) {
  if (!z.uuid().safeParse(id).success) throw new DrillError('not_found', 404, 'Report not found');
  const updated = await db.update(drillItemReports).set({
    status: body.status, labels: body.labels ?? null, redFlags: body.red_flags ?? null, reviewerNotes: body.notes?.trim() || null,
    reviewedBy: reviewer, reviewedAt: new Date(),
  }).where(eq(drillItemReports.id, id)).returning({ id: drillItemReports.id });
  if (!updated.length) throw new DrillError('not_found', 404, 'Report not found');
  return { ok: true };
}

// The queue, newest first: open reports, then the rest.
export async function reportQueue(limit = 200) {
  return db.select({ report: drillItemReports, attempt: drillAttempts, drillId: drillSets.drillId, tier: drillSets.tier, plan: drillSets.itemPlan })
    .from(drillItemReports)
    .innerJoin(drillSets, eq(drillSets.id, drillItemReports.setId))
    .leftJoin(drillAttempts, eq(drillAttempts.id, drillItemReports.attemptId))
    .orderBy(sql`${drillItemReports.status} = 'open' desc`, desc(drillItemReports.createdAt))
    .limit(limit);
}
