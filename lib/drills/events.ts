// Drills analytics events (docs/prd-drills.md "Analytics and event logging"),
// appended to analytics_events through the shared logEvent. Every event
// carries the student, their org, the taxonomy version and the app version.
// Logging never fails a student's request.
import 'server-only';
import { after } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentProfiles } from '@/db/schema';
import { logEvent } from '@/lib/analytics';
import { TAXONOMY_VERSION } from './config';

export type DrillEvent =
  | 'drill_set_started' | 'drill_example_viewed' | 'drill_example_skipped' | 'drill_item_served'
  | 'drill_attempt_submitted' | 'drill_set_completed' | 'drill_set_expired'
  | 'grading_job_completed' | 'grading_injection_suspected';

const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';

// Inside a request, the event is written after the response is sent (Next's
// after()), so logging adds no latency for the student. Outside one (scripts),
// it is written straight away.
export function logDrillEvent(studentId: string, type: DrillEvent, props: Record<string, unknown>): Promise<void> {
  const write = () => writeDrillEvent(studentId, type, props);
  try {
    after(write);
    return Promise.resolve();
  } catch {
    return write();
  }
}

async function writeDrillEvent(studentId: string, type: DrillEvent, props: Record<string, unknown>): Promise<void> {
  try {
    const [profile] = await db.select({ orgId: studentProfiles.orgId }).from(studentProfiles).where(eq(studentProfiles.userId, studentId));
    await logEvent(type, {
      ...props,
      student_id: studentId,
      org_id: profile?.orgId ?? null,
      taxonomy_version: TAXONOMY_VERSION,
      app_version: APP_VERSION,
    }, { userId: studentId });
  } catch (e) {
    console.error(`drills: failed to log ${type}`, e);
  }
}
