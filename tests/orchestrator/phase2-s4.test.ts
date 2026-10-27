// Phase 2 S4 (`askMatches`): R3/R4 outcomes applied over today's decisions (Lorenzo, 27 Oct). Pure.
import { describe, it, expect } from 'vitest';
import { applyMatches, type AskDecided } from '@/lib/orchestrator/ask-decision';
import type { TurnData } from '@/lib/orchestrator/turn-data';

const base: TurnData = { releases: [], restates: [], exhibit: null, refusals: [], defers: [], gateDefers: [], unmatchedDefers: [], offers: [], requests: [], gatedIds: [] };
const ask = (o: Partial<AskDecided>): AskDecided => ({ words: '', whats: [], sentence: null, source: 'candidate', declared: true, old: 'none', oldItems: [], outcome: 'release', rule: 'R4', items: [], agree: false, ...o } as AskDecided);
const x = { canGive: () => true, cap: 3, lineOf: (id: string) => `line of ${id}`, spoken: (id: string) => id.replace(/_/g, ' ') };

describe('applyMatches (S4)', () => {
  it('releases an R4 match today said nothing on (b36l a7d9f44e t6: CASM → unit_costs)', () => {
    const { data, changes } = applyMatches(base, [ask({ words: 'how has cost per available seat mile moved', items: ['unit_costs'] })], x);
    expect(data.releases.map(r => r.id)).toEqual(['unit_costs']);
    expect(changes[0]).toMatchObject({ rule: 'R4', from: 'none', to: 'release', added: ['unit_costs'] });
  });
  it('replaces a refusal with the release and refuses the cut beside it (E1)', () => {
    const d = { ...base, refusals: ['fuel cost per gallon'] };
    const { data } = applyMatches(d, [ask({ words: 'do we have fuel cost per gallon', old: 'refuse', rule: 'R3', items: ['fuel_prices'], cut: 'per-gallon fuel cost' })], x);
    expect(data.releases.map(r => r.id)).toEqual(['fuel_prices']);
    expect(data.refusals).toEqual(['per-gallon fuel cost']);
  });
  it('never overrides a deferral today makes (b33 5cfdf48e t2)', () => {
    const d = { ...base, defers: ['the number of stores'] };
    const { data, changes } = applyMatches(d, [ask({ words: 'the store count for both years', old: 'defer', items: ['stores_count'] })], x);
    expect(data.releases).toEqual([]);
    expect(data.defers).toEqual(['the number of stores']);
    expect(changes).toEqual([]);
  });
  it('drops a refusal the order deferral answers, keeping the part another sub-ask refuses (b39l 52904ce7 t20)', () => {
    const d = { ...base, refusals: ['Unserved or underserved city pairs from the hub where no LCC flies or data on whether passengers turned away at peak times'], defers: ["the new routes' planning estimates"],
      requests: [{ request: { what: "the new routes' planning estimates", itemIds: ['new_routes_plan'], explicit: true, respond: 'defer' as const }, response: 'defer' as const, ledgerItemIds: ['new_routes_plan'] }] };
    const asks = [ask({ words: 'unserved or underserved city pairs from the hub where no LCC flies', old: 'point', outcome: 'defer', why: 'order', rule: 'R3', items: ['new_routes_plan'] }),
      ask({ words: 'whether the four healthy routes have spill — passengers turned away at peak times', old: 'refuse', outcome: 'refuse', rule: 'R6', items: [], agree: true })];
    const { data } = applyMatches(d, asks, x);
    expect(data.refusals).toEqual(['data on whether passengers turned away at peak times']);
    expect(data.defers).toEqual(["the new routes' planning estimates"]);
  });
  it('never turns a refusal into a deferral (S2 ruling; b39q dd74b01b t2)', () => {
    const d = { ...base, refusals: ['the split of Starter sign-ups between new prospects and would-be Pro buyers'] };
    const { data } = applyMatches(d, [ask({ words: 'the split of Starter sign-ups between new prospects and would-be Pro buyers', old: 'refuse', outcome: 'defer', why: 'gate', rule: 'R3', items: ['starter_cohort'] })], x);
    expect(data.refusals).toHaveLength(1);
    expect(data.gateDefers).toEqual([]);
  });
  it('a gate deferral where today said nothing is said and booked', () => {
    const { data } = applyMatches(base, [ask({ words: 'ancillary revenue', outcome: 'defer', why: 'gate', items: ['extras_revenue'] })], x);
    expect(data.gateDefers).toEqual(['extras revenue']);
    expect(data.gatedIds).toEqual(['extras_revenue']);
  });
  it('leaves undeclared sub-asks and R2 alone', () => {
    const { changes } = applyMatches(base, [ask({ declared: false, items: ['a'] }), ask({ rule: 'R2', items: ['b'] })], x);
    expect(changes).toEqual([]);
  });
});
