// Interviewer captions shown whole, each word brightened at its start (Lorenzo,
// 18 Oct, item 7): the timing, from Cartesia's word starts, else the rate so far.
import { describe, it, expect } from 'vitest';
import { brightTokens, captionWords, CAPTION_AUDIO_OFFSET_MS, captionOffsetFrom } from '@/lib/voice/caption-timing';

describe('caption timing', () => {
  const text = 'Which bucket would you start with?';
  const words = captionWords(text, [
    { word: 'Which', startMs: 0, endMs: 200 }, { word: 'bucket', startMs: 200, endMs: 500 },
    { word: 'would', startMs: 500, endMs: 700 }, { word: 'you', startMs: 700, endMs: 800 },
    { word: 'start', startMs: 800, endMs: 1100 }, { word: 'with?', startMs: 1100, endMs: 1400 },
  ]);

  it('aligns word starts to the written tokens (their end offsets)', () => {
    expect(words.map(w => text.slice(0, w.end))).toEqual(['Which', 'Which bucket', 'Which bucket would', 'Which bucket would you', 'Which bucket would you start', text]);
    expect(words.map(w => w.startMs)).toEqual([0, 200, 500, 700, 800, 1100]);
  });

  it('brightens each word at its start, from the arrival plus the audio offset', () => {
    expect(brightTokens(words, -1)).toBe(0);           // before the audio reaches the ear
    expect(brightTokens(words, 0)).toBe(1);
    expect(brightTokens(words, 499)).toBe(2);
    expect(brightTokens(words, 500)).toBe(3);
    expect(brightTokens(words, 5000)).toBe(6);
  });

  it('estimates the words not timed yet from the rate so far, in order', () => {
    const partial = captionWords(text, [{ word: 'Which', startMs: 0, endMs: 200 }, { word: 'bucket', startMs: 200, endMs: 500 }]);
    expect(partial.slice(2).every(w => w.startMs === null)).toBe(true);
    // "Which bucket" (12 chars) took 500ms to its end: ~41.7ms a char.
    expect(brightTokens(partial, 500)).toBe(2);   // "would" estimated at char 13 ≈ 542ms
    expect(brightTokens(partial, 900)).toBe(4);   // "you" at char 19 ≈ 792ms; "start" at 23 ≈ 958ms
    expect(brightTokens(partial, 10_000)).toBe(6);
  });

  it('with no timestamps at all, a default speaking rate', () => {
    const none = captionWords(text, null);
    expect(brightTokens(none, 0)).toBe(1);
    expect(brightTokens(none, 60_000)).toBe(6);
  });

  it('the audio offset starts at 150ms and can be tuned from the page address', () => {
    expect(CAPTION_AUDIO_OFFSET_MS).toBe(150);
    expect(captionOffsetFrom('?captionOffset=250')).toBe(250);
    expect(captionOffsetFrom('?captionOffset=abc')).toBe(150);
    expect(captionOffsetFrom('')).toBe(150);
  });
});
