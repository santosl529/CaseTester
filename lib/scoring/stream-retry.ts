// Phase 1 4.11 (Lorenzo, 22 Oct: "Scoring: retry with backoff when the scoring stream dies."). Batch 35 Hollis Bay
// Marcus was never scored: the stream died after one Opus call ("scoring failed: terminated", $0.07), and the pass
// failed whole; the verifier and the reconciliation pass swallow the same death and ship unverified. Each Opus
// stream (judge, claim verifier, reconciliation) is now retried on its own when the connection dies mid-stream —
// never on an answer the model gave (a refusal, a cut-off, unparseable output) and never on a request error — so a
// pass already done is never paid for again. The retries run inside the pass and so inside its claim
// (scoring-claim.ts: the claim beats while the pass runs, and the row is written only by its own claim): a retry can
// never write a second report. A dead stream's partial output is discarded: the retry is the whole call again, and
// only a completed message is read.
import { AsyncLocalStorage } from 'node:async_hooks';
import Anthropic from '@anthropic-ai/sdk';

export const STREAM_RETRY_BACKOFF_MS = [2_000, 8_000] as const;   // two retries: 2 s, then 8 s
// The score route's maxDuration is 300 s. A retry that would run past this writes nothing and leaves the next
// attempt to pay for all three Opus passes again, so a pass that dies late fails now instead (review item 6).
export const SCORING_BUDGET_MS = 240_000;

// The scoring pass's deadline, for the streams inside it. AsyncLocalStorage, as lib/analytics.ts's draft scope: two
// sessions can be scored in one process, so a module-level deadline would be the wrong one.
const deadlines = new AsyncLocalStorage<number>();
export function withScoringDeadline<T>(deadlineAt: number, fn: () => Promise<T>): Promise<T> {
  return deadlines.run(deadlineAt, fn);
}

// The connection died mid-stream: worth one more try.
//
// Review item 5: the 429 / 5xx branch is gone. The SDK retries those itself — `maxRetries` defaults to 2, and its
// `shouldRetry` honours `x-should-retry` and Retry-After on 408, 409, 429 and every 5xx — so retrying them here
// multiplied the layers: one 429 could cost 3 × 3 = 9 HTTP attempts and 10 s of our own sleeps on top of the SDK's.
// The genuine gap is the death the SDK cannot retry, because the request already succeeded: the socket dropping
// part-way through the stream, and the `error` SSE event mid-stream (core/streaming.js throws it as an APIError
// with **no** HTTP status, so a status means the SDK already retried it and gave up). Dropping the branch was the
// choice over `maxRetries: 0` on the three calls: that would have thrown away the SDK's Retry-After handling and
// its pre-stream connection retries to buy nothing.
export function isStreamDeath(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true;   // includes the timeout
  if (err instanceof Anthropic.APIError) {
    if (typeof err.status === 'number') return false;             // an HTTP error the SDK has already retried
    const type = err.type ?? (err.error as { error?: { type?: string } } | undefined)?.error?.type;
    return type === 'overloaded_error' || type === 'api_error';
  }
  const e = err as { message?: string; code?: string; cause?: { code?: string; message?: string } } | null;
  const text = `${e?.message ?? ''} ${e?.code ?? ''} ${e?.cause?.code ?? ''} ${e?.cause?.message ?? ''}`;
  return /\bterminated\b|ECONNRESET|ETIMEDOUT|EPIPE|UND_ERR_SOCKET|UND_ERR_BODY_TIMEOUT|socket hang up|other side closed|premature close/i.test(text);
}

export type RetryDeps = { sleep: (ms: number) => Promise<void>; log?: (msg: string) => void; now?: () => number; deadlineAt?: number };
const realDeps: RetryDeps = { sleep: ms => new Promise(r => setTimeout(r, ms)), log: m => console.warn(m) };

// `call` again after each death, with backoff; any other error, or the last death, is thrown as it was. A retry is
// skipped when its backoff plus another call as long as the one that just died would run past the pass's deadline
// (`withScoringDeadline`, or `deps.deadlineAt`): the death is thrown now, while the route can still answer.
export async function withStreamRetry<T>(label: string, call: () => Promise<T>, deps: RetryDeps = realDeps): Promise<T> {
  const now = deps.now ?? Date.now;
  const deadlineAt = deps.deadlineAt ?? deadlines.getStore();
  for (let attempt = 0; ; attempt++) {
    const startedAt = now();
    try {
      return await call();
    } catch (err) {
      if (attempt >= STREAM_RETRY_BACKOFF_MS.length || !isStreamDeath(err)) throw err;
      const wait = STREAM_RETRY_BACKOFF_MS[attempt];
      const took = now() - startedAt;
      if (deadlineAt !== undefined && now() + wait + took > deadlineAt) {
        deps.log?.(`[${label}] stream died after ${took} ms (${err instanceof Error ? err.message : String(err)}); not retried: ${wait} ms of backoff plus another call would pass the scoring deadline`);
        throw err;
      }
      deps.log?.(`[${label}] stream died (${err instanceof Error ? err.message : String(err)}); retry ${attempt + 1} of ${STREAM_RETRY_BACKOFF_MS.length} in ${wait} ms`);
      await deps.sleep(wait);
    }
  }
}
