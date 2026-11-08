// POST /api/sign-up (8 Nov): limited per IP before anything else; each outcome a status the form can explain.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  limited: { ok: true } as { ok: true } | { ok: false; retryAfterSec: number },
  hits: [] as string[],
  result: { ok: true } as Record<string, unknown>,
  thrown: null as Error | null,
  signUps: 0,
}));
vi.mock('@/lib/rate-limit', async () => {
  const real = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit');
  return { ...real, hitRateLimit: async (rule: { name: string }, subject: string) => { h.hits.push(`${rule.name}:${subject}`); return h.limited; } };
});
vi.mock('@/lib/site/sign-up', async () => {
  const real = await vi.importActual<typeof import('@/lib/site/sign-up')>('@/lib/site/sign-up');
  return { ...real, signUpStudent: async () => { h.signUps++; if (h.thrown) throw h.thrown; return h.result; } };
});
vi.mock('@/db/client', () => ({ db: {} }));
process.env.CLUB_CODES = 'ALPHA';
const { POST } = await import('@/app/api/sign-up/route');
const call = (body: unknown) => POST(new Request('http://x/api/sign-up', { method: 'POST', headers: { 'x-real-ip': '9.9.9.9' }, body: JSON.stringify(body) }) as never);
const good = { email: 'ann@example.com', password: 'longenough', clubCode: 'alpha' };

beforeEach(() => { h.limited = { ok: true }; h.hits = []; h.result = { ok: true }; h.thrown = null; h.signUps = 0; });

describe('POST /api/sign-up', () => {
  it('created: 200, one sign-up hit for the IP', async () => {
    const res = await call(good);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.hits).toEqual(['signUp:ip:9.9.9.9']);
  });
  it('past the limit: 429 with Retry-After, no account attempted', async () => {
    h.limited = { ok: false, retryAfterSec: 600 };
    const res = await call(good);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('600');
    expect(h.signUps).toBe(0);
  });
  it('a bad form: 400 invalid_email / weak_password, 403 invalid_club_code — no account attempted', async () => {
    expect((await call({ ...good, email: 'x' })).status).toBe(400);
    expect(await (await call({ ...good, password: 'short' })).json()).toEqual({ error: 'weak_password' });
    const bad = await call({ ...good, clubCode: 'NOPE' });
    expect(bad.status).toBe(403);
    expect(await bad.json()).toEqual({ error: 'invalid_club_code' });
    expect(h.signUps).toBe(0);
  });
  it('the email is taken: 409 email_exists', async () => {
    h.result = { ok: false, error: 'email_exists' };
    const res = await call(good);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'email_exists' });
  });
  it('Supabase down or misconfigured: 503 sign_up_unavailable, logged', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.thrown = new Error('fetch failed');
    const res = await call(good);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'sign_up_unavailable' });
    err.mockRestore();
  });
  it('a body that is not JSON: 400 invalid_email', async () => {
    const res = await POST(new Request('http://x/api/sign-up', { method: 'POST', body: 'nope' }) as never);
    expect(res.status).toBe(400);
  });
});
