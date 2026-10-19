// Interviewer captions shown whole, each word brightened as it is spoken
// (Lorenzo, 18 Oct, item 7). The display only: what counts as heard stays on
// the heard cursor (playout.ts — word end + HEARD_MARGIN_MS). Client-safe: no
// server imports.

// A written token of the segment: its end offset in the text, and when it
// starts in the segment's audio (Cartesia's word start, ms from the segment's
// first audio) — null while not timed yet; endMs likewise.
export type CaptionWord = { end: number; startMs: number | null; endMs: number | null };

// The audio reaches the ear after the message: network and the jitter buffer.
export const CAPTION_AUDIO_OFFSET_MS = 150;
// Without any timestamp: about 14 characters a second.
const DEFAULT_MS_PER_CHAR = 70;

// Word timestamps (already folded onto the written tokens) to the text's tokens, in order.
export function captionWords(text: string, words: readonly { word?: string; startMs: number; endMs: number }[] | null): CaptionWord[] {
  return [...text.matchAll(/\S+/g)].map((m, i) => ({
    end: m.index! + m[0].length,
    startMs: words?.[i]?.startMs ?? null,
    endMs: words?.[i]?.endMs ?? null,
  }));
}

// How many tokens have started `elapsedMs` into the segment's audio. A token
// not timed yet starts at its first character × the rate so far (the last
// timed token's end over its characters), never before the token before it.
export function brightTokens(words: CaptionWord[], elapsedMs: number): number {
  let lastStart = -Infinity;
  let msPerChar = DEFAULT_MS_PER_CHAR;
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const firstChar = i === 0 ? 0 : words[i - 1].end + 1;
    let start: number;
    if (w.startMs !== null) {
      start = w.startMs;
      if (w.endMs !== null && w.end > 0 && w.endMs > 0) msPerChar = w.endMs / w.end;
    } else {
      start = firstChar * msPerChar;
    }
    start = Math.max(start, lastStart);
    lastStart = start;
    if (start <= elapsedMs) n = i + 1;
    else break;
  }
  return n;
}

// The offset, tunable live with ?captionOffset=<ms> on the interview page.
export function captionOffsetFrom(search: string): number {
  const raw = new URLSearchParams(search).get('captionOffset');
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : CAPTION_AUDIO_OFFSET_MS;
}
