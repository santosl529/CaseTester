// The pilot dashboard's new events (Matt, 22 Nov 2026): page views (cookie-free), logged_in, failed voice sessions,
// wrong club codes. signed_up: tests/api/sign-up-route.test.ts; the case limit: below.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ID = '51111111-1111-4111-8111-111111111111';
const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  session: { id: '51111111-1111-4111-8111-111111111111' } as Record<string, unknown> | undefined,
  events: [] as { type: string; payload: Record<string, unknown>; ids: Record<string, unknown> }[],
  limited: { ok: true } as { ok: boolean },
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock('@/db/client', () => ({ db: { query: { sessions: { findFirst: async () => h.session } } } }));
vi.mock('@/lib/analytics', () => ({ logEvent: async (type: string, payload: Record<string, unknown> = {}, ids: Record<string, unknown> = {}) => { h.events.push({ type, payload, ids }); } }));
vi.mock('@/lib/rate-limit', async () => {
  const real = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit');
  return { ...real, hitRateLimit: async () => h.limited };
});

const pv = (await import('@/app/api/pv/route')).POST;
const loggedIn = (await import('@/app/api/auth/logged-in/route')).POST;
const failed = (await import('@/app/api/voice/[sessionId]/failed/route')).POST;
const { noteWrongClubCode } = await import('@/lib/club-alert');

const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const view = (path: unknown, ua = SAFARI) => pv(new Request('http://x/api/pv', { method: 'POST', headers: { 'user-agent': ua, 'x-real-ip': '9.9.9.9' }, body: JSON.stringify({ path }) }) as never);

beforeEach(() => { h.user = { id: 'u1' }; h.session = { id: ID }; h.events = []; h.limited = { ok: true }; });

describe('POST /api/pv', () => {
  it('a logged-in student\'s view carries their id and the cleaned path', async () => {
    expect((await view(`/case/${ID}/report?x=1`)).status).toBe(204);
    expect(h.events).toEqual([{ type: 'page_view', payload: { path: '/case/:id/report' }, ids: { userId: 'u1' } }]);
  });
  it('a logged-out visitor\'s view carries today\'s code, never the address', async () => {
    h.user = null;
    await view('/');
    expect(h.events).toHaveLength(1);
    expect(h.events[0].payload).toEqual({ path: '/', visitor: expect.stringMatching(/^[\w-]{22}$/) });
    expect(JSON.stringify(h.events)).not.toContain('9.9.9.9');
  });
  it('bots, API paths and rate-limited addresses are not counted (and still get 204)', async () => {
    expect((await view('/', 'Googlebot/2.1')).status).toBe(204);
    await view('/api/pv');
    h.limited = { ok: false };
    await view('/');
    expect(h.events).toEqual([]);
  });
});

describe('POST /api/auth/logged-in', () => {
  it('logs logged_in for the signed-in account only', async () => {
    expect((await loggedIn()).status).toBe(200);
    expect(h.events).toEqual([{ type: 'logged_in', payload: {}, ids: { userId: 'u1' } }]);
    h.user = null; h.events = [];
    expect((await loggedIn()).status).toBe(401);
    expect(h.events).toEqual([]);
  });
});

describe('POST /api/voice/[id]/failed', () => {
  const call = (kind: unknown) => failed(new Request(`http://x/api/voice/${ID}/failed`, { method: 'POST', body: JSON.stringify({ kind }) }) as never, { params: Promise.resolve({ sessionId: ID }) });
  it('the owner\'s failure, by kind', async () => {
    expect((await call('no_interviewer')).status).toBe(200);
    expect(h.events).toEqual([{ type: 'voice_connect_failed', payload: { kind: 'no_interviewer' }, ids: { sessionId: ID, userId: 'u1' } }]);
  });
  it('an unknown kind, someone else\'s session or no account: nothing logged', async () => {
    expect((await call('whatever')).status).toBe(400);
    h.session = undefined;
    expect((await call('dropped')).status).toBe(404);
    h.user = null;
    expect((await call('dropped')).status).toBe(401);
    expect(h.events).toEqual([]);
  });
});

describe('wrong club codes', () => {
  it('each one is recorded (no code text), alongside the hourly alert', async () => {
    let recorded = 0;
    await noteWrongClubCode({ count: async () => 1, send: async () => {}, threshold: 30, log: () => {}, record: async () => { recorded++; } });
    expect(recorded).toBe(1);
  });
});
