// The per-turn note at the end of the prompt (THIS TURN). Kept here so the
// voice acknowledgment and the recommendation ask compose in one place.
import type { TurnKind } from './plan-turn';

export function turnNoteFor(kind: TurnKind, acknowledged?: string): string | undefined {
  const notes: string[] = [];
  if (kind === 'rec_ask') {
    notes.push('THIS TURN: the system asks the candidate for their recommendation as your question. Write only "say" — a brief neutral acknowledgment of their last message, or "" — declare their requests as usual, and set "question" to "".');
  }
  if (acknowledged) {
    notes.push(`THIS TURN: you have already said "${acknowledged}" to the candidate, the moment they finished. Don't acknowledge again: "say" may name what they did in a few plain words, or be "".`);
  }
  return notes.length > 0 ? notes.join('\n') : undefined;
}
