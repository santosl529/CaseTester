// POST /api/session and the stored club code (site flow, 19 Oct): a returning
// student starts a case without retyping the code — the code on their profile
// counts while it is still in CLUB_CODES; only listed cases start.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  profile: [] as { orgId: string | null }[],
  inserted: [] as unknown[],
  started: [] as unknown[],
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock('@/db/client', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => h.profile }) }),
    insert: () => ({ values: (v: unknown) => ({ onConflictDoNothing: async () => { h.inserted.push(v); } }) }),
  },
}));
vi.mock('@/lib/orchestrator/start-session', () => ({
  startSession: async (userId: string, caseId: string) => { h.started.push({ userId, caseId }); return { sessionId: 's1', openingText: 'Hi' }; },
}));

const { POST } = await import('@/app/api/session/route');
const { storedClubOrg } = await import('@/lib/club');
const call = (body: unknown) => POST(new Request('http://x/api/session', { method: 'POST', body: JSON.stringify(body) }) as never);

const savedCodes = process.env.CLUB_CODES;
beforeEach(() => {
  process.env.CLUB_CODES = 'ALPHA, BETA';
  h.user = { id: 'u1' };
  h.profile = [];
  h.inserted.length = 0; h.started.length = 0;
});
afterEach(() => { process.env.CLUB_CODES = savedCodes; });

describe('storedClubOrg', () => {
  it('the profile’s code while it is still valid; null when removed from CLUB_CODES, unset, or no profile', async () => {
    h.profile = [{ orgId: 'ALPHA' }];
    expect(await storedClubOrg('u1')).toBe('ALPHA');
    h.profile = [{ orgId: 'GAMMA' }];
    expect(await storedClubOrg('u1')).toBeNull();
    h.profile = [{ orgId: null }];
    expect(await storedClubOrg('u1')).toBeNull();
    h.profile = [];
    expect(await storedClubOrg('u1')).toBeNull();
  });
});

describe('POST /api/session', () => {
  it('401 without a user', async () => {
    h.user = null;
    expect((await call({ caseId: 'prof-001' })).status).toBe(401);
  });

  it('a typed code still works and is recorded', async () => {
    const res = await call({ caseId: 'prof-001', clubCode: 'alpha' });
    expect(res.status).toBe(200);
    expect(h.inserted).toEqual([{ userId: 'u1', orgId: 'ALPHA' }]);
    expect(h.started).toEqual([{ userId: 'u1', caseId: 'prof-001' }]);
  });

  it('no code typed: the stored code lets a returning student start', async () => {
    h.profile = [{ orgId: 'BETA' }];
    const res = await call({ caseId: 'prof-001' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionId: 's1', openingText: 'Hi' });
  });

  it('no code typed and the stored one was removed from CLUB_CODES: 403', async () => {
    h.profile = [{ orgId: 'GAMMA' }];
    const res = await call({ caseId: 'prof-001' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Invalid club code' });
    expect(h.started).toEqual([]);
  });

  it('no code and no profile: 403', async () => {
    expect((await call({ caseId: 'prof-001' })).status).toBe(403);
  });

  it('a registered but unlisted case, or an unknown one: 400, nothing started', async () => {
    h.profile = [{ orgId: 'ALPHA' }];
    for (const caseId of ['prof-002', 'nope-001']) {
      const res = await call({ caseId });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown case' });
    }
    expect(h.started).toEqual([]);
  });
});
