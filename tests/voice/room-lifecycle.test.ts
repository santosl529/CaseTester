// Freeing a voice room (voice lifecycle, 5 Nov; lib/voice/room-lifecycle.ts) and local voice isolation
// (lib/voice/livekit-env.ts) and the browser's leave beacon (lib/voice/leave.ts).
import { describe, it, expect, vi } from 'vitest';
import { closeVoiceRoom, type RoomAdmin } from '@/lib/voice/room-lifecycle';
import { liveKitEnvProblem } from '@/lib/voice/livekit-env';
import { sendLeave, shouldSendLeave } from '@/lib/voice/leave';

const admin = (o: Partial<RoomAdmin> = {}): RoomAdmin & { deleted: string[]; cancelled: string[] } => {
  const deleted: string[] = [], cancelled: string[] = [];
  return {
    deleted, cancelled,
    listRooms: async () => [],
    listDispatch: async () => [{ id: 'AD_1', agentName: 'case-interviewer' }, { id: 'AD_2', agentName: 'someone-else' }],
    createDispatch: async () => ({}),
    deleteDispatch: async id => { cancelled.push(id); },
    deleteRoom: async room => { deleted.push(room); },
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
