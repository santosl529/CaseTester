// How the voice says a term (Lorenzo's brief, 17 Oct): "COGS" as "cogs", not
// spelled out; "MECE" as "mee-see". In the TTS text only, like the "So,"
// connector (connector.ts): the saved text, captions, transcripts and heard
// checks keep the line as written. The TTS's word timestamps come back for the
// spoken words; they are folded back onto the written tokens (WordFolder), so
// the heard cursor (heardChars) still counts characters of the written line.
import type { Word } from './types';

// Whole written tokens only, case-sensitive: "COGS" and "COGS'", not "cogs".
export const PRONUNCIATIONS: readonly { term: RegExp; say: string }[] = [
  { term: /\bCOGS\b/g, say: 'cogs' },
  { term: /\bMECE\b/g, say: 'mee-see' },
];

export type SpeechText = {
  text: string;      // what the TTS reads
  counts: number[];  // per written whitespace token, how many spoken whitespace tokens it became
};

const tokensOf = (t: string) => t.match(/\S+/g) ?? [];

// The TTS text for a written line, and the token map back to it.
export function speechTextFor(written: string): SpeechText {
  const counts: number[] = [];
  const spoken = tokensOf(written).map(tok => {
    const said = PRONUNCIATIONS.reduce((s, p) => s.replace(p.term, p.say), tok);
    counts.push(Math.max(1, tokensOf(said).length));
    return said;
  });
  // Spacing as written: replace token by token in place.
  let i = 0;
  const text = written.replace(/\S+/g, () => spoken[i++]);
  return { text, counts };
}

// Folds the TTS's words back onto the written tokens: first the connector's
// words (skipped), then for each written token as many words as it became —
// one word with the first's start and the last's end. Words arrive in chunks.
export class WordFolder {
  private pending: Word[] = [];
  private token = 0;
  constructor(private counts: number[], private skip = 0) {}
  push(ws: Word[]): Word[] {
    const out: Word[] = [];
    for (const w of ws) {
      if (this.skip > 0) { this.skip--; continue; }
      this.pending.push(w);
      // Past the map (a TTS that splits a token we counted as one): one word per word.
      const need = this.counts[this.token] ?? 1;
      if (this.pending.length >= need) {
        const first = this.pending[0], last = this.pending[this.pending.length - 1];
        out.push({ word: this.pending.map(x => x.word).join(' '), startMs: first.startMs, endMs: last.endMs });
        this.pending = [];
        this.token++;
      }
    }
    return out;
  }
}
