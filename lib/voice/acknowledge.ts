// Instant acknowledgment (M0 spike lever 1): a short backchannel spoken the
// moment the candidate's turn ends, from audio synthesized once at startup,
// so the candidate hears the interviewer within ~endpoint time while the
// model's turn is still being written. Neutral only — never grading ("Right."
// is left out: after an answer it can sound like "you're right").
import { classifyConduct } from '@/lib/orchestrator/conduct';
import { pickScript } from '@/lib/agent/prompts/scripts';

export const ACKS = ['Mm-hm.', 'Got it.', 'Okay.', 'I see.', 'Understood.'] as const;
export type Ack = (typeof ACKS)[number];

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
