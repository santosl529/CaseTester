// The browser's per-turn health line (Lorenzo, 19 Oct, d): the longest frame
// gap and long-task time since the last line, with the audio element count and
// the audio context's state — so a freeze shows its cause in the records.
import { describe, it, expect } from 'vitest';
import { HealthMeter } from '@/lib/voice/health';
import { parseClientMessage } from '@/lib/voice/protocol';

describe('HealthMeter', () => {
  it('reports the longest gap between frames and the long-task time since the last report, then starts over', () => {
    const m = new HealthMeter(true);
    for (const t of [0, 16, 33, 250, 266]) m.frame(t, true);   // a 217ms stall
    m.longTask(120); m.longTask(60);
    expect(m.take({ audioElements: 1, audioContextState: 'running' })).toEqual({ longestFrameGapMs: 217, longTaskMs: 180, audioElements: 1, audioContextState: 'running' });
    m.frame(282, true);
    expect(m.take({ audioElements: 1, audioContextState: 'running' })).toMatchObject({ longestFrameGapMs: 16, longTaskMs: 0 });
  });

  it('a hidden tab is not a stall: frames stop while hidden and the gap is not counted', () => {
    const m = new HealthMeter(true);
    m.frame(0, true); m.frame(16, true);
    m.frame(5000, false);          // hidden: browsers pause frames
    m.frame(5016, true); m.frame(5032, true);
    expect(m.take({ audioElements: 1, audioContextState: 'running' }).longestFrameGapMs).toBe(16);
  });

  it('no long-task support (Safari, Firefox): null, not zero', () => {
    const m = new HealthMeter(false);
    expect(m.take({ audioElements: 0, audioContextState: 'suspended' }).longTaskMs).toBeNull();
  });
});

describe('the health message', () => {
  it('parses a well-formed line and rejects a malformed one', () => {
    const ok = { type: 'health', turnSeq: 3, longestFrameGapMs: 217, longTaskMs: 180, audioElements: 1, audioContextState: 'running' };
    expect(parseClientMessage(JSON.stringify(ok))).toEqual(ok);
    expect(parseClientMessage(JSON.stringify({ ...ok, longTaskMs: null }))).toEqual({ ...ok, longTaskMs: null });
    expect(parseClientMessage(JSON.stringify({ ...ok, audioElements: 'x' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...ok, turnSeq: 1.5 }))).toBeNull();
  });
});
