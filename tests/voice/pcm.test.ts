import { describe, it, expect } from 'vitest';
import { frames, durationSec, speechEndSec, silence, streamRealtime } from '@/lib/voice/pcm';

const RATE = 16000;

// A tone at `amp` (0..1 of full scale) for `sec` seconds.
function tone(sec: number, amp = 0.5): Uint8Array {
  const n = Math.round(sec * RATE);
  const v = new Int16Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / RATE) * amp * 32767);
  return new Uint8Array(v.buffer);
}
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

describe('pcm helpers', () => {
  it('splits into 20ms frames with a short tail', () => {
    const fs = frames(silence(0.05, RATE), RATE);
    expect(fs.map(f => f.length)).toEqual([640, 640, 320]);
  });

  it('measures duration', () => {
    expect(durationSec(silence(1.5, RATE), RATE)).toBeCloseTo(1.5);
  });

  it('finds where speech ends, ignoring trailing silence', () => {
    const clip = concat(silence(0.2, RATE), tone(1.0), silence(0.8, RATE));
    expect(speechEndSec(clip, RATE)).toBeCloseTo(1.2, 1);
  });

  it('treats near-silence as silence', () => {
    expect(speechEndSec(concat(tone(0.5), tone(0.5, 0.005)), RATE)).toBeCloseTo(0.5, 1);
  });

  it('streams frames on a real-time schedule', async () => {
    let t = 0;
    const pushedAt: number[] = [];
    await streamRealtime(silence(0.1, RATE), RATE, () => pushedAt.push(t), {
      now: () => t, sleep: async ms => { t += ms; },
    });
    expect(pushedAt).toEqual([0, 20, 40, 60, 80]);
  });
});
