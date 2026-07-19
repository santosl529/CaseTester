// PRD §13: instrument as you build, not at the end. Append-only event log —
// separate from session_events (lib/orchestrator/session-runner.ts's
// logSessionEvent), which is scoring-input/conduct data, not product analytics.
import { db } from '@/db/client';
import { analyticsEvents } from '@/db/schema';

export async function logEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
  ids: { sessionId?: string; userId?: string } = {},
): Promise<void> {
  await db.insert(analyticsEvents).values({
    sessionId: ids.sessionId,
    userId: ids.userId,
    eventType,
    payloadJsonb: payload,
  });
}
