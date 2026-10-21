// Phase 1 4.4 (`refusalNounCheck`; Lorenzo, 22 Oct: "Refusals: when both code and Haiku find no match, refuse only if no
// ledger item shares a key noun with the ask; otherwise defer. Haiku's "none" adds nothing on its own."). b38 Larkspur
// Tyler cee7d399 t1 → t2 and Jasmine 3f928012 t3 → t4, the two "split" refusals of the wave (graded false, judgement):
// the check's verdicts as recorded, the candidates' messages verbatim. A check-made refusal (its "none", or a verdict
// with no item answering the ask) goes out only when no ledger item not yet out shares a key noun with it; otherwise it
// is the named deferral, tracked until every one of its nouns has been delivered, else "We won't get to …" at the first
// wrap-up. Off: today's refusal.
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
import { turnDataChecked, resolveDeferrals, type OpenDeferral, type TurnData } from '@/lib/orchestrator/turn-data';
import { renderDataLines, keyNouns } from '@/lib/orchestrator/data-decisions';
import type { ModelTurn, DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

// b38 Larkspur Tyler cee7d399 t1, verbatim; the model's request as declared; the check's verdict as recorded (coarse:
// five route items partial, none releasable before the structure is settled).
const TYLER_T1 = "Let me make sure I have the setup right: revenue down from $200M to $176M, and we went from $20M profit to a $4M loss, so a $24M swing — and load factors are roughly flat, which is interesting because it means the problem isn't empty planes.\n\nI'd structure it as profit = revenue minus cost, and work both sides.\n\nOn revenue: revenue is roughly passengers × average fare. Passengers is seats × flights × load factor. Since load factor is flat, the decline is either fewer flights/seats flown, or a lower average fare per ticket — or mix shift across the six routes.\n\nOn cost: break into fuel, labor, aircraft ownership/maintenance, airport fees, and distribution/overhead, and look at both total and cost per available seat mile.\n\nI'd start with revenue since I can decompose it cleanly. Do we have the split of the revenue decline between number of passengers flown and average fare?";
const TYLER_WHAT = 'the split of the revenue decline between passengers and average fare';
const TYLER_PART = 'split of revenue decline between passengers and average fare';
const TYLER_VERDICT = { items: ['lakeport_fare', 'port_avery_per_flight', 'lakeport_seats_load', 'route_results_lakeport', 'route_results_port_avery'].map(id => ({ id, answers: 'partial', missing: TYLER_PART })) };
// b38 Larkspur Jasmine 3f928012 t3 (its asking sentence; the rest as in phase1-coarse-keep-named.test.ts) and t4's verdict.
const JASMINE_T3 = 'So revised revenue branch: ticket revenue (departures × seats × load × fare, with route mix) plus ancillary revenue.\n\nDo we have the revenue split between ticket and ancillary for FY2023 and FY2025, and the departure count each year?';
const SPLIT = 'the ticket versus extras revenue split';
const JASMINE_ASKS: DeclaredRequest[] = [
  { what: SPLIT, itemIds: ['extras_revenue'], explicit: true, respond: 'release' },
  { what: 'departure counts for each year', itemIds: ['network_totals'], explicit: true, respond: 'release' },
];
const JASMINE_VERDICT = { items: [{ id: 'extras_revenue', answers: 'full' }, { id: 'lakeport_fare', answers: 'partial', missing: SPLIT }, { id: 'port_avery_per_flight', answers: 'partial', missing: SPLIT }] };

const SATISFIED = { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
function plan(text: string, o: { phase?: 'INTRO' | 'STRUCTURE' | 'ANALYSIS' | 'RECOMMENDATION'; flags?: Record<string, unknown>; revealed?: string[]; kind?: TurnKind } = {}): ModelPlan {
  const p = planTurn(readsFixture({ caseId: 'prof-002', phase: o.phase ?? 'STRUCTURE', flags: o.flags, revealed: o.revealed }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  p.state.distress = Promise.resolve(null);
  if (o.kind) p.state.kind = o.kind;
  return p;
}
const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const modelTurn = (requests: DeclaredRequest[], o: Partial<ModelTurn> = {}): ModelTurn =>
  ({ say: 'Okay.', move: 'acknowledge', requests, exhibit: null, rescueItem: null, question: 'What would you look at next?', ...o } as unknown as ModelTurn);
const outcome = (turn: ModelTurn): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });
const turn = (requests: DeclaredRequest[]) => ({ requests, exhibit: null, rescueItem: null });
const acted = (p: ModelPlan, check: string) => p.ctx.checks.entries.filter(e => e.check === check);
const env = process.env.ENGINE_SWITCHES;
const on = () => { process.env.ENGINE_SWITCHES = 'prof-002=refusalNounCheck'; };
beforeEach(() => { ask.mockReset(); delete process.env.ENGINE_SWITCHES; });
afterEach(() => { if (env === undefined) delete process.env.ENGINE_SWITCHES; else process.env.ENGINE_SWITCHES = env; });

describe('key nouns: content nouns after the stop list and plural fold, proper names aside', () => {
  it('Tyler t2\'s part: decline, passenger, fare (split, revenue and average are stop words)', () => {
    expect([...keyNouns(TYLER_PART)].sort()).toEqual(['decline', 'fare', 'passenger']);
  });
  it('the case\'s proper names are taken out whole; possessives folded', () => {
    expect([...keyNouns("Port Avery's fuel line", ['Port Avery', 'Larkspur'])]).toEqual(['fuel']);
    expect([...keyNouns('the ticket versus extras revenue split')].sort()).toEqual(['extra', 'ticket']);
  });
});

describe('b38 Tyler t2: the passengers-versus-fare split', () => {
  it('off: refused, as live', async () => {
    ask.mockImplementation(async () => TYLER_VERDICT);
    const p = plan(TYLER_T1, { phase: 'INTRO' });
    const d = await turnDataChecked(p, turn([{ what: TYLER_WHAT, itemIds: [], explicit: true, respond: 'defer' }]));
    expect(d.refusals).toEqual([TYLER_PART]);
    expect(acted(p, 'refusal_noun')).toEqual([]);
  });
  it('on: deferred in the same words — fare, passengers and the decline are on items not yet out', async () => {
    on();
    ask.mockImplementation(async () => TYLER_VERDICT);
    const p = plan(TYLER_T1, { phase: 'INTRO' });
    const d = await turnDataChecked(p, turn([{ what: TYLER_WHAT, itemIds: [], explicit: true, respond: 'defer' }]));
    expect(d.refusals).toEqual([]);
    expect(d.defers).toEqual([TYLER_PART]);
    expect(d.itemlessDefers).toEqual([TYLER_PART]);
    expect(renderDataLines(d, 's')).toEqual([`I'll come back to ${TYLER_PART} shortly.`]);
    const log = acted(p, 'refusal_noun').map(e => e.detail as { asks: { what: string; deferred: boolean; shared: Record<string, string[]> }[] })[0].asks;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ what: TYLER_PART, deferred: true });
    expect(log[0].shared.lakeport_fare).toEqual(['fare']);
    const opened = d.deferralsOpened!;
    expect(opened).toHaveLength(1);
    expect(Object.keys(opened[0].need!).sort()).toEqual(['decline', 'fare', 'passenger']);
    expect(opened[0].need!.fare).toContain('lakeport_fare');
    expect(d.requests.find(r => r.request.what === TYLER_WHAT)?.response).toBe('defer');
  });
});

describe('b38 Jasmine t4: the ticket-versus-extras split beside the Port Avery line', () => {
  it('off: the Port Avery line and the refusal, as live', async () => {
    ask.mockImplementation(async () => JASMINE_VERDICT);
    const p = plan(JASMINE_T3, { flags: SATISFIED });
    const d = await turnDataChecked(p, turn(JASMINE_ASKS));
    expect(d.releases.map(r => r.id)).toEqual(['port_avery_per_flight', 'network_totals']);
    expect(d.refusals).toEqual([SPLIT]);
  });
  it('on: the same lines, the refusal deferred (extras revenue and the fare are still to come)', async () => {
    on();
    ask.mockImplementation(async () => JASMINE_VERDICT);
    const p = plan(JASMINE_T3, { flags: SATISFIED });
    const d = await turnDataChecked(p, turn(JASMINE_ASKS));
    expect(d.releases.map(r => r.id)).toEqual(['port_avery_per_flight', 'network_totals']);
    expect(d.refusals).toEqual([]);
    expect(d.defers).toEqual([SPLIT]);
    // port_avery_per_flight goes out this turn: it meets no noun; lakeport_fare ("lakeport ticket price") and
    // extras_revenue (or the new routes' plan, "new route extras") do.
    expect(d.deferralsOpened![0].need).toEqual({ ticket: ['lakeport_fare'], extra: ['extras_revenue', 'new_routes_plan'] });
  });
});

describe('a refusal no item shares a noun with stays a refusal', () => {
  it('on: "catering contracts" — the check\'s none, no item has either noun: refused', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan('Do we have the catering contracts?', { flags: SATISFIED, phase: 'ANALYSIS' });
    const d = await turnDataChecked(p, turn([{ what: 'the catering contracts', itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.refusals).toEqual(['the catering contracts']);
    expect(d.defers).toEqual([]);
    expect(acted(p, 'refusal_noun').map(e => (e.detail as { asks: unknown[] }).asks)).toEqual([[{ what: 'the catering contracts', ask: 'the catering contracts', deferred: false, shared: {} }]]);
  });
  it('on: a noun only items already out share: refused (nothing more can come for it)', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [] }));
    const all = ['lakeport_variable_cost', 'fuel_prices'];
    const p = plan('Do we have fuel hedging?', { flags: SATISFIED, phase: 'ANALYSIS', revealed: all });
    // "fuel": lakeport_variable_cost ("lakeport fuel cost"), fuel_prices — both out; "hedging": none.
    const d = await turnDataChecked(p, turn([{ what: 'fuel hedging', itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.refusals).toEqual(['fuel hedging']);
  });
  it('on: a check mapping the answer gate drops whole is untouched (Haiku matched; code\'s tags vetoed it — audit row 2)', async () => {
    on();
    // b36 Larkspur Marisol t11/t12: the entrant's flights a day mapped to Larkspur's network totals — another company's.
    const what = 'how many flights a day the entrant runs on each route';
    ask.mockImplementation(async () => ({ items: [{ id: 'network_totals', answers: 'full' }] }));
    const p = plan('Do we know how many flights a day the entrant runs on each route?', { flags: SATISFIED, phase: 'ANALYSIS' });
    const d = await turnDataChecked(p, turn([{ what, itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.refusals.join(' ')).toMatch(/entrant/);
    expect(acted(p, 'refusal_noun')).toEqual([]);
  });
});

describe('on a wrap-up turn: "We won\'t get to … today." at once', () => {
  it('a rec-ask turn: the moved refusal is a "won\'t get to", nothing tracked', async () => {
    on();
    ask.mockImplementation(async () => TYLER_VERDICT);
    const p = plan('My recommendation is to exit both routes.', { flags: SATISFIED, phase: 'RECOMMENDATION', kind: 'rec_ask' });
    const d = await turnDataChecked(p, turn([{ what: TYLER_WHAT, itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.refusals).toEqual([]);
    expect(d.wontGetTo).toContain(TYLER_PART);
    expect(d.deferralsOpened).toBeUndefined();
  });
});

describe('a noun deferral resolves once every noun has been delivered', () => {
  const open: OpenDeferral = { what: SPLIT, ids: [], turn: 4, need: { ticket: ['lakeport_fare'], extra: ['extras_revenue'] } };
  const none = { requests: [], refusals: [], defers: [], gateDefers: [], releases: [], restates: [], exhibit: null } as unknown as TurnData;
  it('one noun met: still open, with the other noun still needed', () => {
    const r = resolveDeferrals([open], none, 6, ['extras_revenue']);
    expect(r.resolved).toEqual([]);
    expect(r.open).toEqual([{ ...open, need: { ticket: ['lakeport_fare'] } }]);
  });
  it('both met (Exhibit 2 shows both): delivered', () => {
    const r = resolveDeferrals([open], none, 12, ['lakeport_fare', 'extras_revenue', 'lakeport_seats_load']);
    expect(r.resolved).toEqual([{ what: SPLIT, how: 'delivered', turn: 12 }]);
    expect(r.open).toEqual([]);
  });
  it('a noun no item shares can never be met: open until the wrap-up', () => {
    const lone: OpenDeferral = { what: 'the business versus leisure fare mix', ids: [], turn: 14, need: { business: [], leisure: [], fare: ['new_routes_plan'] } };
    const r = resolveDeferrals([lone], none, 20, ['new_routes_plan']);
    expect(r.resolved).toEqual([]);
    expect(r.open[0].need).toEqual({ business: [], leisure: [] });
  });
  it('the first wrap-up turn names it: "We won\'t get to … today."', async () => {
    on();
    const lone: OpenDeferral = { what: 'the business versus leisure fare mix', ids: [], turn: 14, need: { business: [], leisure: [] } };
    const p = plan('I recommend exiting.', { flags: { ...SATISFIED, openDeferrals: [lone] }, phase: 'RECOMMENDATION', kind: 'rec_ask', revealed: ['new_route_rampup'] });
    const d = await turnDataChecked(p, turn([]));
    expect(renderDataLines(d, 's')).toEqual(["We won't get to the business versus leisure fare mix today."]);
  });
  it('Settle books it open with what it needs (an untagged case tracks it too, under the switch)', async () => {
    on();
    ask.mockImplementation(async () => TYLER_VERDICT);
    const p = plan(TYLER_T1, { phase: 'INTRO' });
    await settleTurn(p, outcome(modelTurn([{ what: TYLER_WHAT, itemIds: [], explicit: true, respond: 'defer' }])));
    const flags = p.ctx.flags.openDeferrals as OpenDeferral[];
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ what: TYLER_PART, ids: [] });
    expect(Object.keys(flags[0].need!).sort()).toEqual(['decline', 'fare', 'passenger']);
  });
  it('the first wrap-up turn says nothing for one whose last nouns that turn delivers', async () => {
    on();
    const open: OpenDeferral = { what: 'the fleet mix by aircraft type', ids: [], turn: 4, need: { fleet: ['fleet'] } };
    const p = plan('I recommend exiting. Is the fleet all one type?', { flags: { ...SATISFIED, openDeferrals: [open] }, phase: 'RECOMMENDATION', kind: 'rec_ask', revealed: ['new_route_rampup'] });
    const d = await turnDataChecked(p, turn([{ what: "Larkspur's fleet", itemIds: ['fleet'], explicit: true, respond: 'release' }]));
    expect(d.releases.map(r => r.id)).toContain('fleet');
    expect(renderDataLines(d, 's').join(' ')).not.toMatch(/won't get to/);
  });
});

describe('an untagged case (prof-001) tracks a noun deferral under the switch', () => {
  const plan1 = (text: string) => {
    const p = planTurn(readsFixture({ phase: 'ANALYSIS', flags: SATISFIED }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    p.state.distress = Promise.resolve(null);
    return p;
  };
  const WHAT = 'the coffee bean supplier contracts';
  it('off: the check\'s none is refused, nothing tracked', async () => {
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan1('Do we have the coffee bean supplier contracts?');
    const s = await settleTurn(p, outcome(modelTurn([{ what: WHAT, itemIds: [], explicit: true, respond: 'release' }])));
    expect(s.spokenText).toMatch(/I don't have the coffee bean supplier contracts/);
    expect(p.ctx.flags.openDeferrals).toBeUndefined();
  });
  it('on: "bean" is on the bean items not yet out — deferred, and booked open', async () => {
    process.env.ENGINE_SWITCHES = 'prof-001=refusalNounCheck';
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan1('Do we have the coffee bean supplier contracts?');
    const s = await settleTurn(p, outcome(modelTurn([{ what: WHAT, itemIds: [], explicit: true, respond: 'release' }])));
    expect(s.spokenText).toMatch(/come back to the coffee bean supplier contracts/);
    const open = p.ctx.flags.openDeferrals as OpenDeferral[];
    expect(open.map(o => o.what)).toEqual([WHAT]);
    expect(open[0].need!.bean).toEqual(expect.arrayContaining(['bean_price_change', 'bean_share_of_cogs']));
  });
  it('on: its first wrap-up turn says "We won\'t get to … today." for it', async () => {
    process.env.ENGINE_SWITCHES = 'prof-001=refusalNounCheck';
    const p = planTurn(readsFixture({ phase: 'RECOMMENDATION', flags: { ...SATISFIED, openDeferrals: [{ what: WHAT, ids: [], turn: 4, need: { supplier: [] } }] } }), 'I recommend a price rise.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    p.state.kind = 'rec_ask';
    const d = await turnDataChecked(p, turn([]));
    expect(renderDataLines(d, 's')).toEqual([`We won't get to ${WHAT} today.`]);
  });
});

describe('a period or scope in the deferred words: items sharing its nouns don\'t meet it', () => {
  it('b34 Larkspur Raj 061ef630 t14 "FY2024 fares": deferred, never met by FY2023/FY2025 fares — closed at the wrap-up', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan('Do we have FY2024 fares?', { flags: SATISFIED, phase: 'ANALYSIS' });
    const d = await turnDataChecked(p, turn([{ what: 'FY2024 fares', itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.defers).toEqual(['FY2024 fares']);
    const need = d.deferralsOpened![0].need!;
    expect(need['(a period or scope)']).toEqual([]);
    const open: OpenDeferral = { what: 'FY2024 fares', ids: [], turn: 14, need };
    const none = { requests: [], refusals: [], defers: [], gateDefers: [], releases: [], restates: [], exhibit: null } as unknown as TurnData;
    const r = resolveDeferrals([open], none, 18, ['lakeport_fare', 'port_avery_per_flight', 'competitor_costs', 'competitor_entry', 'new_routes_plan']);
    expect(r.resolved).toEqual([]);
  });
});
