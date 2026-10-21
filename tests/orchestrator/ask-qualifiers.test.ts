// Round 5c Task 61, the qualifier guard (Lorenzo, 20 Oct, ruling 1): "Bare partials:
// build an engine guard. If an ask names a qualifier the item's line doesn't contain
// (a period: FY2024, "since <date>", "today/current", "beyond month N", "later/earlier
// cohorts", "trend"; a scope: industry, competitor(s), market; or a second topic with
// no item), that item counts as partial whatever Haiku labels it, and the refusal names
// the qualifier ("I don't have FY2024 fares.", "I don't have industry benchmarks.")."
// The asks are the second Haiku run's verbatim (r5b-haiku-check.md, haiku5b2-verdicts.json);
// the lines are the ledger's own (server-side, unmasked).
import { describe, it, expect } from 'vitest';
import { askQualifiers, unmetQualifiers, guardRefusal, guardParts, mergeParts, qualifierItems, guardedItems } from '@/lib/orchestrator/ask-qualifiers';
import { contentStems } from '@/lib/orchestrator/data-requests';
import { labelWithPeriod } from '@/lib/orchestrator/data-ledger';
import { getCaseById } from '@/lib/cases/loader';

const lines = (caseId: string, ids: string[]) => ids.map(id => {
  const i = getCaseById(caseId).dataLedger.find(x => x.id === id)!;
  return { id, label: labelWithPeriod(i), value: i.value };
});
const texts = (qs: { kind: string; text: string }[]) => qs.map(q => `${q.kind}:${q.text}`);
// The round-5b `missing` rule as the guard must keep it: no word the ask lacks, no figure the ask lacks.
const fromAsk = (phrase: string, what: string) => {
  const asked = new Set(contentStems(what));
  const figs = (t: string): string[] => t.match(/\d+/g) ?? [];
  return contentStems(phrase).every(w => asked.has(w)) && figs(phrase).every(f => figs(what).includes(f));
};

// The five bare partials of the second run, and the items Haiku mapped.
const BARE = [
  { n: 18, caseId: 'prof-001', what: 'current waste rates and bean contracting terms', ids: ['bean_price_change', 'bean_share_of_cogs'], said: 'current waste rates or bean contracting terms' },
  { n: 36, caseId: 'prof-001', what: 'industry input cost inflation benchmarks', ids: ['non_bean_input_change', 'bean_price_change'], said: 'industry benchmarks' },
  { n: 49, caseId: 'prof-002', what: 'the fare trend across FY2024 and FY2025', ids: ['lakeport_fare', 'port_avery_per_flight'], said: 'FY2024 fares' },
  { n: 63, caseId: 'pricing-001', what: 'upgrade rates for later cohorts', ids: ['starter_cohort', 'cohort_notes'], said: "later cohorts' upgrade rates" },
  { n: 66, caseId: 'pricing-001', what: "how Pro's CAC has moved since January 2025", ids: ['plan_cac'], said: "Pro's CAC since January 2025" },
];

describe('askQualifiers: what an ask names beyond its quantity', () => {
  it('periods: a fiscal year, "since <date>", "current", "later cohorts", a trend', () => {
    expect(texts(askQualifiers('the fare trend across FY2024 and FY2025'))).toEqual(['period:trend', 'period:FY2024', 'period:FY2025']);
    expect(texts(askQualifiers("how Pro's CAC has moved since January 2025"))).toEqual(['period:has moved', 'period:since January 2025']);
    expect(texts(askQualifiers('upgrade rates for later cohorts'))).toEqual(['period:later cohorts']);
    expect(texts(askQualifiers('Starter cohort beyond month 12'))).toEqual(['period:beyond month 12']);
    expect(texts(askQualifiers('COGS as a share of revenue today'))).toEqual(['period:today']);
    expect(texts(askQualifiers('Q3 2024 sales'))).toEqual(['period:Q3 2024']);
  });
  it('scopes: industry, benchmark(s), competitor(s); "market share" is a quantity, not a scope', () => {
    expect(texts(askQualifiers('industry input cost inflation benchmarks'))).toEqual(['scope:industry', 'scope:benchmarks']);
    expect(texts(askQualifiers('competitor pricing'))).toEqual(['scope:competitor']);
    expect(texts(askQualifiers("Kelvexa's market share in Europe"))).toEqual([]);
  });
  it('topics: each conjunct with its own content noun, when there are two or more', () => {
    expect(texts(askQualifiers('current waste rates and bean contracting terms'))).toEqual(['period:current', 'topic:current waste rates', 'topic:bean contracting terms']);
    expect(texts(askQualifiers('the partner deal terms, including royalty step-downs and rights reversion')))
      .toEqual(['topic:the partner deal terms', 'topic:royalty step-downs', 'topic:rights reversion']);
    // "FY2025" has no content noun of its own: one conjunct, no topic.
    expect(askQualifiers('the fare trend across FY2024 and FY2025').some(q => q.kind === 'topic')).toBe(false);
    // A question's alternatives are one ask.
    expect(askQualifiers('whether the locations are company-owned or franchised')).toEqual([]);
  });
  it('true full asks name no qualifier: #12, #67', () => {
    expect(askQualifiers('operating margin over the period')).toEqual([]);
    expect(askQualifiers('churn for upgraded customers measured from their upgrade date')).toEqual([]);
  });
});

describe('unmetQualifiers: the qualifiers no mapped item\'s line or label states', () => {
  it.each(BARE)('#$n "$what" → unmet', ({ caseId, what, ids }) => {
    expect(unmetQualifiers(what, lines(caseId, ids)).length).toBeGreaterThan(0);
  });
  it('#49: FY2025 and the trend are on the Lakeport line ("fell from $200 in FY2023 to $120 in FY2025"); FY2024 is on none', () => {
    expect(texts(unmetQualifiers('the fare trend across FY2024 and FY2025', lines('prof-002', ['lakeport_fare', 'port_avery_per_flight'])))).toEqual(['period:FY2024']);
  });
  it('#66: a CAC that "does not change with volume" states no change over time, and no date', () => {
    expect(texts(unmetQualifiers("how Pro's CAC has moved since January 2025", lines('pricing-001', ['plan_cac'])))).toEqual(['period:has moved', 'period:since January 2025']);
  });
  it('#18: neither topic is on either line', () => {
    expect(texts(unmetQualifiers('current waste rates and bean contracting terms', lines('prof-001', ['bean_price_change', 'bean_share_of_cogs']))))
      .toEqual(['period:current', 'topic:current waste rates', 'topic:bean contracting terms']);
  });
  it('#42: the deal terms are on Option B\'s line (partner, terms); the royalty step-downs and the rights reversion are not', () => {
    expect(texts(unmetQualifiers('the partner deal terms, including royalty step-downs and rights reversion', lines('entry-001', ['option_b']))))
      .toEqual(['topic:royalty step-downs', 'topic:rights reversion']);
  });
  it('a qualifier the line states is met: the asked period on the line, a trend the line states, the month beyond', () => {
    expect(unmetQualifiers('the Lakeport fare in FY2025', lines('prof-002', ['lakeport_fare']))).toEqual([]);
    expect(unmetQualifiers('COGS as a share of revenue today', lines('prof-001', ['cogs_pct']))).toEqual([]);
    expect(unmetQualifiers('the COGS trend', lines('prof-001', ['cogs_pct']))).toEqual([]);
    expect(unmetQualifiers('the menu price trend', lines('prof-001', ['menu_price_change']))).toEqual([]);   // "have not changed in two years"
    expect(unmetQualifiers('Starter cohort beyond month 12', lines('pricing-001', ['starter_cohort', 'cohort_notes']))).toEqual([]);
    expect(unmetQualifiers('competitor pricing', lines('pricing-001', ['competitor_prices']))).toEqual([]);
    expect(unmetQualifiers("Kelvexa's European sales since 2022", lines('entry-001', ['kelvexa_product']))).toEqual([]);
    expect(unmetQualifiers('current upgrade timing', lines('pricing-001', ['upgrade_timing']))).toEqual([]);   // no period on the item: current
  });
  it('a topic another mapped item states is met (#55 shape: one item per conjunct)', () => {
    expect(unmetQualifiers('the Lakeport fare and the Port Avery fare', lines('prof-002', ['lakeport_fare', 'port_avery_per_flight']))).toEqual([]);
  });
});

describe('guardRefusal: the qualifier and the ask\'s head noun, in the ask\'s own words', () => {
  it.each(BARE)('#$n "$what" → "$said"', ({ caseId, what, ids, said }) => {
    const phrase = guardRefusal(what, unmetQualifiers(what, lines(caseId, ids)));
    expect(phrase).toBe(said);
    expect(fromAsk(phrase, what)).toBe(true);
  });
  it('"current waste rates" alone, against the prior-period bean share → "current waste rates"', () => {
    expect(guardRefusal('current waste rates', unmetQualifiers('current waste rates', lines('prof-001', ['bean_share_of_cogs'])))).toBe('current waste rates');
  });
  it('#13: both conjuncts, competitor pricing included ("Competitor pricing gets no word" in r5b)', () => {
    const what = 'competitor pricing and price elasticity from past increases';
    expect(guardParts(what, unmetQualifiers(what, lines('prof-001', ['menu_price_change'])))).toEqual(['competitor pricing', 'price elasticity from past increases']);
  });
  it('a period with no phrase form of its own, or a trend alone: the conjunct in the ask\'s words', () => {
    const what = "Kelvexa's European sales trajectory since 2022";
    expect(guardRefusal(what, unmetQualifiers(what, lines('entry-001', ['kelvexa_product'])))).toBe(what);
  });
  it('two years unmet → both before the noun ("FY2024 and FY2025 fares")', () => {
    const what = 'the fare trend across FY2024 and FY2025';
    expect(guardRefusal(what, [{ kind: 'period', text: 'FY2024' }, { kind: 'period', text: 'FY2025' }])).toBe('FY2024 and FY2025 fares');
  });
  it('nothing unmet → no phrase', () => {
    expect(guardParts('upgrade rates for later cohorts', [])).toEqual([]);
  });
});

// The corpus's model-mapped releases (b28–b35, 358 rows) read through the guard: wordings that
// must not read as a missing topic or period (the guard is not on that path; the same words can
// reach the check).
describe('no false qualifier: periods, lists and figures in the ask', () => {
  const ledger = (caseId: string) => getCaseById(caseId).dataLedger;
  const items = (caseId: string, ids: string[]) => qualifierItems(ids.map(id => ledger(caseId).find(i => i.id === id)!), ledger(caseId), i => labelWithPeriod(i as Parameters<typeof labelWithPeriod>[0]));
  it('a period phrase after a comma is no topic ("labor as a percent of revenue, both years"; b28 Sofia t3)', () => {
    expect(askQualifiers('labor as a percent of revenue, both years')).toEqual([]);
    expect(askQualifiers('labor as a percent of revenue, two years ago versus today').map(q => q.kind)).toEqual(['period']);
    expect(askQualifiers('COGS as a percent of revenue, year one versus today').map(q => q.kind)).toEqual(['period']);
  });
  it('a list inside parentheses, after "between", inside a clause, or in a figure is one conjunct', () => {
    expect(askQualifiers('the cost structure (COGS, labor and overhead as a share of revenue)')).toEqual([]);
    expect(askQualifiers('the split between new-store and same-store revenue')).toEqual([]);
    expect(askQualifiers('the share of covered lives where Nimbrel has exclusive or preferred status')).toEqual([]);
    expect(askQualifiers('Payer interview data on willingness to cover Kelvexa at $10,000 list price')).toEqual([]);
    // A question is one ask, its comma included (b34a Marisol t19).
    expect(askQualifiers("how the board's threshold is defined, net sales versus what Aldermoor keeps")).toEqual([]);
  });
  it('a one-noun piece joins its neighbour ("the COGS breakdown by coffee, dairy and packaging"; "bean and dairy purchasing terms")', () => {
    expect(askQualifiers('the COGS breakdown by coffee, dairy and packaging')).toEqual([]);
    expect(texts(askQualifiers('bean and dairy purchasing terms, supplier count, and hedging'))).toEqual(['topic:bean and dairy purchasing terms', 'topic:supplier count, and hedging']);
  });
  it('the case\'s compared years stand for a line that names none (Larkspur network totals: FY2023 and FY2025)', () => {
    expect(unmetQualifiers('total operating cost, FY2023 vs. FY2025', items('prof-002', ['network_totals']))).toEqual([]);
    expect(texts(unmetQualifiers('the fare trend across FY2024 and FY2025', items('prof-002', ['port_avery_per_flight'])))).toEqual(['period:FY2024']);
  });
  it('words common to the case tell no topic apart: Nimbrel is "the current US standard of care" (b34a Raj t11)', () => {
    const what = 'the competitive set and the current US standard of care';
    expect(unmetQualifiers(what, items('entry-001', ['nimbrel']), ledger('entry-001'))).toEqual([]);
    // … while "bean contracting terms" stays unmet ("bean" is on the bean lines, the contracting terms are not).
    expect(texts(unmetQualifiers('current waste rates and bean contracting terms', items('prof-001', ['bean_price_change', 'bean_share_of_cogs']), ledger('prof-001'))))
      .toEqual(['period:current', 'topic:current waste rates', 'topic:bean contracting terms']);
  });
  it('a competitor named without the word: "How Kelvexa compares with Nimbrel in trials" (b34a Raj t11)', () => {
    expect(unmetQualifiers('how Kelvexa compares with competitors in clinical trials', items('entry-001', ['trial_comparison']))).toEqual([]);
  });
  it('"since launch" against "before and after Starter launched" (b35q Marisol t5)', () => {
    expect(unmetQualifiers('monthly new-signup counts by plan since launch', items('pricing-001', ['new_customers_by_plan']))).toEqual([]);
  });
  it('a head phrase ends at its punctuation: "total departures, FY2023 vs FY2025" with FY2025 unmet → "FY2025 total departures"', () => {
    const what = 'average fare and total departures, FY2023 vs FY2025';
    const p = guardRefusal(what, [{ kind: 'period', text: 'FY2025' }]);
    expect(p).toBe('FY2025 total departures');
    expect(fromAsk(p, what)).toBe(true);
  });
});

describe('mergeParts: the check\'s own valid parts beside the guard\'s', () => {
  it('a part the guard\'s parts already say is not said again; one that adds words replaces those it covers; the ask\'s order', () => {
    const what = 'the partner deal terms, including royalty step-downs and rights reversion';
    expect(mergeParts(['royalty step-downs', 'rights reversion'], ['royalty step-downs and rights reversion'], what)).toEqual(['royalty step-downs', 'rights reversion']);
    expect(mergeParts(['rights reversion'], ['royalty step-downs and rights reversion'], what)).toEqual(['royalty step-downs and rights reversion']);
    expect(mergeParts(['a velocity benchmark'], ['store count'], 'store count and a velocity benchmark')).toEqual(['store count', 'a velocity benchmark']);
  });
});

// Task 61 fix round 2 (Opus review of d154476..856195f; the reviewer's repro asks and the controller's rulings):
// a line that states the period, the trend or the scope keeps the item full.
describe('fix round 2: lines that state the period, trend or scope stay full', () => {
  const ledger = (caseId: string) => getCaseById(caseId).dataLedger;
  const items = (caseId: string, ids: string[]) => qualifierItems(ids.map(id => ledger(caseId).find(i => i.id === id)!), ledger(caseId), i => labelWithPeriod(i as Parameters<typeof labelWithPeriod>[0]));
  const FULL: [string, string, string[]][] = [
    // 1a: "since FY…" read with its prefix
    ['prof-002', 'the fleet since FY2023', ['fleet']],
    ['prof-002', 'changes to the route network since FY2023', ['routes_schedule']],
    // 1b: "no material changes", "the same … as in <period>"
    ['prof-002', 'how wages have changed', ['unit_costs']],
    ['prof-002', 'whether costs per flight have changed', ['unit_costs']],
    ['prof-002', 'wage trend', ['unit_costs']],
    ['prof-002', 'the trend in wages and costs per flight', ['unit_costs']],
    // 1c: a series over months
    ['pricing-001', 'Pro retention over time', ['pro_cohort']],
    ['pricing-001', 'Starter churn over time', ['starter_cohort']],
    ['pricing-001', 'Starter upgrade rates over time', ['starter_cohort']],
    ['pricing-001', 'cancellation rates over time', ['pro_cohort', 'starter_cohort']],
    // 1d: a from→to line with no timeframes takes the case's two periods
    ['prof-002', 'FY2025 revenue on the other four routes', ['route_results_other']],
    ['prof-002', 'revenue on the other routes in FY2023 and FY2025', ['route_results_other']],
    ['prof-002', 'the fleet in FY2025', ['fleet']],
    // a case that names no compared years and a line that names no year: no asked year can be ruled out
    ['pricing-001', 'Pro CAC in 2025', ['plan_cac']],
    // 2: scopes the line already carries
    ['launch-001', 'market prices for chickpea snacks', ['competitor_prices']],
    ['launch-001', 'Competitor pricing data to understand current market positioning', ['competitor_prices']],
    ['pricing-001', 'Competitor pricing data to understand current market positioning', ['competitor_prices']],
    ['entry-001', "the US market for Corlan's disease", ['funnel_rates', 'us_adults']],
    ['prof-002', 'industry demand', ['demand']],
    ['prof-002', 'the market demand trend', ['demand']],
    ['launch-001', 'benchmarks from past launches', ['planning_assumptions']],
    ['launch-001', 'conversion benchmarks', ['planning_assumptions', 'survey_reliability']],
    ['launch-001', 'industry pricing for chickpea snacks', ['competitor_prices']],
    ['entry-001', 'industry benchmarks for time to coverage', ['insurance_coverage']],   // "new drugs often take 12–18 months"
    // a one-noun piece of its own only when an article leads it: "historical trend" stays with "current"
    ['prof-001', 'Labor as a percentage of revenue, current and historical trend', ['labor_pct']],
  ];
  it.each(FULL)('%s "%s" → no unmet qualifier', (caseId, what, ids) => {
    expect(texts(unmetQualifiers(what, items(caseId, ids), ledger(caseId)))).toEqual([]);
  });
  it('#36 "industry input cost inflation benchmarks" stays flagged: the company\'s own cost lines carry no market, industry or benchmark word', () => {
    expect(texts(unmetQualifiers('industry input cost inflation benchmarks', items('prof-001', ['non_bean_input_change', 'bean_price_change']), ledger('prof-001')))).toEqual(['scope:industry', 'scope:benchmarks']);
  });
  it('true gaps stay flagged: the revenue trend on a current-only line, current bean prices on a change-only line', () => {
    expect(texts(unmetQualifiers('revenue trend', items('prof-001', ['revenue_total']), ledger('prof-001')))).toEqual(['period:trend']);
    expect(texts(unmetQualifiers('current bean prices', items('prof-001', ['bean_price_change']), ledger('prof-001')))).toEqual(['period:current']);
  });
  it('3: a benchmark head keeps the noun before it ("velocity benchmarks", "pricing benchmarks"), never a bare "benchmark"', () => {
    expect(guardRefusal('Competitor pricing benchmark', [{ kind: 'scope', text: 'benchmark' }])).toBe('pricing benchmarks');
    expect(guardRefusal('Velocity benchmark (sales rate per store or per unit of shelf space)', [{ kind: 'scope', text: 'benchmark' }])).toBe('velocity benchmarks');
    expect(guardRefusal('industry input cost inflation benchmarks', [{ kind: 'scope', text: 'industry' }, { kind: 'scope', text: 'benchmarks' }])).toBe('industry benchmarks');
    expect(guardRefusal('industry benchmarks for time to coverage', [{ kind: 'scope', text: 'industry' }])).toBe('industry benchmarks');
  });
  it('4: a phrase built on the head keeps the ask\'s article when nothing goes before the head', () => {
    expect(guardRefusal('the fleet since FY2023', [{ kind: 'period', text: 'since FY2023' }])).toBe('the fleet since FY2023');
    expect(guardRefusal('the fare trend across FY2024 and FY2025', [{ kind: 'period', text: 'FY2024' }])).toBe('FY2024 fares');
  });
});

describe('fix round 2: a period per conjunct', () => {
  it('"the FY2024 fare and the current load factor" is two conjuncts; FY2024 is judged on the fare\'s items only', () => {
    expect(texts(askQualifiers('the FY2024 fare and the current load factor')).filter(t => t.startsWith('topic'))).toEqual(['topic:the FY2024 fare', 'topic:the current load factor']);
  });
});

describe('fix round 2: a period judged on its own conjunct\'s items', () => {
  const ledger = getCaseById('prof-002').dataLedger;
  const items = (ids: string[]) => qualifierItems(ids.map(id => ledger.find(i => i.id === id)!), ledger, i => labelWithPeriod(i as Parameters<typeof labelWithPeriod>[0]));
  it('"the FY2024 load factor and the competitor\'s entry": FY2024 is on the entry\'s line, not the load factor\'s → unmet, and only the load factor item partial', () => {
    const what = "the FY2024 load factor and the competitor's entry";
    const its = items(['lakeport_seats_load', 'competitor_entry']);
    const unmet = unmetQualifiers(what, its, ledger);
    expect(texts(unmet)).toEqual(['period:FY2024']);
    expect(guardedItems(what, its, unmet, ledger)).toEqual(['lakeport_seats_load']);
    expect(guardRefusal(what, unmet)).toBe('the FY2024 load factor');
  });
});

// Task 61 fix round 3 (Opus re-review of 856195f..88da114; the controller's rulings).
describe('fix round 3', () => {
  const ledger = (caseId: string) => getCaseById(caseId).dataLedger;
  const items = (caseId: string, ids: string[]) => qualifierItems(ids.map(id => ledger(caseId).find(i => i.id === id)!), ledger(caseId), i => labelWithPeriod(i as Parameters<typeof labelWithPeriod>[0]));
  const unmetOf = (caseId: string, what: string, ids: string[]) => texts(unmetQualifiers(what, items(caseId, ids), ledger(caseId)));
  it.each([
    // 1: "since FY2023" on a line spanning FY2023→FY2025 with no year in its text
    ['prof-002', 'how network revenue has moved since FY2023', ['network_totals']],
    ['prof-002', 'Port Avery revenue since FY2023', ['route_results_port_avery']],
    ['prof-002', 'the Port Avery fare since FY2023', ['port_avery_per_flight']],
    ['prof-002', 'fuel prices since FY2023', ['fuel_prices']],
    ['prof-002', 'demand since FY2023', ['demand']],
    // 2: still met via "eligible"/"patients"
    ['entry-001', "the US market for Corlan's disease", ['funnel_rates', 'us_adults']],
    // 3: a line with no today/current/now marker waives an asked year in a case with no compared years
    ['pricing-001', 'Pro CAC in 2025', ['plan_cac']],
  ] as [string, string, string[]][])('stays full: %s "%s"', (caseId, what, ids) => {
    expect(unmetOf(caseId, what, ids)).toEqual([]);
  });
  it.each([
    // 2: "usually" is no benchmark; total/overall/size/adults are no market
    ['pricing-001', 'industry upgrade benchmarks', ['upgrade_timing'], ['scope:industry', 'scope:benchmarks']],
    ['pricing-001', 'market demand for Starter', ['new_customers_by_plan'], ['scope:market']],
    ['prof-001', 'market share in the coffee market', ['revenue_total'], ['scope:market']],
    // 3: a line saying "today" rules out 2024
    ['pricing-001', 'Starter customers at the end of 2024', ['existing_starter_customers'], ['period:2024']],
    // 4: "the same as Larkspur's current fares" is a comparison, not a change over time
    ['prof-002', "how the competitor's fares have changed", ['competitor_costs'], ['period:have changed']],
    ['prof-002', "the competitor's cost per seat since FY2023", ['competitor_costs'], ['period:since FY2023']],
  ] as [string, string, string[], string[]][])('flags: %s "%s"', (caseId, what, ids, unmet) => {
    expect(unmetOf(caseId, what, ids)).toEqual(unmet);
  });
  it('5: the ask\'s article stays when a year goes before the head; after a possessive the year follows it', () => {
    expect(guardRefusal('the Lakeport load factor in FY2024', [{ kind: 'period', text: 'FY2024' }])).toBe('the FY2024 Lakeport load factor');
    expect(guardRefusal("the competitor's fares in FY2023", [{ kind: 'period', text: 'FY2023' }])).toBe("the competitor's FY2023 fares");
    expect(guardRefusal('the fare trend across FY2024 and FY2025', [{ kind: 'period', text: 'FY2024' }])).toBe('FY2024 fares');
  });
  it('6: a period said in two conjuncts is said once per part', () => {
    const what = "fuel prices since FY2023 and the competitor's costs since FY2023";
    const parts = guardParts(what, unmetQualifiers(what, items('prof-002', ['fuel_prices', 'competitor_costs']), ledger('prof-002')));
    expect(parts.every(p => (p.match(/since FY2023/g) ?? []).length === 1)).toBe(true);
    expect(parts).toEqual(["the competitor's costs since FY2023"]);
    // The same period handed twice with no place in the ask: said once.
    expect(guardRefusal('fuel prices since FY2023', [{ kind: 'period', text: 'since FY2023' }, { kind: 'period', text: 'since FY2023' }])).toBe('fuel prices since FY2023');
  });
});

// Task 61 fix round 4 (the controller's rulings).
describe('fix round 4', () => {
  const ledger = (caseId: string) => getCaseById(caseId).dataLedger;
  const items = (caseId: string, ids: string[]) => qualifierItems(ids.map(id => ledger(caseId).find(i => i.id === id)!), ledger(caseId), i => labelWithPeriod(i as Parameters<typeof labelWithPeriod>[0]));
  const refusal = (caseId: string, what: string, ids: string[]) => guardRefusal(what, unmetQualifiers(what, items(caseId, ids), ledger(caseId)));
  it('a company\'s own average is no benchmark: the refusal names the benchmark', () => {
    expect(refusal('prof-002', 'fare benchmarks', ['lakeport_fare'])).toBe('fare benchmarks');
    expect(refusal('prof-001', 'average ticket benchmarks', ['avg_ticket'])).toBe('average ticket benchmarks');
    expect(refusal('prof-001', 'revenue per store benchmarks', ['revenue_per_store'])).toBe('revenue per store benchmarks');
    expect(refusal('entry-001', 'discount benchmarks', ['kelvexa_pricing'])).toBe('discount benchmarks');
  });
  it('… while past launches still meet it, and #36 still flags', () => {
    expect(unmetQualifiers('benchmarks from past launches', items('launch-001', ['planning_assumptions']), ledger('launch-001'))).toEqual([]);
    expect(refusal('prof-001', 'industry input cost inflation benchmarks', ['non_bean_input_change', 'bean_price_change'])).toBe('industry benchmarks');
  });
  it('"a" before a period that opens with a vowel sound is "an": "an FY2024 load factor"', () => {
    expect(guardRefusal('a load factor in FY2024', [{ kind: 'period', text: 'FY2024' }])).toBe('an FY2024 load factor');
    expect(guardRefusal('a fare in 2024', [{ kind: 'period', text: '2024' }])).toBe('a 2024 fare');
  });
});
