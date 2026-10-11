// POST /api/voice/[sessionId]/end (spec 2026-10-08-voice-phase-b §5.8; Rule
// 18A v4.10): the candidate ends a voice interview — with something assessable
// done the session is completed with a report on what was covered; with
// nothing, abandoned (no report).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  session: undefined as Record<string, unknown> | undefined,
  updates: [] as Record<string, unknown>[],
  events: [] as unknown[],
  rows: [] as unknown[],
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock('@/db/client', () => ({
  db: {
    query: { sessions: { findFirst: async () => h.session }, sessionTurns: { findMany: async () => [] } },
    update: () => ({ set: (v: Record<string, unknown>) => ({ where: async () => { h.updates.push(v); } }) }),
    insert: () => ({ values: async (v: unknown) => { h.rows.push(v); } }),
  },
}));
vi.mock('@/lib/analytics', () => ({ logEvent: async (...a: unknown[]) => { h.events.push(a); } }));

const { POST } = await import('@/app/api/voice/[sessionId]/end/route');
const call = () => POST(new Request('http://x/api/voice/s1/end', { method: 'POST' }) as never, { params: Promise.resolve({ sessionId: 's1' }) });

beforeEach(() => {
  h.user = { id: 'u1' };
  h.session = { id: 's1', userId: 'u1', status: 'active', phase: 'ANALYSIS', flagsJsonb: {} };
  h.updates.length = 0; h.events.length = 0; h.rows.length = 0;
});

describe('voice end route', () => {
  it('401 without a user; 404 for someone else’s session', async () => {
    h.user = null;
    expect((await call()).status).toBe(401);
    h.user = { id: 'u1' }; h.session = undefined;
    expect((await call()).status).toBe(404);
  });
  it('with nothing assessable done, the session is abandoned at its phase (no report) and logged', async () => {
    const res = await call();
    expect(await res.json()).toEqual({ status: 'abandoned', report: false, partial: false });
    expect(h.updates[0]).toMatchObject({ status: 'abandoned', abandonPhase: 'ANALYSIS', flagsJsonb: { endReason: 'candidate_end_button' } });
    expect(h.updates[0].completedAt).toBeInstanceOf(Date);
    expect(h.events).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({ category: 'intervention', subtype: 'candidate_exit', payloadJsonb: { via: 'voice_button', report: false } });
  });
  it('with a structure and analysis done, the session is completed with a partial report', async () => {
    h.session = { ...h.session, flagsJsonb: { pressureTest: { state: 'satisfied', structureGiven: true } } };
    expect(await (await call()).json()).toEqual({ status: 'completed', report: true, partial: true });
    expect(h.updates[0]).toMatchObject({ status: 'completed', flagsJsonb: { endReason: 'candidate_end_button', partial: true } });
  });
  it('leaves a session that already ended alone', async () => {
    h.session = { ...h.session, status: 'completed' };
    expect(await (await call()).json()).toEqual({ status: 'completed', report: true, partial: false });
    expect(h.updates).toEqual([]);
  });
});
