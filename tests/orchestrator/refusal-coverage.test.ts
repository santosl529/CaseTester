// Lorenzo, 13 Oct (Larkspur rulings a, round 2): before code says "I don't
// have X", it checks whether a ledger item or the case prompt covers X — the
// case's `factAnchors.covers` phrases, beside the false-refusal reading (F3).
// A ledger item that covers it is given (restated, "As I mentioned: …", when
// already out); a prompt fact is restated; what no item or fact covers in a
// list is still refused. The three refusals the scan found: Raj 55d12d38 t7,
// Omar 9bbf41bc t9, Maya b0b28d36 t8.
import { describe, it, expect } from 'vitest';
import { factBaseFor, buildFactBase, coverageOf, statesNoFigure } from '@/lib/orchestrator/fact-check';
import { outsideAskScope } from '@/lib/orchestrator/data-decisions';
import { CaseSchema } from '@/lib/cases/schema';
import { getCaseById } from '@/lib/cases/loader';

const p1 = factBaseFor(getCaseById('prof-001') as never);
const p2 = factBaseFor(getCaseById('prof-002') as never);

describe('what covers an ask', () => {
  it.each([
    ['whether the 15% growth is total or same-store revenue', ['stores_count'], [], null],                 // Raj t7: one question, not a list
    ['same-store sales', ['stores_count'], [], null],
    ['whether the growth came from new stores', ['stores_count'], [], null],
    ['whether the 24% to 6% margin is net margin for the whole chain', [], ['net_margin'], null],         // Maya t8
    // Lorenzo, 15 Oct (batch-25 ruling 7): the case answers volume through the ticket and revenue.
    ['transaction volume by store, same-store versus new', ['avg_ticket', 'stores_count'], [], null],     // Jordan 78c89dba t9
    ['transaction volume per store', ['avg_ticket'], [], null],                                           // Tyler 47563861 t13, Marisol 0f7551c2 t9
    ['same-store transaction counts', ['avg_ticket'], [], null],                                          // Raj 47ca643f t13 (refused before: traffic isn't the store count)
    ['same-store transaction volume for both years', ['avg_ticket'], [], null],
    // Lorenzo, 16 Oct: "transaction volume (or average ticket) per store" is the ticket, not revenue per store.
    ['transaction volume or average ticket per store', ['avg_ticket'], [], null],                         // Marcus 9cb2554f t15 (batch 27), as said
    ['average ticket and transaction data per store', ['avg_ticket'], [], null],                          // Marcus 9cb2554f t15, as the model wrote it
  ] as const)('prof-001: "%s"', (what, items, facts, rest) => {
    expect(coverageOf(what, p1)).toEqual({ items, promptFacts: facts, rest, coarse: [] });
  });
  it('prof-002: "the low-cost carrier\'s frequency and aircraft size" — the aircraft size is covered, the frequency is not (Omar t9)', () => {
    expect(coverageOf("the low-cost carrier's frequency and aircraft size", p2)).toEqual({ items: ['competitor_costs'], promptFacts: [], rest: "the low-cost carrier's frequency", coarse: [] });
  });
  // Lorenzo, 13 Oct (Owen c2cdbcc3 t5): flights are the same and the planes as full — the drop is all fare.
  it('prof-002: "the revenue split between fares and volume" — the same flights, and the prompt\'s planes-as-full fact', () => {
    expect(coverageOf('the revenue split between fares and volume', p2)).toEqual({ items: ['routes_schedule'], promptFacts: ['planes_as_full'], rest: null, coarse: [] });
  });
  it('a phrase across a list keeps the rest of the list: "fares and volume, and the competitor\'s schedule"', () => {
    expect(coverageOf("the revenue split between fares and volume, and the competitor's schedule", p2)).toEqual({ items: ['routes_schedule'], promptFacts: ['planes_as_full'], rest: "the competitor's schedule", coarse: [] });
  });
  it.each([
    ['prof-001', 'what the menu includes, drinks only or food too'],   // Maya c1b79f9e t4: the case doesn't hold it (Lorenzo)
    ['prof-001', 'same-store sales by region'],                 // a cut the case doesn't hold
    ['prof-001', 'transaction volume by region'],               // a cut no phrase names
    ['prof-001', 'transaction counts broken down by customer segment'],   // 567bdb1 t19 on the replay
    ['prof-001', 'transactions per store per day'],
    ['prof-001', 'how they plan to renew stores'],              // a phrase is a whole word: "renew stores" isn't "new stores"
    ['prof-001', 'net margin by product category'],
    ['prof-001', 'price elasticity and competitor pricing'],
    ['prof-002', "the competitor's schedule"],
  ])('%s: nothing covers "%s"', (id, what) => {
    expect(coverageOf(what, id === 'prof-001' ? p1 : p2)).toEqual({ items: [], promptFacts: [], rest: what, coarse: [] });
  });
});

// Round 5 Task 50 (A4; Lorenzo, 20 Oct: B2 Hollis Bay Jasmine t5 "matches D4/E1 —
// the chip-sales-flat line with the bag-count refusal"): a count asked of an item
// that states no figure reaches it only at a coarser cut, unless the cover phrase
// carries the count.
describe('a count asked of an item that states no figure', () => {
  const l1 = factBaseFor(getCaseById('launch-001') as never);
  const item = (c: string, id: string) => getCaseById(c).dataLedger.find(i => i.id === id)!;
  it('Jasmine t5: why_now is the coarse answer to "how many bags of chips Hollis Bay sells a year"', () => {
    const what = 'how many bags of chips Hollis Bay sells a year';
    expect(coverageOf(what, l1)).toEqual({ items: [], promptFacts: [], rest: null, coarse: [{ what, ids: ['why_now'] }] });
    expect(outsideAskScope(what, item('launch-001', 'why_now'))).toBe(true);
  });
  it('D4 unchanged: a trend ask is why_now whole (Tyler t7)', () => {
    const what = "how the chip business's volume has trended year over year, to know whether we're defending a declining base";
    expect(coverageOf(what, l1)).toMatchObject({ items: ['why_now'], coarse: [] });
    expect(outsideAskScope(what, item('launch-001', 'why_now'))).toBe(false);
  });
  it('D2 unchanged: a cover that carries the count keeps the item whole (Marcus t9)', () => {
    expect(coverageOf('how many stores Hollis Bay can get the line into', l1)).toMatchObject({ items: ['retailer_support'], coarse: [] });
  });
  it('a cover phrase that carries the count keeps a figure-less item whole', () => {
    const c = getCaseById('launch-001');
    const fb = buildFactBase({ ...c, factAnchors: { ...c.factAnchors!, covers: { ...c.factAnchors!.covers, why_now: ['how many bags of chips'] } } } as never);
    expect(coverageOf('how many bags of chips Hollis Bay sells a year', fb)).toMatchObject({ items: ['why_now'], coarse: [] });
  });
  it('"a number of" is no count', () => {
    expect(outsideAskScope('whether a number of retailers asked for healthier options', item('launch-001', 'why_now'))).toBe(false);
    expect(outsideAskScope('the number of bags of chips Hollis Bay sells', item('launch-001', 'why_now'))).toBe(true);
  });
  it('a value with a figure, a number word or "no" states one', () => {
    expect(statesNoFigure(item('launch-001', 'why_now').value)).toBe(true);
    expect(statesNoFigure(item('launch-001', 'retailer_support').value)).toBe(false);   // "two largest retail partners"
    expect(statesNoFigure(item('prof-002', 'new_routes_context').value)).toBe(false);  // "No other airline is flying nonstop"
    expect(statesNoFigure(item('launch-001', 'planning_assumptions').value)).toBe(false);
  });
});

describe('the case format', () => {
  it('covers names only ledger items and prompt facts', () => {
    const base = getCaseById('prof-001');
    const bad = { ...base, factAnchors: { ...base.factAnchors!, covers: { no_such_item: ['same-store'] } } };
    expect(CaseSchema.safeParse(bad).success).toBe(false);
    expect(CaseSchema.safeParse(base).success).toBe(true);
  });
});
