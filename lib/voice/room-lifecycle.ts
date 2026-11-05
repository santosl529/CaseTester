// A voice session's LiveKit room, from the server side (voice lifecycle, 5 Nov; Lorenzo's brief: "Leaving frees
// everything"). Ending a session — the case closing, End, the candidate leaving or the tab closing — cancels any
// dispatch still pending for the room and deletes the room, so the next Start is never refused as busy and a
// late-arriving agent finds no room to wait in. Used by the token, end and leave routes and by the agent itself.
import { AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { AGENT_NAME } from './protocol';

export type RoomInfo = { name: string; numParticipants: number; creationTime: bigint | number };

// What the routes and the agent need of LiveKit's server API: small, so tests pass a fake.
export type RoomAdmin = {
  listRooms(): Promise<RoomInfo[]>;
  listDispatch(room: string): Promise<{ id?: string; agentName: string }[]>;
  createDispatch(room: string, agentName: string, opts: { metadata: string }): Promise<unknown>;
  deleteDispatch(dispatchId: string, room: string): Promise<unknown>;
  deleteRoom(room: string): Promise<unknown>;
  listParticipants(room: string): Promise<{ identity: string }[]>;
};

// From LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET (LiveKit Cloud injects them into the hosted agent);
// null when voice isn't configured.
export function roomAdminFromEnv(env: Record<string, string | undefined> = process.env): RoomAdmin | null {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = env;
  if (!url || !key || !secret) return null;
  const httpUrl = url.replace(/^ws/, 'http');
  const rooms = new RoomServiceClient(httpUrl, key, secret);
  const dispatch = new AgentDispatchClient(httpUrl, key, secret);
  return {
    listRooms: () => rooms.listRooms(),
    listDispatch: room => dispatch.listDispatch(room),
    createDispatch: (room, agentName, opts) => dispatch.createDispatch(room, agentName, opts),
    deleteDispatch: (id, room) => dispatch.deleteDispatch(id, room),
    deleteRoom: room => rooms.deleteRoom(room),
    listParticipants: room => rooms.listParticipants(room),
  };
}

// Cancels the interviewer's dispatches for the room, then deletes the room (which disconnects whoever is in it —
// an agent still there sees its room close and finishes). Best effort and idempotent: a room or dispatch already
// gone is not an error. Never throws.
export async function closeVoiceRoom(admin: RoomAdmin | null, room: string, log: (m: string) => void = m => console.warn(m)): Promise<{ dispatchesCancelled: number; roomDeleted: boolean }> {
  if (!admin) return { dispatchesCancelled: 0, roomDeleted: false };
  let dispatchesCancelled = 0;
  try {
    const ds = await admin.listDispatch(room);
    for (const d of ds) {
      if (d.agentName !== AGENT_NAME || !d.id) continue;
      try { await admin.deleteDispatch(d.id, room); dispatchesCancelled++; } catch (e) { log(`[voice] dispatch ${d.id} not cancelled: ${String(e)}`); }
    }
  } catch (e) { log(`[voice] dispatches for ${room} not listed: ${String(e)}`); }
  let roomDeleted = false;
  try { await admin.deleteRoom(room); roomDeleted = true; } catch (e) {
    // "not found" is the usual case once everyone has left.
    if (!/not.?found|404/i.test(String(e))) log(`[voice] room ${room} not deleted: ${String(e)}`);
  }
  return { dispatchesCancelled, roomDeleted };
}
