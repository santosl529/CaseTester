// The per-turn note at the end of the prompt (THIS TURN). Kept here so the
// voice acknowledgment and the recommendation ask compose in one place.
import type { TurnKind } from './plan-turn';
import type { Phase } from './state-machine';

const EARLY: Phase[] = ['INTRO', 'CLARIFY', 'STRUCTURE'];

export function turnNoteFor(kind: TurnKind, acknowledged?: string, opts: { pressureTest?: 'not_asked' | 'awaiting' | 'satisfied' | 'waived'; phase?: Phase } = {}): string | undefined {
  const notes: string[] = [];
  // Guard A (7 Oct, batch 17): Luna asked the pressure test fourteen turns
  // running while the candidate's data waited. In any stage (v3: batch 18,
  // Destiny's phase moved to ANALYSIS while the test was open, the note
  // dropped, and the model asked about "these cost lines" for twenty turns).
  if (opts.pressureTest === 'awaiting') {
    notes.push('THIS TURN: your pressure test on the structure is waiting for an answer, and the analysis data waits for it — the candidate hasn\'t received any figure that isn\'t under Revealed data. Don\'t ask a different probe, and don\'t ask about figures they haven\'t received; if the candidate hasn\'t answered it, ask them to.');
  }
  if (opts.pressureTest === 'waived' && opts.phase && EARLY.includes(opts.phase)) {
    notes.push('THIS TURN: the pressure test on the structure is closed. Don\'t ask another one — move into the analysis. Requests are no longer premature: declare what they ask for with respond "release".');
  }
  if (opts.pressureTest === 'satisfied' && opts.phase && EARLY.includes(opts.phase)) {
    notes.push('THIS TURN: your pressure test on the structure has been asked and answered. Don\'t ask another one — no "Is that MECE?" or "Which branch would you prioritize?" — move into the analysis. Requests are no longer premature: declare what they ask for with respond "release".');
  }
  if (kind === 'rec_ask') {
    notes.push('THIS TURN: the system asks the candidate for their recommendation as your question. Write only "say" — a brief neutral acknowledgment of their last message, or "" — declare their requests as usual, and set "question" to "".');
  }
  if (acknowledged) {
    notes.push(`THIS TURN: you have already said "${acknowledged}" to the candidate, the moment they finished. Don't acknowledge again: "say" may name what they did in a few plain words, or be "".`);
  }
  return notes.length > 0 ? notes.join('\n') : undefined;
}
