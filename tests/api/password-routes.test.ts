// Forgot password routes (Lorenzo, 10 Nov): request a reset email, open the link, set the new password.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type AuthErr = { code?: string; status?: number; message?: string } | null;
const h = vi.hoisted(() => ({
  limited: { ok: true } as { ok: true } | { ok: false; retryAfterSec: number },
  hits: [] as string[],
  resetCalls: [] as [string, unknown][],
  resetError: null as AuthErr,
  resetThrows: false,
  user: { id: 'u1' } as { id: string } | null,
  updates: [] as unknown[],
  updateError: null as AuthErr,
  verifyCalls: [] as unknown[],
  verifyError: null as AuthErr,
  exchangeCalls: [] as string[],
  exchangeError: null as AuthErr,
  account: { id: 'u1', confirmed: true } as { id: string; confirmed: boolean } | null,
}));
vi.mock('@/lib/account/auth-user', () => ({ findAuthUserByEmail: async () => h.account }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/rate-limit', async () => {
  const real = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit');
  return { ...real, hitRateLimit: async (rule: { name: string }, subject: string) => { h.hits.push(`${rule.name}:${subject}`); return h.limited; } };
});
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      resetPasswordForEmail: async (email: string, opts: unknown) => {
        h.resetCalls.push([email, opts]);
        if (h.resetThrows) throw new Error('fetch failed');
        return { data: {}, error: h.resetError };
      },
      getUser: async () => ({ data: { user: h.user } }),
      updateUser: async (attrs: unknown) => { h.updates.push(attrs); return { data: {}, error: h.updateError }; },
      verifyOtp: async (args: unknown) => { h.verifyCalls.push(args); return { data: {}, error: h.verifyError }; },
      exchangeCodeForSession: async (code: string) => { h.exchangeCalls.push(code); return { data: {}, error: h.exchangeError }; },
    },
  }),
}));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); } }));

process.env.NEXT_PUBLIC_SITE_URL = 'https://casepace.example';
const { POST: forgot } = await import('@/app/api/password/forgot/route');
const { POST: update } = await import('@/app/api/password/update/route');
const { GET: confirm } = await import('@/app/auth/confirm/route');
const post = (body: unknown) => new Request('http://x/api', { method: 'POST', headers: { 'x-real-ip': '9.9.9.9' }, body: JSON.stringify(body) }) as never;
async function redirectOf(url: string): Promise<string> {
  try { await confirm(new Request(url) as never); } catch (e) { return (e as { to: string }).to; }
  throw new Error('no redirect');
}

beforeEach(() => {
  h.limited = { ok: true }; h.hits = []; h.resetCalls = []; h.resetError = null; h.resetThrows = false;
  h.user = { id: 'u1' }; h.updates = []; h.updateError = null;
  h.verifyCalls = []; h.verifyError = null; h.exchangeCalls = []; h.exchangeError = null;
  h.account = { id: 'u1', confirmed: true };
});

describe('POST /api/password/forgot', () => {
  it('sends the reset email, linking back to /auth/confirm; one hit for the IP', async () => {
    const res = await forgot(post({ email: ' Ann@Example.com ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.resetCalls).toEqual([['ann@example.com', { redirectTo: 'https://casepace.example/auth/confirm' }]]);
    expect(h.hits).toEqual(['passwordReset:ip:9.9.9.9']);
  });
  it('no account uses the email: 404 no_account, said plainly (Lorenzo, 11 Nov); no email', async () => {
    h.account = null;
    const res = await forgot(post({ email: 'ghost@example.com' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_account' });
    expect(h.resetCalls).toEqual([]);
  });
  it('past our limit: 429, no email', async () => {
    h.limited = { ok: false, retryAfterSec: 900 };
    const res = await forgot(post({ email: 'ann@example.com' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('900');
    expect(h.resetCalls).toEqual([]);
  });
  it('a bad email: 400 invalid_email, no email', async () => {
    const res = await forgot(post({ email: 'nope' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_email' });
    expect(h.resetCalls).toEqual([]);
  });
  it("Supabase's own email limit: 429 rate_limited", async () => {
    h.resetError = { status: 429, code: 'over_email_send_rate_limit' };
    const res = await forgot(post({ email: 'ann@example.com' }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('rate_limited');
  });
  it('sending fails (no email sender, Supabase down): 503 reset_unavailable, logged without the email', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.resetError = { status: 500, code: 'unexpected_failure', message: 'Error sending recovery email' };
    expect((await forgot(post({ email: 'ann@example.com' }))).status).toBe(503);
    h.resetError = null; h.resetThrows = true;
    const res = await forgot(post({ email: 'ann@example.com' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'reset_unavailable' });
    expect(JSON.stringify(err.mock.calls)).not.toContain('ann@example.com');
    err.mockRestore();
  });
});

describe('POST /api/password/update', () => {
  it('signed out (link expired or never opened): 401, nothing changed', async () => {
    h.user = null;
    expect((await update(post({ password: 'longenough' }))).status).toBe(401);
    expect(h.updates).toEqual([]);
  });
  it('a valid password: changed', async () => {
    const res = await update(post({ password: 'longenough' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.updates).toEqual([{ password: 'longenough' }]);
  });
  it('too short: 400 weak_password, nothing changed', async () => {
    const res = await update(post({ password: 'short' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'weak_password' });
    expect(h.updates).toEqual([]);
  });
  it('the same password as before: 422 same_password', async () => {
    h.updateError = { status: 422, code: 'same_password' };
    const res = await update(post({ password: 'longenough' }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'same_password' });
  });
  it('Supabase refuses it as weak: 400 weak_password', async () => {
    h.updateError = { status: 422, code: 'weak_password' };
    expect(await (await update(post({ password: 'longenough' }))).json()).toEqual({ error: 'weak_password' });
  });
  it('anything else: 503 update_failed, logged', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.updateError = { status: 500, code: 'unexpected_failure' };
    const res = await update(post({ password: 'longenough' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'update_failed' });
    err.mockRestore();
  });
});

describe('GET /auth/confirm', () => {
  it('a valid recovery token: signed in, on to /reset-password', async () => {
    expect(await redirectOf('http://x/auth/confirm?token_hash=abc&type=recovery')).toBe('/reset-password');
    expect(h.verifyCalls).toEqual([{ type: 'recovery', token_hash: 'abc' }]);
  });
  it('a code (the default email template, same browser): exchanged, on to /reset-password', async () => {
    expect(await redirectOf('http://x/auth/confirm?code=c1')).toBe('/reset-password');
    expect(h.exchangeCalls).toEqual(['c1']);
  });
  it('an expired or used link: back to /forgot-password with a notice', async () => {
    h.verifyError = { status: 403, code: 'otp_expired' };
    expect(await redirectOf('http://x/auth/confirm?token_hash=abc&type=recovery')).toBe('/forgot-password?expired=1');
    h.exchangeError = { status: 400, code: 'bad_code_verifier' };
    expect(await redirectOf('http://x/auth/confirm?code=c1')).toBe('/forgot-password?expired=1');
  });
  it('no token, or a type other than recovery: no Supabase call, the notice', async () => {
    expect(await redirectOf('http://x/auth/confirm')).toBe('/forgot-password?expired=1');
    expect(await redirectOf('http://x/auth/confirm?token_hash=abc&type=signup')).toBe('/forgot-password?expired=1');
    expect(h.verifyCalls).toEqual([]);
  });
  it('a confirmation link (type=email): confirmed and signed in, on to /sign-in?confirmed=1', async () => {
    expect(await redirectOf('http://x/auth/confirm?token_hash=abc&type=email')).toBe('/sign-in?confirmed=1');
    expect(h.verifyCalls).toEqual([{ type: 'email', token_hash: 'abc' }]);
  });
  it('an expired or used confirmation link: /sign-in?link_expired=1 (log in to get a new one)', async () => {
    h.verifyError = { status: 403, code: 'otp_expired' };
    expect(await redirectOf('http://x/auth/confirm?token_hash=abc&type=email')).toBe('/sign-in?link_expired=1');
  });
  it('ignores any next= (never an open redirect)', async () => {
    expect(await redirectOf('http://x/auth/confirm?token_hash=abc&type=recovery&next=https://evil.example')).toBe('/reset-password');
  });
});
