// POST /api/session and the stored club (site flow, 19 Oct): a returning
// student starts a case without retyping the code — the club on their profile
// counts while it is switched on (clubs table since 14 Nov); only listed cases start.
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  startSessionLimited: async (userId: string, caseId: string) => { h.started.push({ userId, caseId }); return { ok: true, sessionId: 's1', openingText: 'Hi' }; },
}));

vi.mock('@/lib/club-directory', () => import('../club/fake-club-directory'));
const { setClubs } = await import('../club/fake-club-directory');

const { POST } = await import('@/app/api/session/route');
const { storedClubOrg } = await import('@/lib/club');
const call = (body: unknown) => POST(new Request('http://x/api/session', { method: 'POST', body: JSON.stringify(body) }) as never);

beforeEach(() => {
  setClubs(['ALPHA', 'BETA']);
  h.user = { id: 'u1' };
  h.profile = [];
  h.inserted.length = 0; h.started.length = 0;
});

describe('storedClubOrg', () => {
  it('the profile’s club while it is switched on; null when switched off, unset, or no profile', async () => {
    h.profile = [{ orgId: 'alpha' }];
    expect(await storedClubOrg('u1')).toBe('alpha');
    h.profile = [{ orgId: 'gamma' }];
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
    expect(h.inserted).toEqual([{ userId: 'u1', orgId: 'alpha' }]);
    expect(h.started).toEqual([{ userId: 'u1', caseId: 'prof-001' }]);
  });

  it('no code typed: the stored club lets a returning student start', async () => {
    h.profile = [{ orgId: 'beta' }];
    const res = await call({ caseId: 'prof-001' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionId: 's1', openingText: 'Hi' });
  });

  it('no code typed and the stored club was switched off: 403', async () => {
    h.profile = [{ orgId: 'gamma' }];
    const res = await call({ caseId: 'prof-001' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Invalid club code' });
    expect(h.started).toEqual([]);
  });

  it('no code and no profile: 403', async () => {
    expect((await call({ caseId: 'prof-001' })).status).toBe(403);
  });

  it('a registered but unlisted case, or an unknown one: 400, nothing started', async () => {
    h.profile = [{ orgId: 'alpha' }];
    for (const caseId of ['entry-001', 'nope-001']) {
      const res = await call({ caseId });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown case' });
    }
    expect(h.started).toEqual([]);
  });
});
