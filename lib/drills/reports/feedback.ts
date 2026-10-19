// Pilot feedback on the reports page (D6): the feedback feed, reported items
// and check-in averages by week. Pure functions over rows (tested), plus a
// loader for one club or every student.
import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillCheckins, drillFeedback, drillItemReports, drillSets, studentProfiles } from '@/db/schema';
import { checkinWeeks, feedbackFeed, reportedItems, type FeedbackRows } from './feedback-compute';
import { TEST_ORGS } from './data';

export * from './feedback-compute';

export async function loadFeedback(orgId: string | null): Promise<FeedbackRows> {
  const profiles = await db.select({ id: studentProfiles.userId, orgId: studentProfiles.orgId }).from(studentProfiles)
    .where(orgId ? eq(studentProfiles.orgId, orgId) : undefined);
  const students = orgId ? profiles : profiles.filter(p => !TEST_ORGS.includes(p.orgId ?? ''));
  const ids = students.map(s => s.id);
  if (ids.length === 0) return { feedback: [], reports: [], checkins: [], clubOf: new Map() };
  // In sequence, like loadReportData (parallel queries stalled the pooler).
  const feedback = await db.select().from(drillFeedback).where(inArray(drillFeedback.studentId, ids)).orderBy(desc(drillFeedback.createdAt));
  const reports = await db.select({ report: drillItemReports, drillId: drillSets.drillId }).from(drillItemReports)
    .innerJoin(drillSets, eq(drillSets.id, drillItemReports.setId)).where(inArray(drillItemReports.studentId, ids)).orderBy(desc(drillItemReports.createdAt));
  const checkins = await db.select().from(drillCheckins).where(inArray(drillCheckins.studentId, ids));
  return {
    feedback: feedback.map(f => ({ at: f.createdAt, studentId: f.studentId, category: f.category, comment: f.comment, page: f.page, item: f.itemId ? `${f.itemId}@${f.itemVersion}` : f.templateId, device: f.device })),
    reports: reports.map(({ report: r, drillId }) => ({
      at: r.createdAt, studentId: r.studentId, setId: r.setId, drillId, item: r.itemId ? `${r.itemId}@${r.itemVersion}` : r.templateId ?? '?',
      reason: r.reason, comment: r.comment, status: r.status,
    })),
    checkins: checkins.map(c => ({ at: c.answeredAt ?? c.createdAt, studentId: c.studentId, kind: c.kind, status: c.status, rating: c.rating, comment: c.comment })),
    clubOf: new Map(students.map(s => [s.id, s.orgId])),
  };
}

export function feedbackReports(rows: FeedbackRows, filter: { type?: string; page?: string }) {
  return { feed: feedbackFeed(rows, filter), reported: reportedItems(rows), weeks: checkinWeeks(rows) };
}
