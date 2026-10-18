// Scoring waits for the math checker (Lorenzo, 18 Oct; batch 31 Marisol t19:
// the closing message's verdict landed after the close). The harness awaits
// every background check before it scores; the app's score route did not —
// a verdict still running when the candidate pressed Score (up to the
// checker's 30s timeout) was missing from the report. A check is started on a
// candidate message when its `math_checker` check row says so; it is done when
// a verdict or error row for that message exists.
import { MATH_CHECKER_TIMEOUT_MS } from '@/lib/orchestrator/math-checker-live';

export type WaitRow = { category: string; subtype: string; turnIndex: number | null; payloadJsonb: unknown };

// Candidate messages whose check started and has no verdict or error yet.
export function pendingCheckerTurns(rows: WaitRow[]): number[] {
  const started = rows
    .filter(r => r.category === 'check' && r.subtype === 'math_checker' && r.turnIndex !== null
      && Boolean((r.payloadJsonb as { detail?: { started?: boolean } } | null)?.detail?.started))
    .map(r => r.turnIndex as number);
  const done = new Set(rows
    .filter(r => r.category === 'math_checker' && (r.subtype === 'verdict' || r.subtype === 'error'))
    .map(r => (r.payloadJsonb as { candidateTurnIndex?: number } | null)?.candidateTurnIndex));
  return [...new Set(started)].filter(n => !done.has(n)).sort((a, b) => a - b);
}

export type CheckerWait = { pending: number[]; waitedMs: number; timedOut: boolean };

// Polls until no check is pending, or the checker's own timeout has passed.
export async function waitForCheckerVerdicts(read: () => Promise<WaitRow[]>, o: {
  timeoutMs?: number; pollMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void>;
} = {}): Promise<CheckerWait> {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
  const timeoutMs = o.timeoutMs ?? MATH_CHECKER_TIMEOUT_MS;
  const start = now();
  for (;;) {
    const pending = pendingCheckerTurns(await read());
    const waitedMs = now() - start;
    if (pending.length === 0) return { pending, waitedMs, timedOut: false };
    if (waitedMs >= timeoutMs) return { pending, waitedMs, timedOut: true };
    await sleep(Math.min(o.pollMs ?? 500, Math.max(0, timeoutMs - waitedMs)));
  }
}
