// Guard B detector (7 Oct): explicit data asks in the candidate's message,
// tuned for precision — it only has to catch a turn where the model declared
// nothing at all. Examples from batches 12–17.
import { describe, it, expect } from 'vitest';
import { explicitRequestCues } from '@/lib/orchestrator/request-signal';

const fires = (t: string) => explicitRequestCues(t).length > 0;

describe('explicitRequestCues', () => {
  it.each([
    'Before I frame it, could I get a few data points? One, the full cost breakdown by line item for both years.',
    'Do we have a cost breakdown as a percentage of revenue for both years?',
    'Can I see the cost breakdown now?',
    'Can we see the cost breakdown by year?',
    'And separately, do we have menu-price history — have they actually raised prices at all?',
    "I'd need to know whether prices changed.",
    "I'd want the actual COGS component split by year so I can see which input moved.",
    'Yes, please share the bean price change and the other input moves.',
    'Is there any data on transactions per store per day?',
    'Do you have the per-pound bean cost by year?',
  ])('fires on an explicit ask: %s', t => expect(fires(t)).toBe(true));

  it.each([
    'Does that seem okay as a starting point?',
    "I'm done — can we do another case?",
    "Honestly I'd rather let the data point me than pick a branch blind.",
    "Fair, though I'd want to avoid committing to a branch and then finding out the data doesn't support it.",
    'COGS went from 42% to 58% of revenue, so that is 16 points of margin.',
    'Want me to go to recommendations, or is there another cut of this you would want me to look at first?',
    'Where would you like me to dig in first?',
    "I'd want to look at which line grew fastest relative to revenue.",
  ])('stays quiet without an ask: %s', t => expect(fires(t)).toBe(false));

  it('names what matched, for the log', () => {
    expect(explicitRequestCues('Could I get the store count? And do we have menu prices?')).toEqual(['could I get', 'do we have']);
  });
});

// ---- Guard B wiring ----
import { vi } from 'vitest';
import type { InterviewerModel, TurnContext, TurnEvent } from '@/lib/agent/models/interface';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';

vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

const { streamInterviewerTurn, REQUEST_GUARD_NOTE } = await import('@/lib/agent/interviewer');
const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
const { planTurn } = await import('@/lib/orchestrator/plan-turn');
const { streamTurnSegments } = await import('@/lib/orchestrator/stream-turn');
const { readsFixture } = await import('./fixtures/turn-reads');

const promptCtx = {
  casePrompt: 'Client.', currentPhase: 'STRUCTURE' as const, revealedValues: {}, unrevealedItems: [{ id: 'cogs_pct', label: 'COGS' }],
  exhibits: [], advancedLastTurn: false, elapsedMs: 0, totalMs: 1_200_000,
};
const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: 'Got it.', question: 'Why?', ...over });
const COGS = { what: 'COGS', itemIds: ['cogs_pct'], explicit: true, respond: 'release' as const };

function scriptedModel(turns: ModelTurn[]) {
  const seen: TurnContext[] = [];
  let n = 0;
  const model: InterviewerModel = {
    runTurn: async () => turns[0],
    streamTurn: (ctx: TurnContext) => { seen.push(ctx); return eventsFromTurn(Promise.resolve(turns[Math.min(n++, turns.length - 1)])); },
  };
  return { model, seen };
}
async function all(g: AsyncGenerator<TurnEvent>) { const out: TurnEvent[] = []; for await (const e of g) out.push(e); return out; }

describe('guard B: streamInterviewerTurn', () => {
  it('restarts once with the note when an explicit ask got no declared request', async () => {
    const { model, seen } = scriptedModel([T(), T({ requests: [COGS] })]);
    const guard: boolean[] = [];
    const ev = await all(streamInterviewerTurn({ model, candidateText: 'Could I get COGS?', history: [], promptCtx, phase: 'STRUCTURE', requireRequests: true, onRequestGuard: r => guard.push(r.regenerated) }));
    expect(seen).toHaveLength(2);
    expect(seen[1].turnSystem).toContain(REQUEST_GUARD_NOTE);
    expect(ev.some(e => e.type === 'restart')).toBe(true);
    expect(ev.at(-1)).toMatchObject({ type: 'done', turn: { requests: [{ itemIds: ['cogs_pct'] }] } });
    expect(guard).toEqual([true]);
  });

  it('keeps the second answer even if it still declares nothing (the model decides)', async () => {
    const { model, seen } = scriptedModel([T(), T()]);
    const ev = await all(streamInterviewerTurn({ model, candidateText: 'Could I get COGS?', history: [], promptCtx, phase: 'STRUCTURE', requireRequests: true }));
    expect(seen).toHaveLength(2);
    expect(ev.at(-1)).toMatchObject({ type: 'done' });
  });

  it('does nothing when requests were declared, or when the guard is off', async () => {
    const a = scriptedModel([T({ requests: [COGS] })]);
    await all(streamInterviewerTurn({ model: a.model, candidateText: 'Could I get COGS?', history: [], promptCtx, phase: 'STRUCTURE', requireRequests: true }));
    expect(a.seen).toHaveLength(1);
    const b = scriptedModel([T()]);
    await all(streamInterviewerTurn({ model: b.model, candidateText: 'Could I get COGS?', history: [], promptCtx, phase: 'STRUCTURE' }));
    expect(b.seen).toHaveLength(1);
  });
});

describe('guard B: Plan and Stream', () => {
  const plan = (phase: 'STRUCTURE' | 'BRAINSTORM', text: string) => {
    const p = planTurn(readsFixture({ phase }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('model plan expected');
    p.state.distress = Promise.resolve(null);
    return p;
  };

  it('arms the guard on an explicit ask before the brainstorm only', () => {
    expect(plan('STRUCTURE', 'Could I get the cost breakdown?').state.requestCues).toEqual(['could I get']);
    expect(plan('STRUCTURE', 'I think costs drove it.').state.requestCues).toEqual([]);
    expect(plan('BRAINSTORM', 'Could I get the cost breakdown?').state.requestCues).toEqual([]);
  });

  it('holds say until the declarations close when the guard is armed', async () => {
    const p = plan('STRUCTURE', 'Could I get the cost breakdown?');
    const heard: string[] = [];
    let heardBeforeRequests = -1;
    async function* events(): AsyncGenerator<TurnEvent> {
      yield { type: 'sentence', text: 'Got it.' };
      yield { type: 'field', key: 'say', value: 'Got it.' };
      yield { type: 'field', key: 'move', value: 'analysis' };
      await new Promise(r => setTimeout(r, 5));
      heardBeforeRequests = heard.length;
      yield { type: 'field', key: 'requests', value: [{ what: 'COGS', item_ids: ['cogs_pct'], explicit: true, respond: 'release' }] };
      yield { type: 'field', key: 'exhibit', value: null };
      yield { type: 'field', key: 'rescue_item', value: null };
      yield { type: 'field', key: 'question', value: 'Why?' };
      yield { type: 'done', turn: T({ requests: [COGS] }), validation: null as never };
    }
    await streamTurnSegments(events(), p, async s => { heard.push(s.text); }, { isDelivered: { value: false } });
    expect(heardBeforeRequests).toBe(0);
    expect(heard[0]).toBe('Got it.');
  });
});
