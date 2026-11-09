// The browser's calls never throw (8 Nov): a network failure is status 0, a non-JSON body is data null — so every
// screen can always say something and re-enable its buttons.
import { describe, it, expect } from 'vitest';
import { requestJson } from '@/lib/site/fetch-json';

const fakeFetch = (impl: () => Promise<Response>) => (async () => impl()) as unknown as typeof fetch;

describe('requestJson', () => {
  it('ok with JSON', async () => {
    expect(await requestJson('/x', { method: 'POST' }, fakeFetch(async () => Response.json({ a: 1 })))).toEqual({ ok: true, status: 200, data: { a: 1 } });
  });
  it('an error status with JSON', async () => {
    expect(await requestJson('/x', {}, fakeFetch(async () => Response.json({ error: 'rate_limited', retryAfterSec: 5 }, { status: 429 })))).toEqual({ ok: false, status: 429, data: { error: 'rate_limited', retryAfterSec: 5 } });
  });
  it('an HTML error page: data null', async () => {
    expect(await requestJson('/x', {}, fakeFetch(async () => new Response('<html>500</html>', { status: 500 })))).toEqual({ ok: false, status: 500, data: null });
  });
  it('the network fails: status 0, never throws', async () => {
    expect(await requestJson('/x', {}, fakeFetch(async () => { throw new TypeError('Failed to fetch'); }))).toEqual({ ok: false, status: 0, data: null });
  });
});
