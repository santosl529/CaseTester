// Scale and currency words after a figure (Phase 1, switch `scaleWordReading`;
// follow-up 2 of the 27 Oct speech-normalization report, measured by
// `scripts/scale-words-measure.ts` and ruled on by Lorenzo on 27 Oct).
//
// The gap. `normalizeNumberWords` turns "two hundred thousand" into the two tokens
// `200 thousand`, and "forty cents" into `40 cents`. To the reader the scale or
// currency word is an unknown word, so it ends the expression and the figure keeps
// the wrong magnitude: `200 thousand` reads as 200, three orders of magnitude small;
// `40 cents` reads as 40, a hundred times large. On the spoken corpus that is the
// largest single thing the reader still cannot read — 589 claims it would verify and
// 14 points of verified figures.
//
// **Lorenzo's ruling (27 Oct): a scale-changing reading may verify, but it may never
// flag.** A claim the absorbed reading would rate `incorrect` comes out `unclear`
// instead. The reason it is allowed to verify at all is the measurement: all 7 flags
// the absorbed reading raises on this corpus are false and it catches 0 real errors,
// so the flag is worth nothing and the verified figure is worth a great deal (a
// verified figure is what stops the interviewer doubting correct work). The reason it
// may never flag is the same measurement read the other way round.
//
// The absorption itself is a text pre-pass into notation the reader already reads, so
// there is one definition of the scale factors (`$`, `k`, `m`, `b`) and the feature and
// its measurement cannot drift apart: `scale-words-measure.ts` imports this function.
const N = String.raw`\d[\d,]*(?:\.\d+)?`;
const SUFFIX: Record<string, string> = { thousand: 'k', million: 'm', billion: 'b' };

// Applied to the text the reader sees — after `normalizeSpeech` and
// `normalizeNumberWords`, which is where `200 thousand` and `40 cents` exist as such.
// A word is absorbed only immediately after a figure, and only when the word ends
// there (`(?![a-z])`), so "thousands of patients" and "a million-dollar question" are
// untouched.
export function absorbScaleWords(text: string): string {
  return text
    // "six dollars and twenty cents" → $6.20
    .replace(new RegExp(`(${N})\\s+dollars?\\s+and\\s+(\\d{1,2})\\s+cents?(?![a-z])`, 'gi'),
      (_m, d: string, c: string) => `$${d}.${c.padStart(2, '0')}`)
    // "forty cents" → $0.40
    .replace(new RegExp(`(${N})\\s+cents?(?![a-z])`, 'gi'),
      (_m, c: string) => `$${(Number(c.replace(/,/g, '')) / 100).toFixed(2)}`)
    // "six dollars" / "six bucks" → $6
    .replace(new RegExp(`(${N})\\s+(?:dollars?|bucks)(?![a-z])`, 'gi'), (_m, d: string) => `$${d}`)
    // "two hundred thousand" → 200k, "320 million" → 320m
    .replace(new RegExp(`(${N})\\s+(thousand|million|billion)(?![a-z])`, 'gi'),
      (_m, d: string, w: string) => `${d}${SUFFIX[w.toLowerCase()]}`);
}
