// Instant acknowledgment (M0 spike lever 1): a short backchannel spoken the
// moment the candidate's turn ends, from audio synthesized once at startup,
// so the candidate hears the interviewer within ~endpoint time while the
// model's turn is still being written. Neutral only — never grading ("Right."
// is left out: after an answer it can sound like "you're right").
// Since 17 Oct (Lorenzo's ruling, v2) answers and questions get thinking
// sounds only — no confirming words ("Got it, thanks.", "I see",
// "Understood" confirmed, which is unnatural) — each beat synthesized alone
// with trailing intonation and joined in code with silence (ackBeats,
// joinBeats). The reply's first segment then opens with a connector
// (connector.ts).
import { classifyConduct } from '@/lib/orchestrator/conduct';
import { pickScript } from '@/lib/agent/prompts/scripts';
import { explicitRequestCues } from '@/lib/orchestrator/request-signal';

// Thinking sounds (Lorenzo, 17 Oct): one beat after a short message, two
// (joined with FILLER_GAP_MS between them) after an answer of
// LONG_ANSWER_WORDS or more — by length only, no latency prediction.
export const ONE_BEAT = ['Hmm…', 'Mhm…', 'Okay…', 'Alright…'] as const;
export const TWO_BEATS = ['Hmm… okay…', 'Hmm… alright…', 'Mhm… okay…', 'Mhm… alright…'] as const;
// A data ask: the thinking sounds or "Let me see…" — never a promise of data
// (code may still refuse or defer the ask).
export const LET_ME_SEE = 'Let me see…';
// Every thinking filler: its reply opens with a connector (connector.ts).
export const ACKS = [...ONE_BEAT, ...TWO_BEATS, LET_ME_SEE] as const;
export const LONG_ANSWER_WORDS = 40;

// One pool per kind of message (9 Oct): "Got it, thanks." after "Sorry. Hold
// on." or a question read as not listening. Since 17 Oct only the stuck pool
// has words; the rest are thinking sounds.
export const ACK_POOLS = {
  answer: ONE_BEAT,
  long: TWO_BEATS,
  stuck: ['Take your time.', 'Sure, take a moment.'],
  question: ONE_BEAT,
  data_request: [...ONE_BEAT, LET_ME_SEE],
} as const;
export type AckKind = keyof typeof ACK_POOLS;
export type Ack = (typeof ACK_POOLS)[AckKind][number];
// Every phrase, for synthesizing the audio once at startup.
export const ALL_ACKS: readonly Ack[] = [...new Set(Object.values(ACK_POOLS).flat())];

// The text sent to the TTS: an ellipsis spelled out, which the TTS reads with
// trailing, unfinished intonation (17 Oct).
export function ackSpeechText(ack: string): string {
  return ack.replace(/…/g, '...');
}

// A thinking filler (every pool but stuck): its reply opens with a connector.
export function isThinkingFiller(ack: string | null): boolean {
  return ack !== null && (ACKS as readonly string[]).includes(ack);
}

// A filler's beats, each synthesized as its own clip ("Hmm… okay…" → "Hmm…",
// "Okay…"); any other acknowledgment is one clip, as written.
export function ackBeats(ack: string): string[] {
  if (!isThinkingFiller(ack)) return [ack];
  return ack.split(/(?<=…)\s+/).map(b => b.charAt(0).toUpperCase() + b.slice(1));
}

// Silence between a filler's beats and after its last (Lorenzo, 17 Oct: "try
// about 400ms between beats and 300ms after the last"); the agent can override
// them with VOICE_FILLER_GAP_MS / VOICE_FILLER_TAIL_MS.
export const FILLER_GAP_MS = 400;
export const FILLER_TAIL_MS = 300;
// The filler starts this long after end of turn (Lorenzo, 17 Oct): a pause
// Flux took for the end of the turn is often the candidate thinking, and a
// filler over it sounds like talking over them (VOICE_FILLER_DELAY_MS).
export const FILLER_DELAY_MS = 500;

// The beats' clips (trimmed) joined: gap between them, tail after the last.
export function joinBeats(clips: Uint8Array[], sampleRate: number, gapMs = FILLER_GAP_MS, tailMs = FILLER_TAIL_MS): Uint8Array {
  const pause = (ms: number) => new Uint8Array(Math.round((sampleRate * ms) / 1000) * 2);
  const parts = clips.flatMap((c, i) => (i < clips.length - 1 ? [c, pause(gapMs)] : [c, pause(tailMs)]));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Only short messages get a kind: a long answer that opens with "let me take a
// second" or asks a rhetorical question is still an answer (on the 9 Oct
// check, cues anywhere in long persona answers misfired more than random) —
// 'long', two beats, from LONG_ANSWER_WORDS on.
const STUCK = [
  /\b(i'?m|i\s+am)\s+(stuck|lost|confused|blanking|not\s+sure)\b/i,
  /\bi\s+(really\s+)?(don'?t|do\s+not)\s+(really\s+)?know\b/i,
  /\b(hold|hang)\s+on\b(?!\s+to\b)/i,
  /\b(give\s+me|just)\s+(a|one)\s+(sec|second|moment|minute)\b/i,
  /\blet\s+me\s+(think|redo|re-do|start\s+over|try\s+again)\b/i,
  /\bwait\s*[,.!…]/i,
];
const QUESTION = [/\?/, /^\s*(sorry[.,—–-]?\s*)?(quick\s+question|can\s+i\s+ask|what|how|why|which|is|are|does|do|did)\b/i];

// Stuck before a data ask before a question: "Sorry. Hold on." asks for time,
// not an answer. STT may drop a "?", so a question opener counts too.
export function ackKind(candidateText: string): AckKind {
  const t = candidateText.trim();
  if (t.split(/\s+/).length >= LONG_ANSWER_WORDS) return 'long';
  if (STUCK.some(re => re.test(t))) return 'stuck';
  if (explicitRequestCues(t).length) return 'data_request';
  if (QUESTION.some(re => re.test(t))) return 'question';
  return 'answer';
}

// A seeded pick from the kind's pool that never repeats the previous acknowledgment.
export function pickAck(seed: string, last: string | null, kind: AckKind = 'answer'): Ack {
  const pool: readonly Ack[] = ACK_POOLS[kind];
  const first = pickScript([...pool], seed) as Ack;
  if (first !== last) return first;
  return pool[(pool.indexOf(first) + 1) % pool.length];
}

// No acknowledgment when the conduct floor (the regex layer, instant) flags
// the message: a distress offer, warning or redirect comes first, and "Mm-hm."
// before "Let's set the case aside — are you okay?" is wrong. Subtle distress
// that only the model layer catches can still get one.
export function shouldAcknowledge(candidateText: string): boolean {
  if (!candidateText.trim()) return false;
  const { category } = classifyConduct(candidateText, 0);
  return category === 'none' || category === 'C1';
}
