// Voice capacity (voice deploy, 18 Oct; PRD §15 "Voice capacity"): the limits
// are shared resources — Deepgram's concurrent Flux streams (an apparent
// one-stream limit on the credit account), Cartesia's plan, the monthly
// character cap — so the cap is global, checked by the token route against
// LiveKit's own room list: VOICE_MAX_CONCURRENT (default 1) live voice rooms.
// A session past it is refused before any dispatch; one whose agent never
// speaks gets the same message from the browser after AGENT_AUDIO_TIMEOUT_MS.
export const VOICE_BUSY_MESSAGE = 'Voice is busy right now. Try again in a few minutes.';
// 30s, not 15 (Lorenzo, 19 Oct): a LiveKit Build-plan agent can cold-start
// 10–20s after idle, which 15s called "busy". The page says it is connecting
// meanwhile; the token route's 429 (rooms full) stays immediate.
export const AGENT_AUDIO_TIMEOUT_MS = 30_000;
export const CONNECTING_MESSAGE = 'Connecting to your interviewer…';
export const ROOM_PREFIX = 'case-';
// A room this new counts even before anyone has joined it: the dispatch
// creates it, and the candidate and the agent join within seconds.
const JUST_CREATED_SEC = 30;

export const voiceRoomName = (sessionId: string) => `${ROOM_PREFIX}${sessionId}`;

export function maxConcurrentVoice(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.VOICE_MAX_CONCURRENT);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

type RoomInfo = { name: string; numParticipants: number; creationTime: bigint | number };

// The other voice sessions running now: rooms of ours with someone in them,
// or just created. A room empties and closes once the candidate and the
// agent leave; the session's own room (a reload, a second Start) never counts.
export function liveVoiceRooms(rooms: RoomInfo[], ours: string, nowSec: number): string[] {
  return rooms.filter(r => r.name.startsWith(ROOM_PREFIX) && r.name !== ours
    && (r.numParticipants > 0 || nowSec - Number(r.creationTime) < JUST_CREATED_SEC)).map(r => r.name);
}

// The browser's watchdog: arm() when the room connects (and again after the
// audio-unlock click — no audio can play before it), heard() on the first
// interviewer audio, stop() when leaving. Fires onTimeout once, only if no
// audio was heard in timeoutMs since the last arm().
export function agentAudioWatchdog(o: { onTimeout: () => void; timeoutMs?: number;
  setTimer?: (f: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void }) {
  const set = o.setTimer ?? ((f, ms) => setTimeout(f, ms));
  const clear = o.clearTimer ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>));
  let handle: unknown = null;
  let heard = false;
  const stop = () => { if (handle !== null) clear(handle); handle = null; };
  return {
    arm() { stop(); if (!heard) handle = set(() => { handle = null; if (!heard) o.onTimeout(); }, o.timeoutMs ?? AGENT_AUDIO_TIMEOUT_MS); },
    heard() { heard = true; stop(); },
    stop,
    get wasHeard() { return heard; },
  };
}
