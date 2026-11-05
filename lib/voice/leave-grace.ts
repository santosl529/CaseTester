// The leave beacon's grace (Lorenzo, 5 Nov: "a reload mid-session must resume the same interview"). The page sends
// the beacon on pagehide — which a reload fires too — so the leave route does not free the room at once: it waits
// LEAVE_GRACE_MS and frees it (dispatches cancelled, room deleted, claim released) only if the candidate is not back
// in the room by then. A reload reconnects within seconds (components/voice-room.tsx resumes on its own), so the
// same agent carries on with the same interview. End and the case ending free the room at once, as before.
import { closeVoiceRoom, type RoomAdmin } from './room-lifecycle';

export const LEAVE_GRACE_MS = 15_000;

export type LeaveGraceDeps = {
  admin: RoomAdmin | null;
  release: (sessionId: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  log?: (m: string) => void;
};

export async function freeRoomUnlessBack(
  p: { sessionId: string; room: string; candidate: string; graceMs?: number },
  d: LeaveGraceDeps,
): Promise<'rejoined' | 'freed'> {
  const log = d.log ?? (m => console.log(m));
  await d.sleep(p.graceMs ?? LEAVE_GRACE_MS);
  let present = false;
  try {
    present = (await d.admin?.listParticipants(p.room) ?? []).some(x => x.identity === p.candidate);
  } catch {
    present = false;   // no room (deleted, or closed once empty): nobody came back
  }
  if (present) { log(`[voice] ${p.room}: candidate back within the grace — room kept`); return 'rejoined'; }
  const freed = await closeVoiceRoom(d.admin, p.room);
  await d.release(p.sessionId).catch(e => log(`[voice] dispatch claim not released: ${String(e)}`));
  log(`[voice] ${p.room}: candidate did not come back — room freed (${JSON.stringify(freed)})`);
  return 'freed';
}
