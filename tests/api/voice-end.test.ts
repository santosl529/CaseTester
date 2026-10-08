// POST /api/voice/[sessionId]/end (spec 2026-10-08-voice-phase-b §5.8): the
// candidate ends a voice interview — an active session becomes abandoned.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  session: undefined as Record<string, unknown> | undefined,
  updates: [] as Record<string, unknown>[],
  events: [] as unknown[],
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock('@/db/client', () => ({
  db: {
    query: { sessions: { findFirst: async () => h.session } },
    update: () => ({ set: (v: Record<string, unknown>) => ({ where: async () => { h.updates.push(v); } }) }),
  },
}));
vi.mock('@/lib/analytics', () => ({ logEvent: async (...a: unknown[]) => { h.events.push(a); } }));

const { POST } = await import('@/app/api/voice/[sessionId]/end/route');
const call = () => POST(new Request('http://x/api/voice/s1/end', { method: 'POST' }) as never, { params: Promise.resolve({ sessionId: 's1' }) });

beforeEach(() => {
  h.user = { id: 'u1' };
  h.session = { id: 's1', userId: 'u1', status: 'active', phase: 'ANALYSIS' };
  h.updates.length = 0; h.events.length = 0;
});

describe('voice end route', () => {
  it('401 without a user; 404 for someone else’s session', async () => {
    h.user = null;
    expect((await call()).status).toBe(401);
    h.user = { id: 'u1' }; h.session = undefined;
    expect((await call()).status).toBe(404);
  });
  it('marks an active session abandoned at its phase and logs it', async () => {
    const res = await call();
    expect(await res.json()).toEqual({ status: 'abandoned' });
    expect(h.updates[0]).toMatchObject({ status: 'abandoned', abandonPhase: 'ANALYSIS' });
    expect(h.updates[0].completedAt).toBeInstanceOf(Date);
    expect(h.events).toHaveLength(1);
  });
  it('leaves a session that already ended alone', async () => {
    h.session = { ...h.session, status: 'completed' };
    expect(await (await call()).json()).toEqual({ status: 'completed' });
    expect(h.updates).toEqual([]);
  });
});
