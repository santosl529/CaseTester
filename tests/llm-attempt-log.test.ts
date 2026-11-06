// Every SDK retry and rate-limit response is logged per call (Lorenzo, 6 Nov: "so a hidden retry can't look like a
// slow first token") — through the real Anthropic SDK, whose retries are invisible to the caller.
import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { attemptLoggingFetch, withLlmCall, type LlmAttempt } from '@/lib/llm-attempt-log';

const ok = () => new Response(JSON.stringify({ id: 'm1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_ok' } });
const limited = () => new Response(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after-ms': '20', 'request-id': 'req_429' } });

function client(responses: (() => Response)[], log: string[]) {
  let i = 0;
  const base = (async () => responses[Math.min(i++, responses.length - 1)]()) as unknown as typeof fetch;
  return new Anthropic({ apiKey: 'test', maxRetries: 2, fetch: attemptLoggingFetch(base, { log: m => log.push(m) }) });
}
const call = (c: Anthropic) => c.messages.create({ model: 'claude-sonnet-5-5', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] });

describe('SDK retries are logged per attempt', () => {
  it('a 429 the SDK retries silently: logged with status, retry-after and the wait; the retry that succeeds too', async () => {
    const log: string[] = [];
    const attempts: LlmAttempt[] = [];
    const r = await withLlmCall(a => attempts.push(a), () => call(client([limited, ok], log)));
    expect(r.id).toBe('m1');   // the caller saw one call
    expect(attempts.map(a => [a.attempt, a.status])).toEqual([[0, 429], [1, 200]]);
    expect(attempts[0]).toMatchObject({ model: 'claude-sonnet-5-5', retryAfterMs: 20, requestId: 'req_429' });
    expect(attempts[1].waitedMs).toBeGreaterThanOrEqual(15);
    expect(log[0]).toMatch(/^\[anthropic\] claude-sonnet-5-5 attempt 0 → 429 retry-after 20ms \(\d+ms, req_429\)$/);
    expect(log[1]).toMatch(/^\[anthropic\] claude-sonnet-5-5 attempt 1 → 200 after waiting \d+ms \(\d+ms, req_ok\)$/);
  });

  it('a first-try success is not logged (nothing hidden happened)', async () => {
    const log: string[] = [];
    const attempts: LlmAttempt[] = [];
    await withLlmCall(a => attempts.push(a), () => call(client([ok], log)));
    expect(log).toEqual([]);
    expect(attempts.map(a => [a.attempt, a.status])).toEqual([[0, 200]]);
  });

  it('a network error and the retries after it; calls outside withLlmCall are logged too', async () => {
    const log: string[] = [];
    let n = 0;
    const base = (async () => { if (n++ === 0) throw new TypeError('fetch failed'); return ok(); }) as unknown as typeof fetch;
    await call(new Anthropic({ apiKey: 'test', maxRetries: 2, fetch: attemptLoggingFetch(base, { log: m => log.push(m) }) }));
    expect(log[0]).toMatch(/attempt 0 → network_error/);
    expect(log[1]).toMatch(/attempt 1 → 200/);
  });
});
