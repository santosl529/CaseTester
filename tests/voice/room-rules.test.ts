// Who the agent listens to in a room (spec 2026-10-08-voice-phase-b §9).
import { it, expect } from 'vitest';
import { pickCandidateTrack } from '@/lib/voice/room-rules';

it('uses only the session owner’s first audio track (Review Focus 4)', () => {
  expect(pickCandidateTrack('u1', null, 'u1', 'TR_a')).toBe(true);
  expect(pickCandidateTrack('u1', 'TR_a', 'u1', 'TR_a')).toBe(true);    // the same track again
  expect(pickCandidateTrack('u1', 'TR_a', 'u1', 'TR_b')).toBe(false);   // a second tab
  expect(pickCandidateTrack('u1', null, 'intruder', 'TR_c')).toBe(false);
});
