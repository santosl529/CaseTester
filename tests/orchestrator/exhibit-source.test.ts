// D6 (Lorenzo, 20 Oct): the simulated candidate sees exhibit notes as the UI shows them, and code's
// restatement says how the item came out — "As I mentioned" if said, "As the exhibit shows" if only on an exhibit.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getCaseById } from '@/lib/cases/loader';
import { decideData, renderDataLines } from '@/lib/orchestrator/data-decisions';
import { createLedger, reveal, markExhibitReveals, restoreReveal } from '@/lib/orchestrator/data-ledger';
import { poolPattern } from '@/lib/orchestrator/phrasing';
import { exhibitAsText } from '@/lib/eval/exhibit-text';
import { applyMessage, type VoiceView } from '@/components/voice-view';
import { ExhibitTable } from '@/components/exhibit-table';
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import type { LedgerItem } from '@/lib/orchestrator/data-ledger';

const pricing = getCaseById('pricing-001');
const ITEMS = pricing.dataLedger as unknown as LedgerItem[];
const EXHIBITS = pricing.exhibits as unknown as { id: string; title: string; coversLedgerItems?: string[] }[];
const exhibit4 = pricing.exhibits.find(e => e.id === 'exhibit-4')!;
const ask = (itemIds: string[]): DeclaredRequest => ({ what: 'the notes on the price test', itemIds, explicit: true, respond: 'release' });
const decide = (ledger = createLedger(ITEMS), itemIds = ['price_test_notes']) => decideData({
  requests: [ask(itemIds)], exhibit: null, rescueItem: null, rung3: false, ledger, exhibits: EXHIBITS,
  shownExhibitIds: new Set(['exhibit-4']), open: [], candidateText: '',
});
const NOTES_LINE = pricing.dataLedger.find(d => d.id === 'price_test_notes')!.value;

describe('exhibitAsText', () => {
  it('appends the exhibit notes below the rows, as the UI shows them', () => {
    const text = exhibitAsText({ id: exhibit4.id, title: exhibit4.title, chartType: exhibit4.chartType, data: exhibit4.data as Record<string, unknown>[], notes: exhibit4.notes });
    expect(text).toContain(exhibit4.notes!);
    expect(text.indexOf('Note: ')).toBeGreaterThan(text.indexOf(String(Object.values(exhibit4.data[0])[0])));
  });
  it('an exhibit without notes has no note line', () => {
    expect(exhibitAsText({ id: 'x', title: 'T', chartType: 'table', data: [{ A: 1 }] })).toBe('[Exhibit shown: T]\nA\n1');
  });
});

describe('the restatement lead-in follows how the item came out', () => {
  it('Quillpath Raj t22: price_test_notes only on exhibit-4, asked for again → "As the exhibit shows: …"', () => {
    const ledger = createLedger(ITEMS);
    expect(markExhibitReveals(ledger, exhibit4)).toContain('price_test_notes');
    const lines = renderDataLines(decide(ledger), 's');
    expect(lines).toEqual([`As the exhibit shows: ${NOTES_LINE}`]);
  });
  it('an item said before → "As I mentioned: …"', () => {
    const ledger = createLedger(ITEMS);
    reveal(ledger, 'price_test_notes');
    expect(renderDataLines(decide(ledger), 's')).toEqual([`As I mentioned: ${NOTES_LINE}`]);
  });
  it('saved rows: source "exhibit" reads as exhibit-only; no source (older runs) and "said" read as said', () => {
    for (const [source, lead] of [['exhibit', 'As the exhibit shows: '], [undefined, 'As I mentioned: '], [null, 'As I mentioned: '], ['said', 'As I mentioned: ']] as const) {
      const ledger = createLedger(ITEMS);
      restoreReveal(ledger, { ledgerItemId: 'price_test_notes', source });
      expect(renderDataLines(decide(ledger), 's'), String(source)).toEqual([`${lead}${NOTES_LINE}`]);
    }
  });
  it('one said and one exhibit-only restated together: each group leads with its own words, said first', () => {
    const ledger = createLedger(ITEMS);
    markExhibitReveals(ledger, exhibit4);
    reveal(ledger, 'plan_prices_costs');
    const line = renderDataLines(decide(ledger, ['price_test_notes', 'plan_prices_costs']), 's:2').join(' ');
    const said = line.search(poolPattern('restate'));
    const exhibit = line.search(poolPattern('restate_exhibit'));
    expect(said).toBeGreaterThanOrEqual(0);
    expect(exhibit).toBeGreaterThan(said);
    expect(line.endsWith(NOTES_LINE)).toBe(true);
  });
});

describe('the voice room shows exhibit notes', () => {
  it('the exhibit message keeps its notes in the view, and the table the room renders prints them', () => {
    const empty = applyMessage({ exhibits: [], captions: [] } as unknown as VoiceView, { type: 'exhibit', turnSeq: 3, exhibit: { id: 'exhibit-4', title: exhibit4.title, chartType: 'table', data: exhibit4.data as Record<string, unknown>[], notes: exhibit4.notes } });
    expect(empty.exhibits[0].notes).toBe(exhibit4.notes);
    expect(renderToStaticMarkup(createElement(ExhibitTable, { exhibit: empty.exhibits[0] }))).toContain('lasted only eight weeks');
  });
});
