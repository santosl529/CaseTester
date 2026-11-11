// POST /api/sign-up/resend (Lorenzo, 11 Nov): a new confirmation link, said plainly when there's nothing to send.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  limited: { ok: true } as { ok: true } | { ok: false; retryAfterSec: number },
  hits: [] as string[],
  outcome: 'sent' as string,
  throws: false,
  calls: [] as string[],
}));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/rate-limit', async () => {
  const real = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit');
  return { ...real, hitRateLimit: async (rule: { name: string }, subject: string) => { h.hits.push(`${rule.name}:${subject}`); return h.limited; } };
});
vi.mock('@/lib/site/verify-email', async () => {
  const real = await vi.importActual<typeof import('@/lib/site/verify-email')>('@/lib/site/verify-email');
  return { ...real, resendVerification: async (email: string) => { h.calls.push(email); if (h.throws) throw new Error('resend 500'); return h.outcome; } };
});
const { POST } = await import('@/app/api/sign-up/resend/route');
const call = (body: unknown) => POST(new Request('http://x/api/sign-up/resend', { method: 'POST', headers: { 'x-real-ip': '9.9.9.9' }, body: JSON.stringify(body) }) as never);

beforeEach(() => { h.limited = { ok: true }; h.hits = []; h.outcome = 'sent'; h.throws = false; h.calls = []; process.env.RESEND_API_KEY = 'k'; });

describe('POST /api/sign-up/resend', () => {
  it('sent: 200, one hit for the IP', async () => {
    const res = await call({ email: ' Ann@Example.com ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.calls).toEqual(['ann@example.com']);
    expect(h.hits).toEqual(['verifyResend:ip:9.9.9.9']);
  });
  it('no account: 404 no_account', async () => {
    h.outcome = 'no_account';
    const res = await call({ email: 'ghost@example.com' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_account' });
  });
  it('already confirmed: 409 already_confirmed', async () => {
    h.outcome = 'already_confirmed';
    const res = await call({ email: 'ann@example.com' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_confirmed' });
  });
  it('past the limit: 429, nothing looked up', async () => {
    h.limited = { ok: false, retryAfterSec: 60 };
    expect((await call({ email: 'ann@example.com' })).status).toBe(429);
    expect(h.calls).toEqual([]);
  });
  it('a bad email: 400 invalid_email', async () => {
    expect(await (await call({ email: 'x' })).json()).toEqual({ error: 'invalid_email' });
  });
  it('no email sender configured, or sending fails: 503 email_unavailable', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.RESEND_API_KEY;
    expect(await (await call({ email: 'ann@example.com' })).json()).toEqual({ error: 'email_unavailable' });
    expect(h.calls).toEqual([]);
    process.env.RESEND_API_KEY = 'k'; h.throws = true;
    const res = await call({ email: 'ann@example.com' });
    expect(res.status).toBe(503);
    err.mockRestore();
  });
});
