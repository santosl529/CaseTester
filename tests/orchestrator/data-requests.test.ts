import { describe, it, expect } from 'vitest';
import {
  parseDataRequestResponse, buildDataRequestPrompt, toDataRequestEvents,
  type LedgerCatalogItem,
} from '@/lib/orchestrator/data-requests';
import { getCaseById } from '@/lib/cases/loader';

const catalog: LedgerCatalogItem[] = [
  { id: 'avg_ticket', label: 'Average transaction value' },
  { id: 'bean_price_change', label: 'Coffee bean price change over 2 years' },
];

describe('parseDataRequestResponse', () => {
  it('parses detected requests with a ledger id and response type', () => {
    const raw = JSON.stringify({
      requests: [
        { what: 'menu price history', ledgerItemId: 'avg_ticket', response: 'none' },
        { what: 'store-level concentration', ledgerItemId: null, response: 'refuse' },
      ],
    });
    expect(parseDataRequestResponse(raw, catalog)).toEqual([
      { what: 'menu price history', ledgerItemId: 'avg_ticket', response: 'none' },
      { what: 'store-level concentration', ledgerItemId: null, response: 'refuse' },
    ]);
  });

  it('returns an empty list when the turn contains no request', () => {
    expect(parseDataRequestResponse('{"requests":[]}', catalog)).toEqual([]);
  });

  it('strips code fences', () => {
    const raw = '```json\n{"requests":[{"what":"bean costs","ledgerItemId":"bean_price_change","response":"release"}]}\n```';
    expect(parseDataRequestResponse(raw, catalog)?.[0].ledgerItemId).toBe('bean_price_change');
  });

  it('closed catalog: an id not in the ledger is dropped to null, never trusted', () => {
    const raw = '{"requests":[{"what":"vintage split","ledgerItemId":"vintage_split","response":"none"}]}';
    expect(parseDataRequestResponse(raw, catalog)?.[0].ledgerItemId).toBeNull();
  });

  it('coerces an unknown response type to "none" (unanswered is the safe default)', () => {
    const raw = '{"requests":[{"what":"bean costs","ledgerItemId":"bean_price_change","response":"sort of"}]}';
    expect(parseDataRequestResponse(raw, catalog)?.[0].response).toBe('none');
  });

  it('skips malformed entries but keeps valid ones', () => {
    const raw = '{"requests":[{"ledgerItemId":"avg_ticket"},{"what":"bean costs","ledgerItemId":null,"response":"defer"}]}';
    expect(parseDataRequestResponse(raw, catalog)).toEqual([
      { what: 'bean costs', ledgerItemId: null, response: 'defer' },
    ]);
  });

  it('returns null on garbage (fail open: no events, never blocks a turn)', () => {
    expect(parseDataRequestResponse('not json', catalog)).toBeNull();
    expect(parseDataRequestResponse('{"nope":1}', catalog)).toBeNull();
  });
});

describe('buildDataRequestPrompt', () => {
  const c = getCaseById('prof-001');
  const fullCatalog = c.dataLedger.map(d => ({ id: d.id, label: d.label }));

  it('includes ledger ids, labels, and both turns', () => {
    const prompt = buildDataRequestPrompt('What happened to menu prices?', "We're near time.", fullCatalog);
    expect(prompt).toContain('avg_ticket');
    expect(prompt).toContain('Average transaction value');
    expect(prompt).toContain('What happened to menu prices?');
    expect(prompt).toContain("We're near time.");
  });

  it('never contains ledger VALUES (FR-4: values are server-only and reveal-gated)', () => {
    const prompt = buildDataRequestPrompt('Any data on costs?', 'Walk me through that.', fullCatalog);
    for (const item of c.dataLedger) {
      expect(prompt).not.toContain(item.value);
    }
  });
});

describe('toDataRequestEvents', () => {
  it('maps requests to data_request session events keyed to the candidate turn', () => {
    const events = toDataRequestEvents(
      [
        { what: 'menu price history', ledgerItemId: 'avg_ticket', response: 'none' },
        { what: 'store concentration', ledgerItemId: null, response: 'refuse' },
      ],
      { candidateTurnIndex: 12, interviewerTurnIndex: 13, revealedIds: new Set(['bean_price_change']) },
    );
    expect(events).toEqual([
      {
        category: 'data_request', subtype: 'none', turnIndex: 12,
        payload: { what: 'menu price history', ledgerItemId: 'avg_ticket', interviewerTurnIndex: 13, revealedByNow: false },
      },
      {
        category: 'data_request', subtype: 'refuse', turnIndex: 12,
        payload: { what: 'store concentration', ledgerItemId: null, interviewerTurnIndex: 13, revealedByNow: false },
      },
    ]);
  });

  it('marks a ledger request as revealedByNow when the item has been released', () => {
    const [e] = toDataRequestEvents(
      [{ what: 'ticket size', ledgerItemId: 'avg_ticket', response: 'release' }],
      { candidateTurnIndex: 4, interviewerTurnIndex: 5, revealedIds: new Set(['avg_ticket']) },
    );
    expect(e.payload.revealedByNow).toBe(true);
  });
});
