// Freeing a voice room (voice lifecycle, 5 Nov; lib/voice/room-lifecycle.ts) and local voice isolation
// (lib/voice/livekit-env.ts) and the browser's leave beacon (lib/voice/leave.ts).
import { describe, it, expect, vi } from 'vitest';
import { closeVoiceRoom, type RoomAdmin } from '@/lib/voice/room-lifecycle';
import { liveKitEnvProblem } from '@/lib/voice/livekit-env';
import { sendLeave, shouldSendLeave, markLive, clearLive, shouldAutoResume, RESUME_WINDOW_MS } from '@/lib/voice/leave';
import { freeRoomUnlessBack } from '@/lib/voice/leave-grace';

const admin = (o: Partial<RoomAdmin> = {}): RoomAdmin & { deleted: string[]; cancelled: string[] } => {
  const deleted: string[] = [], cancelled: string[] = [];
  return {
    deleted, cancelled,
    listRooms: async () => [],
    listDispatch: async () => [{ id: 'AD_1', agentName: 'case-interviewer' }, { id: 'AD_2', agentName: 'someone-else' }],
    createDispatch: async () => ({}),
    deleteDispatch: async id => { cancelled.push(id); },
    deleteRoom: async room => { deleted.push(room); },
    listParticipants: async () => [],
    ...o,
  };
};

describe('closeVoiceRoom', () => {
  it('cancels the interviewer dispatch (only ours) and deletes the room', async () => {
    const a = admin();
    expect(await closeVoiceRoom(a, 'case-s1')).toEqual({ dispatchesCancelled: 1, roomDeleted: true });
    expect(a.cancelled).toEqual(['AD_1']);
    expect(a.deleted).toEqual(['case-s1']);
  });
  it('a room already gone is fine and quiet; other failures are logged, never thrown', async () => {
    const log = vi.fn();
    expect(await closeVoiceRoom(admin({ deleteRoom: async () => { throw new Error('twirp error not_found'); } }), 'r', log)).toEqual({ dispatchesCancelled: 1, roomDeleted: false });
    expect(log).not.toHaveBeenCalled();
    await closeVoiceRoom(admin({ listDispatch: async () => { throw new Error('down'); }, deleteRoom: async () => { throw new Error('500'); } }), 'r', log);
    expect(log).toHaveBeenCalledTimes(2);
    expect(await closeVoiceRoom(null, 'r')).toEqual({ dispatchesCancelled: 0, roomDeleted: false });
  });
});

describe('local voice isolation', () => {
  const prod = 'wss://case-tester-t1foysn4.livekit.cloud';
  it('refuses production’s LiveKit project outside production, unless deliberately allowed', () => {
    expect(liveKitEnvProblem({ LIVEKIT_URL: prod })).toMatch(/production's LiveKit project/);
    expect(liveKitEnvProblem({ LIVEKIT_URL: prod, NODE_ENV: 'development' })).not.toBeNull();
    expect(liveKitEnvProblem({ LIVEKIT_URL: prod, VOICE_DEV_ALLOW_PROD_LIVEKIT: '1' })).toBeNull();
    expect(liveKitEnvProblem({ LIVEKIT_URL: prod, NODE_ENV: 'production' })).toBeNull();
  });
  it('a local project is fine', () => {
    expect(liveKitEnvProblem({ LIVEKIT_URL: 'wss://case-tester-dev-abc123.livekit.cloud' })).toBeNull();
    expect(liveKitEnvProblem({ LIVEKIT_URL: 'ws://localhost:7880' })).toBeNull();
    expect(liveKitEnvProblem({})).toBeNull();
  });
});

describe('the leave beacon', () => {
  it('beacons the leave route; falls back to a keepalive fetch', () => {
    const beacon = vi.fn<(url: string, body?: BodyInit | null) => boolean>(() => true);
    expect(sendLeave('s1', { sendBeacon: beacon })).toBe(true);
    expect(beacon.mock.calls[0][0]).toBe('/api/voice/s1/leave');
    const f = vi.fn(async () => ({}));
    expect(sendLeave('s1', { sendBeacon: () => false, fetch: f })).toBe(true);
    expect(f).toHaveBeenCalledWith('/api/voice/s1/leave', { method: 'POST', keepalive: true });
  });
  it('only mid-session: not before Start, not after the case ended', () => {
    expect(shouldSendLeave('connecting', false)).toBe(true);
    expect(shouldSendLeave('live', false)).toBe(true);
    expect(shouldSendLeave('live', true)).toBe(false);
    expect(shouldSendLeave('idle', false)).toBe(false);
    expect(shouldSendLeave('ended', false)).toBe(false);
  });
});

describe('reload-and-resume in the browser (sessionStorage mark)', () => {
  const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }; };
  it('a page that left mid-session resumes on reload; not after the case ended; not long after', () => {
    const s = store();
    const now = Date.now();
    expect(shouldAutoResume(s, 's1', now)).toBe(false);
    markLive(s, 's1');
    expect(shouldAutoResume(s, 's1', now + 2_000)).toBe(true);
    expect(shouldAutoResume(s, 's2', now + 2_000)).toBe(false);
    expect(shouldAutoResume(s, 's1', now + RESUME_WINDOW_MS + 1_000)).toBe(false);
    clearLive(s, 's1');
    expect(shouldAutoResume(s, 's1', now + 2_000)).toBe(false);
    expect(shouldAutoResume(null, 's1', now)).toBe(false);
  });
});

describe('the leave grace', () => {
  const deps = (participants: string[] | Error) => {
    const a = admin({ listParticipants: async () => { if (participants instanceof Error) throw participants; return participants.map(identity => ({ identity })); } });
    const released: string[] = [];
    const slept: number[] = [];
    return { a, released, slept, d: { admin: a, release: async (id: string) => { released.push(id); }, sleep: async (ms: number) => { slept.push(ms); }, log: () => {} } };
  };
  it('back within the grace: nothing freed', async () => {
    const x = deps(['agent-1', 'u1']);
    expect(await freeRoomUnlessBack({ sessionId: 's1', room: 'case-s1', candidate: 'u1' }, x.d)).toBe('rejoined');
    expect(x.slept).toEqual([15_000]);
    expect([x.a.deleted, x.a.cancelled, x.released]).toEqual([[], [], []]);
  });
  it('not back (only the agent, or no room at all): freed', async () => {
    for (const p of [['agent-1'], new Error('not_found')]) {
      const x = deps(p);
      expect(await freeRoomUnlessBack({ sessionId: 's1', room: 'case-s1', candidate: 'u1' }, x.d)).toBe('freed');
      expect(x.a.deleted).toEqual(['case-s1']);
      expect(x.released).toEqual(['s1']);
    }
  });
});

