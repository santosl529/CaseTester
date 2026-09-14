import { describe, it, expect } from 'vitest';
import { summarizeDataRequests } from '@/lib/scoring/data-coverage';

const catalog = [
  { id: 'avg_ticket', label: 'Average transaction value' },
  { id: 'bean_price_change', label: 'Coffee bean price change over 2 years' },
];

function row(subtype: string, turnIndex: number, what: string, ledgerItemId: string | null) {
  return { subtype, turnIndex, payloadJsonb: { what, ledgerItemId, interviewerTurnIndex: turnIndex + 1, revealedByNow: false } };
}

describe('summarizeDataRequests (Rule 11 data-coverage caveat)', () => {
  it('requested ledger data never revealed → coverage gap, with label and what was asked', () => {
    const out = summarizeDataRequests([row('none', 9, 'is it commodity inflation', 'bean_price_change')], catalog, []);
    expect(out.requestedUnanswered).toEqual([
      { ledgerItemId: 'bean_price_change', label: 'Coffee bean price change over 2 years', what: 'is it commodity inflation', turnIndex: 9 },
    ]);
    expect(out.requestedNotInCase).toEqual([]);
  });

  it('a request resolved by a reveal at ANY point in the session is not a gap (revealed set is final)', () => {
    const out = summarizeDataRequests([row('defer', 3, 'ticket size', 'avg_ticket')], catalog, ['avg_ticket']);
    expect(out.requestedUnanswered).toEqual([]);
  });

  it('refusing data that EXISTS in the ledger is still withholding → coverage gap', () => {
    const out = summarizeDataRequests([row('refuse', 5, 'bean costs', 'bean_price_change')], catalog, []);
    expect(out.requestedUnanswered.map(r => r.ledgerItemId)).toEqual(['bean_price_change']);
  });

  it('dedupes repeated requests for the same item, keeping the earliest turn', () => {
    const out = summarizeDataRequests(
      [row('none', 11, 'menu prices again', 'avg_ticket'), row('none', 4, 'menu price history', 'avg_ticket')],
      catalog, [],
    );
    expect(out.requestedUnanswered).toEqual([
      { ledgerItemId: 'avg_ticket', label: 'Average transaction value', what: 'menu price history', turnIndex: 4 },
    ]);
  });

  it('requests with no ledger match → not-in-case (fair game), with the response type', () => {
    const out = summarizeDataRequests([row('refuse', 2, 'store-level concentration', null)], catalog, []);
    expect(out.requestedNotInCase).toEqual([{ what: 'store-level concentration', response: 'refuse', turnIndex: 2 }]);
    expect(out.requestedUnanswered).toEqual([]);
  });

  it('a ledger id no longer in the case catalog is treated as not-in-case, never as a gap', () => {
    const out = summarizeDataRequests([row('none', 2, 'vintage split', 'vintage_split')], catalog, []);
    expect(out.requestedUnanswered).toEqual([]);
    expect(out.requestedNotInCase.map(r => r.what)).toEqual(['vintage split']);
  });

  it('skips malformed rows', () => {
    const out = summarizeDataRequests(
      [{ subtype: 'none', turnIndex: 1, payloadJsonb: null }, { subtype: 'none', turnIndex: 1, payloadJsonb: { ledgerItemId: 'avg_ticket' } }],
      catalog, [],
    );
    expect(out).toEqual({ requestedUnanswered: [], requestedNotInCase: [] });
  });

  it('ignores "classified" marker rows (they record that an exchange was checked, not a request)', () => {
    const out = summarizeDataRequests(
      [{ subtype: 'classified', turnIndex: 3, payloadJsonb: { interviewerTurnIndex: 4, requestCount: 0 } }],
      catalog, [],
    );
    expect(out).toEqual({ requestedUnanswered: [], requestedNotInCase: [] });
  });

  it('a request covering several ledger items is a gap for each one still unrevealed (live run 58cb8061)', () => {
    const out = summarizeDataRequests(
      [{ subtype: 'none', turnIndex: 13, payloadJsonb: { what: 'COGS broken into components', ledgerItemIds: ['avg_ticket', 'bean_price_change'] } }],
      catalog, ['avg_ticket'],
    );
    expect(out.requestedUnanswered).toEqual([
      { ledgerItemId: 'bean_price_change', label: 'Coffee bean price change over 2 years', what: 'COGS broken into components', turnIndex: 13 },
    ]);
    expect(out.requestedNotInCase).toEqual([]);
  });

  it('a request whose ledger ids are all unknown to the case is not-in-case', () => {
    const out = summarizeDataRequests(
      [{ subtype: 'refuse', turnIndex: 2, payloadJsonb: { what: 'vintage split', ledgerItemIds: ['vintage_split'] } }],
      catalog, [],
    );
    expect(out.requestedNotInCase.map(r => r.what)).toEqual(['vintage split']);
  });

  it('orders results by turn', () => {
    const out = summarizeDataRequests(
      [row('none', 8, 'beans', 'bean_price_change'), row('none', 3, 'ticket', 'avg_ticket')],
      catalog, [],
    );
    expect(out.requestedUnanswered.map(r => r.turnIndex)).toEqual([3, 8]);
  });
});
