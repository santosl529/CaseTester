import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { gateSentence, streamTurnSegments, type GateContext } from '@/lib/orchestrator/stream-turn';
import type { TurnEvent } from '@/lib/agent/models/interface';
import type { Segment } from '@/lib/orchestrator/turn-types';
import type { Action } from '@/lib/orchestrator/actions';
import { modelPlanFixture } from './fixtures/model-plan';

const g = (over: Partial<GateContext> = {}): GateContext => ({
  allowedTexts: ['Revenue is $480M a year.'], verified: [], alreadyProbed: new Set(), flaggedThisTurn: false,
  openItems: [], phase: 'ANALYSIS', ...over,
});

async function* events(list: TurnEvent[]) { for (const e of list) yield e; }
const done = (actions: Action[]): TurnEvent => ({
  type: 'done', actions, report: { dropped: [], invalidIds: [], empty: false, capped: false }, retried: false, unparsed: false, refused: false,
});
function collect() {
  const got: Segment[] = [];
  return { got, sink: async (s: Segment) => { got.push(s); } };
}
const run = (list: TurnEvent[], plan = modelPlanFixture({ distress: null }), sink = collect().sink) =>
  streamTurnSegments(events(list), plan, sink, { isDelivered: { value: false } });

describe('gateSentence', () => {
  it('passes a clean sentence', () => expect(gateSentence('Walk me through that.', g())).toEqual({ pass: true }));
  it('stops at an unsourced figure', () => expect(gateSentence('So the bean cost rose by $7M per year.', g()).pass).toBe(false));
  it('passes a revealed figure', () => expect(gateSentence('Revenue is $480M a year.', g()).pass).toBe(true));
  it('stops at narration', () => expect(gateSentence("I'll release the cost-structure data now.", g()).pass).toBe(false));
  it('stops at a close cue', () => expect(gateSentence("That's our time, thanks for working through it.", g()).pass).toBe(false));
  it('stops at a supplied recommendation in BRAINSTORM', () =>
    expect(gateSentence('The direct lever is menu prices.', g({ phase: 'BRAINSTORM' })).pass).toBe(false));
  it('stops at a fabricated candidate turn', () =>
    expect(gateSentence('What else could they do?\n\nuser Several levers.', g()).pass).toBe(false));
});

describe('streamTurnSegments', () => {
  it('delivers statements at once and holds the trailing question', async () => {
    const { got, sink } = collect();
    const out = await run([
      { type: 'sentence', text: 'Okay.', sayIndex: 0 },
      { type: 'sentence', text: 'What drove the change?', sayIndex: 0 },
      done([{ type: 'speak', text: 'Okay. What drove the change?' }]),
    ], undefined, sink);
    expect(got.map(s => s.text)).toEqual(['Okay.']);
    expect(out).toMatchObject({ kind: 'done', delivered: ['Okay.'], bufferSwitch: null });
  });

  it('releases a mid-turn question before the next statement', async () => {
    const { got, sink } = collect();
    await run([
      { type: 'sentence', text: 'Is that MECE?', sayIndex: 0 },
      { type: 'sentence', text: 'Take a moment.', sayIndex: 0 },
      done([]),
    ], undefined, sink);
    expect(got.map(s => s.text)).toEqual(['Is that MECE?', 'Take a moment.']);
  });

  it('delivers nothing when the distress verdict is positive, even after held sentences', async () => {
    const { got, sink } = collect();
    const out = await run([
      { type: 'sentence', text: 'Okay.', sayIndex: 0 },
      done([{ type: 'speak', text: 'Okay.' }]),
    ], modelPlanFixture({ distress: { label: 'distress', reason: 'x' }, distressDelayMs: 10 }), sink);
    expect(got).toEqual([]);
    expect(out.kind).toBe('distress');
  });

  it('holds everything until the distress verdict arrives, then delivers', async () => {
    const { got, sink } = collect();
    const out = await run([
      { type: 'sentence', text: 'Okay.', sayIndex: 0 },
      done([{ type: 'speak', text: 'Okay.' }]),
    ], modelPlanFixture({ distress: { label: 'none', reason: '' } as never, distressDelayMs: 15 }), sink);
    expect(got.map(s => s.text)).toEqual(['Okay.']);
    expect(out.kind === 'done' && out.distressWaitMs).toBeGreaterThanOrEqual(10);
  });

  it('switches to buffered at end_case and delivers nothing after it', async () => {
    const { got, sink } = collect();
    const out = await run([
      { type: 'sentence', text: 'Okay.', sayIndex: 0 },
      { type: 'action', action: { type: 'end_case' } },
      { type: 'sentence', text: 'Go on.', sayIndex: 1 },
      done([]),
    ], undefined, sink);
    expect(got.map(s => s.text)).toEqual(['Okay.']);
    expect(out).toMatchObject({ kind: 'done', bufferSwitch: 'end_case' });
  });

  it('stops at the first sentence a gate would change', async () => {
    const { got, sink } = collect();
    const out = await run([
      { type: 'sentence', text: 'Okay.', sayIndex: 0 },
      { type: 'sentence', text: "I'll release the cost-structure data now.", sayIndex: 0 },
      { type: 'sentence', text: 'Go on.', sayIndex: 0 },
      done([]),
    ], undefined, sink);
    expect(got.map(s => s.text)).toEqual(['Okay.']);
    expect(out).toMatchObject({ kind: 'done', bufferSwitch: 'meta_leak' });
  });

  it('delivers nothing after a stop event (the action cap)', async () => {
    const { got, sink } = collect();
    const out = await run([
      { type: 'sentence', text: 'Okay.', sayIndex: 0 },
      { type: 'stop', reason: 'action_cap' },
      { type: 'action', action: { type: 'reveal_data', itemId: 'stores_count' } },
      done([]),
    ], undefined, sink);
    expect(got.map(s => s.text)).toEqual(['Okay.']);
    expect(out).toMatchObject({ kind: 'done', bufferSwitch: 'action_cap', deliveredRevealIds: [] });
  });

  it('stops at a repeated sentence (normalizeActions drops duplicate lines)', async () => {
    const { got, sink } = collect();
    const out = await run([
      { type: 'sentence', text: 'Go on.', sayIndex: 0 },
      { type: 'sentence', text: 'Go on.', sayIndex: 1 },
      done([]),
    ], undefined, sink);
    expect(got.map(s => s.text)).toEqual(['Go on.']);
    expect(out).toMatchObject({ kind: 'done', bufferSwitch: 'duplicate' });
  });

  it('delivers nothing on a buffered plan', async () => {
    const { got, sink } = collect();
    const out = await run([{ type: 'sentence', text: 'Okay.', sayIndex: 0 }, done([])],
      modelPlanFixture({ distress: null, buffered: true }), sink);
    expect(got).toEqual([]);
    expect(out.kind === 'done' && out.bufferSwitch).toMatch(/^plan:/);
  });

  it('delivers a reveal as its approved wording, releasing a held question first', async () => {
    const { got, sink } = collect();
    const out = await run([
      { type: 'sentence', text: 'What about the footprint?', sayIndex: 0 },
      { type: 'action', action: { type: 'reveal_data', itemId: 'stores_count' } },
      done([]),
    ], undefined, sink);
    expect(got[0].text).toBe('What about the footprint?');
    expect(got[1]).toMatchObject({ revealIds: ['stores_count'] });
    expect(got[1].text.length).toBeGreaterThan(0);
    expect(out).toMatchObject({ kind: 'done', deliveredRevealIds: ['stores_count'] });
  });

  it('does not book a reveal whose segment the sink rejects', async () => {
    const out = await run([
      { type: 'action', action: { type: 'reveal_data', itemId: 'stores_count' } },
      done([{ type: 'reveal_data', itemId: 'stores_count' }]),
    ], undefined, async () => { throw new Error('interrupted'); });
    expect(out).toMatchObject({ kind: 'done', deliveredRevealIds: [], undeliveredRevealIds: ['stores_count'] });
  });

  it('discards a draft on restart', async () => {
    const { got, sink } = collect();
    await run([
      { type: 'sentence', text: 'First draft.', sayIndex: 0 },
      { type: 'restart', reason: 'bad id' },
      { type: 'sentence', text: 'Second draft.', sayIndex: 0 },
      done([{ type: 'speak', text: 'Second draft.' }]),
    ], modelPlanFixture({ distress: null, distressDelayMs: 20 }), sink);
    expect(got.map(s => s.text)).toEqual(['Second draft.']);
  });

  it('never delivers before the verdict, so a regeneration stays possible', async () => {
    const isDelivered = { value: false };
    const seen: boolean[] = [];
    async function* slow(): AsyncGenerator<TurnEvent> {
      yield { type: 'sentence', text: 'Okay.', sayIndex: 0 };
      seen.push(isDelivered.value);
      yield done([{ type: 'speak', text: 'Okay.' }]);
    }
    await streamTurnSegments(slow(), modelPlanFixture({ distress: null, distressDelayMs: 20 }), async () => {}, { isDelivered });
    expect(seen).toEqual([false]);
    expect(isDelivered.value).toBe(true);
  });
});
