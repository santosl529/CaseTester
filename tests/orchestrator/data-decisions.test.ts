import { describe, it, expect } from 'vitest';
import { decideData, renderDataLines, decisionRows, labelMatch, outsideAskScope, splitOfItem, mentionStatesNeed, exhibitReady, heldForOrder, nextReadyExhibit, nextRequiredExhibit } from '@/lib/orchestrator/data-decisions';
import { createLedger, reveal, type LedgerItem } from '@/lib/orchestrator/data-ledger';
import { getCaseById } from '@/lib/cases/loader';
import { factBaseFor, coverageOf } from '@/lib/orchestrator/fact-check';
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';

// Rule 11 decided in code (spec 2026-10-06 D2/D3): the model declares what was
// asked and now-or-later; code releases only what the case holds and was asked
// for, and writes every data line.

const ITEMS: LedgerItem[] = [
  { id: 'stores_count', label: 'Number of stores', value: '200 stores today.', releaseWhen: 'CLARIFY' },
  { id: 'cogs_pct', label: 'COGS as % of revenue', value: 'COGS is 58% of revenue.', releaseWhen: 'ANALYSIS' },
  { id: 'labor_pct', label: 'Labor as % of revenue', value: 'Labor is 22% of revenue.', releaseWhen: 'ANALYSIS' },
  { id: 'avg_ticket', label: 'Average transaction value', value: 'The average transaction is $6.80.', releaseWhen: 'ANALYSIS' },
  { id: 'bean_price_change', label: 'Bean price change', value: 'Bean costs are up 40%.', releaseWhen: 'EXHIBIT' },
];
const EXHIBITS = [{ id: 'exhibit-a', title: 'Cost Structure Over Time', coversLedgerItems: ['cogs_pct', 'labor_pct'] }];
const req = (over: Partial<DeclaredRequest>): DeclaredRequest => ({ what: 'the data', itemIds: [], explicit: true, respond: 'release', ...over });
const base = (over: Partial<Parameters<typeof decideData>[0]> = {}) => ({
  requests: [] as DeclaredRequest[], exhibit: null, rescueItem: null, rung3: false,
  ledger: createLedger(ITEMS), exhibits: EXHIBITS, shownExhibitIds: new Set<string>(), open: [], candidateText: '', ...over,
});

describe('decideData', () => {
  it('releases an explicit ask the case holds', () => {
    const d = decideData(base({ requests: [req({ what: 'store count', itemIds: ['stores_count'] })] }));
    expect(d.releases.map(r => r.id)).toEqual(['stores_count']);
    expect(renderDataLines(d, 's')).toEqual(['200 stores today.']);
  });

  it('defers when the model says later, naming what was asked', () => {
    const d = decideData(base({ requests: [req({ what: 'the bean price change', itemIds: ['bean_price_change'], respond: 'defer' })] }));
    expect(d.releases).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I'll come back to the bean price change shortly."]);
  });

  it('refuses an explicit ask the case does not hold, naming it', () => {
    const d = decideData(base({ requests: [req({ what: 'transaction volume by store', itemIds: [] }), req({ what: 'competitor pricing', itemIds: [] })] }));
    expect(renderDataLines(d, 's')).toEqual(["I don't have transaction volume by store or competitor pricing."]);
  });

  it('never releases a passing mention — offers it when the candidate states a need for it (Tyler t14, batch 19)', () => {
    const d = decideData(base({
      requests: [req({ what: 'the average ticket', itemIds: ['avg_ticket'], explicit: false })],
      candidateText: "Specialty coffee is a habitual purchase, so I'd expect inelastic demand, but I'd want transaction data to confirm.",
    }));
    expect(d.releases).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I can share the average ticket if you'd like."]);
  });

  // Batch 19: 17 of 24 Haiku runs heard offers of data nobody asked for
  // (Lorenzo's rule, 12 Oct): a mention is offered only when one sentence
  // names the item and states a need for it; otherwise no line.
  it.each([
    ['Jasmine t14 — the need is for something else', 'Volume holding roughly flat and revenue growth coming from traffic, not just new stores. Still need elasticity data.'],
    ['Sam t10 — no ask at all', "Thank you. I'm okay. I'd rather keep going, if that's alright."],
    ['named without a need', 'Ticket went up because people buy more items, so transaction value rose.'],
    ['a need, but in another sentence', "Transaction value rose. I'd want to see the store count next."],
  ])('says nothing for a mention that is not a stated need: %s', (_, candidateText) => {
    const d = decideData(base({ requests: [req({ what: 'the average ticket', itemIds: ['avg_ticket'], explicit: false })], candidateText }));
    expect(d.offers).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual([]);
  });

  it('ignores a passing mention of data the case does not hold', () => {
    expect(renderDataLines(decideData(base({ requests: [req({ what: 'NPS', itemIds: [], explicit: false })] })), 's')).toEqual([]);
  });

  // Batch 18 v3 recheck (10 Oct): an explicit re-ask of data already released
  // got nothing while the model said "Here they are again." Already revealed
  // is not "don't say it again": the value is restated, the ledger untouched.
  it('restates data already released on an explicit re-ask (never re-released), and skips unknown ids', () => {
    const ledger = createLedger(ITEMS);
    reveal(ledger, 'stores_count');
    const d = decideData(base({ ledger, requests: [req({ itemIds: ['stores_count', 'not_a_real_id'] })] }));
    expect(d.releases).toEqual([]);
    expect(d.restates.map(r => r.id)).toEqual(['stores_count']);
    expect(renderDataLines(d, 's')).toEqual(['As I mentioned: 200 stores today.']);
    expect(decisionRows(d)).toEqual([{ what: 'the data', ledgerItemIds: ['stores_count', 'not_a_real_id'].filter(id => id === 'stores_count'), response: 'release', explicit: true }]);
  });

  // Batch 11 (Nikhil t6, t8): "COGS is 58%… I'll come back to the cost
  // breakdown" — a deferral declared before the release of one of its items.
  it('says no deferral for a request partly released this turn, in either order', () => {
    for (const order of ['defer-first', 'release-first']) {
      const defer = req({ what: 'the cost breakdown', itemIds: ['cogs_pct', 'labor_pct'], respond: 'defer' });
      const release = req({ what: 'COGS', itemIds: ['cogs_pct'] });
      const d = decideData(base({ requests: order === 'defer-first' ? [defer, release] : [release, defer] }));
      expect(d.releases.map(r => r.id)).toEqual(['cogs_pct']);
      expect(renderDataLines(d, 's')).toEqual(['COGS is 58% of revenue.']);
      // still held, so still tracked: labor stays a deferred request
      expect(d.requests.find(x => x.request.what === 'the cost breakdown')).toMatchObject({ response: 'defer', ledgerItemIds: ['labor_pct'] });
    }
  });

  it('logs a deferral fully covered by this turn\'s releases as a release', () => {
    const d = decideData(base({ requests: [req({ what: 'COGS later', itemIds: ['cogs_pct'], respond: 'defer' }), req({ what: 'COGS', itemIds: ['cogs_pct'] })] }));
    expect(d.requests.map(x => x.response)).toEqual(['release', 'release']);
  });

  it('offers nothing a direct ask is releasing this turn', () => {
    const d = decideData(base({ requests: [
      req({ what: 'the average ticket', itemIds: ['avg_ticket'], explicit: false }),
      req({ what: 'ticket size', itemIds: ['avg_ticket'] }),
    ] }));
    expect(renderDataLines(d, 's')).toEqual(['The average transaction is $6.80.']);
  });

  it('caps releases at three and defers the rest out loud', () => {
    const d = decideData(base({ exhibits: [], requests: [
      req({ what: 'stores', itemIds: ['stores_count'] }), req({ what: 'COGS', itemIds: ['cogs_pct'] }),
      req({ what: 'labor', itemIds: ['labor_pct'] }), req({ what: 'the ticket', itemIds: ['avg_ticket'] }),
    ] }));
    expect(d.releases.map(r => r.id)).toEqual(['stores_count', 'cogs_pct', 'labor_pct']);
    expect(renderDataLines(d, 's').at(-1)).toBe("I'll come back to the ticket shortly.");
  });

  it('shows a requested exhibit and does not read the values it displays', () => {
    const d = decideData(base({ requests: [req({ what: 'the cost lines', itemIds: ['cogs_pct', 'labor_pct', 'exhibit-a'] })] }));
    expect(d.exhibit?.id).toBe('exhibit-a');
    expect(d.releases).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["Here's an exhibit: Cost Structure Over Time."]);
  });

  it("shows the model's exhibit handover once", () => {
    expect(decideData(base({ exhibit: 'exhibit-a' })).exhibit?.id).toBe('exhibit-a');
    expect(decideData(base({ exhibit: 'exhibit-a', shownExhibitIds: new Set(['exhibit-a']) })).exhibit).toBeNull();
  });

  it('marks an earlier open request with a lead-in', () => {
    const d = decideData(base({
      requests: [req({ what: 'the ticket', itemIds: ['avg_ticket'] })],
      open: [{ ledgerItemId: 'avg_ticket', label: 'Average transaction value', what: 'average ticket', turnIndex: 3 }],
    }));
    expect(renderDataLines(d, 's')[0]).toMatch(/earlier/i);
    expect(renderDataLines(d, 's').at(-1)).toBe('The average transaction is $6.80.');
  });

  it('honours the rescue item only on a rung-3 turn', () => {
    expect(decideData(base({ rescueItem: 'cogs_pct' })).releases).toEqual([]);
    expect(decideData(base({ rescueItem: 'cogs_pct', rung3: true })).releases.map(r => r.id)).toEqual(['cogs_pct']);
  });

  it('orders lines: releases, refusals, deferrals, offers', () => {
    const d = decideData(base({ requests: [
      req({ what: 'NPS', itemIds: [] }),
      req({ what: 'the ticket', itemIds: ['avg_ticket'], explicit: false }),
      req({ what: 'bean prices', itemIds: ['bean_price_change'], respond: 'defer' }),
      req({ what: 'stores', itemIds: ['stores_count'] }),
    ], candidateText: "I'd want transaction data too." }));
    expect(renderDataLines(d, 's')).toEqual([
      '200 stores today.', "I don't have NPS.", "I'll come back to bean prices shortly.", "I can share the ticket if you'd like.",
    ]);
  });
});

describe('decisionRows', () => {
  it('logs each request with the decision as its response', () => {
    const d = decideData(base({ requests: [
      req({ what: 'stores', itemIds: ['stores_count'] }), req({ what: 'NPS', itemIds: [] }),
      req({ what: 'bean prices', itemIds: ['bean_price_change'], respond: 'defer' }), req({ what: 'ticket', itemIds: ['avg_ticket'], explicit: false }),
    ] }));
    expect(decisionRows(d).map(r => [r.what, r.response, r.explicit])).toEqual([
      ['stores', 'release', true], ['NPS', 'refuse', true], ['bean prices', 'defer', true], ['ticket', 'defer', false],
    ]);
  });
});

// Smoke run 9 Oct (b5ebdd96 t23): "I don't have Pilot elasticity results … or
// Competitor pricing actions" — the classifier's capital, mid-sentence. Lists
// lower-case each item's first letter unless its first word looks like an
// acronym, carries a digit, has inner capitals, or opens a capitalised name.
describe('spoken lists lower-case the first letter of each item', () => {
  it.each([
    ['Pilot elasticity results', 'pilot elasticity results'],
    ['Competitor pricing actions', 'competitor pricing actions'],
    ['COGS by line item', 'COGS by line item'],
    ['NPS scores', 'NPS scores'],
    ['Q3 revenue', 'Q3 revenue'],
    ['2024 store count', '2024 store count'],
    ['McKinsey benchmarks', 'McKinsey benchmarks'],
    ['Brew & Bean menu prices', 'Brew & Bean menu prices'],
    ['Blue Bottle pricing', 'Blue Bottle pricing'],
    ['the store count', 'the store count'],
  ])('%s → %s', (what, spoken) => {
    expect(renderDataLines(decideData(base({ requests: [req({ what, itemIds: [] })] })), 's')).toEqual([`I don't have ${spoken}.`]);
  });

  it('applies to refusals, deferrals and offers, and keeps the logged what as declared', () => {
    const d = decideData(base({ requests: [
      req({ what: 'Pilot elasticity results', itemIds: [] }), req({ what: 'Competitor pricing actions', itemIds: [] }),
      req({ what: 'Bean prices', itemIds: ['bean_price_change'], respond: 'defer' }),
      req({ what: 'Average ticket', itemIds: ['avg_ticket'], explicit: false }),
    ], candidateText: "I'd want transaction data too." }));
    expect(renderDataLines(d, 's')).toEqual([
      "I don't have pilot elasticity results or competitor pricing actions.",
      "I'll come back to bean prices shortly.",
      "I can share average ticket if you'd like.",
    ]);
    expect(decisionRows(d).map(r => r.what)).toEqual(['Pilot elasticity results', 'Competitor pricing actions', 'Bean prices', 'Average ticket']);
  });
});

// Batch 18 (v2, Maya t6): the model declared "the number of stores over the two
// years" with item_ids [] and respond "defer", and code answered "I don't have
// the number of stores" although the case holds it. An empty mapping is the
// model's claim, not proof (v3).
describe('an empty item mapping is not proof the case lacks the data', () => {
  // prof-001's labels and timeframes.
  const CATALOG: { id: string; label: string; timeframes: Record<string, string> }[] = [
    { id: 'revenue_total', label: 'Total annual revenue', timeframes: { 480: 'current' } },
    { id: 'stores_count', label: 'Number of stores', timeframes: { 200: 'both' } },
    { id: 'revenue_per_store', label: 'Average revenue per store', timeframes: { 2.4: 'current' } },
    { id: 'cogs_pct', label: 'COGS as % of revenue', timeframes: { 42: 'prior', 58: 'current' } },
    { id: 'labor_pct', label: 'Labor as % of revenue', timeframes: { 22: 'both' } },
    { id: 'menu_price_change', label: 'Menu price changes over 2 years', timeframes: {} },
  ];

  it('maps a request that names exactly one label, plus only timeframe words', () => {
    expect(labelMatch('the number of stores over the two years', CATALOG)).toBe('stores_count');
    expect(labelMatch('COGS as a percent of revenue, both periods', CATALOG)).toBe('cogs_pct');
    expect(labelMatch('menu price changes over the past two years', CATALOG)).toBe('menu_price_change');
  });

  it('does not map a broader, qualified request that contains a label', () => {
    expect(labelMatch('total annual revenue by region', CATALOG)).toBeNull();
    expect(labelMatch('average revenue per store by format', CATALOG)).toBeNull();
    expect(labelMatch('number of stores opened per year by city', CATALOG)).toBeNull();
  });

  // Scope qualifiers are preserved: any word beyond the label that isn't an
  // article / auxiliary or a period word blocks the match.
  it.each([
    'total annual revenue by year', 'total annual revenue per store', 'total annual revenue for company-owned stores',
    'total annual revenue excluding new stores', 'total annual revenue in California', 'total annual revenue at the flagship',
    'number of stores by state', 'number of stores opened each year', 'number of new stores', 'number of stores per city',
    'number of stores across regions', 'number of franchised stores', 'COGS as % of revenue by product',
    'COGS as % of revenue for drinks only', 'COGS as % of revenue with delivery fees', 'labor as % of revenue at the top 10 stores',
    'labor as % of revenue every year', 'menu price changes by item', 'menu price changes on drinks', 'average revenue per store by format',
  ])('keeps the qualifier: "%s" is not mapped', what => {
    expect(labelMatch(what, CATALOG)).toBeNull();
  });

  // A period the item doesn't cover is a qualifier too.
  it('maps a period word only when the item covers that period', () => {
    expect(labelMatch('total annual revenue two years ago', CATALOG)).toBeNull();          // current only
    expect(labelMatch('total annual revenue now versus two years ago', CATALOG)).toBeNull();
    expect(labelMatch('average revenue per store over the past two years', CATALOG)).toBeNull();
    expect(labelMatch('current total annual revenue', CATALOG)).toBe('revenue_total');
    expect(labelMatch('COGS as % of revenue two years ago', CATALOG)).toBe('cogs_pct');
    expect(labelMatch('labor as a percent of revenue now and two years ago', CATALOG)).toBe('labor_pct');
    expect(labelMatch('number of stores two years ago', CATALOG)).toBe('stores_count');
  });

  it('does not map a request that names only part of a label, or none', () => {
    expect(labelMatch('the stores', CATALOG)).toBeNull();
    expect(labelMatch('the cost breakdown', CATALOG)).toBeNull();
    expect(labelMatch('pilot elasticity results', CATALOG)).toBeNull();
  });

  it('a deferral the model could not map is not refused here: held for the small-model check (turnDataChecked), nothing promised', () => {
    const d = decideData(base({ requests: [req({ what: 'the number of stores over the two years', itemIds: [], respond: 'defer' })] }));
    expect(d.refusals).toEqual([]);
    // Nothing is said until the check decides (19 Oct, engine-asks R1; the generic line is gone).
    expect(d.unmatchedDefers).toEqual(['the number of stores over the two years']);
    expect(renderDataLines(d, 's')).toEqual([]);
    expect(decisionRows(d)).toEqual([{ what: 'the number of stores over the two years', ledgerItemIds: [], response: 'defer', explicit: true }]);
  });

  it('an unmapped explicit release is still refused', () => {
    const d = decideData(base({ requests: [req({ what: 'total annual revenue by region', itemIds: [] })] }));
    expect(renderDataLines(d, 's')).toEqual(["I don't have total annual revenue by region."]);
  });
});

describe('repeat requests for data already released', () => {
  const revealedLedger = (...ids: string[]) => { const l = createLedger(ITEMS); ids.forEach(id => reveal(l, id)); return l; };

  it('a passing mention of released data repeats nothing', () => {
    const d = decideData(base({ ledger: revealedLedger('cogs_pct'), requests: [req({ what: 'COGS', itemIds: ['cogs_pct'], explicit: false })] }));
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual([]);
  });

  it('a new item and a released one in the same ask: the new one released, the old one restated after it', () => {
    const d = decideData(base({ ledger: revealedLedger('cogs_pct'), requests: [req({ what: 'the cost lines', itemIds: ['cogs_pct', 'labor_pct'] })] }));
    expect(d.releases.map(r => r.id)).toEqual(['labor_pct']);
    expect(d.restates.map(r => r.id)).toEqual(['cogs_pct']);
    expect(renderDataLines(d, 's')).toEqual(['Labor is 22% of revenue.', 'As I mentioned: COGS is 58% of revenue.']);
  });

  it('restates each item once per turn, at most the release cap, and only for explicit asks', () => {
    const l = revealedLedger('stores_count', 'cogs_pct', 'labor_pct', 'avg_ticket');
    const d = decideData(base({ ledger: l, requests: [
      req({ what: 'stores and COGS', itemIds: ['stores_count', 'cogs_pct'] }),
      req({ what: 'COGS again', itemIds: ['cogs_pct'] }),
      req({ what: 'labor and ticket', itemIds: ['labor_pct', 'avg_ticket'] }),
    ] }));
    expect(d.restates.map(r => r.id)).toEqual(['stores_count', 'cogs_pct', 'labor_pct']);
  });

  it('an item on an exhibit already on screen is restated from the ledger too', () => {
    const l = revealedLedger('cogs_pct');
    const d = decideData(base({ ledger: l, shownExhibitIds: new Set(['exhibit-a']), requests: [req({ what: 'COGS', itemIds: ['cogs_pct'] })] }));
    expect(d.restates.map(r => r.id)).toEqual(['cogs_pct']);
  });
});

// v4.10 (Rule 10): data an exhibit shows is released by showing it.
describe('an ask for the data an exhibit shows gets the exhibit', () => {
  it('two or more of its unreleased items in one explicit ask → the exhibit, not the values read aloud', () => {
    const d = decideData(base({ requests: [req({ what: 'the cost breakdown', itemIds: ['cogs_pct', 'labor_pct'] })] }));
    expect(d.exhibit?.id).toBe('exhibit-a');
    expect(d.releases).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["Here's an exhibit: Cost Structure Over Time."]);
  });
  it('one of its items alone is read out; a passing mention shows nothing', () => {
    expect(decideData(base({ requests: [req({ what: 'COGS', itemIds: ['cogs_pct'] })] })).exhibit).toBeNull();
    expect(decideData(base({ requests: [req({ what: 'the cost lines', itemIds: ['cogs_pct', 'labor_pct'], explicit: false })] })).exhibit).toBeNull();
  });
  it('an exhibit already on screen is not shown again; a re-ask restates the values', () => {
    const l = createLedger(ITEMS); reveal(l, 'cogs_pct'); reveal(l, 'labor_pct');
    const d = decideData(base({ ledger: l, shownExhibitIds: new Set(['exhibit-a']), requests: [req({ what: 'the cost lines', itemIds: ['cogs_pct', 'labor_pct'] })] }));
    expect(d.exhibit).toBeNull();
    expect(d.restates.map(r => r.id)).toEqual(['cogs_pct', 'labor_pct']);
  });
});

// v4.10: a qualified ask keeps its scope; synonyms and grouped asks untouched.
// Lorenzo, 13 Oct (4b; Marcus 71a04add t12): a split of an item, by its case names too.
describe('splitOfItem', () => {
  const other = { label: 'Price change of the other inputs (dairy, packaging, food) over 2 years' };
  it('"the split within that non-bean bucket" is a split of the other inputs, by their name "non-bean"', () => {
    expect(splitOfItem('the split within that non-bean bucket', other, ['non-bean', 'other inputs'])).toBe(true);
    expect(splitOfItem('the split within that non-bean bucket', other)).toBe(false);
  });
  it('parts listed, not a split of one: "breakdown of beans and other inputs", "split of COGS between beans"', () => {
    const beans = { label: 'Coffee bean price change over 2 years' };
    expect(splitOfItem('the breakdown of beans and other inputs', beans, ['beans'])).toBe(false);
    expect(splitOfItem('the split of COGS between beans', beans, ['beans'])).toBe(false);
    expect(splitOfItem('the breakdown of beans', beans, ['beans'])).toBe(true);
  });
  it('an item that is itself a part answers a split ("the coffee beans\' share of COGS")', () => {
    expect(splitOfItem('the split within the bean share', { label: "Composition of COGS: coffee beans' share of COGS" }, ['bean share'])).toBe(false);
  });
});

describe('a basis ask (Lorenzo, 19 Oct; batch 32 Larkspur Marisol t27)', () => {
  const plan = getCaseById('prof-002').dataLedger.find(i => i.id === 'new_routes_plan')!;
  const fb = factBaseFor(getCaseById('prof-002') as never);
  const names = fb.quantities.find(q => q.id === 'new_routes_plan')?.names ?? [];
  it('is outside the item that holds only the figure', () => {
    expect(outsideAskScope('Basis for the 70% load factor estimate on the new routes', plan, names)).toBe(true);
    expect(outsideAskScope('the 70% load factor on the new routes', plan, names)).toBe(false);
  });
  it('is in scope when the item says where the figure comes from', () => {
    expect(outsideAskScope('the basis for the estimate', { label: 'Forecast', value: 'The forecast is based on 3 pilots.' })).toBe(false);
  });
  it.each([
    ['What are the revenue sources?', { label: 'Revenue by source', value: 'Fares are 80% of revenue.' }],
    ['Where does our revenue come from?', { label: 'Revenue mix by source', value: 'Fares are 80% of revenue.' }],
    ['the source data for revenue', { label: 'Revenue', value: 'Revenue was $200M.' }],
  ])('"%s" stays in scope of a revenue item', (what, item) => {
    expect(outsideAskScope(what, item)).toBe(false);
  });
  it.each(['where the 70% load factor estimate comes from', 'how solid is the 70% assumption', 'the source of the 70% figure', 'how was the 70% estimated'])('"%s" is a basis ask', what => {
    expect(outsideAskScope(what, plan, names)).toBe(true);
  });
  it('is not covered by the phrase beside it', () => {
    expect(coverageOf('basis for the 70% load factor estimate', fb).items).toEqual([]);
  });
});

describe('outsideAskScope', () => {
  const L = (label: string, timeframes?: Record<string, string>) => ({ label, timeframes });
  const COGS = L('COGS as % of revenue', { 58: 'current', 42: 'prior' });
  const LABOR = L('Labor as % of revenue', { 22: 'both' });
  const SHARE = L("Composition of COGS: coffee beans' share of COGS", { 25: 'prior' });
  const OTHER_CHANGE = L('Price change of the other inputs (dairy, packaging, food) over 2 years', { 37.5: 'change' });
  const TICKET = L('Average transaction value', { '6.80': 'current' });
  const PER_STORE = L('Average revenue per store', { 2.4: 'current' });

  it.each([
    ['Variable-versus-fixed cost split within COGS and labor', COGS],   // Tyler t19 (batch 18)
    ['Variable-versus-fixed cost split within COGS and labor', LABOR],
    ['transaction volume per store', TICKET],                             // Yuki t13
    ['the split of COGS by input', OTHER_CHANGE],                         // the batch-18 over-map (7 runs)
    ['the COGS breakdown by input', OTHER_CHANGE],
    ['green coffee cost per pound by year', SHARE],
    // a fixed/variable cut: both words, the fixed part, "is fixed"
    ['the fixed and variable split of labor', LABOR],
    ['fixed/variable split of COGS', COGS],
    ['COGS, fixed versus variable', COGS],
    ['labor costs, variable vs. fixed', LABOR],
    ['the fixed portion of COGS', COGS],
    ['how much of labor is fixed', LABOR],
    ['whether labor is mostly variable', LABOR],
  ])('out of scope: "%s"', (what, item) => {
    expect(outsideAskScope(what, item)).toBe(true);
  });

  it.each([
    ['the cost breakdown', COGS],                                         // a grouped ask covers the lines
    ['the cost breakdown by category for both years', LABOR],
    ['the COGS split by input', SHARE],                                   // the composition is the split
    ['the COGS split by input and the price trend on each', OTHER_CHANGE],
    ['COGS split by input and how each moved', OTHER_CHANGE],
    ['the cost breakdown by component, then versus now', OTHER_CHANGE],
    ['cost of goods sold', COGS],                                         // a synonym
    ['COGS by year', COGS],
    ['revenue per store', PER_STORE],
    ['whether the 15% revenue growth is total or per store', L('Total annual revenue', { 480: 'current' })],
    // "the fixed costs" names a cost line, not a cut (Lorenzo, 13 Oct; Larkspur, Marcus 27c2d0fb t22)
    ['what sits inside the fixed costs, including aircraft leases', L('Aircraft leases')],
    ['the fixed costs and the aircraft leases', L('Aircraft leases')],
    ['variable costs on the new routes', L('New routes: seats, load factor, fare and extras')],
  ])('in scope: "%s"', (what, item) => {
    expect(outsideAskScope(what, item)).toBe(false);
  });
});

describe('mentionStatesNeed', () => {
  it.each([
    ["I'd want the COGS line broken out by component: green coffee, dairy, syrups and packaging.", 'Coffee bean price change over 2 years'],
    ['And it matters whether prices on the menu moved at all, because input costs rose.', 'Menu price changes'],
    ["I'd check milk and dairy first.", 'Price change of the other inputs (dairy, packaging, food) over 2 years'],
    // missing data said as such, and a next step that names the item (batch 20 replays: Tyler t14, Jasmine t6)
    ["I don't think I've been given the input price changes themselves — unless I missed them, all I have is beans at 25% of COGS.", 'Coffee bean price change over 2 years'],
    ['Next steps: test prices in a few markets, and get the COGS split by input to confirm beans are the driver.', "Composition of COGS: coffee beans' share of COGS"],
    // Lorenzo, 15 Oct (batch-25 ruling 6; Blake cd75e075 t15)
    ['Worth checking the actual COGS percentage rather than my benchmark.', 'COGS as % of revenue'],
  ])('a need for the item: %s', (text, label) => expect(mentionStatesNeed(text, label)).toBe(true));

  it.each([
    // generic label words don't name an item
    ["I'd want to understand the revenue picture first.", 'Total annual revenue'],
    ['Other inputs were 75% of COGS, so 0.75 × 42 = 31.5% of revenue.', 'Total annual revenue'],
    // the item named in passing, in the candidate's own math
    ['Beans were 25% of COGS, meaning 10.5 points of revenue at baseline.', 'Coffee bean price change over 2 years'],
    // the need is for something else; the item sits in a subordinate clause (batch 20 R25 t24)
    ["I'd check dairy and packaging first since that's the bigger chunk, even though beans rose faster in percentage terms.", 'Coffee bean price change over 2 years'],
    // named before the need, not as its object
    ["Beans are a small piece, so I'd want to look at labor next.", 'Coffee bean price change over 2 years'],
    ['It is worth noting that COGS rose 16 points.', 'COGS as % of revenue'],
  ])('not a need for the item: %s', (text, label) => expect(mentionStatesNeed(text, label)).toBe(false));
});

// Step 4 (batch 19, 12 Oct): Camila t6 and Sofia t4 heard the exhibit handed
// over and "I'll come back to the cost breakdown shortly" in the same turn —
// the exhibit delivered exactly that data.
describe('no deferral for data the exhibit delivers this turn', () => {
  it('a held ask whose items the exhibit shows gets no deferral line', () => {
    const d = decideData(base({ requests: [
      req({ what: 'store count', itemIds: ['stores_count'] }),
      req({ what: 'the cost breakdown', itemIds: ['cogs_pct', 'labor_pct'], respond: 'defer' }),
    ], exhibit: 'exhibit-a' }));
    expect(renderDataLines(d, 's')).toEqual(['200 stores today.', "Here's an exhibit: Cost Structure Over Time."]);
    expect(decisionRows(d).find(r => r.what === 'the cost breakdown')?.response).toBe('release');
  });
  it('a held ask the exhibit only partly shows still gets nothing promised twice', () => {
    const d = decideData(base({ requests: [req({ what: 'costs and ticket', itemIds: ['cogs_pct', 'avg_ticket'], respond: 'defer' })], exhibit: 'exhibit-a' }));
    expect(renderDataLines(d, 's')).toEqual(["Here's an exhibit: Cost Structure Over Time."]);
  });
});

// Step 4: what code reads aloud is speech, not catalog text (Camila t4 "COGS
// as % of revenue … overhead / rent as % of revenue"; Owen t24 "… price
// changes / price elasticity data"; Sam t10 "(dairy, packaging, food)").
describe('spoken whats', () => {
  it('a slash is "or" in a refusal and "and" elsewhere; a percent sign is spoken', () => {
    expect(renderDataLines(decideData(base({ requests: [req({ what: 'historical customer response to price changes / price elasticity data', itemIds: [] })] })), 's'))
      .toEqual(["I don't have historical customer response to price changes or price elasticity data."]);
    expect(renderDataLines(decideData(base({ requests: [req({ what: 'Overhead / rent as % of revenue', itemIds: ['cogs_pct'], respond: 'defer' })] })), 's'))
      .toEqual(["I'll come back to overhead and rent as a percent of revenue shortly."]);
  });
  it('Camila t4 (batch 19): a gate deferral of three catalog labels reads as one phrase', () => {
    expect(renderDataLines({ ...decideData(base()), gateDefers: ['COGS as % of revenue', 'Labor as % of revenue', 'Overhead / rent as % of revenue'] }, 's'))
      .toEqual(["I'll share COGS, labor and overhead as a percent of revenue once we've settled your structure."]);
  });
  // Lorenzo, 15 Oct (ruling 6): prof-001's overhead is spoken "overhead including rent" — "COGS, labor, and overhead including rent".
  it('the spoken overhead name in a list: a comma before the last; none in a pair', () => {
    expect(renderDataLines({ ...decideData(base()), gateDefers: ['COGS as a percent of revenue', 'labor as a percent of revenue', 'overhead including rent as a percent of revenue'] }, 's'))
      .toEqual(["I'll share COGS, labor, and overhead including rent as a percent of revenue once we've settled your structure."]);
    expect(renderDataLines({ ...decideData(base()), gateDefers: ['labor as a percent of revenue', 'overhead including rent as a percent of revenue'] }, 's'))
      .toEqual(["I'll share labor and overhead including rent as a percent of revenue once we've settled your structure."]);
  });
  it('a catalog heading before a colon is not said (remapped asks, 12 Oct)', () => {
    expect(renderDataLines({ ...decideData(base()), gateDefers: ["Composition of COGS: coffee beans' share of COGS", 'Coffee bean price change over 2 years'] }, 's'))
      .toEqual(["I'll share coffee beans' share of COGS and coffee bean price change once we've settled your structure."]);   // no period qualifier in a promise (batch 21 D8)
  });
  it('a suffix every item shares is said once', () => {
    const d = decideData(base({ requests: [
      req({ what: 'COGS as % of revenue', itemIds: ['cogs_pct'], respond: 'defer' }),
      req({ what: 'Labor as % of revenue', itemIds: ['labor_pct'], respond: 'defer' }),
    ] }));
    expect(renderDataLines(d, 's')).toEqual(["I'll come back to COGS and labor as a percent of revenue shortly."]);
  });
  it('a parenthesis at the end is dropped; a figure keeps its percent sign', () => {
    const d = decideData(base({ requests: [
      req({ what: 'Pilot elasticity results (volume loss from price increase)', itemIds: [] }),
      req({ what: 'whether the 15% growth is per store', itemIds: [] }),
    ] }));
    expect(renderDataLines(d, 's')).toEqual(["I don't have pilot elasticity results or whether the 15% growth is per store."]);
  });
  it('a parenthesis inside is read as an aside', () => {
    const d = decideData(base({ requests: [req({ what: 'price change of the other inputs (dairy, packaging, food) by supplier', itemIds: ['bean_price_change'], explicit: false })], candidateText: "I'd want the bean price trend." }));
    expect(renderDataLines(d, 's')).toEqual(["I can share price change of the other inputs — dairy, packaging and food — by supplier if you'd like."]);
  });
});

// New cases (13 Oct): an exhibit may come only after others (Larkspur's
// Exhibit 3 before the per-flight math gives the answer away). Every path —
// a requested exhibit, one shown for the data it covers, the model's own
// handover — waits; so does an item that only a waiting exhibit shows.
describe('exhibit release order', () => {
  const OITEMS: LedgerItem[] = [
    { id: 'routes', label: 'Results by route', value: 'Lakeport lost $1.2M.', releaseWhen: 'ANALYSIS' },
    { id: 'totals', label: 'Network totals', value: 'The network lost $4M.', releaseWhen: 'ANALYSIS' },
    { id: 'fare', label: 'Lakeport fare', value: 'The Lakeport fare is $120.', releaseWhen: 'ANALYSIS' },
    { id: 'seats', label: 'Lakeport seats and load', value: 'Each flight has 80 seats, 75% full.', releaseWhen: 'ANALYSIS' },
    { id: 'plan', label: 'New route plan', value: 'New routes would fly 5,000 flights.', releaseWhen: 'ANALYSIS' },
    { id: 'plan_cost', label: 'New route cost', value: 'Each new-route flight costs $9,200.', releaseWhen: 'ANALYSIS' },
    { id: 'leases', label: 'Aircraft leases', value: 'Leases run three more years.', releaseWhen: 'CLARIFY' },
  ];
  const OEX = [
    { id: 'exhibit-1', title: 'Results by route', coversLedgerItems: ['routes', 'totals'] },
    { id: 'exhibit-2', title: 'One Lakeport flight', coversLedgerItems: ['fare', 'seats'], after: ['exhibit-1'] },
    { id: 'exhibit-3', title: 'New routes', coversLedgerItems: ['plan', 'plan_cost'], after: ['exhibit-2'] },
  ];
  const ob = (over: Partial<Parameters<typeof decideData>[0]> = {}) => base({ ledger: createLedger(OITEMS), exhibits: OEX, ...over });

  it('a requested exhibit whose predecessor is not out is deferred, not shown', () => {
    const d = decideData(ob({ requests: [req({ what: 'the new-route estimates', itemIds: ['exhibit-3'] })], shownExhibitIds: new Set(['exhibit-1']) }));
    expect(d.exhibit).toBeNull();
    expect(renderDataLines(d, 's')).toEqual(["I'll come back to the new-route estimates shortly."]);
    expect(decisionRows(d)[0].response).toBe('defer');
  });

  it('once its predecessors are shown the requested exhibit goes out', () => {
    const d = decideData(ob({ requests: [req({ what: 'the new-route estimates', itemIds: ['exhibit-3'] })], shownExhibitIds: new Set(['exhibit-1', 'exhibit-2']) }));
    expect(d.exhibit?.id).toBe('exhibit-3');
  });

  it("a predecessor counts as out once all of its data was released as lines", () => {
    const l = createLedger(OITEMS); reveal(l, 'fare'); reveal(l, 'seats');
    const d = decideData(ob({ ledger: l, requests: [req({ what: 'the new-route estimates', itemIds: ['exhibit-3'] })], shownExhibitIds: new Set(['exhibit-1']) }));
    expect(d.exhibit?.id).toBe('exhibit-3');
  });

  it('an ask for two items of a waiting exhibit gets neither the exhibit nor the values', () => {
    const d = decideData(ob({ requests: [req({ what: 'the new-route economics', itemIds: ['plan', 'plan_cost'] })] }));
    expect(d.exhibit).toBeNull();
    expect(d.releases).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I'll come back to the new-route economics shortly."]);
  });

  it("an item only a waiting exhibit shows is held; one an exhibit doesn't show is released", () => {
    const d = decideData(ob({ requests: [req({ what: 'the fare', itemIds: ['fare'] }), req({ what: 'the leases', itemIds: ['leases'] })] }));
    expect(d.releases.map(r => r.id)).toEqual(['leases']);
    expect(renderDataLines(d, 's')).toEqual(['Leases run three more years.', "I'll come back to the fare shortly."]);
  });

  it("the model's handover of a waiting exhibit is dropped; of a ready one, shown", () => {
    expect(decideData(ob({ exhibit: 'exhibit-2' })).exhibit).toBeNull();
    expect(decideData(ob({ exhibit: 'exhibit-2', shownExhibitIds: new Set(['exhibit-1']) })).exhibit?.id).toBe('exhibit-2');
  });

  it('no offer and no rescue release for an item a waiting exhibit shows', () => {
    const offered = decideData(ob({ requests: [req({ what: 'the fare', itemIds: ['fare'], explicit: false })], candidateText: "I'd want the Lakeport fare to check." }));
    expect(offered.offers).toEqual([]);
    expect(decideData(ob({ rescueItem: 'fare', rung3: true })).releases).toEqual([]);
  });

  it('requiresItems: an exhibit waits for ledger items to be out', () => {
    const ex = [{ id: 'exhibit-1', title: 'Results by route', coversLedgerItems: ['routes'], requiresItems: ['leases'] }];
    expect(decideData(ob({ exhibits: ex, exhibit: 'exhibit-1' })).exhibit).toBeNull();
    const l = createLedger(OITEMS); reveal(l, 'leases');
    expect(decideData(ob({ exhibits: ex, ledger: l, exhibit: 'exhibit-1' })).exhibit?.id).toBe('exhibit-1');
  });

  it("code's exhibit stage hands over the first exhibit whose turn has come", () => {
    const l = createLedger(OITEMS);
    expect(nextReadyExhibit(OEX, new Set(), l)?.id).toBe('exhibit-1');
    expect(nextReadyExhibit(OEX, new Set(['exhibit-1']), l)?.id).toBe('exhibit-2');
    const waiting = [{ ...OEX[0], requiresItems: ['leases'] }, OEX[1]];
    expect(nextReadyExhibit(waiting, new Set(), l)).toBeUndefined();
  });

  it('exhibitReady / heldForOrder read the same order', () => {
    const l = createLedger(OITEMS);
    expect(exhibitReady(OEX[1], OEX, new Set(), l)).toBe(false);
    expect(exhibitReady(OEX[1], OEX, new Set(['exhibit-1']), l)).toBe(true);
    expect(heldForOrder('fare', OEX, new Set(), l)).toBe(true);
    expect(heldForOrder('fare', OEX, new Set(['exhibit-1']), l)).toBe(false);
    expect(heldForOrder('leases', OEX, new Set(), l)).toBe(false);
    reveal(l, 'fare');
    expect(heldForOrder('fare', OEX, new Set(), l)).toBe(false);   // already out: a re-ask restates it
  });

  it('an exhibit after the brainstorm waits until the brainstorm counts as out, by every path', () => {
    const l = createLedger(OITEMS);
    const ex = [OEX[0], { ...OEX[1], after: ['exhibit-1', 'brainstorm'], required: true }];
    const shown = new Set(['exhibit-1']);
    const out = new Set(['brainstorm']);
    expect(exhibitReady(ex[1], ex, shown, l)).toBe(false);
    expect(exhibitReady(ex[1], ex, shown, l, out)).toBe(true);
    expect(nextReadyExhibit(ex, shown, l)).toBeUndefined();
    expect(nextReadyExhibit(ex, shown, l, out)?.id).toBe('exhibit-2');
    expect(nextRequiredExhibit(ex, shown, l)).toBeUndefined();
    expect(nextRequiredExhibit(ex, shown, l, out)?.id).toBe('exhibit-2');
    expect(heldForOrder('fare', ex, shown, l)).toBe(true);
    expect(heldForOrder('fare', ex, shown, l, out)).toBe(false);
    expect(decideData(ob({ exhibits: ex, shownExhibitIds: shown, exhibit: 'exhibit-2' })).exhibit).toBeNull();
    expect(decideData(ob({ exhibits: ex, shownExhibitIds: shown, exhibit: 'exhibit-2', stagesOut: out })).exhibit?.id).toBe('exhibit-2');
  });
});

// Batch 21 D8 (Anika t6, t10): hold lines read catalog wording aloud — "I'll
// share COGS as a percent of revenue, both years, labor as a percent of
// revenue, both years and …", "I'll come back to coffee bean price change over
// 2 years shortly". A promise says what it promises in speech: no period
// qualifier (the data line states the periods), and an item's catalog label
// becomes its spoken name. Refusals and the logged wording are unchanged.
describe('promises say the item, not its catalog label', () => {
  const PITEMS: LedgerItem[] = [
    { id: 'cogs_pct', label: 'COGS as % of revenue', value: 'COGS is 58% of revenue.', releaseWhen: 'ANALYSIS' },
    { id: 'labor_pct', label: 'Labor as % of revenue', value: 'Labor is 22% of revenue.', releaseWhen: 'ANALYSIS' },
    { id: 'overhead_pct', label: 'Overhead / rent as % of revenue', value: 'Overhead is 14% of revenue.', releaseWhen: 'ANALYSIS' },
    { id: 'bean_price_change', label: 'Coffee bean price change over 2 years', value: 'Bean costs are up 40%.', releaseWhen: 'EXHIBIT' },
    { id: 'bean_share', label: "Composition of COGS: coffee beans' share of COGS", value: 'Beans were 25% of COGS.', releaseWhen: 'EXHIBIT' },
    { id: 'lakeport', label: 'Hub–Lakeport results: revenue, contribution and flights', value: 'Lakeport lost $1.2M.', releaseWhen: 'ANALYSIS' },
    { id: 'option_a', label: 'Entry Option A: build its own US team — terms', value: 'Option A costs $90M a year.', releaseWhen: 'ANALYSIS' },
    { id: 'kelvexa', label: "Kelvexa's forecast peak share of eligible patients", value: 'Kelvexa would reach 20%.', releaseWhen: 'ANALYSIS' },
    { id: 'liked', label: 'Survey: what shoppers like most', value: 'Shoppers like the crunch most.', releaseWhen: 'ANALYSIS' },
  ];
  const pb = (over: Partial<Parameters<typeof decideData>[0]> = {}) => base({ ledger: createLedger(PITEMS), exhibits: [], ...over });
  const defer = (what: string, id: string) => req({ what, itemIds: [id], respond: 'defer' });

  it('Anika t6: the period qualifiers go, the shared suffix is said once', () => {
    const d = decideData(pb({ requests: [
      req({ what: 'COGS as a percent of revenue, both years', itemIds: ['cogs_pct'] }),
      req({ what: 'labor as a percent of revenue, both years', itemIds: ['labor_pct'] }),
      req({ what: 'overhead and rent as a percent of revenue, both years', itemIds: ['overhead_pct'] }),
    ].map(r => ({ ...r, respond: 'defer' as const })), gateHeld: new Set(['COGS as a percent of revenue, both years', 'labor as a percent of revenue, both years', 'overhead and rent as a percent of revenue, both years']) }));
    // Lorenzo, 13 Oct: a group of held items is said by the items' spoken names, once.
    expect(renderDataLines(d, 's')).toEqual(["I'll share COGS, labor and overhead as a percent of revenue once we've settled your structure."]);
  });

  it("Tyler af62e2e2 t4: the ask's period wording isn't repeated per item — each item's spoken name, once", () => {
    const whats = ['COGS as a percent of revenue, year one versus year three', 'labor as a percent of revenue, year one versus year three', 'overhead and rent as a percent of revenue, year one versus year three'];
    const d = decideData(pb({ requests: whats.map((what, i) => ({ ...req({ what, itemIds: [['cogs_pct', 'labor_pct', 'overhead_pct'][i]] }), respond: 'defer' as const })), gateHeld: new Set(whats) }));
    expect(renderDataLines(d, 's')).toEqual(["I'll share COGS, labor and overhead as a percent of revenue once we've settled your structure."]);
  });

  it('a single held ask keeps its own words', () => {
    const d = decideData(pb({ requests: [{ ...req({ what: 'the cost breakdown as a percent of revenue', itemIds: ['cogs_pct'] }), respond: 'defer' as const }], gateHeld: new Set(['the cost breakdown as a percent of revenue']) }));
    expect(renderDataLines(d, 's')).toEqual(["I'll share the cost breakdown as a percent of revenue once we've settled your structure."]);
  });

  it.each([
    ['Coffee bean price change over 2 years', 'bean_price_change', "I'll come back to the coffee bean price change shortly."],   // Anika t10
    ["Composition of COGS: coffee beans' share of COGS", 'bean_share', "I'll come back to the coffee beans' share of COGS shortly."],
    ['Hub–Lakeport results: revenue, contribution and flights', 'lakeport', "I'll come back to the Hub–Lakeport results shortly."],
    ['Entry Option A: build its own US team — terms', 'option_a', "I'll come back to Entry Option A shortly."],
    ["Kelvexa's forecast peak share of eligible patients", 'kelvexa', "I'll come back to Kelvexa's forecast peak share of eligible patients shortly."],
    ['Survey: what shoppers like most', 'liked', "I'll come back to what shoppers like most shortly."],
    ['COGS as % of revenue', 'cogs_pct', "I'll come back to COGS as a percent of revenue shortly."],
  ])('a label is said as the item: %s', (label, id, line) => {
    expect(renderDataLines(decideData(pb({ requests: [defer(label, id)] })), 's')).toEqual([line]);
  });

  it.each([
    ['menu price history over the two years', 'menu price history'],
    ['the cost breakdown by component, then versus now', 'the cost breakdown by component'],
    ['store count two years ago versus today', 'store count'],
    ['COGS as a percent of revenue by year', 'COGS as a percent of revenue'],
  ])('a promise drops the period: %s', (what, said) => {
    expect(renderDataLines(decideData(pb({ requests: [defer(what, 'cogs_pct')] })), 's')).toEqual([`I'll come back to ${said} shortly.`]);
  });

  it("an item's authored spoken name wins over the derived one (Lorenzo, 13 Oct: a derived name can give the finding away)", () => {
    const items: LedgerItem[] = [{ id: 'competitor_entry', label: 'What changed on the problem routes: a new competitor', value: 'A low-cost airline entered.', releaseWhen: 'CLARIFY', spoken: 'what changed on those two routes' }];
    const d = decideData(pb({ ledger: createLedger(items), requests: [defer('What changed on the problem routes: a new competitor', 'competitor_entry')] }));
    expect(renderDataLines(d, 's')).toEqual(["I'll come back to what changed on those two routes shortly."]);
  });

  it("the candidate's own wording and the logged what are kept; refusals keep their periods", () => {
    const d = decideData(pb({ requests: [defer('the bean price trend', 'bean_price_change'), req({ what: 'store counts today and two years ago', itemIds: [] })] }));
    expect(renderDataLines(d, 's')).toEqual(["I don't have store counts today and two years ago.", "I'll come back to the bean price trend shortly."]);
    const labelled = decideData(pb({ requests: [defer('Coffee bean price change over 2 years', 'bean_price_change')] }));
    expect(decisionRows(labelled)[0].what).toBe('Coffee bean price change over 2 years');
  });
});
