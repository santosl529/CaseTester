// Lorenzo, 13 Oct (Larkspur review, item 5): a candidate's quote of an exhibit
// cell or ledger figure is looked up exactly; a misread is corrected in the
// ledger's own words (Tyler 38014721: "14,500 flights" never corrected,
// "$33.6M" took three probes). Every example is a Larkspur line.
import { describe, it, expect } from 'vitest';
import { findCellMisquotes } from '@/lib/orchestrator/cell-lookup';
import { getCaseById } from '@/lib/cases/loader';

const c = getCaseById('prof-002');
const ALL = c.dataLedger.map(d => d.id);
const SHOWN = ['exhibit-1', 'exhibit-2', 'exhibit-3'];
const MATH = { ...c, mathSteps: c.mathSteps };
const flags = (t: string, shown = SHOWN, revealed = ALL) => findCellMisquotes(t, MATH, revealed, shown).map(f => [f.items[0], f.cited]);

describe('misread figures are caught, with the item that corrects them', () => {
  it.each([
    ['Okay, so flights are flat — 14,500 a year in both years, if I have that right — so this isn\'t a capacity story at all.', 'network_totals', '14,500'],
    ['Port Avery: 46.8 down to 33.6, so −$13.2M.', 'route_results_port_avery', '33.6'],
    ['Port Avery FY2023 revenue was $46.8M and FY2025 was $33.6M, so the change is 46.8 − 33.6 = −$13.2M, a drop of about 28%.', 'route_results_port_avery', '$33.6M'],
    ['Combined, I took Lakeport\'s decline of $9.6M — 26.4 down to 16.8 — plus Port Avery\'s $13.2M, from 46.8 down to 33.6.', 'route_results_port_avery', '33.6'],
    ['Priority three, cost: we need the fixed base down, since contribution today is only about $15.4M against roughly $20M of fixed cost.', 'network_totals', '$15.4M'],
    ['At 5,200 flights that\'s about $10.4M of new contribution — against a $4M operating loss.', 'new_routes_cost_flights', '5,200'],
  ])('%s', (text, item, cited) => {
    expect(flags(text)).toEqual([[item, cited]]);
  });
});

describe('right quotes, derived figures and scenarios are left alone', () => {
  it.each([
    'A low-cost carrier entered both in FY2024 with a 30% cost advantage and we matched its fares, which is why load factor held at 75% while fare fell 40% on Lakeport and 33% on Port Avery.',
    'Lakeport: 26.4 down to 16.8, and contribution from 8.4 to a $1.2M loss.',
    'Revenue per flight: 200M / 14,000 ≈ $14,286 in FY2023.',
    'Across all six routes revenue fell from $200M to $176M on 14,000 flights.',
    'If the new routes only reach 60%, contribution would be about $2M.',
    'Plus $17.8M from the four healthy routes, less $20M fixed = $2.8M operating profit.',
    'At 5,000 flights that\'s $10M of new contribution.',
  ])('%s', text => expect(flags(text)).toEqual([]));
  it.each([
    'Port Avery: $14.4M of revenue and $14.4M of contribution.',
    'The entire $24M revenue decline sits in 2 routes.',
    'So breakeven per passenger is $9,000 / 60 = $150, meaning a fare of $130 with $20 of extras.',
    "But if it's $4,200, then across 5,000 flights that's $21M of contribution in year one.",
  ])('a change, a case answer or a computed result is no quote: %s', text => expect(flags(text)).toEqual([]));
  it('a figure shown only by a revealed ledger line is looked up too (Tyler t5: exhibit 1 not yet out)', () => {
    expect(findCellMisquotes('Okay, so flights are flat — 14,500 a year in both years.', c, ['network_totals'], []).map(f => f.items[0])).toEqual(['network_totals']);
  });
  it('an exhibit not yet shown is not looked up', () => {
    const notThree = ALL.filter(id => !(c.exhibits.find(e => e.id === 'exhibit-3')!.coversLedgerItems ?? []).includes(id));
    expect(flags('At 5,200 flights that\'s about $10.4M.', ['exhibit-1'], notThree)).toEqual([]);
  });
});

describe('what keeps a figure from being a quote', () => {
  it.each([
    ["That's $15.4M of contribution today.", 'a computed result'],
    ['If contribution today is $15.4M we still lose money.', 'a hypothetical in its clause'],
    ['Fuel is $4,300 a passenger.', 'a per-passenger rate'],
    ['The new contribution is $15.4M.', 'a derived quantity ("new")'],
  ])('%s — %s', text => expect(flags(text)).toEqual([]));
  it('…and the same figures as quotes are caught', () => {
    expect(flags('Contribution today is $15.4M.')).toEqual([['network_totals', '$15.4M']]);
    expect(flags('Fuel is $4,300.')).toEqual([['lakeport_variable_cost', '$4,300']]);
  });
});

describe('the correction names the right line', () => {
  it("Millbrook's 2,000 flights are the other routes' line, not Lakeport's", async () => {
    const { buildCellFacts } = await import('@/lib/orchestrator/cell-lookup');
    const f = buildCellFacts(c).find(x => x.subject.includes('millbrook') && x.quantity.includes('flights'));
    expect(f?.item).toBe('route_results_other');
  });
});

describe('wired into the misquote check (fact-check F2)', () => {
  it("Tyler t7's 33.6 reaches the correction path, once", async () => {
    const { factBaseFor, findCandidateMisquotes } = await import('@/lib/orchestrator/fact-check');
    const out = findCandidateMisquotes('Port Avery: 46.8 down to 33.6, so −$13.2M.', factBaseFor(c as never), new Set(ALL), SHOWN);
    expect(out).toEqual([expect.objectContaining({ items: ['route_results_port_avery'], cited: '33.6' })]);
  });
});

describe('only table exhibits; projections are no quotes', () => {
  it('prof-001 (a chart, with its own quote grammar) is not looked up — Preston ec02dac7 t11', () => {
    const p1 = getCaseById('prof-001');
    expect(findCellMisquotes('Extrapolate one more year: COGS 66, overhead 15, labor 22.', p1, p1.dataLedger.map(d => d.id), ['exhibit-a'])).toEqual([]);
    expect(findCellMisquotes('Overhead is 15 today.', p1, p1.dataLedger.map(d => d.id), ['exhibit-a'])).toEqual([]);
  });
  it('a projection in a table case', () => {
    expect(flags('Extrapolate one more year: contribution today is $15.4M.')).toEqual([]);
  });
});
