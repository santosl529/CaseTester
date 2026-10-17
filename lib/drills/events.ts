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
import { DRILL_EVENT_PROPS, type DrillEvent, type EventProps, type PendingEvent } from './event-props';

export type { DrillEvent, EventProps, PendingEvent } from './event-props';

const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';

// Inside a request, the event is written after the response is sent (Next's
// after()), so logging adds no latency for the student. Outside one (scripts),
// it is written straight away. The type requires the PRD's key properties
// for the event (event-props.ts).
export function logDrillEvent<E extends DrillEvent>(studentId: string, type: E, props: EventProps<E>): Promise<void> {
  const write = () => writeDrillEvent(studentId, type, props);
  try {
    after(write);
    return Promise.resolve();
  } catch {
    return write();
  }
}

// Events built inside a transaction, logged once it commits.
export async function logPendingEvents(studentId: string, events: PendingEvent[]): Promise<void> {
  for (const e of events) await logDrillEvent<DrillEvent>(studentId, e.type, e.props as EventProps<DrillEvent>);
}

async function writeDrillEvent(studentId: string, type: DrillEvent, props: Record<string, unknown>): Promise<void> {
  try {
    const [profile] = await db.select({ orgId: studentProfiles.orgId }).from(studentProfiles).where(eq(studentProfiles.userId, studentId));
    // A key property passed as undefined is stored as null, so it is never
    // missing from the row (JSON drops undefined).
    const required = Object.fromEntries(DRILL_EVENT_PROPS[type].map(k => [k, props[k] ?? null]));
    await logEvent(type, {
      ...props,
      ...required,
      student_id: studentId,
      org_id: profile?.orgId ?? null,
      taxonomy_version: TAXONOMY_VERSION,
      app_version: APP_VERSION,
    }, { userId: studentId });
  } catch (e) {
    console.error(`drills: failed to log ${type}`, e);
  }
}
