import { describe, it, expect } from 'vitest';
import { recordedChecks, recordedCheckVerdict, overrideVerdict, loadCheckOverrides, recordedDroppedAsks, askResultOf } from '@/lib/eval/recorded-checks';

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
    // A verdict recorded before the partial form (round 5b Task 56) reads as all full.
    expect(recordedCheckVerdict(checks, 27, 'week-by-week sign-ups within the price test')).toEqual({ items: [{ id: 'price_test_results', answers: 'full' }] });
    expect(recordedCheckVerdict(checks, 21, 'Starter cohort beyond month 12')).toEqual({ items: [] });
  });
  it('else the same ask at the nearest other turn of the run', () => {
    expect(recordedCheckVerdict(checks, 19, 'Starter cohort beyond month 12')?.items.map(i => i.id)).toEqual(['starter_cohort', 'cohort_notes']);
    expect(recordedCheckVerdict(checks, 29, 'week-by-week sign-ups within the price test')?.items.map(i => i.id)).toEqual(['price_test_results']);
  });
  it('else no verdict (null), as before; a recorded no-verdict stays null', () => {
    expect(recordedCheckVerdict(checks, 27, 'week-by-week sign-ups')).toBeNull();
    expect(recordedCheckVerdict(checks, 25, 'a timed-out ask')).toBeNull();
    expect(recordedCheckVerdict([], 3, 'anything')).toBeNull();
  });
});

describe('REPLAY_CHECKS overrides the recorded verdicts', () => {
  const file = 'test runs/batch-28/10-sofia-the-unit-confuser/live-run-x.json';
  const over = [
    { run: '10-sofia', turn: 4, what: 'competitor pricing', ids: [] as string[] | null },
    { run: '10-sofia', turn: 10, what: 'competitor pricing', ids: ['bean_price_change'] },
    { run: '10-sofia', turn: 4, what: 'whether the 6% includes unusual charges', ids: null },
  ];
  it('serves the entry for the run and exact ask, the nearest turn; [] is no item, null no verdict', () => {
    expect(overrideVerdict(over, file, 4, 'competitor pricing')).toEqual({ items: [] });
    expect(overrideVerdict(over, file, 9, 'competitor pricing')).toEqual({ items: [{ id: 'bean_price_change', answers: 'full' }] });
    expect(overrideVerdict(over, file, 4, 'whether the 6% includes unusual charges')).toBeNull();
  });
  it('undefined (fall back to the recorded lookup) for another run or another ask', () => {
    expect(overrideVerdict(over, 'test runs/batch-28/24-marcus/live-run-x.json', 4, 'competitor pricing')).toBeUndefined();
    expect(overrideVerdict(over, file, 4, 'competitor')).toBeUndefined();
    expect(overrideVerdict([], file, 4, 'competitor pricing')).toBeUndefined();
  });
  it('loads nothing when REPLAY_CHECKS is unset', () => { expect(loadCheckOverrides(undefined)).toEqual([]); });
  // Round 5b Task 56: a row may carry the check's `answers` and `missing` per id (Task 59's Haiku rerun); without them, full.
  it('a row with `answers` and `missing` serves the partial; an id it leaves out is full', () => {
    const rows = [{ run: '10-sofia', turn: 8, what: 'coffee beans as a share of COGS today', ids: ['bean_share_of_cogs', 'cogs_pct'],
      answers: { bean_share_of_cogs: 'partial' as const }, missing: { bean_share_of_cogs: "coffee beans' share of COGS today" } }];
    expect(overrideVerdict(rows, file, 8, 'coffee beans as a share of COGS today')).toEqual({ items: [
      { id: 'bean_share_of_cogs', answers: 'partial', missing: "coffee beans' share of COGS today" }, { id: 'cogs_pct', answers: 'full' }] });
    // A partial with no `missing`: the ask's own words.
    expect(overrideVerdict([{ ...rows[0], missing: undefined }], file, 8, 'coffee beans as a share of COGS today')?.items[0])
      .toEqual({ id: 'bean_share_of_cogs', answers: 'partial', missing: 'coffee beans as a share of COGS today' });
  });
});

describe('a verdict recorded with the partial form (round 5b Task 56) is served as recorded', () => {
  const row = { turnIndex: 8, checks: [{ check: 'itemless_defer', decision: 'act' as const, detail: {
    what: 'coffee beans as a share of COGS today', mapped: true, found: [{ what: 'coffee beans as a share of COGS today', ids: ['bean_share_of_cogs'] }],
    partial: ['bean_share_of_cogs'], missing: { bean_share_of_cogs: "coffee beans' share of COGS today" } } }] };
  it('partial ids and their missing parts', () => {
    expect(recordedCheckVerdict(recordedChecks([row]), 8, 'coffee beans as a share of COGS today'))
      .toEqual({ items: [{ id: 'bean_share_of_cogs', answers: 'partial', missing: "coffee beans' share of COGS today" }] });
  });
  it('askResultOf: detections in the old shape read as all full; null stays null', () => {
    expect(askResultOf([{ what: 'x', ledgerItemIds: ['a', 'b'], response: 'none', explicit: true }, { what: 'y', ledgerItemIds: ['a'], response: 'none', explicit: true }]))
      .toEqual({ items: [{ id: 'a', answers: 'full' }, { id: 'b', answers: 'full' }] });
    expect(askResultOf(null)).toBeNull();
  });
});

// Round 5 Task 49: a code-written turn's dropped asks, served again on replay.
// Batch 34 Aldermoor Tyler fc5eb050 t21, as its turn file and run JSON logged them.
describe('recordedDroppedAsks', () => {
  const WHAT = "How long Kelvexa's US exclusivity/patent protection lasts";
  const turn = { turnIndex: 21, checks: [{ check: 'code_written_requests', decision: 'act' as const, detail: { sentences: [], answered: [], dropped: [WHAT] } }] };
  const mention = { category: 'data_request', subtype: 'none', turnIndex: 21, payloadJsonb: { what: WHAT, explicit: false, ledgerItemIds: ['patents'], revealedByNow: false, interviewerTurnIndex: 22 } };
  it('the dropped ask, explicit, with the ids its passing-mention row logged', () => {
    expect(recordedDroppedAsks(turn, [mention])).toEqual([{ what: WHAT, ledgerItemIds: ['patents'], response: 'none', explicit: true }]);
  });
  it('no mention row (the close): no ids; another turn\'s row is not read; no check row: nothing', () => {
    expect(recordedDroppedAsks(turn, [])).toEqual([{ what: WHAT, ledgerItemIds: [], response: 'none', explicit: true }]);
    expect(recordedDroppedAsks(turn, [{ ...mention, turnIndex: 19 }])[0].ledgerItemIds).toEqual([]);
    expect(recordedDroppedAsks({ turnIndex: 21, checks: [] }, [mention])).toEqual([]);
  });
});
