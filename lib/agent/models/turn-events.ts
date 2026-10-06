// Bridges between the streamed turn and callers that want the whole turn.
import type { ModelTurn } from './turn-schema';
import type { TurnEvent } from './interface';

export const NEUTRAL_TURN: ModelTurn = {
  move: 'other', requests: [], exhibit: null, rescueItem: null,
  say: '', question: 'What would you like to explore next?',
};

export async function collectTurn(events: AsyncIterable<TurnEvent>): Promise<ModelTurn> {
  let turn: ModelTurn = NEUTRAL_TURN;
  for await (const e of events) if (e.type === 'done') turn = e.turn;
  return turn;
}

// A model without streamTurn (test mocks, experiments): its finished turn as
// one burst of events, in the stream's field order.
export async function* eventsFromTurn(turn: Promise<ModelTurn>): AsyncGenerator<TurnEvent> {
  const t = await turn;
  yield { type: 'field', key: 'move', value: t.move };
  yield {
    type: 'field', key: 'requests',
    value: t.requests.map(r => ({ what: r.what, item_ids: r.itemIds, explicit: r.explicit, respond: r.respond })),
  };
  yield { type: 'field', key: 'exhibit', value: t.exhibit };
  yield { type: 'field', key: 'rescue_item', value: t.rescueItem };
  for (const s of t.say.split(/(?<=[.!?])\s+/).filter(Boolean)) yield { type: 'sentence', text: s };
  yield { type: 'field', key: 'say', value: t.say };
  yield { type: 'field', key: 'question', value: t.question };
  yield {
    type: 'done', turn: t,
    validation: { unknownIds: [], emptyTurn: !t.say && !t.question, retried: false, unparsed: false, refused: false },
  };
}
