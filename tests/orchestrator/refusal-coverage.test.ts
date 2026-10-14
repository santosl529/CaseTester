// Lorenzo, 13 Oct (Larkspur rulings a, round 2): before code says "I don't
// have X", it checks whether a ledger item or the case prompt covers X — the
// case's `factAnchors.covers` phrases, beside the false-refusal reading (F3).
// A ledger item that covers it is given (restated, "As I mentioned: …", when
// already out); a prompt fact is restated; what no item or fact covers in a
// list is still refused. The three refusals the scan found: Raj 55d12d38 t7,
// Omar 9bbf41bc t9, Maya b0b28d36 t8.
import { describe, it, expect } from 'vitest';
import { factBaseFor, coverageOf } from '@/lib/orchestrator/fact-check';
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
  ] as const)('prof-001: "%s"', (what, items, facts, rest) => {
    expect(coverageOf(what, p1)).toEqual({ items, promptFacts: facts, rest });
  });
  it('prof-002: "the low-cost carrier\'s frequency and aircraft size" — the aircraft size is covered, the frequency is not (Omar t9)', () => {
    expect(coverageOf("the low-cost carrier's frequency and aircraft size", p2)).toEqual({ items: ['competitor_costs'], promptFacts: [], rest: "the low-cost carrier's frequency" });
  });
  it.each([
    ['prof-001', 'same-store sales by region'],                 // a cut the case doesn't hold
    ['prof-001', 'same-store transaction counts'],              // traffic, not sales: the store count doesn't answer it (Raj 47ca643f t13)
    ['prof-001', 'same-store transaction volume for both years'],
    ['prof-001', 'how they plan to renew stores'],              // a phrase is a whole word: "renew stores" isn't "new stores"
    ['prof-001', 'net margin by product category'],
    ['prof-001', 'price elasticity and competitor pricing'],
    ['prof-002', "the competitor's schedule"],
  ])('%s: nothing covers "%s"', (id, what) => {
    expect(coverageOf(what, id === 'prof-001' ? p1 : p2)).toEqual({ items: [], promptFacts: [], rest: what });
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
