import { describe, it, expect } from 'vitest';
import { schedulePlayback, type FillerPolicy } from '@/lib/voice/playback';

// Times in ms from end of turn. Filler: 2000ms long, word boundaries every 400ms.
const FILLER = { durMs: 2000, cutsMs: [400, 800, 1200, 1600, 2000] };
const full: FillerPolicy = { mode: 'full', delayMs: 400, ...FILLER };
const yieldAt: FillerPolicy = { mode: 'yield', delayMs: 400, ...FILLER };
const none: FillerPolicy = { mode: 'none', delayMs: 400, ...FILLER };

const useful = (readyMs: number) => ({ kind: 'data' as const, readyMs, durMs: 3000 });
const say = (readyMs: number, durMs = 1000) => ({ kind: 'say' as const, readyMs, durMs });

describe('schedulePlayback', () => {
  it('plays useful audio as soon as it is ready when nothing is playing', () => {
    const out = schedulePlayback({ ackDurMs: 1000, segments: [useful(1200)], filler: full });
    expect(out.firstUsefulMs).toBe(1200);
    expect(out.fillerPlayed).toBe(false);
  });

  it('holds useful audio until the acknowledgment ends', () => {
    const out = schedulePlayback({ ackDurMs: 1000, segments: [useful(300)], filler: full });
    expect(out.firstUsefulMs).toBe(1000);
  });

  it('starts no filler when anything playable is ready by the filler start', () => {
    const out = schedulePlayback({ ackDurMs: 1000, segments: [say(1300), useful(2600)], filler: full });
    expect(out.fillerPlayed).toBe(false);
    expect(out.firstUsefulMs).toBe(2600); // say 1300–2300, useful ready 2600
  });

  it('full mode: useful audio waits for the whole filler (the demo behaviour)', () => {
    // ack ends 1000, filler 1400–3400, useful ready 1600
    const out = schedulePlayback({ ackDurMs: 1000, segments: [useful(1600)], filler: full });
    expect(out.fillerPlayed).toBe(true);
    expect(out.firstUsefulMs).toBe(3400);
  });

  it('yield mode: the filler stops at the next boundary once useful audio is ready', () => {
    // filler starts 1400; useful ready 1600 → 200ms in → next boundary 400 → 1800
    const out = schedulePlayback({ ackDurMs: 1000, segments: [useful(1600)], filler: yieldAt });
    expect(out.fillerCut).toBe(true);
    expect(out.firstUsefulMs).toBe(1800);
  });

  it('yield mode: a non-useful say does not cut the filler', () => {
    // say ready 1500 (not useful), useful ready 5000: filler plays out to 3400, say 3400–4400, useful 5000
    const out = schedulePlayback({ ackDurMs: 1000, segments: [say(1500), useful(5000)], filler: yieldAt });
    expect(out.fillerCut).toBe(false);
    expect(out.firstUsefulMs).toBe(5000);
  });

  it('none: silence until the model is ready, measured as dead air after the acknowledgment', () => {
    const out = schedulePlayback({ ackDurMs: 1000, segments: [useful(2500)], filler: none });
    expect(out.firstUsefulMs).toBe(2500);
    expect(out.longestSilenceMs).toBe(1500);
  });

  it('skipSay: a say not yet started is skipped once useful audio is ready', () => {
    // ack plays to 1500; say (ready 1300) and useful (ready 1350) both wait → say skipped
    const out = schedulePlayback({ ackDurMs: 1500, segments: [say(1300), useful(1350)], filler: none, skipSay: true });
    expect(out.firstUsefulMs).toBe(1500);
    expect(out.saySkipped).toBe(true);
  });

  it('skipSay: a say that started before useful audio was ready plays out', () => {
    const out = schedulePlayback({ ackDurMs: 1000, segments: [say(1300), useful(1800)], filler: none, skipSay: true });
    expect(out.firstUsefulMs).toBe(2300);
    expect(out.saySkipped).toBe(false);
  });

  it('reports the longest silence between the acknowledgment and the first useful audio', () => {
    const out = schedulePlayback({ ackDurMs: 1000, segments: [useful(1600)], filler: yieldAt });
    expect(out.longestSilenceMs).toBe(400); // 1000–1400 before the filler
  });
});
