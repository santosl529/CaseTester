// Phase 1 4.5 (`coverNormalization`; Lorenzo, 22 Oct: "Cover matching: finish normalization (plurals, a synonym table,
// matching the candidate's own sentence as well as the model's rewording)"; contract: "On prof-001 this needs
// tagMatching and itemCovers too"). b38 Larkspur Tyler cee7d399 t1 → t2: "Do we have the split of the revenue decline
// between number of passengers flown and average fare?" — the model's "the split of the revenue decline between
// passengers and average fare" missed `routes_schedule` / `planes_as_full`'s covers "volume and fare" (written for this
// ask, Lorenzo's 13 Oct ruling: give routes_schedule and restate the prompt's load-factor fact) and the check's coarse
// verdict refused it. With the switch: a passenger count is the volume, an average fare the fare — covered, no check.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
const { ask } = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [], classifyAsk: ask }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnDataChecked } from '@/lib/orchestrator/turn-data';
import { coverageOf, factBaseFor, buildFactBase } from '@/lib/orchestrator/fact-check';
import { repeatsLine } from '@/lib/orchestrator/turn-data';
import { getCaseById } from '@/lib/cases/loader';
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

const TYLER_T1 = "I'd start with revenue since I can decompose it cleanly. Do we have the split of the revenue decline between number of passengers flown and average fare?";
const TYLER_WHAT = 'the split of the revenue decline between passengers and average fare';
const TYLER_PART = 'split of revenue decline between passengers and average fare';
const TYLER_VERDICT = { items: ['lakeport_fare', 'port_avery_per_flight', 'lakeport_seats_load', 'route_results_lakeport', 'route_results_port_avery'].map(id => ({ id, answers: 'partial', missing: TYLER_PART })) };

const plan = (text: string, caseId = 'prof-002'): ModelPlan => {
  const p = planTurn(readsFixture({ caseId, phase: 'INTRO' }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  return p;
};
const turn = (requests: DeclaredRequest[]) => ({ requests, exhibit: null, rescueItem: null });
const acted = (p: ModelPlan, check: string) => p.ctx.checks.entries.filter(e => e.check === check);
const env = process.env.ENGINE_SWITCHES;
beforeEach(() => { ask.mockReset(); ask.mockImplementation(async () => TYLER_VERDICT); delete process.env.ENGINE_SWITCHES; });
afterEach(() => { if (env === undefined) delete process.env.ENGINE_SWITCHES; else process.env.ENGINE_SWITCHES = env; });

describe('b38 Tyler t2: passengers versus average fare', () => {
  it('off: no cover matches; the check\'s coarse verdict refuses it, as live', async () => {
    const p = plan(TYLER_T1);
    const d = await turnDataChecked(p, turn([{ what: TYLER_WHAT, itemIds: [], explicit: true, respond: 'defer' }]));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(d.refusals).toEqual([TYLER_PART]);
  });
  it('on: "passengers" is the volume and "average fare" the fare — the routes line and the planes-as-full fact, no check, no refusal', async () => {
    process.env.ENGINE_SWITCHES = 'prof-002=coverNormalization';
    const p = plan(TYLER_T1);
    const d = await turnDataChecked(p, turn([{ what: TYLER_WHAT, itemIds: [], explicit: true, respond: 'defer' }]));
    expect(ask).not.toHaveBeenCalled();
    expect(d.refusals).toEqual([]);
    // The model declared a deferral before the structure is settled: routes_schedule is deferred by its name and booked
    // (released once the pressure test is answered); the prompt's planes-as-full fact is said again now.
    expect(d.defers).toEqual(['the routes and schedule']);
    expect(d.requests[0]).toMatchObject({ response: 'defer', ledgerItemIds: ['routes_schedule'] });
    expect(d.restates.map(r => r.id)).toEqual(['planes_as_full']);
    expect(acted(p, 'refusal_covered').map(e => (e.detail as { covered: { ids: string[]; promptFacts: string[] }[] }).covered[0])).toMatchObject([{ ids: ['routes_schedule'], promptFacts: ['planes_as_full'] }]);
  });
});

describe('the fold and the synonyms, on a tagged case only', () => {
  const larkspur = getCaseById('prof-002');
  it('the switch sets coverNorm per call (never cached with the case)', () => {
    expect(factBaseFor(larkspur).coverNorm).toBeUndefined();
    process.env.ENGINE_SWITCHES = 'prof-002=coverNormalization';
    expect(factBaseFor(larkspur).coverNorm).toBe(true);
    delete process.env.ENGINE_SWITCHES;
    expect(factBaseFor(larkspur).coverNorm).toBeUndefined();
  });
  it('synonyms: passengers / ticket prices / average fares', () => {
    const fb = { ...buildFactBase(larkspur as never), coverNorm: true };
    const off = buildFactBase(larkspur as never);
    expect(coverageOf('passengers versus fare', fb).items).toEqual(['routes_schedule']);
    expect(coverageOf('passengers versus fare', off).items).toEqual([]);
    expect(coverageOf('ticket prices by route', fb).items.sort()).toEqual(['lakeport_fare', 'port_avery_per_flight']);
    expect(coverageOf('ticket prices by route', off).items).toEqual([]);
    expect(coverageOf('the competitor average fares', fb).items).toEqual(['competitor_costs']);
    expect(coverageOf('the competitor average fares', off).items).toEqual([]);
    expect(coverageOf('lakeport passengers', fb).items).toEqual(['lakeport_seats_load']);   // "lakeport volume"
  });
  it('the plural fold takes "-ies" to "-y"', () => {
    const fb = { ...buildFactBase({ ...larkspur, factAnchors: { ...larkspur.factAnchors!, covers: { ...larkspur.factAnchors!.covers, fleet: ['fleet strategy'] } } } as never), coverNorm: true };
    expect(coverageOf('the fleet strategies', fb).items).toEqual(['fleet']);
    expect(coverageOf('the fleet strategies', { ...fb, coverNorm: false }).items).toEqual([]);
  });
  it('untagged prof-001: literal matching, the switch alone changes nothing', () => {
    process.env.ENGINE_SWITCHES = 'prof-001=coverNormalization';
    const brew = getCaseById('prof-001');
    const fb = factBaseFor(brew);
    expect(fb.coverNorm).toBe(true);
    expect(fb.answerGate).toBe(false);
    const literal = buildFactBase(brew as never);
    for (const ask of ['the store counts', 'how many stores', 'average ticket prices', 'number of transactions']) expect(coverageOf(ask, fb)).toEqual(coverageOf(ask, literal));
  });
});

describe('a synonym\'s match yields to a finer word beside it', () => {
  const larkspur = getCaseById('prof-002');
  const fb = { ...buildFactBase(larkspur as never), coverNorm: true };
  it('b22 Larkspur Fiona b6b7fc3a t17 "price sensitivity of Lakeport passengers at a $200 fare": not the seats-and-load line', () => {
    expect(coverageOf('price sensitivity of Lakeport passengers at a $200 fare', fb).items).toEqual([]);
  });
  it('b36 Larkspur Marcus a7d9f44e t11 "quarter-by-quarter fares and passengers since entry": no coarse cover', () => {
    expect(coverageOf('quarter-by-quarter fares and passengers since entry', fb).items).toEqual([]);
    expect(coverageOf('quarter-by-quarter fares and passengers since entry', fb).promptFacts).toEqual([]);
  });
  it('a literal cover match is not held to it (round 6 as before)', () => {
    expect(coverageOf('lakeport volume per quarter', { ...fb, coverNorm: false }).items).toEqual(coverageOf('lakeport volume per quarter', fb).items);
  });
});

describe('a cover the round-6 fold already matches is no synonym hit', () => {
  it('b38 Larkspur Marisol f80d981c t5 "Next I\'d want average fare by route, and the extras revenue per passenger": the route fares, as round 6', () => {
    const larkspur = getCaseById('prof-002');
    const fb = { ...buildFactBase(larkspur as never), coverNorm: true };
    const sentence = "Next I'd want average fare by route, and the extras revenue per passenger, to see whether the discounting is concentrated on one or two routes.";
    expect(coverageOf('results by route', fb, { sentence }).items.sort()).toEqual(coverageOf('results by route', { ...fb, coverNorm: false }, { sentence }).items.sort());
    expect(coverageOf('results by route', fb, { sentence }).items).toContain('port_avery_per_flight');
  });
});

// The coverExcludes reader (contract §1, the `itemCovers` data; Lorenzo, 21 Oct: "Add exclusion words where a confusion
// is known"). Stream 2's overlays give every item the excluded entity's words, which round 6's entity rule (tagsAgree,
// coverageIn's dropWhy) already drops — so on today's data the reader changes nothing (see the stream report). It fires
// on an exclusion word that is no entity word, and only when the ask names no word of the item's own side.
describe('coverExcludes stop a cover matching', () => {
  const larkspur = getCaseById('prof-002');
  const withEx = (ex: Record<string, string[]>, covers: Record<string, string[]> = {}) => buildFactBase({
    ...larkspur,
    dataLedger: larkspur.dataLedger.map(d => (ex[d.id] ? { ...d, coverExcludes: ex[d.id] } : d)),
    factAnchors: { ...larkspur.factAnchors!, covers: { ...larkspur.factAnchors!.covers, ...covers } },
  } as never);
  const EX = { fuel_prices: ['charter'] };
  const COV = { fuel_prices: ['fuel price trend'] };
  it('the excluded word in the entry: the hit is dropped, and the ask goes on uncovered', () => {
    expect(coverageOf('the charter fuel price trend', withEx({}, COV)).items).toEqual(['fuel_prices']);
    expect(coverageOf('the charter fuel price trend', withEx(EX, COV)).items).toEqual([]);
    // Dropped FURTHER_CUT's way: the entry is just uncovered — no entity/region drop, so no cover-vetoed deferral.
    expect(coverageOf('the charter fuel price trend', withEx(EX, COV)).rest).toBe('the charter fuel price trend');
  });
  it('the word inside the hit itself does not exclude it', () => {
    expect(coverageOf('the fuel price trend', withEx({ fuel_prices: ['fuel'] }, COV)).items).toEqual(['fuel_prices']);
  });
  it('the ask naming the item\'s own side keeps it (one-directional, as tagsAgree)', () => {
    expect(coverageOf("our charter fuel price trend versus the entrant's", withEx(EX, COV)).items).toEqual(['fuel_prices']);
  });
  it('another list entry\'s word does not exclude it', () => {
    const fb = withEx(EX, COV);
    expect(coverageOf('the fuel price trend, and the charter market', fb).items).toEqual(['fuel_prices']);
  });
  it('an untagged case reads no excludes (literal matching)', () => {
    const brew = getCaseById('prof-001');
    const fb = buildFactBase({ ...brew, dataLedger: brew.dataLedger.map(d => ({ ...d, coverExcludes: ['charter'] })) } as never);
    expect(coverageOf('the charter store count', fb).items).toEqual(coverageOf('the charter store count', buildFactBase(brew as never)).items);
  });
});

// Review F1: `passenger → volume` reached the network-level drivers' covers from a route-level ask. A hit only a
// Phase 1 synonym makes now yields when the ask names one of the case's proper names, outside the hit, that the item's
// own words don't carry — the client's own words aside. b38 Tyler t2's ask names none, so it still matches.
describe('a synonym hit yields to a route the item does not carry', () => {
  const larkspur = getCaseById('prof-002');
  const fb = { ...buildFactBase(larkspur as never), coverNorm: true };
  it('b34 Larkspur Marisol e6432db0 t7 "the Hub-Lakeport fare and passenger split": no network driver line', () => {
    expect(coverageOf('the Hub-Lakeport fare and passenger split', fb).items).toEqual([]);
    expect(coverageOf('the Hub-Lakeport fare and passenger split', fb).promptFacts).toEqual([]);
  });
  it('b22 Larkspur Jordan 9ab76a39 t7 "Hub–Port Avery passengers and fare": the same', () => {
    expect(coverageOf('Hub–Port Avery passengers and fare', fb).items).toEqual([]);
  });
  it('b38 Tyler t2\'s ask names no route: still covered', () => {
    expect(coverageOf(TYLER_WHAT, fb).items).toEqual(['routes_schedule']);
    expect(coverageOf(TYLER_WHAT, fb).promptFacts).toEqual(['planes_as_full']);
  });
  it('the client\'s own name is no route: "Larkspur\'s passengers and fare" is still the network ask', () => {
    expect(coverageOf("Larkspur's passengers and fare", fb).items).toEqual(['routes_schedule']);
  });
  it('a literal cover match is not held to it (no synonym, no yield)', () => {
    expect(coverageOf('average fare by route, Lakeport first', fb).items.sort()).toEqual(['lakeport_fare', 'port_avery_per_flight']);
  });
});

// Review F1: and it does not add a line that repeats, word for word, a line the turn already carries.
describe('a synonym-added cover does not duplicate a line the turn already carries', () => {
  it('repeatsLine: the routes-and-schedule line against the network totals', () => {
    const line = (id: string) => getCaseById('prof-002').dataLedger.find(i => i.id === id)!.value;
    expect(repeatsLine(line('routes_schedule'), line('network_totals'))).toBe(true);
    expect(repeatsLine(line('routes_schedule'), line('lakeport_fare'))).toBe(false);
    expect(repeatsLine(line('fuel_prices'), line('unit_costs'))).toBe(false);
  });
  const SATISFIED = { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
  const planOn = (text: string) => {
    const p = planTurn(readsFixture({ caseId: 'prof-002', phase: 'ANALYSIS', flags: SATISFIED }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    return p;
  };
  it('b34 Larkspur Raj 061ef630 t7 → t8: the network totals go out, the routes line is not added beside them', async () => {
    process.env.ENGINE_SWITCHES = 'prof-002=coverNormalization';
    const p = planOn('Do we have the breakdown of revenue into passengers flown and average fare for both years?');
    const d = await turnDataChecked(p, turn([{ what: 'the revenue breakdown into passengers and average fare', itemIds: ['network_totals'], explicit: true, respond: 'release' }]));
    expect(d.releases.map(r => r.id)).toEqual(['network_totals']);
    expect(acted(p, 'covers_added')).toEqual([]);
  });
  it('with the switch off the dedupe does not run (the covers themselves no longer reach it)', async () => {
    delete process.env.ENGINE_SWITCHES;
    const p = planOn('Do we have the breakdown of revenue into passengers flown and average fare for both years?');
    const d = await turnDataChecked(p, turn([{ what: 'the revenue breakdown into passengers and average fare', itemIds: ['network_totals'], explicit: true, respond: 'release' }]));
    expect(d.releases.map(r => r.id)).toEqual(['network_totals']);
    expect(acted(p, 'covers_added')).toEqual([]);
  });
});
