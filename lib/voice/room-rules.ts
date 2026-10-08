// Room rules for the voice job that need no room to test (spec
// 2026-10-08-voice-phase-b §9): whose microphone counts, and the wall clock.
import type { Clock } from './playout';

// One candidate per room: the session owner's first audio track only (a
// second tab, or anyone else, is ignored).
export function pickCandidateTrack(ownerId: string, current: string | null, identity: string, trackSid: string): boolean {
  return identity === ownerId && (current === null || current === trackSid);
}

export const realClock: Clock = {
  now: () => Date.now(),
  at: (ms, fn) => { const h = setTimeout(fn, Math.max(0, ms - Date.now())); return () => clearTimeout(h); },
};
