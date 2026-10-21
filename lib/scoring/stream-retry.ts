// Phase 1 4.11 (Lorenzo, 22 Oct: "Scoring: retry with backoff when the scoring stream dies."). Batch 35 Hollis Bay
// Marcus was never scored: the stream died after one Opus call ("scoring failed: terminated", $0.07), and the pass
// failed whole; the verifier and the reconciliation pass swallow the same death and ship unverified. Each Opus
// stream (judge, claim verifier, reconciliation) is now retried on its own when the connection dies or the API is
// briefly unavailable — never on an answer the model gave (a refusal, a cut-off, unparseable output) and never on a
// request error (4xx) — so a pass already done is never paid for again. The retries run inside the pass and so
// inside its claim (scoring-claim.ts: the claim beats while the pass runs, and the row is written only by its own
// claim): a retry can never write a second report. A dead stream's partial output is discarded: the retry is the
// whole call again, and only a completed message is read.
import Anthropic from '@anthropic-ai/sdk';

export const STREAM_RETRY_BACKOFF_MS = [2_000, 8_000] as const;   // two retries: 2 s, then 8 s

// The connection died or the service was briefly unavailable: worth one more try.
export function isStreamDeath(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true;   // includes the timeout
  if (err instanceof Anthropic.APIError && typeof err.status === 'number') return err.status === 429 || err.status >= 500;
  if (err instanceof Anthropic.APIError) {
    // An error event mid-stream carries no HTTP status: overloaded / api_error are transient.
    const type = (err.error as { error?: { type?: string } } | undefined)?.error?.type;
    return type === 'overloaded_error' || type === 'api_error';
  }
  const e = err as { message?: string; code?: string; cause?: { code?: string; message?: string } } | null;
  const text = `${e?.message ?? ''} ${e?.code ?? ''} ${e?.cause?.code ?? ''} ${e?.cause?.message ?? ''}`;
  return /\bterminated\b|ECONNRESET|ETIMEDOUT|EPIPE|UND_ERR_SOCKET|UND_ERR_BODY_TIMEOUT|socket hang up|other side closed|premature close/i.test(text);
}

export type RetryDeps = { sleep: (ms: number) => Promise<void>; log?: (msg: string) => void };
const realDeps: RetryDeps = { sleep: ms => new Promise(r => setTimeout(r, ms)), log: m => console.warn(m) };

// `call` again after each death, with backoff; any other error, or the last death, is thrown as it was.
export async function withStreamRetry<T>(label: string, call: () => Promise<T>, deps: RetryDeps = realDeps): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (attempt >= STREAM_RETRY_BACKOFF_MS.length || !isStreamDeath(err)) throw err;
      const wait = STREAM_RETRY_BACKOFF_MS[attempt];
      deps.log?.(`[${label}] stream died (${err instanceof Error ? err.message : String(err)}); retry ${attempt + 1} of ${STREAM_RETRY_BACKOFF_MS.length} in ${wait} ms`);
      await deps.sleep(wait);
    }
  }
}
