// Voice lifecycle (5 Nov; Lorenzo's brief): leaving frees everything, and one agent per session. The token, end
// and leave routes run against one in-memory LiveKit (rooms and dispatches) and one session table, so a sequence —
// End, then a Start right after — is checked the way production would see it.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const lk = vi.hoisted(() => ({
  rooms: new Map<string, { name: string; numParticipants: number; creationTime: bigint }>(),
  dispatches: [] as { id: string; room: string; agentName: string }[],
  created: 0,
  // A pause inside listDispatch, so two token requests overlap where it matters.
  gate: null as Promise<void> | null,
}));
const db = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  sessions: new Map<string, { id: string; userId: string; status: string; phase: string; flagsJsonb: Record<string, unknown> }>(),
  claims: new Map<string, number>(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: db.user } }) } }) }));
// The session lookups the routes make; `select … where id in (…) and status = 'active'` for the cap.
vi.mock('@/db/client', () => ({
  db: {
    query: { sessions: { findFirst: async () => db.sessions.get(currentId) }, sessionTurns: { findMany: async () => [] } },
    select: () => ({ from: () => ({ where: async () => [...db.sessions.values()].filter(s => s.status === 'active').map(s => ({ id: s.id })) }) }),
    update: () => ({ set: (v: Record<string, unknown>) => ({ where: async () => { const s = db.sessions.get(currentId); if (s) Object.assign(s, v); } }) }),
    insert: () => ({ values: async () => {} }),
  },
}));
vi.mock('@/lib/analytics', () => ({ logEvent: async () => {} }));
// The claim as Postgres decides it: one conditional UPDATE — of concurrent callers exactly one matches.
vi.mock('@/lib/voice/dispatch-claim', () => ({
  claimVoiceDispatch: async (id: string, now: number) => (db.claims.has(id) ? false : (db.claims.set(id, now), true)),
  releaseVoiceDispatch: async (id: string) => { db.claims.delete(id); },
}));
vi.mock('livekit-server-sdk', () => ({
  AccessToken: class { addGrant() {} async toJwt() { return 'jwt'; } },
  AgentDispatchClient: class {
    async listDispatch(room: string) { if (lk.gate) await lk.gate; return lk.dispatches.filter(d => d.room === room); }
    async createDispatch(room: string, agentName: string) {
      lk.created++;
      const d = { id: `AD_${lk.created}`, room, agentName };
      lk.dispatches.push(d);
      if (!lk.rooms.has(room)) lk.rooms.set(room, { name: room, numParticipants: 0, creationTime: BigInt(Math.floor(Date.now() / 1000)) });
      return d;
    }
    async deleteDispatch(id: string) { lk.dispatches = lk.dispatches.filter(d => d.id !== id); }
  },
  RoomServiceClient: class {
    async listRooms() { return [...lk.rooms.values()]; }
    async deleteRoom(room: string) { if (!lk.rooms.delete(room)) throw new Error('requested room does not exist (not_found)'); }
  },
}));

let currentId = A;
const { POST: token } = await import('@/app/api/voice/[sessionId]/token/route');
const { POST: end } = await import('@/app/api/voice/[sessionId]/end/route');
const { POST: leave } = await import('@/app/api/voice/[sessionId]/leave/route');
type Route = (req: never, ctx: { params: Promise<{ sessionId: string }> }) => Promise<Response>;
const call = (route: Route, id: string) => { currentId = id; return route(new Request(`http://x/api/voice/${id}`, { method: 'POST' }) as never, { params: Promise.resolve({ sessionId: id }) }); };
const old = () => BigInt(Math.floor(Date.now() / 1000) - 600);

beforeEach(() => {
  lk.rooms.clear(); lk.dispatches = []; lk.created = 0; lk.gate = null;
  db.user = { id: 'u1' };
  db.sessions.clear(); db.claims.clear();
  for (const id of [A, B]) db.sessions.set(id, { id, userId: 'u1', status: 'active', phase: 'ANALYSIS', flagsJsonb: {} });
  delete process.env.VOICE_MAX_CONCURRENT;
  process.env.LIVEKIT_URL = 'wss://dev-project.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'key';
  process.env.LIVEKIT_API_SECRET = 'secret';
});

describe('End then an immediate retry', () => {
  it('while A is live, B is busy; End on A frees the slot before it returns, and B starts at once', async () => {
    expect((await call(token, A)).status).toBe(200);
    lk.rooms.get(`case-${A}`)!.numParticipants = 2;   // the candidate and the agent
    expect((await call(token, B)).status).toBe(429);
    expect((await call(end, A)).status).toBe(200);
    expect(lk.rooms.has(`case-${A}`)).toBe(false);
    expect(lk.dispatches.filter(d => d.room === `case-${A}`)).toEqual([]);
    expect(db.claims.has(A)).toBe(false);
    expect((await call(token, B)).status).toBe(200);
  });

  it('a room LiveKit still lists for an ended session never counts, and is closed', async () => {
    lk.rooms.set(`case-${A}`, { name: `case-${A}`, numParticipants: 1, creationTime: old() });   // an agent lingering
    db.sessions.get(A)!.status = 'completed';
    expect((await call(token, B)).status).toBe(200);
    await new Promise(r => setTimeout(r, 0));
    expect(lk.rooms.has(`case-${A}`)).toBe(false);
  });

  it('a room whose name is not a session id still counts (conservative)', async () => {
    lk.rooms.set('case-legacy', { name: 'case-legacy', numParticipants: 2, creationTime: old() });
    expect((await call(token, B)).status).toBe(429);
  });
});

describe('the candidate leaving (tab closed, navigated away, gave up waiting)', () => {
  it('during the cold start: the pending dispatch is cancelled and the room deleted; a later Start dispatches afresh', async () => {
    expect((await call(token, A)).status).toBe(200);
    expect(lk.dispatches).toHaveLength(1);
    const res = await call(leave, A);
    expect(await res.json()).toMatchObject({ ok: true, dispatchesCancelled: 1, roomDeleted: true });
    expect(lk.dispatches).toEqual([]);
    expect(lk.rooms.size).toBe(0);
    expect(db.claims.has(A)).toBe(false);
    expect(db.sessions.get(A)!.status).toBe('active');   // they can come back
    expect((await call(token, A)).status).toBe(200);
    expect(lk.created).toBe(2);
    // …and another session isn't held up by A's abandoned start.
    expect((await call(leave, A)).status).toBe(200);
    expect((await call(token, B)).status).toBe(200);
  });

  it('401 signed out; 404 for a session that is not theirs', async () => {
    db.user = null;
    expect((await call(leave, A)).status).toBe(401);
    db.user = { id: 'u1' };
    expect((await call(leave, '33333333-3333-4333-8333-333333333333')).status).toBe(404);
  });
});

describe('one agent per session', () => {
  it('two token requests at once start one agent', async () => {
    let open!: () => void;
    lk.gate = new Promise<void>(r => { open = r; });   // both requests pass listDispatch before either dispatches
    const both = Promise.all([call(token, A), call(token, A)]);
    await new Promise(r => setTimeout(r, 0));
    open();
    const [r1, r2] = await both;
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(lk.created).toBe(1);
  });

  it('a reload while the agent is in the room does not dispatch another', async () => {
    await call(token, A);
    db.claims.clear();   // even with the claim gone (a turn rewrote the flags), LiveKit's dispatch list holds
    await call(token, A);
    expect(lk.created).toBe(1);
  });
});
