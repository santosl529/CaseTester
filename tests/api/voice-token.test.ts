// POST /api/voice/[sessionId]/token (spec 2026-10-08-voice-phase-b §4): a
// LiveKit token for the session owner and one agent dispatch per room.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  session: { id: 's1', userId: 'u1', status: 'active', phase: 'CLARIFY' } as Record<string, unknown> | undefined,
  listDispatch: vi.fn(async (): Promise<{ agentName: string }[]> => []),
  createDispatch: vi.fn(async () => ({ id: 'AD_1' })),
  grants: [] as unknown[],
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock('@/db/client', () => ({ db: { query: { sessions: { findFirst: async () => h.session } } } }));
vi.mock('livekit-server-sdk', () => ({
  AccessToken: class { constructor(public key: string, public secret: string, public opts: unknown) {} addGrant(g: unknown) { h.grants.push(g); } async toJwt() { return 'jwt-for-test'; } },
  AgentDispatchClient: class { constructor(public url: string) { (h as Record<string, unknown>).dispatchUrl = url; } listDispatch = h.listDispatch; createDispatch = h.createDispatch; },
}));

const { POST } = await import('@/app/api/voice/[sessionId]/token/route');
const call = () => POST(new Request('http://x/api/voice/s1/token', { method: 'POST' }) as never, { params: Promise.resolve({ sessionId: 's1' }) });

beforeEach(() => {
  h.user = { id: 'u1' };
  h.session = { id: 's1', userId: 'u1', status: 'active', phase: 'CLARIFY' };
  h.listDispatch.mockReset().mockResolvedValue([]);
  h.createDispatch.mockClear();
  h.grants.length = 0;
  process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'key';
  process.env.LIVEKIT_API_SECRET = 'secret';
});

describe('voice token route', () => {
  it('401 without a user', async () => {
    h.user = null;
    expect((await call()).status).toBe(401);
  });
  it('404 when the session is not the user’s', async () => {
    h.session = undefined;
    expect((await call()).status).toBe(404);
  });
  it('409 when the session is no longer active', async () => {
    h.session = { ...h.session, status: 'completed' };
    expect((await call()).status).toBe(409);
  });
  it('503 when LiveKit is not configured', async () => {
    delete process.env.LIVEKIT_API_SECRET;
    expect((await call()).status).toBe(503);
  });
  it('mints a token for the session room and dispatches the agent once, over https', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'wss://example.livekit.cloud', token: 'jwt-for-test' });
    expect(h.grants[0]).toMatchObject({ roomJoin: true, room: 'case-s1', canPublish: true, canSubscribe: true, canPublishData: true });
    expect(h.createDispatch).toHaveBeenCalledWith('case-s1', 'case-interviewer', { metadata: JSON.stringify({ sessionId: 's1' }) });
    expect((h as Record<string, unknown>).dispatchUrl).toBe('https://example.livekit.cloud');
  });
  it('does not dispatch a second agent into a room that has one (Review Focus 3)', async () => {
    h.listDispatch.mockResolvedValue([{ agentName: 'case-interviewer' }]);
    expect((await call()).status).toBe(200);
    expect(h.createDispatch).not.toHaveBeenCalled();
  });
  it('never returns the API key or secret', async () => {
    const body = JSON.stringify(await (await call()).json());
    expect(body).not.toContain('secret');
    expect(body).not.toContain('"key"');
  });
});
