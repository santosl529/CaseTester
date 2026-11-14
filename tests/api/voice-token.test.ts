// POST /api/voice/[sessionId]/token (spec 2026-10-08-voice-phase-b §4): a
// LiveKit token for the session owner and one agent dispatch per room.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  session: { id: '51111111-1111-4111-8111-111111111111', userId: 'u1', status: 'active', phase: 'CLARIFY' } as Record<string, unknown> | undefined,
  listDispatch: vi.fn(async (): Promise<{ agentName: string }[]> => []),
  createDispatch: vi.fn(async () => ({ id: 'AD_1' })),
  grants: [] as unknown[],
  rooms: [] as { name: string; numParticipants: number; creationTime: bigint }[],
}));
// Voice consent on file unless a test says otherwise (lib/voice/consent.ts).
vi.mock('@/lib/voice/consent', () => ({ voiceConsentFor: async () => (globalThis as { __noVoiceConsent?: boolean }).__noVoiceConsent !== true }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock('@/db/client', () => ({ db: { query: { sessions: { findFirst: async () => h.session } } } }));
// The dispatch claim (lib/voice/dispatch-claim.ts), as Postgres would decide it: the first caller wins.
const claim = vi.hoisted(() => ({ held: false }));
vi.mock('@/lib/voice/dispatch-claim', () => ({
  claimVoiceDispatch: async () => (claim.held ? false : (claim.held = true)),
  releaseVoiceDispatch: async () => { claim.held = false; },
}));
vi.mock('livekit-server-sdk', () => ({
  TrackSource: { MICROPHONE: 2, CAMERA: 1, SCREEN_SHARE: 3 },
  AccessToken: class { constructor(public key: string, public secret: string, public opts: unknown) {} addGrant(g: unknown) { h.grants.push(g); } async toJwt() { return 'jwt-for-test'; } },
  AgentDispatchClient: class { constructor(public url: string) { (h as Record<string, unknown>).dispatchUrl = url; } listDispatch = h.listDispatch; createDispatch = h.createDispatch; },
  RoomServiceClient: class { constructor(public url: string) { (h as Record<string, unknown>).roomsUrl = url; } listRooms = async () => h.rooms; deleteRoom = async () => {}; },
}));

const { POST } = await import('@/app/api/voice/[sessionId]/token/route');
const call = () => POST(new Request('http://x/api/voice/51111111-1111-4111-8111-111111111111/token', { method: 'POST' }) as never, { params: Promise.resolve({ sessionId: '51111111-1111-4111-8111-111111111111' }) });

beforeEach(() => {
  h.user = { id: 'u1' };
  h.session = { id: '51111111-1111-4111-8111-111111111111', userId: 'u1', status: 'active', phase: 'CLARIFY' };
  h.listDispatch.mockReset().mockResolvedValue([]);
  h.createDispatch.mockClear();
  h.grants.length = 0;
  h.rooms = [];
  claim.held = false;
  delete process.env.VOICE_MAX_CONCURRENT;
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
  it('403 consent_required without voice consent on file, before any LiveKit work or dispatch (Lorenzo, 14 Nov)', async () => {
    (globalThis as { __noVoiceConsent?: boolean }).__noVoiceConsent = true;
    try {
      const res = await call();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'consent_required' });
      expect(h.createDispatch).not.toHaveBeenCalled();
    } finally {
      delete (globalThis as { __noVoiceConsent?: boolean }).__noVoiceConsent;
    }
  });
  it('503 when LiveKit is not configured', async () => {
    delete process.env.LIVEKIT_API_SECRET;
    expect((await call()).status).toBe(503);
  });
  it('mints a token for the session room and dispatches the agent once, over https', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'wss://example.livekit.cloud', token: 'jwt-for-test' });
    expect(h.grants[0]).toMatchObject({ roomJoin: true, room: 'case-51111111-1111-4111-8111-111111111111', canPublish: true, canSubscribe: true, canPublishData: true });
    // Security audit (6 Nov): the candidate may publish their microphone and nothing else (no camera, no screen).
    expect((h.grants[0] as { canPublishSources?: unknown }).canPublishSources).toEqual([2]);
    expect(h.createDispatch).toHaveBeenCalledWith('case-51111111-1111-4111-8111-111111111111', 'case-interviewer', { metadata: JSON.stringify({ sessionId: '51111111-1111-4111-8111-111111111111' }) });
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

  describe('the concurrency cap (VOICE_MAX_CONCURRENT, voice deploy)', () => {
    const now = () => BigInt(Math.floor(Date.now() / 1000));
    it('refuses a new session while another voice room is live (default 1), before any dispatch', async () => {
      h.rooms = [{ name: 'case-other', numParticipants: 2, creationTime: now() - BigInt(600) }];
      const res = await call();
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: 'busy' });
      expect(h.createDispatch).not.toHaveBeenCalled();
      expect(h.grants).toEqual([]);
      expect((h as Record<string, unknown>).roomsUrl).toBe('https://example.livekit.cloud');
    });
    it('lets the session back into its own room (a reload), and counts only live voice rooms', async () => {
      h.rooms = [
        { name: 'case-51111111-1111-4111-8111-111111111111', numParticipants: 1, creationTime: now() - BigInt(60) },
        { name: 'case-closing', numParticipants: 0, creationTime: now() - BigInt(600) },
        { name: 'playground', numParticipants: 3, creationTime: now() - BigInt(60) },
      ];
      expect((await call()).status).toBe(200);
    });
    it('takes a higher cap', async () => {
      process.env.VOICE_MAX_CONCURRENT = '2';
      h.rooms = [{ name: 'case-other', numParticipants: 2, creationTime: now() - BigInt(600) }];
      expect((await call()).status).toBe(200);
      h.rooms.push({ name: 'case-third', numParticipants: 0, creationTime: now() - BigInt(2) });
      expect((await call()).status).toBe(429);
    });
  });
});
