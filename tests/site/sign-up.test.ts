// Sign-up needs a valid club code (Lorenzo, 8 Nov: "only people with a club code can sign up; then they're sent to
// log in; later log-ins don't need the code"). The server checks the code, creates the account (Supabase admin API;
// public sign-ups are switched off in Supabase) and records the club on the profile, so log-in never asks again.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
process.env.CLUB_CODES = 'ALPHA,BETA';
const { parseSignUp, signUpStudent } = await import('@/lib/site/sign-up');

describe('parseSignUp', () => {
  const ok = { email: '  Ann@Example.com ', password: 'longenough', clubCode: ' alpha ' };
  it('a valid form: email trimmed and lower-cased, the code as its org id', () => {
    expect(parseSignUp(ok)).toEqual({ ok: true, email: 'ann@example.com', password: 'longenough', orgId: 'ALPHA' });
  });
  it('each problem, in the order the form shows them', () => {
    expect(parseSignUp({ ...ok, email: 'not-an-email' })).toEqual({ ok: false, error: 'invalid_email' });
    expect(parseSignUp({ ...ok, password: 'short' })).toEqual({ ok: false, error: 'weak_password' });
    expect(parseSignUp({ ...ok, password: 'x'.repeat(73) })).toEqual({ ok: false, error: 'weak_password' });
    expect(parseSignUp({ ...ok, clubCode: 'GAMMA' })).toEqual({ ok: false, error: 'invalid_club_code' });
    expect(parseSignUp({ ...ok, clubCode: '' })).toEqual({ ok: false, error: 'invalid_club_code' });
  });
  it('not an object, or fields that are not strings: invalid email first', () => {
    expect(parseSignUp(null)).toEqual({ ok: false, error: 'invalid_email' });
    expect(parseSignUp({ email: 5, password: 'longenough', clubCode: 'ALPHA' })).toEqual({ ok: false, error: 'invalid_email' });
  });
});

describe('signUpStudent', () => {
  const input = { ok: true as const, email: 'ann@example.com', password: 'longenough', orgId: 'ALPHA' };
  const deps = (over: Partial<Parameters<typeof signUpStudent>[1]> = {}) => {
    const calls: string[] = [];
    return {
      calls,
      d: {
        createUser: async (email: string, _password: string, confirmed: boolean) => { calls.push(`create:${email}:${confirmed ? 'confirmed' : 'unconfirmed'}`); return { ok: true as const, userId: 'u1' }; },
        recordOrg: async (userId: string, orgId: string) => { calls.push(`org:${userId}:${orgId}`); },
        deleteUser: async (userId: string) => { calls.push(`delete:${userId}`); },
        sendVerification: null as ((email: string) => Promise<void>) | null,
        ...over,
      },
    };
  };
  it('no email sender configured: the account is confirmed at once (as before 11 Nov) and the club recorded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = deps();
    expect(await signUpStudent(input, f.d)).toEqual({ ok: true, verify: false });
    expect(f.calls).toEqual(['create:ann@example.com:confirmed', 'org:u1:ALPHA']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('with an email sender: the account is created unconfirmed, the link emailed, then the club recorded', async () => {
    const f = deps();
    f.d.sendVerification = async (email: string) => { f.calls.push(`email:${email}`); };
    expect(await signUpStudent(input, f.d)).toEqual({ ok: true, verify: true });
    expect(f.calls).toEqual(['create:ann@example.com:unconfirmed', 'email:ann@example.com', 'org:u1:ALPHA']);
  });
  it('the email fails to send: the new account is removed so a retry works; email_unavailable', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = deps();
    f.d.sendVerification = async () => { throw new Error('resend 403'); };
    expect(await signUpStudent(input, f.d)).toEqual({ ok: false, error: 'email_unavailable' });
    expect(f.calls).toEqual(['create:ann@example.com:unconfirmed', 'delete:u1']);
    err.mockRestore();
  });
  it('an email already registered: email_exists, nothing recorded', async () => {
    const f = deps({ createUser: async () => ({ ok: false as const, error: 'email_exists' as const }) });
    expect(await signUpStudent(input, f.d)).toEqual({ ok: false, error: 'email_exists' });
    expect(f.calls).toEqual([]);
  });
  it("Supabase's own password rule refuses it: weak_password", async () => {
    const f = deps({ createUser: async () => ({ ok: false as const, error: 'weak_password' as const }) });
    expect(await signUpStudent(input, f.d)).toEqual({ ok: false, error: 'weak_password' });
  });
  it('the account is made but the club fails to save: still ok — log-in asks for the code once instead', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = deps({ recordOrg: async () => { throw new Error('db down'); } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await signUpStudent(input, f.d)).toEqual({ ok: true, verify: false });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
