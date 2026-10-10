import { describe, it, expect } from 'vitest';
import { decideData, renderDataLines, decisionRows, labelMatch } from '@/lib/orchestrator/data-decisions';
import { createLedger, reveal, type LedgerItem } from '@/lib/orchestrator/data-ledger';
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
  ledger: createLedger(ITEMS), exhibits: EXHIBITS, shownExhibitIds: new Set<string>(), open: [], ...over,
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

  it('never releases a passing mention — offers it instead', () => {
    const d = decideData(base({ requests: [req({ what: 'the average ticket', itemIds: ['avg_ticket'], explicit: false })] }));
    expect(d.releases).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I can share the average ticket if you'd like."]);
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
    const d = decideData(base({ requests: [
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
    ] }));
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
    ] }));
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

  it('a deferral the model could not map is not a refusal: one generic line, no item promised', () => {
    const d = decideData(base({ requests: [req({ what: 'the number of stores over the two years', itemIds: [], respond: 'defer' })] }));
    expect(d.refusals).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I'll come back to the data you've asked for once we've settled your structure."]);
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
