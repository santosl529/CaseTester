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

import { vi, afterEach } from 'vitest';
import { realClock } from '@/lib/voice/room-rules';

afterEach(() => { vi.restoreAllMocks(); });

// Session 9813d6ce (18 Oct): Node ran timers up to ~1ms before their target
// while Playout's ends are fractional ms, so the idle wait resolved just
// before a segment's end, classify took it as still playing, and the heard
// margin dropped its last word ("…which would it be and" without "why?").
it('realClock.at never runs before its time, even when the host timer fires early', () => {
  let now = 1000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const pending: { fn: () => void; ms: number }[] = [];
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => { pending.push({ fn, ms: ms ?? 0 }); return pending.length as unknown as NodeJS.Timeout; }) as typeof setTimeout);
  const ran: number[] = [];
  realClock.at(1012.4, () => ran.push(now));
  now = 1012; pending.shift()!.fn();             // fired early: re-armed, not run
  expect(ran).toEqual([]);
  expect(pending).toHaveLength(1);
  now = 1013; pending.shift()!.fn();
  expect(ran).toEqual([1013]);
});

it('realClock.at cancels a re-armed timer too', () => {
  let now = 1000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const pending: (() => void)[] = [];
  let ids = 0;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => { pending.push(fn); return ++ids as unknown as NodeJS.Timeout; }) as typeof setTimeout);
  const cleared: unknown[] = [];
  vi.spyOn(globalThis, 'clearTimeout').mockImplementation(((h: unknown) => { cleared.push(h); }) as typeof clearTimeout);
  const ran: number[] = [];
  const cancel = realClock.at(1012.4, () => ran.push(now));
  now = 1012; pending.shift()!();                // re-armed as timer 2
  cancel();
  expect(cleared).toEqual([2]);
});
