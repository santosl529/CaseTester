// Lorenzo, 13 Oct (Larkspur rulings, b): the exact lookup covers the ledger
// figures no exhibit shows — Port Avery's $11,000 variable cost, its $240 →
// $160 fares — out only once their line is released, and report-only on the
// new cases until it is checked on the Larkspur re-run.
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: new Proxy({}, { get: (_t, prop) => () => { throw new Error(`db.${String(prop)} used in plan`); } }) }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: () => new Promise(() => {}) }));
import { buildCellFacts, findCellMisquotes } from '@/lib/orchestrator/cell-lookup';
import { factBaseFor, findCandidateMisquotes } from '@/lib/orchestrator/fact-check';
import { planTurn } from '@/lib/orchestrator/plan-turn';
import { getCaseById } from '@/lib/cases/loader';
import { readsFixture } from './fixtures/turn-reads';

const c = getCaseById('prof-002');
const SHOWN = ['exhibit-1', 'exhibit-2'];
const REVEALED = ['route_results_port_avery', 'port_avery_per_flight'];
const flags = (t: string, revealed = REVEALED) => findCellMisquotes(t, c, revealed, SHOWN).map(f => [f.items[0], f.cited]);
const short = (x: { subject: string[]; quantity: string[]; period: string | null; value: number; kind: string; per?: string }) =>
  ({ quantity: x.quantity[0], value: x.value, kind: x.kind, period: x.period, per: x.per ?? null, port: x.subject.includes('port avery') });

describe('facts from ledger lines no exhibit shows', () => {
  it("Port Avery's line: seats, load factor, extras, variable cost, and the fare in each year", () => {
    const facts = buildCellFacts(c).filter(x => x.item === 'port_avery_per_flight');
    expect(facts.every(x => x.exhibit === null)).toBe(true);
    expect(facts.map(short)).toEqual([
      { quantity: 'seats', value: 80, kind: 'count', period: null, per: null, port: true },
      { quantity: 'load factor', value: 75, kind: 'percent', period: null, per: null, port: true },
      { quantity: 'extras', value: 20, kind: 'money', period: null, per: 'passenger', port: true },
      { quantity: 'variable cost', value: 11000, kind: 'money', period: null, per: 'flight', port: true },
      { quantity: 'fare', value: 240, kind: 'money', period: '2023', per: null, port: true },
      { quantity: 'fare', value: 160, kind: 'money', period: '2025', per: null, port: true },
    ]);
  });
  it('a line an exhibit shows gives no ledger facts (the table does)', () => {
    expect(buildCellFacts(c).filter(x => x.item === 'route_results_lakeport' && x.exhibit === null)).toEqual([]);
  });
  it.each([
    ['fleet', '"80-seat" describes the jets'],
    ['aircraft_leases', 'a year'],
    ['competitor_costs', '"30% lower" is a difference'],
  ])('%s: none (%s)', id => expect(buildCellFacts(c).filter(x => x.item === id)).toEqual([]));
  it('a range is no figure ("6–12 months"); the first-year load factor is', () => {
    expect(buildCellFacts(c).filter(x => x.item === 'new_route_rampup').map(short)).toEqual([
      { quantity: 'load factor', value: 60, kind: 'percent', period: null, per: null, port: false },
    ]);
  });
  it('the other cases: counts, money and shares named in the line', () => {
    const facts = (id: string, item: string) => buildCellFacts(getCaseById(id)).filter(x => x.item === item).map(x => [x.quantity[0], x.value, x.kind, x.per ?? null]);
    expect(facts('entry-001', 'specialist_concentration')).toEqual([['us specialists', 6000, 'count', null], ['moderate-to-severe patients', 80, 'percent', null]]);
    expect(facts('entry-001', 'nimbrel')).toEqual([['net price', 9000, 'money', 'patient']]);
    expect(facts('pricing-001', 'company_size')).toEqual([['paying customers', 20000, 'count', null]]);
    expect(facts('launch-001', 'competitor_prices')).toEqual([]);
    expect(facts('launch-001', 'cannibalization')).toEqual([]);    // "Fewer than 5%" is a bound
    expect(facts('pricing-001', 'market_growth')).toEqual([]);     // "growing about 10% a year" is a change
  });
});

describe('what is not a figure of a ledger line (synthetic lines)', () => {
  const line = (value: string) => buildCellFacts({ dataLedger: [{ id: 'x', value }], exhibits: [] }).map(x => [x.quantity[0], x.value]);
  it.each([
    ['Load factor is 60–70% on the new routes.', [], 'a range'],
    ['Jets are 80-seat regional jets.', [], 'a size'],
    ['In FY2023 flights were 14,000.', [['flights', 14000]], 'a year'],
    ['The average transaction is $6.80, about a 10% increase.', [['transaction', 6.8]], 'a change after'],
    ['COGS rose by 16% of revenue over two years.', [], 'a change before'],
  ])('%s', (value, expected) => expect(line(value)).toEqual(expected));
});

describe('a misread of a released ledger figure is caught', () => {
  it.each([
    ["Port Avery's variable cost is $12,000 per flight.", '$12,000'],
    ['Port Avery variable cost is $12,000.', '$12,000'],
    ['On Port Avery the fare fell from $240 to $170.', '$170'],
    ['The Port Avery fare today is $170.', '$170'],
  ])('%s', (text, cited) => expect(flags(text)).toEqual([['port_avery_per_flight', cited]]));
  it.each([
    "Port Avery's variable cost is $11,000 per flight.",
    'On Port Avery the fare fell from $240 to $160.',
    'Extras are $20 per passenger on Port Avery too.',
    'Port Avery revenue per flight is $15,600.',
    'If the Port Avery fare were $170 we would break even.',
  ])('right, derived or hypothetical: %s', text => expect(flags(text)).toEqual([]));
  it('not before the line is released', () => {
    expect(flags("Port Avery's variable cost is $12,000 per flight.", ['route_results_port_avery'])).toEqual([]);
  });
  it('a per-flight figure an exhibit shows is still left alone (no ledger fact of that rate)', () => {
    expect(flags('Lakeport variable cost is $9,500 per flight.')).toEqual([]);
  });
});

describe('a rate is a rate', () => {
  it('no rate said: the figure is read against the line without one (prof-001: total revenue, not revenue per store)', () => {
    const p1 = getCaseById('prof-001');
    expect(findCellMisquotes('Revenue is $2.5M.', p1, ['revenue_total', 'revenue_per_store'], [])).toEqual([]);
    expect(findCellMisquotes('Revenue is $500M.', p1, ['revenue_total', 'revenue_per_store'], []).map(f => f.items[0])).toEqual(['revenue_total']);
  });
});

describe('report-only until checked on the re-run', () => {
  it('through the misquote check the ledger flag comes back report-only; an exhibit cell flag stays live', () => {
    const out = findCandidateMisquotes("Port Avery's variable cost is $12,000 per flight. Port Avery: 46.8 down to 33.6.", factBaseFor(c as never), new Set(REVEALED), SHOWN);
    expect(out.map(m => [m.items[0], m.cited, Boolean(m.reportOnly)])).toEqual([
      ['port_avery_per_flight', '$12,000', true],
      ['route_results_port_avery', '33.6', false],
    ]);
  });
  it('no case has the ledger lookup live yet', () => {
    expect(['prof-001', 'prof-002', 'entry-001', 'pricing-001', 'launch-001'].map(id => Boolean(getCaseById(id).ledgerLookupLive))).toEqual([false, false, false, false, false]);
  });
  it('in a turn: no correction and no MISQUOTE hint; the flag is logged', () => {
    const p = planTurn(readsFixture({ caseId: 'prof-002', phase: 'ANALYSIS', revealed: REVEALED, flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } } }),
      "So Port Avery's variable cost is $12,000 per flight, and that's why it loses money.", { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    expect(p.state.misquote ?? null).toBeNull();
    expect(JSON.stringify(p.state)).not.toMatch(/MISQUOTE:/);
    expect(p.ctx.checks.entries.find(x => x.check === 'misquote_report_only')).toMatchObject({ detail: { flags: [expect.objectContaining({ item: 'port_avery_per_flight', cited: '$12,000' })] } });
  });
});
