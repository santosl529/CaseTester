// Phase 1 4.7 (`modelDeferrals`; Lorenzo, 22 Oct: "Model-said deferrals ("I'll check what we have", "let me come back to
// that"): register them, so the E5 stop sequence resolves them."). b38 Larkspur Tyler cee7d399 t23 → t24: "Do we have
// price elasticity on the four protected routes?" — the model said "On the price elasticity of those four routes, I'll
// check what we have.", the check mapped the ask to route_results_other (out) and code restated it; elasticity never
// came back (graded hollow). With the switch: the model's promise is booked open, and the first wrap-up turn says "We
// won't get to … today." for it — unless the same turn already answers the ask (a new item, a refusal, code's deferral).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Row = Record<string, unknown>;
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/db/client', () => ({
  db: {
    query: { sessions: { findFirst: async () => ({ status: 'active' }) } },
    insert: () => ({ values: async (v: Row | Row[]) => { void v; } }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  },
}));
const { ask } = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [], classifyAsk: ask }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan, type TurnKind } from '@/lib/orchestrator/plan-turn';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { turnDataChecked, needCarriers, type OpenDeferral } from '@/lib/orchestrator/turn-data';
import { renderDataLines } from '@/lib/orchestrator/data-decisions';
import type { ModelTurn, DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

// b38 Tyler t23's asking paragraph and the model's t24 turn, verbatim.
const T23 = 'Fifth, revisit the $20M fixed base — it was never scrutinized.\n\nDo we have price elasticity on the four protected routes?';
const WHAT = 'price elasticity on the four uncontested routes';
const T24: ModelTurn = { move: 'acknowledge', requests: [{ what: WHAT, itemIds: [], explicit: true, respond: 'release' }], exhibit: null, rescueItem: null,
  say: 'A stacked set of levers. On the price elasticity of those four routes, I\'ll check what we have.', question: 'Which of those levers would you pull first, and why?' } as unknown as ModelTurn;
const WONT = `We won't get to ${WHAT} today.`;

const SATISFIED = { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
const REVEALED = ['route_results_other', 'route_results_lakeport', 'route_results_port_avery', 'network_totals', 'fixed_costs', 'new_route_rampup'];
function plan(text: string, o: { kind?: TurnKind; flags?: Record<string, unknown>; phase?: 'BRAINSTORM' | 'RECOMMENDATION'; revealed?: string[] } = {}): ModelPlan {
  const p = planTurn(readsFixture({ caseId: 'prof-002', phase: o.phase ?? 'BRAINSTORM', flags: { ...SATISFIED, ...o.flags }, revealed: o.revealed ?? REVEALED }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  p.state.distress = Promise.resolve(null);
  if (o.kind) p.state.kind = o.kind;
  p.state.shownExhibitIds.add('exhibit-1');
  return p;
}
const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const outcome = (turn: ModelTurn): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });
const acted = (p: ModelPlan, check: string) => p.ctx.checks.entries.filter(e => e.check === check);
const openOf = (p: ModelPlan) => p.ctx.flags.openDeferrals as OpenDeferral[] | undefined;
const env = process.env.ENGINE_SWITCHES;
const on = () => { process.env.ENGINE_SWITCHES = 'prof-002=modelDeferrals'; };
beforeEach(() => { ask.mockReset(); ask.mockImplementation(async () => ({ items: [{ id: 'route_results_other', answers: 'full' }] })); delete process.env.ENGINE_SWITCHES; });
afterEach(() => { if (env === undefined) delete process.env.ENGINE_SWITCHES; else process.env.ENGINE_SWITCHES = env; });

describe('b38 Tyler t24: "I\'ll check what we have" on elasticity', () => {
  it('off: nothing booked, as live (the hollow deferral)', async () => {
    const p = plan(T23);
    const s = await settleTurn(p, outcome(T24));
    expect(s.spokenText).toContain("I'll check what we have");
    expect(openOf(p) ?? []).toEqual([]);
    expect(acted(p, 'model_deferral')).toEqual([]);
  });
  it('on: booked open in the ask\'s words — the restatement answers no "check"', async () => {
    on();
    const p = plan(T23);
    await settleTurn(p, outcome(T24));
    const open = openOf(p)!;
    expect(open.map(o => o.what)).toEqual([WHAT]);
    expect(open[0].ids).toEqual([]);
    // No item carries the ask's head noun, so it is booked with no `need` at all: nothing can deliver it (review F3)
    // and it is met by its own words or by the wrap-up's "We won't get to …".
    expect(open[0].need).toBeUndefined();
    expect(needCarriers(open[0].need)).toBeNull();
    expect(acted(p, 'model_deferral')).toHaveLength(1);
  });
  it('on: the first wrap-up turn closes it — "We won\'t get to … today."', async () => {
    on();
    const p = plan('My recommendation is to exit Lakeport first.', { kind: 'rec_ask', phase: 'RECOMMENDATION', flags: { openDeferrals: [{ what: WHAT, ids: [], turn: 24, need: { elasticity: [] } }] } });
    const d = await turnDataChecked(p, { requests: [], exhibit: null, rescueItem: null });
    expect(renderDataLines(d, 's')).toContain(WONT);
  });
});

describe('what is registered, and what is not', () => {
  it('the ask answered this turn by a new item: not registered', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [{ id: 'competitor_costs', answers: 'full' }] }));
    const p = plan("Do we know the entrant's cost structure?");
    const turn = { ...T24, requests: [{ what: "the entrant's cost structure", itemIds: [], explicit: true, respond: 'release' } as DeclaredRequest], say: "On the entrant's costs, let me check what we have." } as ModelTurn;
    const s = await settleTurn(p, outcome(turn));
    expect(s.newReveals).toContain('competitor_costs');
    expect(openOf(p) ?? []).toEqual([]);
  });
  it('the ask refused this turn (the check\'s none): not registered', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan('Do we have the catering contracts?');
    const turn = { ...T24, requests: [{ what: 'the catering contracts', itemIds: [], explicit: true, respond: 'release' } as DeclaredRequest], say: 'Let me check on that.' } as ModelTurn;
    const s = await settleTurn(p, outcome(turn));
    expect(s.spokenText).toMatch(/don't have the catering contracts/);
    expect(openOf(p) ?? []).toEqual([]);
  });
  it('no request: the sentence\'s own lead names the ask ("On X, I\'ll check what we have")', async () => {
    on();
    const p = plan(T23);
    await settleTurn(p, outcome({ ...T24, requests: [], say: 'A stacked set of levers. On the elasticity question, I\'ll check what we have.' } as unknown as ModelTurn));
    expect(openOf(p)!.map(o => o.what)).toEqual(['the elasticity question']);
  });
  it('a lead carrying a figure no candidate turn said is not said back ("those 4 routes"): nothing registered', async () => {
    on();
    const p = plan(T23);
    await settleTurn(p, outcome({ ...T24, requests: [] } as unknown as ModelTurn));
    expect(openOf(p) ?? []).toEqual([]);
  });
  it('a promise code withheld (the data-talk veto) was never said: nothing registered', async () => {
    on();
    const p = plan('What about a fare war?');
    const s = await settleTurn(p, outcome({ ...T24, requests: [], say: 'On a possible fare war, I\'ll come back to that.' } as unknown as ModelTurn));
    expect(s.spokenText).not.toContain("I'll come back to that");
    expect(openOf(p) ?? []).toEqual([]);
  });
  it('a wrap-up turn: not registered — said "We won\'t get to … today." in the same breath (review F7)', async () => {
    on();
    const p = plan(T23, { kind: 'rec_ask', phase: 'RECOMMENDATION' });
    const s = await settleTurn(p, outcome(T24));
    expect((openOf(p) ?? []).map(o => o.what)).not.toContain(WHAT);
    expect(s.spokenText).toContain(WONT);
    expect(acted(p, 'model_deferral').map(e => (e.detail as { wrapUp?: boolean }).wrapUp)).toEqual([true]);
  });
  it('off: the promise on a wrap-up turn is left as it was', async () => {
    const p = plan(T23, { kind: 'rec_ask', phase: 'RECOMMENDATION' });
    const s = await settleTurn(p, outcome(T24));
    expect(s.spokenText).not.toContain(WONT);
  });
  it('code\'s own lines are not the model\'s: "I\'ll come back to …" in a data line registers nothing', async () => {
    on();
    const p = plan('Do we have the Lakeport fare?', { revealed: ['route_results_other'] });
    p.state.shownExhibitIds.delete('exhibit-1');
    const turn = { ...T24, requests: [{ what: 'the Hub–Lakeport fare', itemIds: ['lakeport_fare'], explicit: true, respond: 'release' } as DeclaredRequest], say: 'Okay.' } as ModelTurn;
    const s = await settleTurn(p, outcome(turn));
    expect(s.spokenText).toMatch(/come back to|get there|hold/i);   // code's deferral (Exhibit 2 not ready)
    expect(acted(p, 'model_deferral')).toEqual([]);
  });
});
