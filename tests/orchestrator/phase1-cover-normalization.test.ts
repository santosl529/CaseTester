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
