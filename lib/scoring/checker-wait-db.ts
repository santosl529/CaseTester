// The checker rows the wait reads (checker-wait.ts): the session's started checks and their verdict / error rows.
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessionEvents } from '@/db/schema';
import { logEvent } from '@/lib/analytics';
import { waitForCheckerVerdicts, type CheckerWait, type WaitRow } from './checker-wait';

export async function checkerRowsFor(sessionId: string): Promise<WaitRow[]> {
  return db.query.sessionEvents.findMany({
    where: and(eq(sessionEvents.sessionId, sessionId), or(
      and(eq(sessionEvents.category, 'check'), eq(sessionEvents.subtype, 'math_checker')),
      and(eq(sessionEvents.category, 'math_checker'), inArray(sessionEvents.subtype, ['verdict', 'error'])),
    )),
  }) as Promise<WaitRow[]>;
}

// Waits, then logs a timeout (analytics `checker_wait_timeout`) if one fired.
export async function finalizeCheckerVerdicts(sessionId: string, userId: string): Promise<CheckerWait> {
  const wait = await waitForCheckerVerdicts(() => checkerRowsFor(sessionId));
  if (wait.timedOut) {
    console.warn('[score] checker verdicts still pending after the wait', sessionId, wait.pending);
    await logEvent('checker_wait_timeout', { pending: wait.pending, waitedMs: wait.waitedMs }, { sessionId, userId });
  }
  return wait;
}
