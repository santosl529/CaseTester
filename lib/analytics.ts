// PRD §13: instrument as you build, not at the end. Append-only event log —
// separate from session_events (lib/orchestrator/session-runner.ts's
// logSessionEvent), which is scoring-input/conduct data, not product analytics.
import { AsyncLocalStorage } from 'node:async_hooks';
import { db } from '@/db/client';
import { analyticsEvents } from '@/db/schema';

// Model usage logged inside a speculative draft (lib/orchestrator/speculative-
// turn.ts) carries the draft's id, so cancelled drafts' cost can be counted.
const draftScope = new AsyncLocalStorage<string>();
export function inDraftScope<T>(draftId: string, fn: () => T): T {
  return draftScope.run(draftId, fn);
}
export function currentDraftId(): string | undefined {
  return draftScope.getStore();
}

export async function logEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
  ids: { sessionId?: string; userId?: string } = {},
): Promise<void> {
  await db.insert(analyticsEvents).values({
    sessionId: ids.sessionId,
    userId: ids.userId,
    eventType,
    payloadJsonb: eventType === 'llm_usage' && currentDraftId() ? { ...payload, speculativeDraftId: currentDraftId() } : payload,
  });
}
