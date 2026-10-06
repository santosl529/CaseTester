import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { vetoReason, streamTurnSegments, type GateContext } from '@/lib/orchestrator/stream-turn';
import { eventsFromTurn } from '@/lib/agent/models/turn-events';
import type { TurnEvent } from '@/lib/agent/models/interface';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { Segment } from '@/lib/orchestrator/turn-types';
import { modelPlanFixture } from './fixtures/model-plan';

const g = (over: Partial<GateContext> = {}): GateContext => ({
  allowedTexts: ['Revenue is $480M a year.'], verified: [], alreadyProbed: new Set(), flaggedThisTurn: false,
  openItems: [], phase: 'ANALYSIS', ...over,
});
const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What drove it?', ...over });
function collect() {
  const got: Segment[] = [];
  return { got, sink: async (s: Segment) => { got.push(s); } };
}
const run = (turn: ModelTurn, plan = modelPlanFixture({ distress: null }), sink = collect().sink) =>
  streamTurnSegments(eventsFromTurn(Promise.resolve(turn)), plan, sink, { isDelivered: { value: false } });

describe('vetoReason', () => {
  it('passes a clean statement', () => expect(vetoReason('Okay.', g())).toBeNull());
  it('stops an unsourced figure', () => expect(vetoReason('So the bean cost rose by $7M per year.', g())).toBe('provenance'));
  it('passes a released figure', () => expect(vetoReason('Revenue is $480M a year.', g())).toBeNull());
  it('stops narration', () => expect(vetoReason("I'll release the cost-structure data now.", g())).not.toBeNull());
  it('stops a goodbye — the system closes', () => expect(vetoReason("That's our time, thanks for working through it.", g())).toBe('close_cue'));
  it("stops the model's own data talk (batch 9: Devon t14)", () => {
    expect(vetoReason("Average revenue per store is available, so I'll give you that.", g())).not.toBeNull();
    expect(vetoReason("I don't have the store-level split.", g())).toBe('data_talk');
    expect(vetoReason("I'll come back to that shortly.", g())).toBe('data_talk');
  });
  it('leaves a probe question about data alone', () => {
    expect(vetoReason('What data would be available to test that?', g(), { inQuestion: true })).toBeNull();
  });
  it('stops a supplied recommendation from BRAINSTORM on', () => {
    expect(vetoReason('The direct lever is menu prices.', g({ phase: 'BRAINSTORM' }))).toBe('synthesis');
    expect(vetoReason('The direct lever is menu prices.', g({ phase: 'RECOMMENDATION' }))).toBe('synthesis');
  });
  it('stops a question in "say" but not in the question field', () => {
    expect(vetoReason('Is that MECE?', g())).toBe('question_in_say');
    expect(vetoReason('Is that MECE?', g(), { inQuestion: true })).toBeNull();
  });
  it('stops a fabricated candidate turn', () => expect(vetoReason('What else?\n\nuser Several levers.', g())).toBe('fabricated_turn'));
});

describe('streamTurnSegments', () => {
  it('delivers say, then the data line, and never the question', async () => {
    const { got, sink } = collect();
    const out = await run(T({ say: 'Okay.', requests: [{ what: 'store count', itemIds: ['stores_count'], explicit: true, respond: 'release' }] }), undefined, sink);
    expect(got.map(s => s.text)).toEqual(['Okay.', expect.stringContaining('200 stores')]);
    expect(got[1].revealIds).toEqual(['stores_count']);
    expect(out).toMatchObject({ kind: 'done', bufferSwitch: null, deliveredRevealIds: ['stores_count'] });
  });

  it('with say first, holds the data line until the declarations close', async () => {
    const turn = T({ say: 'Okay.', requests: [{ what: 'store count', itemIds: ['stores_count'], explicit: true, respond: 'release' }] });
    async function* sayFirst(): AsyncGenerator<TurnEvent> {
      yield { type: 'sentence', text: 'Okay.' };
      yield { type: 'field', key: 'say', value: 'Okay.' };
      yield { type: 'field', key: 'move', value: 'analysis' };
      yield { type: 'field', key: 'requests', value: [{ what: 'store count', item_ids: ['stores_count'], explicit: true, respond: 'release' }] };
      yield { type: 'field', key: 'exhibit', value: null };
      yield { type: 'field', key: 'rescue_item', value: null };
      yield { type: 'field', key: 'question', value: turn.question };
      yield { type: 'done', turn, validation: null as never };
    }
    const { got, sink } = collect();
    await streamTurnSegments(sayFirst(), modelPlanFixture({ distress: null }), sink, { isDelivered: { value: false } });
    expect(got.map(s => s.text)).toEqual(['Okay.', expect.stringContaining('200 stores')]);
    expect(got[1].revealIds).toEqual(['stores_count']);
  });

  it('renders refusals and deferrals from the declaration', async () => {
    const { got, sink } = collect();
    await run(T({ requests: [
      { what: 'transaction volume by store', itemIds: [], explicit: true, respond: 'release' },
      { what: 'the bean prices', itemIds: ['bean_price_change'], explicit: true, respond: 'defer' },
    ] }), undefined, sink);
    expect(got.map(s => s.text)).toEqual(["I don't have transaction volume by store. I'll come back to the bean prices shortly."]);
  });

  it('stops at the first vetoed sentence; the data line is then left to Settle', async () => {
    const { got, sink } = collect();
    const out = await run(T({
      say: "Okay. I'll give you the store count.",
      requests: [{ what: 'store count', itemIds: ['stores_count'], explicit: true, respond: 'release' }],
    }), undefined, sink);
    expect(got.map(s => s.text)).toEqual(['Okay.']);
    expect(out).toMatchObject({ kind: 'done', bufferSwitch: 'data_talk', deliveredRevealIds: [] });
  });

  it('delivers nothing when the distress verdict is positive', async () => {
    const { got, sink } = collect();
    const out = await run(T({ say: 'Okay.' }), modelPlanFixture({ distress: { label: 'distress', reason: 'x' }, distressDelayMs: 10 }), sink);
    expect(got).toEqual([]);
    expect(out.kind).toBe('distress');
  });

  it('holds everything until the distress verdict, then delivers', async () => {
    const isDelivered = { value: false };
    const seen: boolean[] = [];
    async function* slow(): AsyncGenerator<TurnEvent> {
      yield { type: 'sentence', text: 'Okay.' };
      seen.push(isDelivered.value);
      yield { type: 'field', key: 'say', value: 'Okay.' };
      yield { type: 'done', turn: T({ say: 'Okay.' }), validation: { unknownIds: [], emptyTurn: false, retried: false, unparsed: false, refused: false } };
    }
    await streamTurnSegments(slow(), modelPlanFixture({ distress: null, distressDelayMs: 20 }), async () => {}, { isDelivered });
    expect(seen).toEqual([false]);
    expect(isDelivered.value).toBe(true);
  });

  it('does not book a reveal whose segment the sink rejects', async () => {
    const out = await run(T({ requests: [{ what: 'store count', itemIds: ['stores_count'], explicit: true, respond: 'release' }] }),
      undefined, async () => { throw new Error('interrupted'); });
    expect(out).toMatchObject({ kind: 'done', deliveredRevealIds: [], undeliveredRevealIds: ['stores_count'] });
  });

  it('discards a draft on restart', async () => {
    const { got, sink } = collect();
    async function* events(): AsyncGenerator<TurnEvent> {
      yield { type: 'sentence', text: 'First draft.' };
      yield { type: 'restart', reason: 'bad id' };
      yield { type: 'sentence', text: 'Second draft.' };
      yield { type: 'field', key: 'say', value: 'Second draft.' };
      yield { type: 'done', turn: T({ say: 'Second draft.' }), validation: null as never };
    }
    await streamTurnSegments(events(), modelPlanFixture({ distress: null, distressDelayMs: 20 }), sink, { isDelivered: { value: false } });
    expect(got.map(s => s.text)).toEqual(['Second draft.']);
  });
});
