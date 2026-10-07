// End-of-turn tuning (latency experiment 1, 7 Oct): synthetic candidate clips
// with the pauses real candidates make, and the scoring of what Flux signalled
// against where speech really ended. Pure — scripts/endpoint-sweep.ts does the
// audio and the streaming.

// Pauses are macOS `say` embedded commands ([[slnc ms]]).
export type ClipKind = 'clean' | 'think' | 'boundary' | 'number' | 'correction';
export type Clip = { kind: ClipKind; text: string };

const sentencesOf = (line: string) => line.split(/(?<=[.!?])\s+/);

function insertAfterWord(text: string, wordIndex: number, insert: string): string {
  const words = text.split(' ');
  if (wordIndex >= words.length - 1) return text;
  return [...words.slice(0, wordIndex + 1), insert, ...words.slice(wordIndex + 1)].join(' ');
}

export function clipVariants(line: string): Clip[] {
  const sentences = sentencesOf(line);
  const out: Clip[] = [{ kind: 'clean', text: line }];
  // A thinking pause mid-sentence: "So I would split um, … costs".
  const k = sentences.length > 1 ? 1 : 0;
  const think = [...sentences];
  think[k] = insertAfterWord(think[k], 3, 'um, [[slnc 1200]]');
  out.push({ kind: 'think', text: think.join(' ') });
  // A complete sentence, a long pause, then more: what end-of-turn models cut.
  if (sentences.length > 1) out.push({ kind: 'boundary', text: [sentences[0], '[[slnc 1500]]', ...sentences.slice(1)].join(' ') });
  // Hesitating before a figure.
  if (/\d/.test(line)) out.push({ kind: 'number', text: line.replace(/(\S*\d)/, '[[slnc 800]] $1') });
  // A self-correction in the middle of the answer.
  const mid = Math.floor(line.split(' ').length / 2);
  out.push({ kind: 'correction', text: insertAfterWord(line, mid, '[[slnc 700]] actually, sorry, [[slnc 500]]') });
  return out;
}

export type Signal = { kind: 'eager' | 'final'; atMs: number; transcript: string } | { kind: 'resumed'; atMs: number };

export type EndpointScore = {
  detectionMs: number | null;    // true end of speech → the first end-of-turn after it
  premature: number[];           // end-of-turn times before speech ended (would interrupt)
  eagerLeadMs: number | null;    // how much earlier the eager signal that stood came
  eagerMatches: boolean | null;  // its transcript equals the final's (a draft would be valid)
  eagers: number;
  resumed: number;               // eager signals cancelled by more speech (wasted drafts)
};

export function scoreSignals(signals: Signal[], speechEndMs: number): EndpointScore {
  const premature: number[] = [];
  let eager: { atMs: number; transcript: string } | null = null;
  let eagers = 0, resumed = 0;
  for (const s of signals) {
    if (s.kind === 'eager') { eager = { atMs: s.atMs, transcript: s.transcript }; eagers++; continue; }
    if (s.kind === 'resumed') { eager = null; resumed++; continue; }
    if (s.atMs < speechEndMs) { premature.push(s.atMs); eager = null; continue; }
    return {
      detectionMs: s.atMs - speechEndMs, premature,
      eagerLeadMs: eager ? s.atMs - eager.atMs : null,
      eagerMatches: eager ? eager.transcript === s.transcript : null,
      eagers, resumed,
    };
  }
  return { detectionMs: null, premature, eagerLeadMs: null, eagerMatches: null, eagers, resumed };
}
