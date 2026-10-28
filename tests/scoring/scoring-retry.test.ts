// Phase 1 4.11 (Lorenzo, 22 Oct: "Scoring: retry with backoff when the scoring stream dies."; his ruling: "approved
// with no switch only if a retry can NEVER write a second report"). Batch 35 Hollis Bay Marcus: the stream died after
// one Opus call ("scoring failed: terminated") and the session was never scored. Each case below counts the score
// rows written: exactly one, whatever the retries and whoever else calls.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/analytics', async orig => ({ ...(await orig<object>()), logEvent: vi.fn(async () => {}) }));
const fakeStream = vi.hoisted(() => ({ calls: 0, plan: [] as ('die' | 'ok')[] }));
vi.mock('@/lib/anthropic-client', () => ({
  anthropicClient: () => ({
    beta: { messages: { stream: () => ({ finalMessage: async () => {
      const step = fakeStream.plan[fakeStream.calls++] ?? 'ok';
      if (step === 'die') throw new TypeError('terminated');
      return { stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: 'not json' }] };
    } }) } },
  }),
}));

const { scoreOnce } = await import('@/lib/scoring/scoring-claim');
const { scoreAndStore, ClaimLostError } = await import('@/lib/scoring/score-session');
const { withStreamRetry, withScoringDeadline, isStreamDeath, STREAM_RETRY_BACKOFF_MS, SCORING_BUDGET_MS } = await import('@/lib/scoring/stream-retry');
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const { runReconciliation } = await import('@/lib/scoring/reconcile');
const { logEvent } = await import('@/lib/analytics');
const { fakeClaimStore } = await import('./helpers/fake-claim-store');
import type { ScoringClaim } from '@/lib/scoring/scoring-claim';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';

const DIM = { rating: 'meets_bar', wentWell: [], needsWork: [], missedOpportunities: [] };
const rubric = { ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, DIM])), overallRating: 'meets_bar', topFix: 'x' };
const computed = (output: string) => ({ rubric, report: { modelAnswer: output, scoringRuntimeMs: 1, judgeModel: 'claude-opus-5-5' }, mathResults: [], qa: {} });

// One session's database: the claim (fake-claim-store) and the score rows, written through the claim's guard.
function world() {
  const f = fakeClaimStore();
  const rows: Record<string, unknown>[] = [];
  const tx = { insert: () => ({ values: async (v: Record<string, unknown>) => { rows.push(v); } }) };
  // storeIfClaimed's semantics: the row only while the claim token is this pass's.
  const store = async (claim: ScoringClaim, write: (t: never) => Promise<void>) => {
    if (f.state.claimAt !== claim.token) return false;
    await write(tx as never);
    f.state.scoredAt = f.clock.t;
    return true;
  };
  return { f, rows, store };
}

// A scoring stream as the pass runs it: the first attempt streams part of its output, then the connection dies
// ("terminated"); the retry streams the whole answer. `gate` holds the death until the test lets it go.
function dyingStream(f: ReturnType<typeof fakeClaimStore>, opts: { gate?: Promise<void> } = {}) {
  const attempts: { partial: string; done: boolean }[] = [];
  const call = async () => {
    const a = { partial: '', done: false };
    attempts.push(a);
    a.partial = '{"structure": {"rating": "me';          // partial output, charged and then lost
    if (attempts.length === 1) { await opts.gate; throw new TypeError('terminated'); }
    a.partial = '{"structure": {"rating": "meets_bar"}}';
    a.done = true;
    return a.partial;
  };
  const compute = async () => computed(await withStreamRetry('judge', call, { sleep: f.deps.sleep }));
  return { attempts, compute };
}

beforeEach(() => { vi.mocked(logEvent).mockClear(); });

describe('4.11: a dead scoring stream is retried, and one report is written', () => {
  it('the stream dies after partial output, the retry succeeds: exactly one report row, from the retry', async () => {
    const { f, rows, store } = world();
    const s = dyingStream(f);
    const status = await scoreOnce('s1', claim => scoreAndStore(claim, 'u1', { compute: s.compute as never, store: store as never }), f.deps);
    expect(status).toBe('scored');
    expect(s.attempts).toHaveLength(2);
    expect(s.attempts[0].done).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].modelAnswerJsonb).toBe('{"structure": {"rating": "meets_bar"}}');   // the retry's output, never the partial
    expect(f.clock.t).toBe(STREAM_RETRY_BACKOFF_MS[0]);                                  // waited the backoff once
    expect(f.state.claimAt).toBeNull();                                                  // released
  });

  it('two concurrent callers during a retry: the second waits on the claim and never runs a pass; one row', async () => {
    const { f, rows, store } = world();
    let letDie!: () => void;
    const s = dyingStream(f, { gate: new Promise<void>(r => { letDie = r; }) });
    const secondCompute = vi.fn(async () => computed('second pass'));
    const first = scoreOnce('s1', claim => scoreAndStore(claim, 'u1', { compute: s.compute as never, store: store as never }), f.deps);
    await Promise.resolve();
    // The second tab arrives while the first pass's stream is dying and retrying.
    const second = scoreOnce('s1', claim => scoreAndStore(claim, 'u1', { compute: secondCompute as never, store: store as never }), f.deps);
    letDie();
    expect(await Promise.all([first, second])).toEqual(['scored', 'already_scored']);
    expect(secondCompute).not.toHaveBeenCalled();
    expect(f.calls.claims).toBeGreaterThanOrEqual(2);   // the second caller tried the claim while the first held it
    expect(s.attempts).toHaveLength(2);
    expect(rows).toHaveLength(1);
  });

  it('a retry after the first attempt actually wrote: the row stands, nothing is written again', async () => {
    const { f, rows, store } = world();
    // The first pass writes its row, then dies on the events after it (the connection drops on logEvent).
    vi.mocked(logEvent).mockRejectedValueOnce(new TypeError('terminated'));
    const first = vi.fn(async () => computed('first pass'));
    await expect(scoreOnce('s1', claim => scoreAndStore(claim, 'u1', { compute: first as never, store: store as never }), f.deps)).rejects.toThrow('terminated');
    expect(rows).toHaveLength(1);
    // The client's retry (the route's 500, "Prepare my report" again): already scored, no pass, no row.
    const retry = vi.fn(async () => computed('retry'));
    expect(await scoreOnce('s1', claim => scoreAndStore(claim, 'u1', { compute: retry as never, store: store as never }), f.deps)).toBe('already_scored');
    expect(retry).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    // The stream retry never wraps the write: a death is retried before the row, never after it.
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('a pass whose claim was taken over while it retried writes nothing: still one row', async () => {
    const { f, rows, store } = world();
    // Pass A's claim is lost while its stream retries (as if its beats stopped for longer than the stale limit):
    // pass B claims, scores and writes; then A's retry succeeds and A tries to write.
    let letDie!: () => void;
    const s = dyingStream(f, { gate: new Promise<void>(r => { letDie = r; }) });
    const a = scoreOnce('s1', claim => scoreAndStore(claim, 'u1', { compute: s.compute as never, store: store as never }), f.deps);
    await Promise.resolve(); await Promise.resolve();
    const tokenA = f.state.claimAt;
    f.state.claimAt = null; f.state.beatAt = null;                                       // A's claim gone stale and cleared
    const b = await scoreOnce('s1', claim => scoreAndStore(claim, 'u1', { compute: (async () => computed('pass B')) as never, store: store as never }), f.deps);
    expect(b).toBe('scored');
    f.state.claimAt = tokenA === null ? null : tokenA + 1;                                // not A's token
    letDie();
    await expect(a).rejects.toBeInstanceOf(ClaimLostError);
    expect(rows).toHaveLength(1);
    expect(rows[0].modelAnswerJsonb).toBe('pass B');
  });
});

describe('the retry itself', () => {
  it('retries only a death the SDK cannot: a connection drop, "terminated", a mid-stream error event', () => {
    expect(isStreamDeath(new TypeError('terminated'))).toBe(true);
    expect(isStreamDeath(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isStreamDeath(new Anthropic.APIConnectionError({ message: 'socket hang up' }))).toBe(true);
    expect(isStreamDeath(new Error('no structured output (stop_reason: max_tokens)'))).toBe(false);
    expect(isStreamDeath(new SyntaxError('Unexpected token'))).toBe(false);
    // Review fix round, item 5: an HTTP status means the SDK already retried it (maxRetries 2, Retry-After honoured).
    // Retrying it here as well cost up to 9 attempts and 10 s of our own sleeps for one 429.
    const body = (type: string) => ({ type: 'error', error: { type, message: 'x' } });
    expect(isStreamDeath(new Anthropic.RateLimitError(429, body('rate_limit_error'), undefined, new Headers(), 'rate_limit_error'))).toBe(false);
    expect(isStreamDeath(new Anthropic.InternalServerError(500, body('api_error'), undefined, new Headers(), 'api_error'))).toBe(false);
    expect(isStreamDeath(new Anthropic.InternalServerError(529, body('overloaded_error'), undefined, new Headers(), 'overloaded_error'))).toBe(false);
    expect(isStreamDeath(new Anthropic.BadRequestError(400, body('invalid_request_error'), undefined, new Headers(), 'invalid_request_error'))).toBe(false);
    // …while the `error` SSE event mid-stream carries no status (core/streaming.js): the request succeeded, so the
    // SDK is done with it, and this is the gap 4.11 exists to cover.
    expect(isStreamDeath(new Anthropic.APIError(undefined, body('overloaded_error'), undefined, undefined, 'overloaded_error'))).toBe(true);
    expect(isStreamDeath(new Anthropic.APIError(undefined, body('api_error'), undefined, undefined, 'api_error'))).toBe(true);
    expect(isStreamDeath(new Anthropic.APIError(undefined, body('invalid_request_error'), undefined, undefined, 'invalid_request_error'))).toBe(false);
  });

  // Review fix round, item 6: a pass that dies late would spend its backoff, breach the route's 300 s budget, write
  // nothing — and the next attempt pays for all three Opus passes again.
  it('a retry that would pass the pass\'s deadline is skipped: the death is thrown while the route can still answer', async () => {
    let t = 0;
    const slowDeath = vi.fn(async () => { t += 100_000; throw new TypeError('terminated'); });
    const deps = { sleep: async () => {}, now: () => t, deadlineAt: SCORING_BUDGET_MS };
    await expect(withStreamRetry('judge', slowDeath, deps)).rejects.toThrow('terminated');
    expect(slowDeath).toHaveBeenCalledTimes(2);   // 200 s + 8 s backoff + another ~100 s call is past 240 s
    // A quick death inside the budget still gets both retries.
    t = 0;
    const quickDeath = vi.fn(async () => { t += 1_000; throw new TypeError('terminated'); });
    await expect(withStreamRetry('judge', quickDeath, deps)).rejects.toThrow('terminated');
    expect(quickDeath).toHaveBeenCalledTimes(3);
  });

  it('the deadline comes from the pass when the caller passes none (withScoringDeadline)', async () => {
    let t = 239_000;
    const call = vi.fn(async () => { t += 100_000; throw new TypeError('terminated'); });
    const run = () => withStreamRetry('judge', call, { sleep: async () => {}, now: () => t });
    await expect(withScoringDeadline(240_000, run)).rejects.toThrow('terminated');
    expect(call).toHaveBeenCalledTimes(1);
    // No deadline in scope: retried as before.
    t = 239_000;
    call.mockClear();
    await expect(run()).rejects.toThrow('terminated');
    expect(call).toHaveBeenCalledTimes(3);
  });
  it('gives up after two retries (2 s, then 8 s) and throws the death as it was', async () => {
    const waits: number[] = [];
    const call = vi.fn(async () => { throw new TypeError('terminated'); });
    await expect(withStreamRetry('judge', call, { sleep: async ms => { waits.push(ms); } })).rejects.toThrow('terminated');
    expect(call).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([2_000, 8_000]);
  });
  it('another error is thrown at once, unretried', async () => {
    const call = vi.fn(async () => { throw new Error('400 invalid_request_error'); });
    await expect(withStreamRetry('judge', call, { sleep: async () => {} })).rejects.toThrow('400');
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('wired into the passes', () => {
  beforeEach(() => { vi.useFakeTimers(); fakeStream.calls = 0; });
  afterEach(() => { vi.useRealTimers(); });
  it('the reconciliation pass retries its dead stream (the same wrapper as the judge and the verifier)', async () => {
    fakeStream.plan = ['die', 'ok'];
    const withWeakness = { ...DIM, wentWell: [{ point: 'a', quotes: [] }], needsWork: [{ point: 'b', quotes: [] }] };
    const r = { ...rubric, structure: withWeakness };
    const run = runReconciliation(r as never, { requestedUnanswered: [], requestedNotInCase: [] } as never);
    await vi.advanceTimersByTimeAsync(STREAM_RETRY_BACKOFF_MS[0]);
    await run;
    expect(fakeStream.calls).toBe(2);
  });
});
