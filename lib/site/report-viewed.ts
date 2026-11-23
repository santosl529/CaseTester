// The pilot dashboard's "read the report" (Matt, 22 Nov 2026): the owner's first view of a graded report.
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { analyticsEvents } from '@/db/schema';
import { logEvent } from '@/lib/analytics';

export async function noteReportViewed(userId: string, sessionId: string): Promise<void> {
  const [seen] = await db.select({ id: analyticsEvents.id }).from(analyticsEvents)
    .where(and(eq(analyticsEvents.sessionId, sessionId), eq(analyticsEvents.eventType, 'report_viewed'))).limit(1);
  if (!seen) await logEvent('report_viewed', {}, { sessionId, userId });
}
