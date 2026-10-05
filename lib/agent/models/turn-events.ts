// Bridges between the streamed turn and callers that want the whole action list.
import type { Action } from '@/lib/orchestrator/actions';
import type { TurnEvent } from './interface';

export async function collectActions(events: AsyncIterable<TurnEvent>): Promise<Action[]> {
  let actions: Action[] = [];
  for await (const e of events) if (e.type === 'done') actions = e.actions;
  return actions;
}

// A model without streamTurn (test mocks, the replay script's Gemini arm):
// its finished turn as one burst of events.
export async function* eventsFromActions(actions: Promise<Action[]>): AsyncGenerator<TurnEvent> {
  const list = await actions;
  let sayIndex = 0;
  for (const a of list) {
    if (a.type === 'speak') {
      for (const s of a.text.trim().split(/(?<=[.!?])\s+/).filter(Boolean)) yield { type: 'sentence', text: s, sayIndex };
      sayIndex++;
    } else yield { type: 'action', action: a };
  }
  yield {
    type: 'done', actions: list, report: { dropped: [], invalidIds: [], empty: list.length === 0, capped: false },
    retried: false, unparsed: false, refused: false,
  };
}
