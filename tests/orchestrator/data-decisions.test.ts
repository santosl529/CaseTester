import { describe, it, expect } from 'vitest';
import { decideData, renderDataLines, decisionRows } from '@/lib/orchestrator/data-decisions';
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

  it('skips data already released and unknown ids', () => {
    const ledger = createLedger(ITEMS);
    reveal(ledger, 'stores_count');
    const d = decideData(base({ ledger, requests: [req({ itemIds: ['stores_count', 'not_a_real_id'] })] }));
    expect(d.releases).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual([]);
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
