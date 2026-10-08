// Session recording for debugging turn-taking (local, opt-in VOICE_RECORD=1).
import { describe, it, expect } from 'vitest';
import { wavBytes, PcmTrack, mixStereo, SessionRecorder } from '@/lib/voice/recorder';

describe('wavBytes', () => {
  it('writes a 44-byte PCM header and the samples', () => {
    const w = wavBytes(new Int16Array([1, -1]), 16000, 1);
    const v = new DataView(w.buffer);
    expect(new TextDecoder().decode(w.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(w.slice(8, 12))).toBe('WAVE');
    expect(v.getUint16(22, true)).toBe(1);          // channels
    expect(v.getUint32(24, true)).toBe(16000);      // sample rate
    expect(v.getUint32(40, true)).toBe(4);          // data bytes
    expect(v.getInt16(44, true)).toBe(1);
    expect(w.length).toBe(48);
  });
});

describe('PcmTrack', () => {
  it('places audio at its time, filling gaps with silence', () => {
    const t = new PcmTrack(1000);                   // 1 sample per ms
    t.writeAt(2, new Int16Array([5, 6]));
    t.writeAt(6, new Int16Array([7]));
    expect(Array.from(t.samples())).toEqual([0, 0, 5, 6, 0, 0, 7]);
  });
  it('drops audio queued past a cut', () => {
    const t = new PcmTrack(1000);
    t.writeAt(0, new Int16Array([1, 2, 3, 4, 5]));
    t.truncateAfter(3);
    expect(Array.from(t.samples())).toEqual([1, 2, 3]);
  });
});

describe('mixStereo', () => {
  it('interleaves the candidate (left, 16k) with the interviewer resampled 24k → 16k (right)', () => {
    const left = new Int16Array([10, 20, 30, 40]);
    const right = new Int16Array([100, 100, 100, 100, 100, 100]);   // 6 samples at 24k = 4 at 16k
    const m = mixStereo(left, 16000, right, 24000);
    expect(m.length).toBe(8);
    expect(Array.from(m.filter((_, i) => i % 2 === 0))).toEqual([10, 20, 30, 40]);
    expect(Array.from(m.filter((_, i) => i % 2 === 1))).toEqual([100, 100, 100, 100]);
  });
});

describe('SessionRecorder', () => {
  it('keeps the candidate contiguous, the interviewer on the playout clock, and events in ms from the start', () => {
    const r = new SessionRecorder(1000, { candidateRate: 1000, interviewerRate: 1000 });
    r.candidate(new Int16Array([1, 1]), 1002);      // a frame that ended at 2ms
    r.candidate(new Int16Array([2, 2]), 1004);
    r.interviewer(new Int16Array([9, 9, 9]), 1001);
    r.interviewerCut(1003);
    r.event('cut', { kind: 'barge' }, 1003);
    expect(Array.from(r.candidateTrack.samples())).toEqual([1, 1, 2, 2]);
    expect(Array.from(r.interviewerTrack.samples())).toEqual([0, 9, 9]);
    expect(r.events).toEqual([{ t: 3, type: 'cut', kind: 'barge' }]);
  });
  it('times an event by its own absolute `at` (playout time) when it has one, made relative', () => {
    const r = new SessionRecorder(1000, { candidateRate: 1000, interviewerRate: 1000 });
    r.event('ack_start', { seq: 1, at: 1250 }, 1400);
    r.event('turn_start', { seq: 1, speechEndAt: 900 }, 1300);
    expect(r.events).toEqual([{ t: 250, type: 'ack_start', seq: 1, at: 250 }, { t: 300, type: 'turn_start', seq: 1, speechEndAt: -100 }]);
  });
});
