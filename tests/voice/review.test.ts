// Reviewing a recorded session: where the candidate was speaking, and what
// the turn-taking did around it.
import { describe, it, expect } from 'vitest';
import { voicedIntervals, reviewSession } from '@/lib/voice/review';
import type { RecordedEvent } from '@/lib/voice/recorder';

const RATE = 1000;   // 1 sample per ms
function speechAt(totalMs: number, spans: [number, number][]): Int16Array {
  const s = new Int16Array(totalMs);
  for (const [a, b] of spans) for (let i = a; i < b; i++) s[i] = i % 2 ? 6000 : -6000;
  return s;
}

describe('voicedIntervals', () => {
  it('finds speech, bridging short gaps and ignoring blips', () => {
    const v = voicedIntervals(speechAt(5000, [[100, 900], [1000, 1500], [3000, 3040]]), RATE);
    expect(v).toEqual([{ start: 100, end: 1500 }]);   // 100ms gap bridged; 40ms blip dropped
  });
});

describe('reviewSession', () => {
  const ev = (t: number, type: string, data: Record<string, unknown> = {}): RecordedEvent => ({ t, type, ...data });

  it('flags an acknowledgment over the candidate’s continued speech, and a premature end of turn', () => {
    const events = [
      ev(2000, 'final', { text: 'I think the issue is' }), ev(2000, 'turn_start', { seq: 1 }),
      ev(2010, 'ack_start', { seq: 1 }), ev(2300, 'cut', { seq: 1, kind: 'barge' }),
      ev(2400, 'turn_end', { seq: 1, cancelled: true }),
    ];
    const voiced = [{ start: 500, end: 1300 }, { start: 2200, end: 3500 }];
    const [t] = reviewSession(events, voiced);
    expect(t).toMatchObject({ seq: 1, speechEnd: 1300, endpointMs: 700, cancelled: true });
    expect(t.flags).toEqual(expect.arrayContaining(['ack_over_speech', 'premature_end_of_turn']));
    expect(t.bargeReactionMs).toBe(100);
  });

  it('a clean turn has no flags and reports the wait for content', () => {
    const events = [
      ev(2000, 'final', { text: 'Costs went up.' }), ev(2000, 'turn_start', { seq: 2 }),
      ev(2050, 'ack_start', { seq: 2 }), ev(3800, 'segment_start', { seq: 2, kind: 'data' }),
      ev(9000, 'turn_end', { seq: 2, cancelled: false }),
    ];
    const [t] = reviewSession(events, [{ start: 400, end: 1600 }]);
    expect(t.flags).toEqual([]);
    expect(t.ackToContentMs).toBe(1750);
  });

  it('flags a long silence after the acknowledgment', () => {
    const events = [
      ev(2000, 'final', { text: 'x' }), ev(2000, 'turn_start', { seq: 3 }), ev(2050, 'ack_start', { seq: 3 }),
      ev(5200, 'segment_start', { seq: 3, kind: 'tail' }), ev(9000, 'turn_end', { seq: 3, cancelled: false }),
    ];
    expect(reviewSession(events, [{ start: 400, end: 1600 }])[0].flags).toContain('dead_air_after_ack');
  });
});
