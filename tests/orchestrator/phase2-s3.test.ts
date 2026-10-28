// Phase 2 S3: the same-turn contradiction rule, the wrap-up remainder, R2's keep (applyModelKeep), and C2's
// never-silent deferral drop (Lorenzo, 27 Oct). Pure: the item lookups are given.
import { describe, it, expect } from 'vitest';
import { dropContradictedRefusals, wontGetToRemainder, composeDataSlot } from '@/lib/orchestrator/turn-composer';
import { applyModelKeep, type AskDecided } from '@/lib/orchestrator/ask-decision';
import type { TurnData } from '@/lib/orchestrator/turn-data';

const base = { releases: [] as { id: string; value: string; earlier: boolean }[], restates: [] as { id: string; value: string }[], exhibit: null as null | { id: string; title: string; covers: string[] }, refusals: [] as string[], defers: [] as string[], gateDefers: [] as string[], unmatchedDefers: [] as string[], offers: [] as string[], requests: [] as TurnData['requests'], gatedIds: [] as string[] };

describe('refusalContradiction (b39q Marisol t6)', () => {
  const named = (p: string) => (/cost to serve/.test(p) ? ['plan_prices_costs'] : /gross margin/.test(p) ? ['plan_prices_costs'] : []);
  const states = (p: string, id: string) => id === 'plan_prices_costs' && /cost to serve/.test(p);
  it('the part the released line states is dropped; the part it does not state is kept', () => {
    const d = { ...base, releases: [{ id: 'plan_prices_costs', value: 'Pro is $100 a month with a $20 monthly cost to serve …', earlier: false }], refusals: ['gross margin and cost to serve per customer by plan'] };
    const { data, changes } = dropContradictedRefusals(d, named, states);
    expect(data.refusals).toEqual(['gross margin']);
    expect(changes[0].by).toEqual(['plan_prices_costs']);
  });
  it('a finer cut beside its coarse item stays (E1: the line does not state the cut)', () => {
    const d = { ...base, releases: [{ id: 'competitor_costs', value: 'The low-cost airline\'s cost per seat is about 30% lower …', earlier: false }], refusals: ['quarter-by-quarter fares and passengers since entry'] };
    const { data } = dropContradictedRefusals(d, () => ['competitor_costs'], () => false);
    expect(data.refusals).toEqual(['quarter-by-quarter fares and passengers since entry']);
  });
  it('nothing given this turn: untouched', () => {
    expect(dropContradictedRefusals({ ...base, refusals: ['x'] }, () => ['a'], () => true).data.refusals).toEqual(['x']);
  });
});

describe('wontGetToGiven (b39h Marcus t24)', () => {
  const named = (p: string) => (/cost per bag/.test(p) ? ['bag_economics'] : []);
  const states = (p: string, id: string) => id === 'bag_economics' && /cost per bag/.test(p);
  it('the part given since is not said; the rest is', () => {
    expect(wontGetToRemainder('cost per bag for chickpea snacks and chip gross margin history', named, states, new Set(['bag_economics']))).toBe('chip gross margin history');
  });
  it('all parts given: no line', () => {
    expect(wontGetToRemainder('cost per bag for chickpea snacks', named, states, new Set(['bag_economics']))).toBeNull();
  });
  it('nothing given: as before', () => {
    expect(wontGetToRemainder('cost per bag for chickpea snacks', named, states, new Set())).toBe('cost per bag for chickpea snacks');
  });
});

describe('C2: a dropped deferral is never silence (b39q e1dd3616 t10)', () => {
  const exhibit = { id: 'exhibit-1', title: 'Quillpath — New customers per month, by plan (average per month)', covers: ['new_customers_by_plan'] };
  const items = { new_customers_by_plan: { id: 'new_customers_by_plan', words: ['New customers per month by plan', 'New Pro sign-ups were 500 a month in 2024, monthly averages'], spoken: 'new customers per month by plan' } } as Record<string, { id: string; words: string[]; spoken: string }>;
  it('holding nothing and wholly about the exhibit: the true refusal of the finer cut', () => {
    const { data } = composeDataSlot({ ...base, exhibit, defers: ['Monthly Pro new sign-ups for 2024 and 2025'] }, '', id => items[id], [], () => true);
    expect(data.defers).toEqual([]);
    expect((data as { refusals: string[] }).refusals).toEqual(['Monthly Pro new sign-ups for 2024 and 2025']);
  });
  it('when that refusal would be false, the deferral stays', () => {
    const { data } = composeDataSlot({ ...base, exhibit, defers: ['Monthly Pro new sign-ups for 2024 and 2025'] }, '', id => items[id], [], () => false);
    expect(data.defers).toEqual(['Monthly Pro new sign-ups for 2024 and 2025']);
  });
});

describe('askModelKeep (R2)', () => {
  const ask = (o: Partial<AskDecided>): AskDecided => ({ words: 'ticket versus extras revenue split', whats: ['ticket versus extras revenue split'], sentence: null, source: 'model', declared: true, outcome: 'release', rule: 'R2', items: ['extras_revenue'], keepable: ['extras_revenue'], old: 'refuse', oldItems: [], agree: false, ...o });
  it('an item today dropped is released, within the cap; today\'s deferral of exactly it goes', () => {
    const d: TurnData = { ...base, defers: ['extras revenue'], requests: [{ request: { what: 'extras revenue', itemIds: ['extras_revenue'], explicit: true, respond: 'release' }, response: 'defer', ledgerItemIds: ['extras_revenue'] }] };
    const { data, changes } = applyModelKeep(d, [ask({})], () => true, 3, () => 'Extras revenue was $20 per passenger.');
    expect(data.releases.map(r => r.id)).toEqual(['extras_revenue']);
    expect(data.defers).toEqual([]);
    expect(changes[0].added).toEqual(['extras_revenue']);
  });
  it('the cap holds; undeclared, non-R2 and unreleasable items are left', () => {
    const full: TurnData = { ...base, releases: [1, 2, 3].map(i => ({ id: `x${i}`, value: '', earlier: false })) };
    expect(applyModelKeep(full, [ask({})], () => true, 3, () => '').changes).toEqual([]);
    expect(applyModelKeep({ ...base }, [ask({ declared: false }), ask({ rule: 'R4' })], () => true, 3, () => '').changes).toEqual([]);
    expect(applyModelKeep({ ...base }, [ask({})], () => false, 3, () => '').changes).toEqual([]);
    // Not keepable: the model declared it a deferral, or it fails the head-noun test (b32 f59f5ea8 t8, b28 t2).
    expect(applyModelKeep({ ...base }, [ask({ keepable: [] })], () => true, 3, () => '').changes).toEqual([]);
  });
});
describe('C2: an answered deferral is dropped silently (b39q f1f3c359 t6)', () => {
  it('a given line states it: no refusal, no deferral', () => {
    const exhibit = { id: 'exhibit-2', title: 'Customers who signed up in January–March 2025 — Status over their first year', covers: ['starter_cohort'] };
    const items = { starter_cohort: { id: 'starter_cohort', words: ['Starter cohort status by month', 'Of the 3,000 Starter customers, churn by month: cancelled by month 1, 3, 6 and 12'], spoken: 'the Starter cohort' } } as Record<string, { id: string; words: string[]; spoken: string }>;
    const { data } = composeDataSlot({ ...base, exhibit, defers: ['Starter cohort churn month by month'] }, '', id => items[id], [], () => true, (_w, ids) => ids.includes('starter_cohort'));
    expect(data.defers).toEqual([]);
    expect((data as { refusals: string[] }).refusals).toEqual([]);
  });
});

describe('refusalCoverage reading (coversAskedWords; measurement)', () => {
  it('covers a part whose nouns the given words say; never a part with no noun', async () => {
    const { coversAskedWords } = await import('@/lib/orchestrator/ask-qualifiers');
    const line = 'Why Pro sign-ups fell — Pro marketing spend, the sales team and demo requests were unchanged';
    expect(coversAskedWords('data on the Pro marketing spend before versus after Starter launched', line)).toBe(true);
    expect(coversAskedWords('quarter-by-quarter fares and passengers since entry', line)).toBe(false);
    expect(coversAskedWords('that', line)).toBe(false);
  });
});
