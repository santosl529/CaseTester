// Every SDK retry and rate-limit response is logged, per call (Lorenzo, 6 Nov: "so a hidden retry can't look like a
// slow first token"). The Anthropic SDK retries 408/409/429/5xx and connection errors on its own (maxRetries 2,
// with backoff) and the caller sees only one slow request. Each attempt carries X-Stainless-Retry-Count, so this
// fetch wrapper sees every one: an attempt that is a retry, or that gets a non-2xx status or a network error, is
// logged with its model, attempt number, status, retry-after and how long the SDK waited before sending it. A call
// that runs inside `withLlmCall` (the interviewer's stream) also gets the attempt as a timing mark on its turn.
import { AsyncLocalStorage } from 'node:async_hooks';

export type LlmAttempt = {
  model: string | null;
  attempt: number;                 // 0 = the first try; n = the SDK's nth retry
  status: number | 'network_error';
  retryAfterMs: number | null;     // what the server asked for (retry-after-ms / retry-after)
  waitedMs: number | null;         // the SDK's wait before this attempt (from the previous attempt's answer)
  durationMs: number;              // until the response headers (or the error)
  requestId: string | null;
};

type CallContext = { onAttempt?: (a: LlmAttempt) => void; lastAnsweredAt?: number };
const calls = new AsyncLocalStorage<CallContext>();

// Runs `fn` as one logical call: its attempts are reported to `onAttempt`, and waits are measured within it.
export function withLlmCall<T>(onAttempt: ((a: LlmAttempt) => void) | undefined, fn: () => T): T {
  return calls.run({ onAttempt }, fn);
}

const header = (init: RequestInit | undefined, name: string): string | null => {
  const h = init?.headers;
  if (!h) return null;
  if (h instanceof Headers) return h.get(name);
  if (Array.isArray(h)) return h.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null;
  const rec = h as Record<string, string>;
  const key = Object.keys(rec).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? rec[key] : null;
};

function retryAfterMs(res: Response): number | null {
  const ms = Number(res.headers.get('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const s = res.headers.get('retry-after');
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n)) return n * 1000;
  const at = Date.parse(s);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

const modelOf = (init: RequestInit | undefined): string | null => {
  try { return typeof init?.body === 'string' ? (JSON.parse(init.body) as { model?: string }).model ?? null : null; } catch { return null; }
};

export function attemptLoggingFetch(base: typeof fetch, o: { log?: (m: string) => void; now?: () => number } = {}): typeof fetch {
  const log = o.log ?? (m => console.warn(m));
  const now = o.now ?? (() => Date.now());
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!/\/v1\/messages(\?|$)/.test(url)) return base(input, init);
    const ctx = calls.getStore();
    const attempt = Number(header(init, 'x-stainless-retry-count') ?? 0) || 0;
    const start = now();
    const waitedMs = attempt > 0 && ctx?.lastAnsweredAt !== undefined ? start - ctx.lastAnsweredAt : null;
    const report = (a: LlmAttempt) => {
      if (a.attempt > 0 || a.status === 'network_error' || (typeof a.status === 'number' && a.status >= 400)) {
        log(`[anthropic] ${a.model ?? '?'} attempt ${a.attempt} → ${a.status}${a.retryAfterMs !== null ? ` retry-after ${a.retryAfterMs}ms` : ''}${a.waitedMs !== null ? ` after waiting ${a.waitedMs}ms` : ''} (${a.durationMs}ms${a.requestId ? `, ${a.requestId}` : ''})`);
      }
      ctx?.onAttempt?.(a);
    };
    try {
      const res = await base(input, init);
      const answered = now();
      if (ctx) ctx.lastAnsweredAt = answered;
      report({ model: modelOf(init), attempt, status: res.status, retryAfterMs: res.ok ? null : retryAfterMs(res), waitedMs, durationMs: answered - start, requestId: res.headers.get('request-id') });
      return res;
    } catch (e) {
      const answered = now();
      if (ctx) ctx.lastAnsweredAt = answered;
      report({ model: modelOf(init), attempt, status: 'network_error', retryAfterMs: null, waitedMs, durationMs: answered - start, requestId: null });
      throw e;
    }
  }) as typeof fetch;
}
