// POST /api/channel/[sessionId]/expire (Matt, 17 Nov, pre-pilot audit M3): "Get my report" on an interview left
// unfinished past its case's time ends it by the End button's rule, under its own reason; never while time is left.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ID = '51111111-1111-4111-8111-111111111111';
const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  session: undefined as Record<string, unknown> | undefined,
  ends: [] as unknown[][],
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock('@/db/client', () => ({ db: { query: { sessions: { findFirst: async () => h.session } } } }));
vi.mock('@/lib/orchestrator/session-end', () => ({
  endByCandidate: async (...a: unknown[]) => { h.ends.push(a); return { status: 'completed', report: true, partial: true }; },
}));
vi.mock('@/lib/cases/loader', () => ({ getCaseById: () => ({ pacing: { totalMs: 25 * 60_000 } }) }));

const { POST } = await import('@/app/api/channel/[sessionId]/expire/route');
const call = () => POST(new Request(`http://x/api/channel/${ID}/expire`, { method: 'POST' }) as never, { params: Promise.resolve({ sessionId: ID }) });
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

beforeEach(() => {
  h.user = { id: 'u1' };
  h.session = { id: ID, userId: 'u1', caseId: 'prof-002', status: 'active', startedAt: minutesAgo(30), flagsJsonb: {} };
  h.ends = [];
});

describe('POST /api/channel/[id]/expire', () => {
  it('time up: ended by the End rule as time_up', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'completed', report: true, partial: true });
    expect(h.ends).toEqual([[ID, 'u1', 'time_up']]);
  });
  it('time left: 409 time_left, nothing ended', async () => {
    h.session = { ...h.session, startedAt: minutesAgo(10) };
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'time_left' });
    expect(h.ends).toEqual([]);
  });
  it('signed out 401; another student’s session 404', async () => {
    h.user = null;
    expect((await call()).status).toBe(401);
    h.user = { id: 'u1' }; h.session = undefined;
    expect((await call()).status).toBe(404);
  });
});
