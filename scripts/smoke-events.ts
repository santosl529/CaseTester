// Before a smoke deletes its test students' events: every drills event they
// logged must carry its key properties (lib/drills/event-audit.ts). Prints
// the events seen, so a run shows which ones it exercised.
import { inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { analyticsEvents } from '@/db/schema';
import { auditEventRows } from '@/lib/drills/event-audit';

export async function checkSmokeEvents(studentIds: string[], failures: string[]): Promise<void> {
  if (studentIds.length === 0) return;
  const rows = await db.select({ id: analyticsEvents.id, eventType: analyticsEvents.eventType, payload: analyticsEvents.payloadJsonb })
    .from(analyticsEvents).where(inArray(analyticsEvents.userId, studentIds));
  const { seen, incomplete } = auditEventRows(rows);
  for (const line of incomplete) failures.push(`event missing properties: ${line}`);
  console.log(`events seen: ${[...seen.keys()].sort().join(', ') || 'none'}`);
}
