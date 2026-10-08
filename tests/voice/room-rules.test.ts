// Who the agent listens to in a room (spec 2026-10-08-voice-phase-b §9).
import { it, expect } from 'vitest';
import { pickCandidateTrack } from '@/lib/voice/room-rules';

it('uses only the session owner’s first audio track (Review Focus 4)', () => {
  expect(pickCandidateTrack('u1', null, 'u1', 'TR_a')).toBe(true);
  expect(pickCandidateTrack('u1', 'TR_a', 'u1', 'TR_a')).toBe(true);    // the same track again
  expect(pickCandidateTrack('u1', 'TR_a', 'u1', 'TR_b')).toBe(false);   // a second tab
  expect(pickCandidateTrack('u1', null, 'intruder', 'TR_c')).toBe(false);
});

import { findCandidateTrack } from '@/lib/voice/room-rules';

it('finds the owner’s audio track already subscribed before the handler existed', () => {
  const pub = (sid: string, kind: 'audio' | 'video', track: unknown = { id: sid }) => [sid, { sid, kind, track }] as const;
  const participants = [
    { identity: 'intruder', trackPublications: new Map([pub('TR_x', 'audio')]) },
    { identity: 'u1', trackPublications: new Map([pub('TR_v', 'video'), pub('TR_none', 'audio', null), pub('TR_a', 'audio')]) },
  ];
  expect(findCandidateTrack(participants, 'u1', k => k === 'audio')?.sid).toBe('TR_a');
  expect(findCandidateTrack(participants, 'u2', k => k === 'audio')).toBeNull();
});
