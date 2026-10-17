// Instant acknowledgment (M0 spike lever 1): a short backchannel spoken the
// moment the candidate's turn ends, from audio synthesized once at startup,
// so the candidate hears the interviewer within ~endpoint time while the
// model's turn is still being written. Neutral only — never grading ("Right."
// is left out: after an answer it can sound like "you're right").
// Since 17 Oct the answer and question acknowledgments are open, trailing
// fillers that lead into what follows ("Okay, so…") instead of closed
// two-beat ones: Lorenzo's voice test (session 314295e0) heard "Understood,
// okay." then a gap then the model's own line, which read as robotic.
import { classifyConduct } from '@/lib/orchestrator/conduct';
import { pickScript } from '@/lib/agent/prompts/scripts';
import { explicitRequestCues } from '@/lib/orchestrator/request-signal';

// Trailing fillers, synthesized with continuing intonation (ackSpeechText):
// they lead into the question rather than close a beat. Never "Right".
export const ACKS = ['Okay, so…', 'Mm, okay…', 'Hmm…', 'Mm-hm, so…'] as const;

// One pool per kind of message (9 Oct): "Got it, thanks." after "Sorry. Hold
// on." or a question read as not listening. A data ask gets "let me check",
// never a promise — code may still refuse or defer it.
export const ACK_POOLS = {
  answer: ACKS,
  stuck: ['Take your time.', 'Sure, take a moment.'],
  question: ['Okay, so…', 'Mm, so…', 'Sure, so…'],
  data_request: ['Okay, let me check.', 'Sure, one second.'],
} as const;
export type AckKind = keyof typeof ACK_POOLS;
export type Ack = (typeof ACK_POOLS)[AckKind][number];
// Every phrase, for synthesizing the audio once at startup.
export const ALL_ACKS: readonly Ack[] = Object.values(ACK_POOLS).flat();

// The text sent to the TTS: an ellipsis spelled out, which the TTS reads with
// trailing, unfinished intonation (17 Oct).
export function ackSpeechText(ack: string): string {
  return ack.replace(/…/g, '...');
}

// Only short messages get a kind: a long answer that opens with "let me take a
// second" or asks a rhetorical question is still an answer (on the 9 Oct
// check, cues anywhere in long persona answers misfired more than random).
const MAX_KIND_WORDS = 40;
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
  if (t.split(/\s+/).length > MAX_KIND_WORDS) return 'answer';
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

// No acknowledgment after a long answer (17 Oct): the pause before the
// interviewer speaks is natural there, and a filler over it sounds canned.
export const LONG_ANSWER_WORDS = 40;

// No acknowledgment when the conduct floor (the regex layer, instant) flags
// the message: a distress offer, warning or redirect comes first, and "Mm-hm."
// before "Let's set the case aside — are you okay?" is wrong. Subtle distress
// that only the model layer catches can still get one.
export function shouldAcknowledge(candidateText: string): boolean {
  if (!candidateText.trim()) return false;
  if (candidateText.trim().split(/\s+/).length >= LONG_ANSWER_WORDS) return false;
  const { category } = classifyConduct(candidateText, 0);
  return category === 'none' || category === 'C1';
}
