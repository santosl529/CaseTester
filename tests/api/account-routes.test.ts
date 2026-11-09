// /account's routes (Lorenzo, 9 Nov): change club code, delete account.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'Ann@Example.com' } as { id: string; email: string } | null,
  limited: { ok: true } as { ok: true } | { ok: false; retryAfterSec: number },
  assigned: [] as unknown[],
  deleted: [] as string[],
  deleteResult: { ok: true } as { ok: true } | { ok: false; error: 'delete_failed' },
  signedOut: 0,
}));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }), signOut: async () => { h.signedOut++; return { error: null }; } } }) }));
vi.mock('@/lib/rate-limit', async () => {
  const real = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit');
  return { ...real, hitRateLimit: async () => h.limited };
});
vi.mock('@/lib/club', () => ({
  clubOrgId: (c: unknown) => (typeof c === 'string' && ['ALPHA', 'BETA'].includes(c.trim().toUpperCase()) ? c.trim().toUpperCase() : null),
  assignClub: async (userId: string, orgId: string) => { h.assigned.push([userId, orgId]); return { changed: true, from: 'ALPHA' }; },
}));
vi.mock('@/lib/account/delete-account', () => ({ deleteAccount: async (id: string) => { h.deleted.push(id); return h.deleteResult; } }));

const { POST: club } = await import('@/app/api/account/club/route');
const { POST: del } = await import('@/app/api/account/delete/route');
const req = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never;

beforeEach(() => {
  h.user = { id: 'u1', email: 'Ann@Example.com' }; h.limited = { ok: true };
  h.assigned = []; h.deleted = []; h.deleteResult = { ok: true }; h.signedOut = 0;
});

describe('POST /api/account/club', () => {
  it('signed out: 401', async () => { h.user = null; expect((await club(req({ clubCode: 'BETA' }))).status).toBe(401); });
  it('a valid code: the club changes', async () => {
    const res = await club(req({ clubCode: ' beta ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, club: 'BETA', changed: true });
    expect(h.assigned).toEqual([['u1', 'BETA']]);
  });
  it('an invalid code: 403 invalid_club_code, nothing changes', async () => {
    const res = await club(req({ clubCode: 'NOPE' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'invalid_club_code' });
    expect(h.assigned).toEqual([]);
  });
  it('rate-limited (shares the club-code limit): 429', async () => {
    h.limited = { ok: false, retryAfterSec: 60 };
    expect((await club(req({ clubCode: 'BETA' }))).status).toBe(429);
    expect(h.assigned).toEqual([]);
  });
});

describe('POST /api/account/delete', () => {
  it('signed out: 401', async () => { h.user = null; expect((await del(req({ confirmEmail: 'ann@example.com' }))).status).toBe(401); });
  it('the typed email must match the account (any case, spaces trimmed)', async () => {
    const res = await del(req({ confirmEmail: 'someone@else.com' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'email_mismatch' });
    expect(h.deleted).toEqual([]);
  });
  it('confirmed: deleted, signed out, 200', async () => {
    const res = await del(req({ confirmEmail: '  ann@EXAMPLE.com ' }));
    expect(res.status).toBe(200);
    expect(h.deleted).toEqual(['u1']);
    expect(h.signedOut).toBe(1);
  });
  it('the delete fails: 503 delete_failed, still signed in so they can retry', async () => {
    h.deleteResult = { ok: false, error: 'delete_failed' };
    const res = await del(req({ confirmEmail: 'ann@example.com' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'delete_failed' });
    expect(h.signedOut).toBe(0);
  });
});
