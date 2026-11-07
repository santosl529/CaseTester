// POST /api/session past a limit (security audit, 6 Nov): 429 with the reason and when the student can start again;
// within the limits the case starts as before.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  result: { ok: true, sessionId: 's1', openingText: 'Hi' } as Record<string, unknown>,
  calls: [] as unknown[],
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }) }));
vi.mock('@/lib/club', () => ({ clubOrgId: () => null, storedClubOrg: async () => 'ALPHA', recordStudentOrg: async () => {} }));
vi.mock('@/lib/orchestrator/start-session', () => ({
  startSessionLimited: async (userId: string, caseId: string) => { h.calls.push({ userId, caseId }); return h.result; },
}));

const { POST } = await import('@/app/api/session/route');
const call = () => POST(new Request('http://x/api/session', { method: 'POST', body: JSON.stringify({ caseId: 'prof-001' }) }) as never);

beforeEach(() => { h.result = { ok: true, sessionId: 's1', openingText: 'Hi' }; h.calls.length = 0; });

describe('session start limits at the route', () => {
  it('within the limits: the session starts', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionId: 's1', openingText: 'Hi' });
    expect(h.calls).toEqual([{ userId: 'u1', caseId: 'prof-001' }]);
  });
  it('past the daily limit: 429 with the reason, the limit and when to retry', async () => {
    h.result = { ok: false, reason: 'daily', limit: 2, retryAt: new Date('2026-11-07T14:00:00Z') };
    const res = await call();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'session_limit', reason: 'daily', limit: 2, retryAt: '2026-11-07T14:00:00.000Z' });
  });
  it('the site ceiling: 429 with reason site', async () => {
    h.result = { ok: false, reason: 'site', limit: 150, retryAt: new Date('2026-12-01T00:00:00Z') };
    const res = await call();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'session_limit', reason: 'site' });
  });
});
