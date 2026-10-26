// Phase 1 4.4 (`refusalNounCheck`; Lorenzo, 22 Oct: "Refusals: when both code and Haiku find no match, refuse only if no
// ledger item shares a key noun with the ask; otherwise defer. Haiku's "none" adds nothing on its own."), as the review
// tightened it (F2): a check-made refusal (its "none", or a verdict with no item answering the ask) becomes a deferral
// only when the ask's **head noun** is shared and **one single item** carries every noun it shares — a set shared across
// different items is no answer. The deferral is tracked until that item is delivered (F3: the carrier intersection),
// else "We won't get to …" at the first wrap-up. Off: today's refusal.
// The wave's two "split" refusals (b38 Larkspur Tyler cee7d399 t1 → t2, Jasmine 3f928012 t3 → t4; graded false,
// judgement) are pinned here as **still refused by 4.4 alone**: 4.5 fixes Tyler's (phase1-cover-normalization.test.ts)
// and 4.2 fixes Jasmine's (phase1-coarse-keep-named.test.ts), which is what the review's walk expects.
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
import { turnDataChecked, resolveDeferrals, headNoun, needCarriers, type OpenDeferral, type TurnData } from '@/lib/orchestrator/turn-data';
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
  it('the dimension words are stopped (review F2): time, past, beyond, new, data', () => {
    expect([...keyNouns('repeat rates from past launches')].sort()).toEqual(['launche', 'repeat']);
    expect([...keyNouns('repeat purchase rate beyond year one')]).toEqual(['repeat', 'purchase']);
    expect([...keyNouns('contribution by departure time')]).toEqual(['contribution', 'departure']);
    expect([...keyNouns('typical new SKU volume per store')].sort()).toEqual(['sku', 'store', 'typical', 'volume']);
  });
});

describe('the head noun (review F2)', () => {
  it('is the last key noun of the head phrase, before the first modifier', () => {
    expect(headNoun('waste or spoilage data by store')).toBe('waste');
    expect(headNoun('contribution by departure time')).toBe('contribution');
    expect(headNoun("later cohorts' upgrade rates")).toBe('upgrade');   // "rates" is a generic label word
    expect(headNoun('typical annual bag volume for a Hollis Bay chip SKU')).toBe('volume');
  });
  it('falls back to the first key noun when the head phrase has none of its own', () => {
    expect(headNoun('split of revenue decline between passengers and average fare')).toBe('decline');
  });
  it('reads the case\'s proper names out', () => {
    expect(headNoun("Port Avery's fuel line", ['Port Avery'])).toBe('fuel');
  });
});

describe('b38 Tyler t2: the passengers-versus-fare split — the nouns sit on different items', () => {
  it('off: refused, as live', async () => {
    ask.mockImplementation(async () => TYLER_VERDICT);
    const p = plan(TYLER_T1, { phase: 'INTRO' });
    const d = await turnDataChecked(p, turn([{ what: TYLER_WHAT, itemIds: [], explicit: true, respond: 'defer' }]));
    expect(d.refusals).toEqual([TYLER_PART]);
    expect(acted(p, 'refusal_noun')).toEqual([]);
  });
  it('on: still refused — no one item carries the decline, the passengers and the fare (4.5 is what fixes this turn)', async () => {
    on();
    ask.mockImplementation(async () => TYLER_VERDICT);
    const p = plan(TYLER_T1, { phase: 'INTRO' });
    const d = await turnDataChecked(p, turn([{ what: TYLER_WHAT, itemIds: [], explicit: true, respond: 'defer' }]));
    expect(d.refusals).toEqual([TYLER_PART]);
    expect(d.defers).toEqual([]);
    const log = acted(p, 'refusal_noun').map(e => e.detail as { asks: { what: string; deferred: boolean; head: string | null; carriers: string[]; shared: Record<string, string[]> }[] })[0].asks;
    expect(log[0]).toMatchObject({ what: TYLER_PART, deferred: false, head: 'decline', carriers: [] });
    // The nouns are shared, but by different items — which is why the old rule deferred it.
    expect(log[0].shared.lakeport_fare).toEqual(['fare']);
  });
});

describe('b38 Jasmine t4: the ticket-versus-extras split', () => {
  it('off and on: refused by 4.4 either way (4.2 is what fixes this turn)', async () => {
    ask.mockImplementation(async () => JASMINE_VERDICT);
    const off = await turnDataChecked(plan(JASMINE_T3, { flags: SATISFIED }), turn(JASMINE_ASKS));
    expect(off.refusals).toEqual([SPLIT]);
    on();
    const p = plan(JASMINE_T3, { flags: SATISFIED });
    const d = await turnDataChecked(p, turn(JASMINE_ASKS));
    expect(d.releases.map(r => r.id)).toEqual(['port_avery_per_flight', 'network_totals']);
    expect(d.refusals).toEqual([SPLIT]);
  });
});

// b34 Larkspur Tyler 51ad0cb8 t17 → t18, graded a true refusal: "contribution by departure time". The head noun
// (contribution) is shared and the network totals line carries both its nouns, so it is deferred and tracked.
const DEPARTURE = 'contribution by departure time';
describe('a deferral the tightened rule still makes', () => {
  it('on: one item carries the whole ask — deferred, tracked on that item', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan('Do we have contribution by departure time?', { flags: SATISFIED, phase: 'ANALYSIS' });
    const d = await turnDataChecked(p, turn([{ what: DEPARTURE, itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.refusals).toEqual([]);
    expect(d.defers).toEqual([DEPARTURE]);
    expect(renderDataLines(d, 's')).toEqual([`I'll come back to ${DEPARTURE} shortly.`]);
    const opened = d.deferralsOpened!;
    expect(opened).toHaveLength(1);
    expect(opened[0].need).toEqual({ contribution: ['network_totals'], departure: ['network_totals'] });
    expect(d.requests.find(r => r.request.what === DEPARTURE)?.response).toBe('defer');
  });
  it('on: its carrier already out — nothing is deferred for it (only items not yet out can answer a deferral)', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan('Do we have contribution by departure time?', { flags: SATISFIED, phase: 'ANALYSIS', revealed: ['network_totals'] });
    const d = await turnDataChecked(p, turn([{ what: DEPARTURE, itemIds: [], explicit: true, respond: 'release' }]));
    // Only items not yet out can answer a deferral, so the network totals are no longer its carrier.
    for (const e of acted(p, 'refusal_noun')) for (const x of (e.detail as { asks: { carriers: string[] }[] }).asks) expect(x.carriers).not.toContain('network_totals');
    for (const o of d.deferralsOpened ?? []) expect(needCarriers(o.need)).not.toContain('network_totals');
  });
});

describe('a refusal the rule leaves alone', () => {
  it('on: "catering contracts" — no item has either noun: refused', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan('Do we have the catering contracts?', { flags: SATISFIED, phase: 'ANALYSIS' });
    const d = await turnDataChecked(p, turn([{ what: 'the catering contracts', itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.refusals).toEqual(['the catering contracts']);
    expect(d.defers).toEqual([]);
    expect(acted(p, 'refusal_noun').map(e => (e.detail as { asks: { deferred: boolean }[] }).asks[0].deferred)).toEqual([false]);
  });
  it('on: the head noun no item shares — refused though another noun is shared (b38 Tyler t16 "frequency expansion")', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan('Any frequency expansion on the four routes?', { flags: SATISFIED, phase: 'ANALYSIS' });
    const d = await turnDataChecked(p, turn([{ what: 'frequency expansion', itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.refusals).toEqual(['frequency expansion']);
    const log = acted(p, 'refusal_noun').map(e => e.detail as { asks: { head: string | null; shared: Record<string, string[]> }[] })[0].asks[0];
    expect(log.head).toBe('expansion');
    expect(Object.values(log.shared).flat()).toContain('frequency');
  });
  it('on: the nouns shared across different items — refused (b36 Larkspur Raj ef7bed14 t7 → t8)', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [] }));
    const what = 'total passengers flown and average fare per passenger';
    const p = plan('Do we have total passengers flown and average fare per passenger?', { flags: SATISFIED, phase: 'ANALYSIS' });
    const d = await turnDataChecked(p, turn([{ what, itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.refusals).toEqual([what]);
    expect(d.defers).toEqual([]);
  });
  it('on: a noun only items already out share: refused (nothing more can come for it)', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan('Do we have fuel hedging?', { flags: SATISFIED, phase: 'ANALYSIS', revealed: ['lakeport_variable_cost', 'fuel_prices'] });
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
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan('My recommendation is to exit both routes.', { flags: SATISFIED, phase: 'RECOMMENDATION', kind: 'rec_ask' });
    const d = await turnDataChecked(p, turn([{ what: DEPARTURE, itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.refusals).toEqual([]);
    expect(d.wontGetTo).toContain(DEPARTURE);
    expect(d.deferralsOpened).toBeUndefined();
  });
});

describe('a noun deferral is delivered by one item carrying the whole ask (review F3)', () => {
  const open: OpenDeferral = { what: SPLIT, ids: [], turn: 4, need: { ticket: ['lakeport_fare'], extra: ['lakeport_fare'] } };
  const none = { requests: [], refusals: [], defers: [], gateDefers: [], releases: [], restates: [], exhibit: null } as unknown as TurnData;
  it('the carrier delivered: delivered', () => {
    const r = resolveDeferrals([open], none, 12, ['lakeport_fare', 'lakeport_seats_load']);
    expect(r.resolved).toEqual([{ what: SPLIT, how: 'delivered', turn: 12 }]);
    expect(r.open).toEqual([]);
  });
  it('another item that carries one noun only: still open (it does not answer the ask)', () => {
    const split: OpenDeferral = { what: SPLIT, ids: [], turn: 4, need: { ticket: ['lakeport_fare'], extra: ['extras_revenue'] } };
    const r = resolveDeferrals([split], none, 6, ['extras_revenue']);
    expect(r.resolved).toEqual([]);
    expect(r.open).toEqual([split]);
    // …and nothing ever delivers it: the two lists share no item, so it closes at the wrap-up.
    expect(needCarriers(split.need)).toEqual([]);
  });
  it('a noun no item shares can never be met: open until the wrap-up', () => {
    const lone: OpenDeferral = { what: 'the business versus leisure fare mix', ids: [], turn: 14, need: { business: [], fare: ['new_routes_plan'] } };
    const r = resolveDeferrals([lone], none, 20, ['new_routes_plan']);
    expect(r.resolved).toEqual([]);
    expect(r.open).toEqual([lone]);
  });
  it('the first wrap-up turn names it: "We won\'t get to … today."', async () => {
    on();
    const lone: OpenDeferral = { what: 'the business versus leisure fare mix', ids: [], turn: 14, need: { business: [] } };
    const p = plan('I recommend exiting.', { flags: { ...SATISFIED, openDeferrals: [lone] }, phase: 'RECOMMENDATION', kind: 'rec_ask', revealed: ['new_route_rampup'] });
    const d = await turnDataChecked(p, turn([]));
    expect(renderDataLines(d, 's')).toEqual(["We won't get to the business versus leisure fare mix today."]);
  });
  it('the first wrap-up turn says nothing for one whose carrier that turn delivers', async () => {
    on();
    const open2: OpenDeferral = { what: 'the fleet mix by aircraft type', ids: [], turn: 4, need: { fleet: ['fleet'] } };
    const p = plan('I recommend exiting. Is the fleet all one type?', { flags: { ...SATISFIED, openDeferrals: [open2] }, phase: 'RECOMMENDATION', kind: 'rec_ask', revealed: ['new_route_rampup'] });
    const d = await turnDataChecked(p, turn([{ what: "Larkspur's fleet", itemIds: ['fleet'], explicit: true, respond: 'release' }]));
    expect(d.releases.map(r => r.id)).toContain('fleet');
    expect(renderDataLines(d, 's').join(' ')).not.toMatch(/won't get to/);
  });
  it('Settle books it open with its carrier', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan('Do we have contribution by departure time?', { flags: SATISFIED, phase: 'ANALYSIS' });
    await settleTurn(p, outcome(modelTurn([{ what: DEPARTURE, itemIds: [], explicit: true, respond: 'release' }])));
    const flags = p.ctx.flags.openDeferrals as OpenDeferral[];
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ what: DEPARTURE, ids: [] });
    expect(needCarriers(flags[0].need)).toEqual(['network_totals']);
  });
});

describe('an untagged case (prof-001) tracks a noun deferral under the switch', () => {
  const plan1 = (text: string) => {
    const p = planTurn(readsFixture({ phase: 'ANALYSIS', flags: SATISFIED }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    p.state.distress = Promise.resolve(null);
    return p;
  };
  // b33 Brew & Bean Marisol 31e33506 t15 → t16, graded a true refusal ("the case holds no volume, but the store count
  // would have let her derive it"): the average transaction value carries both nouns.
  const VOLUME = 'volume per store';
  it('off: the check\'s none is refused, nothing tracked', async () => {
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan1('Do we have volume per store?');
    const s = await settleTurn(p, outcome(modelTurn([{ what: VOLUME, itemIds: [], explicit: true, respond: 'release' }])));
    expect(s.spokenText).toMatch(/I don't have volume per store/);
    expect(p.ctx.flags.openDeferrals).toBeUndefined();
  });
  it('on: the average transaction value carries the whole ask — deferred, and booked open', async () => {
    process.env.ENGINE_SWITCHES = 'prof-001=refusalNounCheck';
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan1('Do we have volume per store?');
    const s = await settleTurn(p, outcome(modelTurn([{ what: VOLUME, itemIds: [], explicit: true, respond: 'release' }])));
    expect(s.spokenText).toMatch(/come back to volume per store|get there in a bit|hold volume per store/i);
    const open = p.ctx.flags.openDeferrals as OpenDeferral[];
    expect(open.map(o => o.what)).toEqual([VOLUME]);
    expect(needCarriers(open[0].need)).toContain('avg_ticket');
  });
  it('on: its first wrap-up turn says "We won\'t get to … today." for it', async () => {
    process.env.ENGINE_SWITCHES = 'prof-001=refusalNounCheck';
    const p = planTurn(readsFixture({ phase: 'RECOMMENDATION', flags: { ...SATISFIED, openDeferrals: [{ what: VOLUME, ids: [], turn: 4, need: { volume: [] } }] } }), 'I recommend a price rise.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    p.state.kind = 'rec_ask';
    const d = await turnDataChecked(p, turn([]));
    expect(renderDataLines(d, 's')).toEqual([`We won't get to ${VOLUME} today.`]);
  });
});

describe('a period or scope in the deferred words: its carrier never meets it', () => {
  it('b34 Larkspur Raj 061ef630 t14 "FY2024 fares": deferred, never met by the FY2023/FY2025 fares — closed at the wrap-up', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [] }));
    const p = plan('Do we have FY2024 fares?', { flags: SATISFIED, phase: 'ANALYSIS' });
    const d = await turnDataChecked(p, turn([{ what: 'FY2024 fares', itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.defers).toEqual(['FY2024 fares']);
    const need = d.deferralsOpened![0].need!;
    expect(need['(a period or scope)']).toEqual([]);
    expect(needCarriers(need)).toEqual([]);
    const open: OpenDeferral = { what: 'FY2024 fares', ids: [], turn: 14, need };
    const none = { requests: [], refusals: [], defers: [], gateDefers: [], releases: [], restates: [], exhibit: null } as unknown as TurnData;
    expect(resolveDeferrals([open], none, 18, ['lakeport_fare', 'port_avery_per_flight', 'competitor_costs']).resolved).toEqual([]);
  });
});

describe('number words are no key nouns', () => {
  it('"price elasticity on the four uncontested routes": elasticity, uncontested, route', () => {
    expect([...keyNouns('price elasticity on the four uncontested routes')].sort()).toEqual(['elasticity', 'route', 'uncontested']);
  });
});
