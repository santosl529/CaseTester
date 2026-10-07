// Instant acknowledgment (M0 spike lever 1): a short backchannel spoken the
// moment the candidate's turn ends, from audio synthesized once at startup,
// so the candidate hears the interviewer within ~endpoint time while the
// model's turn is still being written. Neutral only — never grading ("Right."
// is left out: after an answer it can sound like "you're right").
import { classifyConduct } from '@/lib/orchestrator/conduct';
import { pickScript } from '@/lib/agent/prompts/scripts';

// Two-beat acknowledgments (~0.7–0.9s spoken) cover more of the model's wait
// than a single word (7 Oct demo: the pause after "Mm-hm." read as too long).
export const ACKS = ['Okay, got it.', 'Mm-hm, I see.', 'Understood, okay.', 'Okay, I follow.', 'Got it, thanks.'] as const;
export type Ack = (typeof ACKS)[number];

// The thinking filler: spoken only when the model's first segment has not
// arrived FILLER_DELAY_MS after the acknowledgment ends. Neutral, no promise of
// data or of an answer, no grading.
export const FILLERS = [
  'Let me think about that for a second.',
  'Give me a moment on that.',
  'Hmm, let me consider that.',
  'One second while I think that through.',
] as const;
export const FILLER_DELAY_MS = 400;

export function pickFiller(seed: string, last: string | null): string {
  const first = pickScript([...FILLERS], seed);
  if (first !== last) return first;
  return FILLERS[(FILLERS.indexOf(first as (typeof FILLERS)[number]) + 1) % FILLERS.length];
}

// When the filler would start on the recording/playback clock, or null when
// the model's first segment is due before then (no filler needed).
export function fillerStartMs(ackEndMs: number, firstSegmentDueMs: number | null): number | null {
  const start = ackEndMs + FILLER_DELAY_MS;
  return firstSegmentDueMs != null && firstSegmentDueMs <= start ? null : start;
}

// A seeded pick that never repeats the previous acknowledgment.
export function pickAck(seed: string, last: string | null): Ack {
  const first = pickScript([...ACKS], seed) as Ack;
  if (first !== last) return first;
  return ACKS[(ACKS.indexOf(first) + 1) % ACKS.length];
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
