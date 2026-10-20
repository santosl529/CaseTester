import { describe, it, expect } from 'vitest';
import { recordedChecks, recordedCheckVerdict } from '@/lib/eval/recorded-checks';

// Batch 35 Quillpath, Marcus (24) t17 and t27, as their turn file logged them.
const T17 = { check: 'itemless_defer', decision: 'act' as const, reason: 'mapped to a ledger item: a named deferral', detail: { what: 'Starter cohort beyond month 12', mapped: true, found: [{ what: 'Starter cohort status data beyond month 12 (covering retention, upgrades, and cancellations past the initial 12-month period)', ids: ['starter_cohort', 'cohort_notes'] }], latencyMs: 1119 } };
const T27 = { check: 'itemless_defer', decision: 'act' as const, reason: 'mapped to a ledger item: a named deferral', detail: { what: 'week-by-week sign-ups within the price test', mapped: true, found: [{ what: 'Week-by-week sign-ups during the price test period', ids: ['price_test_results'] }], outOfScope: ['price_test_results'], latencyMs: 776 } };
const turns = [
  { turnIndex: 17, checks: [{ check: 'data_decisions', decision: 'act' as const }, T17] },
  { turnIndex: 21, checks: [{ check: 'itemless_defer', decision: 'pass' as const, detail: { what: 'Starter cohort beyond month 12', mapped: false, found: [] } }] },
  { turnIndex: 25, checks: [{ check: 'itemless_defer', decision: 'act' as const, detail: { what: 'a timed-out ask', mapped: null, found: null } }] },
  { turnIndex: 27, checks: [T27] },
];
const checks = recordedChecks(turns);

describe('the replay serves the run\'s recorded check verdicts', () => {
  it('reads every itemless_defer row, a no-verdict one as null', () => {
    expect(checks.map(c => [c.turnIndex, c.what, c.found?.length ?? null])).toEqual([
      [17, 'Starter cohort beyond month 12', 1], [21, 'Starter cohort beyond month 12', 0], [25, 'a timed-out ask', null], [27, 'week-by-week sign-ups within the price test', 1],
    ]);
  });
  it('the same ask at the same turn first', () => {
    expect(recordedCheckVerdict(checks, 27, 'week-by-week sign-ups within the price test')).toEqual([{ what: 'Week-by-week sign-ups during the price test period', ledgerItemIds: ['price_test_results'], response: 'none', explicit: true }]);
    expect(recordedCheckVerdict(checks, 21, 'Starter cohort beyond month 12')).toEqual([]);
  });
  it('else the same ask at the nearest other turn of the run', () => {
    expect(recordedCheckVerdict(checks, 19, 'Starter cohort beyond month 12')?.[0].ledgerItemIds).toEqual(['starter_cohort', 'cohort_notes']);
    expect(recordedCheckVerdict(checks, 29, 'week-by-week sign-ups within the price test')?.[0].ledgerItemIds).toEqual(['price_test_results']);
  });
  it('else no verdict (null), as before; a recorded no-verdict stays null', () => {
    expect(recordedCheckVerdict(checks, 27, 'week-by-week sign-ups')).toBeNull();
    expect(recordedCheckVerdict(checks, 25, 'a timed-out ask')).toBeNull();
    expect(recordedCheckVerdict([], 3, 'anything')).toBeNull();
  });
});
