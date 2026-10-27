// Phase 2: the replay's recorded detections on a model turn (REPLAY_MESSAGE_DETECTIONS=1; lib/eval/recorded-checks.ts).
import { describe, it, expect } from 'vitest';
import { recordedMessageDetections } from '@/lib/eval/recorded-checks';

const W = 'Whether the 20% upgrade figure by month 12 represents the full upgrade share';
describe('recordedMessageDetections (b39q Raj t10)', () => {
  it('an answered detection the check ran on is item-less; one it did not is given its recorded ids', () => {
    const turn = { turnIndex: 9, checks: [
      { check: 'uncovered_asks', decision: 'act', detail: { answered: [W, 'the cost to serve'], covered: [], dropped: [] } },
      { check: 'itemless_defer', decision: 'act', detail: { what: W } },
    ] } as never;
    const events = [
      { category: 'data_request', turnIndex: 9, payloadJsonb: { what: W, ledgerItemIds: ['upgrade_timing'] } },
      { category: 'data_request', turnIndex: 9, payloadJsonb: { what: 'the cost to serve', ledgerItemIds: ['plan_prices_costs'] } },
    ];
    expect(recordedMessageDetections(turn, events)).toEqual([
      { what: W, ledgerItemIds: [], response: 'none', explicit: true },
      { what: 'the cost to serve', ledgerItemIds: ['plan_prices_costs'], response: 'none', explicit: true },
    ]);
  });
  it('no recorded row: no detections', () => {
    expect(recordedMessageDetections({ turnIndex: 3, checks: [] } as never, [])).toEqual([]);
  });
});
