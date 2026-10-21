// Round 5 E5 (Lorenzo, 20 Oct): "E5: build (a) and (b). Not (c). Add (d): a
// deferral names the item it will deliver, not the candidate's words, and a
// mapped item that's releasable now goes now." In B1+B2, 10 of 13 asks the
// small-model check mapped to an item were "I'll come back to <ask>" and never
// released. The fixtures are batch 35 Quillpath's (oct 20, runs 1-5): the
// candidate's message and the model's request verbatim, the check's mapping as
// logged (`itemless_defer`), the ledger and exhibits as they stood.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
const { classify, ask } = vi.hoisted(() => ({ classify: vi.fn(async (): Promise<unknown> => []), ask: vi.fn() }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: classify, classifyAsk: ask }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan, type TurnReads } from '@/lib/orchestrator/plan-turn';
import { turnDataChecked, decideCheckedAsk, checkAsk, withAsks, type TurnAsks } from '@/lib/orchestrator/turn-data';
import { auditTurn } from '@/lib/orchestrator/audit';
import { revealedValues } from '@/lib/orchestrator/data-ledger';
import { renderDataLines, decisionRows } from '@/lib/orchestrator/data-decisions';
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { getCaseById } from '@/lib/cases/loader';
import { readsFixture } from './fixtures/turn-reads';
import { askVia } from './fixtures/ask-check';
import { recordedChecks, recordedCheckVerdict } from '@/lib/eval/recorded-checks';

const RAJ = { text: "It flips the answer. The upgraders are effectively Pro customers acquired for $300 instead of $1,200.\n\nPer Starter sign-up: $400 of Starter margin, plus 20% × Pro LTV of $4,000 = $800. Total ≈ $1,200 against $300 CAC, so about 4x — comfortably above the board's 3.\n\nSo the CFO is measuring Starter as a standalone plan and treating an upgrade as churn, when it's actually the cheapest Pro acquisition channel Quillpath has. Note too that Starter's \"40% cancelled\" overstates damage because a chunk of the exits are upgrades.\n\nOne caution: the 20% is from a single Jan–March cohort only 12 months old, and that cohort is early adopters, likely the best-fit customers. Do we have upgrade rates for later cohorts — say the ones that signed up mid-2025 — to see if the rate is holding?", ask: {"what": "upgrade rates for later cohorts", "itemIds": [], "explicit": true, "respond": "release"}, phase: "EXHIBIT", revealed: ["cohort_notes", "board_rule_definition", "pro_cohort", "starter_cohort", "plan_prices_costs", "plan_cac", "ltv_definition"], shown: ["exhibit-1"], found: [{"what": "upgrade rates for later cohorts", "ledgerItemIds": ["starter_cohort", "cohort_notes", "upgrade_timing"], "response": "none", "explicit": true}] };
const MARCUS_T17 = { text: "Honestly, I took 40% over 12 months and divided — that's 3.3% a month, and I rounded to 4% to be conservative. Then life = 1/0.04 = 25 months. That's a shortcut, and the exhibit says it's a bad one.\n\nTwo problems. First, a constant 3.3% monthly rate compounds, so you'd never actually hit exactly 40% cumulative — it's loose. Second, and bigger, the rate isn't constant. Cancellations by period are 5, then 8, then 11, then 16 — that's accelerating, not front-loaded. I said front-loaded a minute ago and that was wrong.\n\nIf anything the churn is getting worse month over month, which means extrapolating 25 months of life is probably too generous, and Starter's standalone value is below the $750 I quoted.\n\nDo we have the cohort beyond month 12 — months 18 or 24?\n\nThat said, the upgrade economics still carry it. Keep Starter, reprice.", ask: {"what": "Starter cohort beyond month 12", "itemIds": [], "explicit": true, "respond": "release"}, phase: "EXHIBIT", revealed: ["cohort_notes", "plan_cac", "pro_cohort", "new_customers_by_plan", "starter_cohort", "plan_prices_costs", "ltv_definition", "board_rule_definition"], shown: ["exhibit-3", "exhibit-1", "exhibit-2"], found: [{"what": "Starter cohort status data beyond month 12 (covering retention, upgrades, and cancellations past the initial 12-month period)", "ledgerItemIds": ["starter_cohort", "cohort_notes"], "response": "none", "explicit": true}] };
const MARCUS_T27 = { text: "The biggest risk is that the test only measures sign-ups, not what those customers do afterwards. Everything in my 3.3x rests on the retention and upgrade curves from the January 2025 cohort at $40, and I'm assuming they hold at $60. They might not. At a higher price the bar for value is higher, so early churn could rise above 5% in month one — and if the monthly cancellation rate goes from 3% to 4.5%, average life drops from ~25 months to ~17 and the whole thing falls back under 3x. The upgrade rate could also fall, because $60 to $100 is a smaller jump in features-per-dollar terms, and that stream is $800 of the value.\n\nHow I'd manage it: don't roll out nationally on eight weeks of sign-up data. Keep the $60 cohort running and track cancellation and upgrade at months 3 and 6 against the $40 benchmark, with a pre-agreed trigger to revert. Meanwhile grandfather existing customers to avoid churning the base.\n\nDo we have the week-by-week sign-ups within the eight weeks? I'd want to see the $60 volume stabilizing rather than still drifting down.", ask: {"what": "week-by-week sign-ups within the price test", "itemIds": [], "explicit": true, "respond": "release"}, phase: "RECOMMENDATION", revealed: ["cohort_notes", "plan_cac", "pro_cohort", "new_customers_by_plan", "starter_cohort", "plan_prices_costs", "ltv_definition", "board_rule_definition", "price_test_results", "price_test_notes"], shown: ["exhibit-3", "exhibit-1", "exhibit-2", "exhibit-4"], found: [{"what": "Week-by-week sign-ups during the price test period", "ledgerItemIds": ["price_test_results"], "response": "none", "explicit": true}] };
const MARISOL = { text: "Same formula. Pro's twelve-month cancellation figure is 40%, so 1 / 0.40 = 2.5. Check: 0.40 × 2.5 = 1.00. So 2.5 years of expected life, which is 30 months.\n\nThen LTV = 30 months × $80 monthly margin = $2,400. CAC is $1,200, so the ratio is $2,400 / $1,200 = 2.0.\n\nSo Pro sits below the board's three-times bar while Starter sits above it. That's the opposite of what the CFO is claiming, and it's worth pressure-testing before we go further — the gap is driven mostly by the CAC difference, $1,200 for a salesperson-led demo versus $300 self-serve. Pro would need either a materially cheaper sales motion or a longer life to clear 3x.\n\nOne thing I'd want: do we know how Pro's CAC has moved since January 2025? If the sales team is now chasing fewer Pro deals, $1,200 may be rising.", ask: {"what": "how Pro's CAC has moved since January 2025", "itemIds": [], "explicit": true, "respond": "release"}, phase: "EXHIBIT", revealed: ["pro_cohort", "starter_cohort", "plan_prices_costs", "plan_cac", "ltv_definition", "new_customers_by_plan"], shown: ["exhibit-1", "exhibit-3"], found: [{"what": "How Pro's customer acquisition cost (CAC) has changed since January 2025", "ledgerItemIds": ["plan_cac"], "response": "none", "explicit": true}] };
const TYLER = { text: "It came off the Pro row — still on Pro at month 12 was 81.5%, with 18.5% cancelled, so I took 1 minus that over twelve months: 0.815^(1/12) ≈ 0.983, so roughly 1.7% monthly churn, and $80 / 0.017 ≈ $4,700.\n\nOn whether it's the right base — fair challenge, and I think it's the weaker part. That cohort is sales-sourced Pro: they went through a demo, they self-selected into a $100 plan from day one, and they're probably larger businesses. An upgraded Starter customer is a smaller operator who grew into Pro. They might churn faster, in which case $4,700 is generous and the upgrade stream is worth less than $940.\n\nThe other direction: an upgrader has already survived six-plus months and proven the product works for them, which usually predicts better retention.\n\nDo we have churn for upgraded customers measured from their upgrade date? If not, I'd stress-test it — at double the churn, 3.4%, Pro LTV is about $2,350, upgrades are worth $470, and total is $875, just under the $900 bar.", ask: {"what": "churn for upgraded customers measured from their upgrade date", "itemIds": [], "explicit": true, "respond": "release"}, phase: "EXHIBIT", revealed: ["plan_prices_costs", "plan_cac", "ltv_definition", "pro_cohort", "starter_cohort", "cohort_notes"], shown: ["exhibit-1", "exhibit-2"], found: [{"what": "Churn rate for customers who upgraded to Pro, measured from their upgrade date", "ledgerItemIds": ["upgrade_timing", "cohort_notes"], "response": "none", "explicit": true}] };

const SATISFIED = { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false };
const AWAITING = { state: 'awaiting', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: false, structureAsked: false, awaitingReplies: 0 };
type Fx = { text: string; ask: unknown; phase: string; revealed: string[]; shown: string[]; found: unknown[] };
const plan = (fx: Fx, o: { exhibitOnly?: string[]; revealed?: string[]; shown?: string[]; pressureTest?: unknown; phase?: Phase; edit?: (r: TurnReads) => void } = {}): ModelPlan => {
  const reads = readsFixture({ caseId: 'pricing-001', phase: o.phase ?? (fx.phase as Phase), revealed: o.revealed ?? fx.revealed, flags: { pressureTest: o.pressureTest ?? SATISFIED, ...(o.exhibitOnly ? { exhibitOnly: o.exhibitOnly } : {}) } });
  o.edit?.(reads);
  const p = planTurn(reads, fx.text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  for (const id of o.shown ?? fx.shown) p.state.shownExhibitIds.add(id);
  return p;
};
const turn = (fx: Fx) => ({ requests: [fx.ask as DeclaredRequest], exhibit: null, rescueItem: null });
const value = (id: string) => getCaseById('pricing-001').dataLedger.find(i => i.id === id)!.value;
const acted = (p: ModelPlan, check: string) => p.ctx.checks.entries.filter(e => e.check === check);
const NO_FIGURE = /\d/;
beforeEach(() => { classify.mockReset(); classify.mockImplementation(async () => []); ask.mockReset(); ask.mockImplementation(askVia(classify)); });

describe('(b) the check maps the ask only to an item out of its scope', () => {
  it('Marcus t27: price_test_results already on Exhibit 4 → "I don\'t have week-by-week sign-ups within the price test." alone', async () => {
    classify.mockResolvedValueOnce(MARCUS_T27.found);
    const p = plan(MARCUS_T27, { exhibitOnly: ['price_test_results', 'price_test_notes'] });
    const d = await turnDataChecked(p, turn(MARCUS_T27));
    expect(acted(p, 'itemless_defer')[0].detail).toMatchObject({ outOfScope: ['price_test_results'], decision: 'coarse' });
    expect(d.releases).toEqual([]);
    expect(d.restates).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have week-by-week sign-ups within the price test."]);
    expect(d.requests.map(r => r.response)).toEqual(['refuse']);
  });
  it('… the price test not yet out (Exhibit 4 ready): its line, and the finer cut refused beside it', async () => {
    classify.mockResolvedValueOnce(MARCUS_T27.found);
    const p = plan(MARCUS_T27, { revealed: MARCUS_T27.revealed.filter(id => !id.startsWith('price_test')), shown: ['exhibit-1', 'exhibit-2', 'exhibit-3'] });
    const d = await turnDataChecked(p, turn(MARCUS_T27));
    expect(d.releases.map(r => r.id)).toEqual(['price_test_results']);
    expect(renderDataLines(d, 's')).toEqual([value('price_test_results'), "I don't have week-by-week sign-ups within the price test."]);
    expect(d.requests.map(r => [r.response, r.ledgerItemIds])).toEqual([['release', ['price_test_results']], ['refuse', []]]);
  });
  it('… the price test held by the release order (Exhibit 4 waits on 1-3): not released, the refusal stands', async () => {
    classify.mockResolvedValueOnce(MARCUS_T27.found);
    const p = plan(MARCUS_T27, { revealed: [], shown: [] });
    const d = await turnDataChecked(p, turn(MARCUS_T27));
    expect(d.releases).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have week-by-week sign-ups within the price test."]);
    expect(classify).toHaveBeenCalledTimes(1);
  });
});

describe('(a) the check maps the ask to an item already out → restated, never deferred', () => {
  it('Marcus t17: starter_cohort (said) and cohort_notes (on Exhibit 2) restated', async () => {
    classify.mockResolvedValueOnce(MARCUS_T17.found);
    const p = plan(MARCUS_T17, { exhibitOnly: ['cohort_notes', 'pro_cohort', 'plan_prices_costs', 'ltv_definition', 'new_customers_by_plan'] });
    const d = await turnDataChecked(p, turn(MARCUS_T17));
    expect(d.restates.map(r => r.id)).toEqual(['starter_cohort', 'cohort_notes']);
    expect(d.releases).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(d.refusals).toEqual([]);
    const lines = renderDataLines(d, 's');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(value('starter_cohort'));
    expect(lines[1]).toContain(value('cohort_notes'));
    expect(lines.join(' ')).not.toMatch(/come back|get there|Starter cohort beyond month 12/);
  });
  // Round 5c Task 61: the round-5 restate here was a bare partial (r5b-haiku-check #66) — plan_cac states no
  // change since January 2025, so the guard makes it partial: out already, the refusal alone, never deferred.
  it('Marisol t11: plan_cac, on Exhibit 1 — not restated: "I don\'t have Pro\'s CAC since January 2025." alone (Task 61)', async () => {
    classify.mockResolvedValueOnce(MARISOL.found);
    const p = plan(MARISOL, { exhibitOnly: ['plan_prices_costs', 'plan_cac', 'ltv_definition', 'new_customers_by_plan'] });
    const d = await turnDataChecked(p, turn(MARISOL));
    expect(d.restates).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have Pro's CAC since January 2025."]);
  });
  // Controller ruling (20 Oct, fix round 1): (a) only on a pure re-ask — every
  // mapped item out. A mixed verdict answers with the new items alone.
  it('Tyler t11 (mixed): upgrade_timing, not yet out, released now (d); cohort_notes (said at t7) not said again', async () => {
    classify.mockResolvedValueOnce(TYLER.found);
    const p = plan(TYLER);
    const d = await turnDataChecked(p, turn(TYLER));
    expect(d.releases.map(r => r.id)).toEqual(['upgrade_timing']);
    expect(d.restates).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual([value('upgrade_timing')]);
    // The release is booked: Settle reveals from `releases`, the row carries the id.
    expect(decisionRows(d).map(r => [r.response, r.ledgerItemIds])).toEqual([['release', ['upgrade_timing']]]);
  });
  it('the restates stay capped at 3', async () => {
    const ids = ['plan_prices_costs', 'plan_cac', 'ltv_definition', 'pro_cohort', 'starter_cohort'];
    classify.mockResolvedValueOnce([{ what: 'churn for upgraded customers', ledgerItemIds: ids, response: 'none', explicit: true }]);
    const d = await turnDataChecked(plan(TYLER), turn(TYLER));
    expect(d.restates).toHaveLength(3);
  });
});

describe('(d) the check maps the ask to an item not yet out', () => {
  // Round 5c Task 61 (the qualifier guard): no mapped line states "later cohorts", so every item is partial —
  // upgrade_timing's line goes (E1), the out items are not said again, and the later cohorts are refused.
  it('Raj t11 (mixed): upgrade_timing released now; starter_cohort and cohort_notes, already said, not restated; "later cohorts\' upgrade rates" refused (Task 61)', async () => {
    classify.mockResolvedValueOnce(RAJ.found);
    const p = plan(RAJ, { exhibitOnly: ['plan_prices_costs', 'plan_cac', 'ltv_definition'] });
    const d = await turnDataChecked(p, turn(RAJ));
    expect(d.releases.map(r => r.id)).toEqual(['upgrade_timing']);
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual([value('upgrade_timing'), "I don't have later cohorts' upgrade rates."]);
    expect(d.defers).toEqual([]);
    expect(d.refusals).toEqual(["later cohorts' upgrade rates"]);
    expect(renderDataLines(d, 's').join(' ')).not.toContain('upgrade rates for later cohorts');
  });
  // A gated item: the Starter cohort and its notes (ANALYSIS data) before the
  // structure is settled; upgrade_timing is clarifying data, never gated, so it goes.
  // On Tyler t11's ask since Task 61 (Raj's names "later cohorts", which no line states:
  // the guard's E1 form, pinned in the Task 61 tests); the same mapping.
  it('… before the pressure test is answered: the gated cohort items deferred by their names, booked, no figure; upgrade_timing still goes', async () => {
    classify.mockResolvedValueOnce([{ ...RAJ.found[0], what: TYLER.ask.what }]);
    const p = plan(TYLER, { pressureTest: AWAITING, revealed: [], shown: [], phase: 'STRUCTURE' });
    const d = await turnDataChecked(p, turn(TYLER));
    expect(d.releases.map(r => r.id)).toEqual(['upgrade_timing']);
    expect(d.gatedIds).toEqual(['starter_cohort', 'cohort_notes']);
    expect(d.gateDefers).toEqual(["the Starter cohort's status", 'the notes on the cohorts']);
    expect(d.itemlessDefers).toBeUndefined();
    const line = renderDataLines(d, 's').at(-1)!;
    expect(line).toContain("the Starter cohort's status and the notes on the cohorts");
    expect(line).not.toContain(TYLER.ask.what);
    expect(line).not.toMatch(NO_FIGURE);
    expect(decisionRows(d).filter(r => r.response === 'defer').map(r => r.ledgerItemIds)).toEqual([['starter_cohort'], ['cohort_notes']]);
  });
  it('… held over the release cap: deferred by its spoken name ("I\'ll come back to when customers upgrade"), booked, no figure', async () => {
    classify.mockResolvedValueOnce([{ what: TYLER.ask.what, ledgerItemIds: ['why_pro_fell', 'buyer_profile', 'competitor_prices', 'upgrade_timing'], response: 'none', explicit: true }]);
    const p = plan(TYLER);
    const d = await turnDataChecked(p, turn(TYLER));
    expect(d.releases.map(r => r.id)).toEqual(['why_pro_fell', 'buyer_profile', 'competitor_prices']);
    expect(d.defers).toEqual(['when customers upgrade']);
    expect(d.itemlessDefers).toBeUndefined();
    const line = renderDataLines(d, 's').at(-1)!;
    expect(line).toContain('when customers upgrade');
    expect(line).not.toMatch(NO_FIGURE);
    expect(decisionRows(d).find(r => r.ledgerItemIds.includes('upgrade_timing'))).toMatchObject({ what: 'When customers upgrade', response: 'defer', explicit: true });
  });
  it('… and the booked deferral is followed up: an open request, released on the next turn', async () => {
    const p = plan(RAJ, { edit: r => { (r as { dataRequestEventRows: unknown[] }).dataRequestEventRows = [{ subtype: 'defer', turnIndex: 3, payloadJsonb: { what: 'When customers upgrade', ledgerItemIds: ['upgrade_timing'], explicit: true } }]; } });
    expect(p.state.openDataRequests.map(o => o.ledgerItemId)).toEqual(['upgrade_timing']);
    const d = await turnDataChecked(p, { requests: [], exhibit: null, rescueItem: null });
    expect(d.releases.map(r => r.id)).toEqual(['upgrade_timing']);
  });
  it('… on a wrap-up turn: "We won\'t get to when customers upgrade today." — not promised', async () => {
    classify.mockResolvedValueOnce([{ what: TYLER.ask.what, ledgerItemIds: ['why_pro_fell', 'buyer_profile', 'competitor_prices', 'upgrade_timing'], response: 'none', explicit: true }]);
    const p = plan(TYLER);
    p.state.kind = 'close';
    const d = await turnDataChecked(p, turn(TYLER));
    expect(d.defers).toEqual([]);
    expect(renderDataLines(d, 's').at(-1)).toBe("We won't get to when customers upgrade today.");
    expect(decisionRows(d).find(r => r.ledgerItemIds.includes('upgrade_timing'))).toMatchObject({ response: 'defer', wontGetTo: true });
  });
});

// Final review (20 Oct), Review Focus 1 on the items path (Task 45): a check-mapped item the release order holds
// back is deferred by its name and booked, never released. An ask as the check might map it to the price test's
// notes, on Exhibit 4, which waits on Exhibits 1-3. Tyler t11's ask since Task 61 (Raj's names "later cohorts",
// which the notes don't state: the guard's E1 form instead, the refusal alone).
describe('(d) a mapped item held by the release order', () => {
  const NOTES = [{ what: TYLER.ask.what, ledgerItemIds: ['price_test_notes'], response: 'none', explicit: true }];
  it('Tyler t11 → price_test_notes, Exhibit 4 not ready: "I\'ll come back to the notes on the price test", booked, nothing released', async () => {
    classify.mockResolvedValueOnce(NOTES);
    const p = plan(TYLER, { shown: ['exhibit-1'] });
    const d = await turnDataChecked(p, turn(TYLER));
    expect(acted(p, 'checked_ask').map(e => e.detail)).toEqual([{ asks: [{ what: TYLER.ask.what, kind: 'items', ids: ['price_test_notes'] }] }]);
    expect(d.releases).toEqual([]);
    expect(d.exhibit).toBeNull();
    expect(d.defers).toEqual(['the notes on the price test']);
    expect(d.itemlessDefers).toBeUndefined();
    const lines = renderDataLines(d, 's');
    expect(lines).toEqual(["I'll come back to the notes on the price test shortly."]);
    expect(lines.join(' ')).not.toMatch(NO_FIGURE);
    expect(lines.join(' ')).not.toContain('upgrade rates for later cohorts');
    expect(decisionRows(d)).toEqual([expect.objectContaining({ ledgerItemIds: ['price_test_notes'], response: 'defer', explicit: true })]);
  });
});

describe('no verdict, or no item: as before', () => {
  it('no verdict (failure, timeout) → the named deferral in the candidate\'s words, holding no item', async () => {
    classify.mockResolvedValueOnce(null);
    const d = await turnDataChecked(plan(RAJ), turn(RAJ));
    expect(d.defers).toEqual(['upgrade rates for later cohorts']);
    expect(d.itemlessDefers).toEqual(['upgrade rates for later cohorts']);
    expect(d.releases).toEqual([]);
  });
  it('mapped to no item → refused', async () => {
    classify.mockResolvedValueOnce([]);
    const d = await turnDataChecked(plan(RAJ), turn(RAJ));
    expect(d.refusals).toEqual(['upgrade rates for later cohorts']);
  });
  it('the check runs once for Stream and Settle, and the decision log is the second pass\'s alone', async () => {
    classify.mockResolvedValueOnce(TYLER.found);
    const p = plan(TYLER);
    const a = await turnDataChecked(p, turn(TYLER));
    const b = await turnDataChecked(p, turn(TYLER));
    expect(classify).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
    expect(acted(p, 'checked_ask')).toHaveLength(2);
    expect(acted(p, 'itemless_defer')).toHaveLength(1);
  });
});

describe('decideCheckedAsk', () => {
  const p = () => plan(RAJ);
  it('sorts a verdict: no verdict, none, in scope, out of scope, siblings only', () => {
    expect(decideCheckedAsk(p(), 'x', { mapped: null, ids: [], outOfScope: [], partial: [], missing: {} })).toEqual({ kind: 'named' });
    expect(decideCheckedAsk(p(), 'x', { mapped: false, ids: [], outOfScope: [], partial: [], missing: {} })).toEqual({ kind: 'refuse' });
    expect(decideCheckedAsk(p(), 'x', { mapped: true, ids: ['upgrade_timing', 'cohort_notes'], outOfScope: ['cohort_notes'], partial: [], missing: {} })).toEqual({ kind: 'items', ids: ['upgrade_timing'] });
    expect(decideCheckedAsk(p(), 'week-by-week sign-ups within the price test', { mapped: true, ids: ['price_test_results'], outOfScope: ['price_test_results'], partial: [], missing: {} })).toEqual({ kind: 'coarse', ids: ['price_test_results'] });
    expect(decideCheckedAsk(p(), 'x', { mapped: true, ids: ['not_an_item'], outOfScope: [], partial: [], missing: {} })).toEqual({ kind: 'refuse' });
    // (a) only on a pure re-ask: all out → all (restated); mixed → only those not yet out.
    expect(decideCheckedAsk(p(), 'x', { mapped: true, ids: ['starter_cohort', 'cohort_notes'], outOfScope: [], partial: [], missing: {} })).toEqual({ kind: 'items', ids: ['starter_cohort', 'cohort_notes'] });
    expect(decideCheckedAsk(p(), 'x', { mapped: true, ids: ['starter_cohort', 'cohort_notes', 'upgrade_timing'], outOfScope: [], partial: [], missing: {} })).toEqual({ kind: 'items', ids: ['upgrade_timing'] });
  });
});

// Round 5b Task 56 (Lorenzo, 20 Oct, job 3): "E5 partial answers: the check reports
// per mapped item whether it fully answers or is only the nearest held data.
// Partial → E1's form ("I don't have <the asked part>." + the item's line)."
// b31 Sofia (e0f7d46c) t7 → t8 and b29 Fiona (fed61584) t3 → t4, prof-001: the
// candidate's message verbatim, the model's item-less ask as it declared it.
const SOFIA_T8 = { caseId: 'prof-001', text: "You're right, that doesn't square — let me redo it. COGS went from 42% of revenue to 58% of revenue. That's a 16 percentage point increase of revenue. The 38% is a separate thing: it's the relative growth in COGS, 16/42. I conflated the two. The 16 points is what I should be using, and that plus the 2 points of overhead gives 18 points, which exactly matches the margin falling from 24 to 6. Good — that fully reconciles.\n\nNow with your data: beans were 25% of COGS two years ago, so 25% of 42 — that's about 10.5% of revenue. And menu prices haven't moved in two years, which is important. It means they've absorbed every bit of input inflation without passing any through. Revenue grew 15% purely on volume or store count, not price.\n\nSo: do we have what beans are as a share of COGS today?", ask: { what: 'coffee beans as a share of COGS today', itemIds: [], explicit: true, respond: 'release' }, phase: 'ANALYSIS', revealed: ['bean_share_of_cogs', 'menu_price_change', 'cogs_pct', 'labor_pct', 'overhead_pct'], shown: [] as string[], found: [] };
const FIONA_T4 = { caseId: 'prof-001', text: "Fair point — net profit margin, not operating margin, so my structure is incomplete below the operating line. I'm missing non-operating items: interest expense, depreciation and amortization, taxes, and any one-time or restructuring charges.\n\nThat actually matters here. If they've grown to 200 locations, that expansion was likely debt-financed, and new store buildouts create a big depreciation load. Both of those hit net income without touching COGS or labor at all. A tax rate change or an impairment on underperforming stores would do the same.\n\nSo the cleaner structure is: revenue, then COGS, then operating expenses — labor, rent, utilities, marketing, corporate overhead — then below the line, interest, D&A, taxes, and one-offs. And I'd want to know whether the decline is concentrated above or below the operating line before I go hunting in COGS at all.\n\nDo we know what operating margin did over the same period?", ask: { what: 'operating margin over the period', itemIds: [], explicit: true, respond: 'release' }, phase: 'STRUCTURE', revealed: [] as string[], shown: [] as string[], found: [] };
const BEAN_PARTIAL = { items: [{ id: 'bean_share_of_cogs', answers: 'partial', missing: 'coffee beans as a share of COGS today' }] };
const planOf = (fx: Fx & { caseId: string }, o: { revealed?: string[]; pressureTest?: unknown; phase?: Phase } = {}): ModelPlan => {
  const reads = readsFixture({ caseId: fx.caseId, phase: o.phase ?? (fx.phase as Phase), revealed: o.revealed ?? fx.revealed, flags: { pressureTest: o.pressureTest ?? SATISFIED } });
  const p = planTurn(reads, fx.text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  for (const id of fx.shown) p.state.shownExhibitIds.add(id);
  return p;
};

describe('E5 partial: the check maps the ask to an item holding only the nearest data', () => {
  it('Sofia t8: bean_share_of_cogs (the prior-period share) already said → "I don\'t have coffee beans as a share of COGS today." alone, no restate (4b)', async () => {
    classify.mockResolvedValueOnce(BEAN_PARTIAL);
    const p = planOf(SOFIA_T8);
    const d = await turnDataChecked(p, turn(SOFIA_T8));
    expect(acted(p, 'itemless_defer')[0].detail).toMatchObject({ decision: 'coarse', partial: ['bean_share_of_cogs'], missing: { bean_share_of_cogs: 'coffee beans as a share of COGS today' } });
    expect(d.restates).toEqual([]);
    expect(d.releases).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have coffee beans as a share of COGS today."]);
    expect(d.requests.map(r => r.response)).toEqual(['refuse']);
  });
  it('… the bean share not yet out: its line, and "I don\'t have coffee beans as a share of COGS today." beside it', async () => {
    classify.mockResolvedValueOnce(BEAN_PARTIAL);
    const p = planOf(SOFIA_T8, { revealed: SOFIA_T8.revealed.filter(id => id !== 'bean_share_of_cogs') });
    const d = await turnDataChecked(p, turn(SOFIA_T8));
    expect(d.releases.map(r => r.id)).toEqual(['bean_share_of_cogs']);
    // The bean-share line (prof-001 speaks it in a variant: cases/variants/prof-001.data-lines.json), then the refusal.
    const lines = renderDataLines(d, 's');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/coffee beans were 25% of COGS/i);
    expect(lines[1]).toBe("I don't have coffee beans as a share of COGS today.");
    expect(d.requests.map(r => [r.response, r.ledgerItemIds])).toEqual([['release', ['bean_share_of_cogs']], ['refuse', []]]);
  });
  it('the refusal says the check\'s `missing` part, not the whole ask', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'bean_share_of_cogs', answers: 'partial', missing: 'COGS today' }] });
    // "COGS today" is not a span of the ask (fix round 2): the ask's words; a span from the ask's start is said.
    expect(renderDataLines(await turnDataChecked(planOf(SOFIA_T8), turn(SOFIA_T8)), 's')).toEqual(["I don't have coffee beans as a share of COGS today."]);
    classify.mockResolvedValueOnce({ items: [{ id: 'bean_share_of_cogs', answers: 'partial', missing: 'Coffee beans as a share of COGS today' }] });
    expect(renderDataLines(await turnDataChecked(planOf(SOFIA_T8), turn(SOFIA_T8)), 's')).toEqual(["I don't have coffee beans as a share of COGS today."]);
  });
  it('… before the pressure test is answered (the bean share is gated): not given, the refusal alone, no deferral, no figure', async () => {
    classify.mockResolvedValueOnce(BEAN_PARTIAL);
    const p = planOf(SOFIA_T8, { revealed: [], pressureTest: AWAITING, phase: 'STRUCTURE' });
    const d = await turnDataChecked(p, turn(SOFIA_T8));
    expect(d.releases).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(d.gateDefers).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have coffee beans as a share of COGS today."]);
    expect(classify).toHaveBeenCalledTimes(1);
  });
  it('… held by the release order (Marcus t27, Exhibit 4 waits on 1-3): not released, the refusal in the missing part\'s words', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'price_test_results', answers: 'partial', missing: 'week-by-week sign-ups' }] });
    const p = plan(MARCUS_T27, { revealed: [], shown: [] });
    const d = await turnDataChecked(p, turn(MARCUS_T27));
    expect(d.releases).toEqual([]);
    expect(d.exhibit).toBeNull();
    expect(d.defers).toEqual([]);
    // "week-by-week sign-ups" stops mid-phrase in the ask (fix round 3): the ask's own words.
    expect(renderDataLines(d, 's')).toEqual(["I don't have week-by-week sign-ups within the price test."]);
    expect(renderDataLines(d, 's').join(' ')).not.toMatch(NO_FIGURE);
  });
  it('mixed full + partial (Tyler t11): the full item decides as today (cohort_notes, out: restated); the partial one (upgrade_timing) is not given, its missing part refused (fix round 2)', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'upgrade_timing', answers: 'partial', missing: 'churn for upgraded customers' }, { id: 'cohort_notes', answers: 'full' }] });
    const p = plan(TYLER);
    const d = await turnDataChecked(p, turn(TYLER));
    expect(d.restates.map(r => r.id)).toEqual(['cohort_notes']);
    expect(d.releases).toEqual([]);
    // "churn for upgraded customers" stops mid-phrase in the ask: no valid part, so no refusal beside the full item (fix round 3).
    expect(d.refusals).toEqual([]);
    expect(renderDataLines(d, 's').join(' ')).not.toContain(value('upgrade_timing'));
  });
  it('#12 Fiona t4: all full (the cost shares answer operating margin by year) → released with the exhibit, no refusal', async () => {
    classify.mockResolvedValueOnce({ items: ['revenue_total', 'cogs_pct', 'labor_pct', 'overhead_pct'].map(id => ({ id, answers: 'full' })) });
    const p = planOf(FIONA_T4);
    const d = await turnDataChecked(p, { requests: [FIONA_T4.ask as DeclaredRequest], exhibit: 'exhibit-a', rescueItem: null });
    expect(d.refusals).toEqual([]);
    expect(d.exhibit?.id).toBe('exhibit-a');
    expect(d.releases.map(r => r.id)).toEqual(['revenue_total']);
    expect(renderDataLines(d, 's').join(' ')).not.toMatch(/I don't have/);
  });
  it('an old recorded verdict (no `answers`) decides exactly as before: Marcus t27 → coarse, the refusal in the ask\'s words', async () => {
    const old = recordedChecks([{ turnIndex: 27, checks: [{ check: 'itemless_defer', decision: 'act', detail: { what: 'week-by-week sign-ups within the price test', mapped: true, found: [{ what: 'Week-by-week sign-ups during the price test period', ids: ['price_test_results'] }], outOfScope: ['price_test_results'], latencyMs: 776 } }] }]);
    ask.mockImplementationOnce(async (q: { what: string }) => recordedCheckVerdict(old, 27, q.what));
    const p = plan(MARCUS_T27, { exhibitOnly: ['price_test_results', 'price_test_notes'] });
    const d = await turnDataChecked(p, turn(MARCUS_T27));
    expect(acted(p, 'itemless_defer')[0].detail).toMatchObject({ decision: 'coarse', outOfScope: ['price_test_results'] });
    expect(acted(p, 'itemless_defer')[0].detail).not.toHaveProperty('partial');
    expect(renderDataLines(d, 's')).toEqual(["I don't have week-by-week sign-ups within the price test."]);
  });
  it('the check record carries the call\'s tokens and cost, for the per-session check cost', async () => {
    ask.mockImplementationOnce(async (q: { onUsage?: (u: unknown) => void }) => {
      q.onUsage?.({ component: 'ask_check', model: 'claude-haiku-4-5', inputTokens: 1200, outputTokens: 40 });
      return BEAN_PARTIAL;
    });
    const p = planOf(SOFIA_T8);
    await turnDataChecked(p, turn(SOFIA_T8));
    expect(acted(p, 'itemless_defer')[0].detail).toMatchObject({ inputTokens: 1200, outputTokens: 40 });
    expect((acted(p, 'itemless_defer')[0].detail as { costUsd: number }).costUsd).toBeCloseTo(0.0014, 8);
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ what: 'coffee beans as a share of COGS today', catalog: expect.arrayContaining([expect.objectContaining({ id: 'bean_share_of_cogs', line: 'Coffee beans were #% of COGS # years ago.' })]) }));
  });
});

describe('decideCheckedAsk with partial answers', () => {
  const p = () => plan(RAJ);
  it('partial only → coarse with its missing part; mixed → the full items, and the partial\'s missing part; a partial sibling (a change item asked for a split) → refused', () => {
    expect(decideCheckedAsk(p(), 'x', { mapped: true, ids: ['upgrade_timing'], outOfScope: [], partial: ['upgrade_timing'], missing: { upgrade_timing: 'x' } }))
      .toEqual({ kind: 'coarse', ids: ['upgrade_timing'], missing: ['x'] });
    expect(decideCheckedAsk(p(), 'x and y', { mapped: true, ids: ['upgrade_timing', 'price_test_notes'], outOfScope: [], partial: ['upgrade_timing'], missing: { upgrade_timing: 'y' } }))
      .toEqual({ kind: 'items', ids: ['price_test_notes'], missing: ['y'] });
    // Never the whole ask beside a full item (fix round 3).
    expect(decideCheckedAsk(p(), 'x and y', { mapped: true, ids: ['upgrade_timing', 'price_test_notes'], outOfScope: [], partial: ['upgrade_timing'], missing: { upgrade_timing: 'x and y' } }))
      .toEqual({ kind: 'items', ids: ['price_test_notes'], dropped: [{ id: 'upgrade_timing', missing: 'x and y', why: 'whole_ask' }] });
    // Out of scope and partial both coarse: the whole ask (final review I1; before, the partial's part alone).
    expect(decideCheckedAsk(p(), 'x', { mapped: true, ids: ['price_test_results', 'upgrade_timing'], outOfScope: ['price_test_results'], partial: ['upgrade_timing'], missing: { upgrade_timing: 'y' } }))
      .toEqual({ kind: 'coarse', ids: ['price_test_results', 'upgrade_timing'], missing: ['x'] });
    // b31 Sofia t17's sibling: a change item asked for a split is never a coarse item, partial or not.
    expect(decideCheckedAsk(planOf(SOFIA_T8), 'the current COGS split by category', { mapped: true, ids: ['bean_price_change'], outOfScope: [], partial: ['bean_price_change'], missing: { bean_price_change: 'the current COGS split by category' } }))
      .toEqual({ kind: 'refuse' });
  });
});

// Task 56 fix round 2 (the first paid run's 52 verdicts replayed through 8e3da07,
// r5b-haiku-pre). The verdicts as Haiku gave them (haiku5b-replay-checks.json); the
// candidate's message verbatim; the ledger as it stood.
const SOFIA_B30_T14 = { caseId: 'prof-001', text: "A few levers beyond headline price.\n\nFirst, procurement. 37–40% increases suggest they're buying at spot. I'd look at forward contracts or hedging on coffee, multi-year supplier agreements on dairy and packaging, and consolidating vendors across 200 stores for volume discounts. Private-label or alternative packaging spec could take real cost out.\n\nSecond, menu engineering rather than blanket pricing. Reprice the items with the worst margin, and steer mix toward high-margin drinks. Espresso-based drinks with less dairy, or sized differently. If customers are adding items anyway, bundle them at a price that captures value.\n\nThird, waste and spoilage. Food and dairy are perishable; if waste is 5–8% of those inputs, tightening forecasting is pure margin.\n\nFourth, portion and spec control — standardizing shots, milk pours, cup sizes.\n\nFifth, loyalty and subscription to protect traffic when prices do rise.\n\nDo we have data on current waste rates or how they're contracting beans?", ask: { what: 'current waste rates and bean contracting terms', itemIds: [], explicit: true, respond: 'release' }, phase: 'ANALYSIS', revealed: ['bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change', 'cogs_pct', 'labor_pct', 'overhead_pct', 'menu_price_change', 'avg_ticket', 'stores_count'], shown: [] as string[], found: [] };
const RAJ_B34L_T13 = { caseId: 'prof-002', text: "It confirms it's a competitive price story, not demand or cost: we held volume by giving up fare, and we matched all the way down below our own variable cost. Both routes now destroy cash on every flight — Lakeport –$1.2M, Port Avery –$0.6M.\n\nBut exiting alone isn't enough. If we drop both, contribution goes from $16M to $17.8M against $20M fixed, so we're still at –$2.2M. The gap is $2.2M more.\n\nTwo things I want. First, are the fixed costs truly fixed if we shrink — does any of the $20M come off with fewer destinations, or is it hub and overhead? Second, and more important: those 5,000 flights free up aircraft. Can we redeploy them to the four uncontested routes or a new city? At Westhaven-like economics, $1,900 contribution per flight, that's real money.\n\nAlso — how did fare fall over FY2024 versus FY2025? If it's still sliding, matching has no floor.", ask: { what: 'the fare trend across FY2024 and FY2025', itemIds: [], explicit: true, respond: 'release' }, phase: 'ANALYSIS', revealed: ['network_totals', 'competitor_entry', 'route_results_lakeport', 'route_results_port_avery', 'route_results_other', 'fixed_costs'], shown: [] as string[], found: [] };
const FARE_PARTIAL = { items: [
  { id: 'lakeport_fare', answers: 'partial', missing: 'the fare trend across FY2024 and FY2025' },
  { id: 'port_avery_per_flight', answers: 'partial', missing: 'the fare trend across FY2024 and FY2025' }] };

describe('fix round 2: a mixed full + partial verdict refuses the partial\'s missing part', () => {
  // Since round 5c Task 61 the guard decides this ask: neither topic ("current waste rates", "bean contracting
  // terms") is on either line, so both items are partial; out already → the refusal alone, both topics named.
  // Haiku's "current bean contracting terms" adds no word to the guard's parts, so it is not said again.
  it('#18 Sofia (b30) t14: bean_price_change "full" and bean_share_of_cogs partial, both out → "I don\'t have current waste rates or bean contracting terms." alone (Task 61)', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'bean_price_change', answers: 'full' }, { id: 'bean_share_of_cogs', answers: 'partial', missing: 'current bean contracting terms' }] });
    const p = planOf(SOFIA_B30_T14);
    const d = await turnDataChecked(p, turn(SOFIA_B30_T14));
    expect(d.restates).toEqual([]);
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual(['current waste rates', 'bean contracting terms']);
    const lines = renderDataLines(d, 's');
    expect(lines).toEqual(["I don't have current waste rates or bean contracting terms."]);
    expect(acted(p, 'checked_ask')[0].detail).toMatchObject({ asks: [{ kind: 'coarse', ids: ['bean_price_change', 'bean_share_of_cogs'], missing: ['current waste rates', 'bean contracting terms'] }] });
  });
});

// Fix round 3 (the re-review of 1a6ae23; controller's ruling): in a mixed verdict a
// partial whose missing part fails validation gets no refusal — never the whole ask
// beside a full item, which would refuse the part just answered.
describe('fix round 3: a mixed verdict never refuses the whole ask', () => {
  const WHAT = 'the bean price change and current waste rates';
  // In a turn this wording never reaches the check (the coverage step maps "bean price change" first),
  // so the check and its decision are called directly, on Sofia (b30) t14's plan.
  const decide = async (partialMissing: string) => {
    classify.mockResolvedValueOnce({ items: [{ id: 'bean_price_change', answers: 'full' }, { id: 'bean_share_of_cogs', answers: 'partial', missing: partialMissing }] });
    const p = planOf(SOFIA_B30_T14);
    return decideCheckedAsk(p, WHAT, await checkAsk(p, WHAT));
  };
  // Since round 5c Task 61 (fix round 1) the guard refuses this ask's missing second topic ("current waste rates")
  // whatever Haiku's missing part; bean_price_change states its own conjunct, so it stays full (the mixed path).
  it('"the bean price change and current waste rates": bean_price_change full, bean_share_of_cogs partial "waste rates" (cut mid-phrase) → bean_price_change, "current waste rates" refused (Task 61)', async () => {
    // Haiku's own whole-ask fallback still logged beside the guard's refusal (fix round 2, finding 6).
    expect(await decide('waste rates')).toEqual({ kind: 'items', ids: ['bean_price_change'], missing: ['current waste rates'], dropped: [{ id: 'bean_share_of_cogs', missing: WHAT, why: 'whole_ask' }] });
  });
  it('… the partial\'s missing part the whole ask, or a valid one ("current waste rates") → the same', async () => {
    expect(await decide(WHAT)).toEqual({ kind: 'items', ids: ['bean_price_change'], missing: ['current waste rates'], dropped: [{ id: 'bean_share_of_cogs', missing: WHAT, why: 'whole_ask' }] });
    expect(await decide('current waste rates')).toEqual({ kind: 'items', ids: ['bean_price_change'], missing: ['current waste rates'] });
  });
});

describe('fix round 2: a missing part the item\'s line states is no missing part', () => {
  // Since round 5c Task 61 the guard's phrase replaces the whole-ask fallback: "FY2024 fares" (FY2025 and the
  // trend are on the Lakeport line).
  it('#49 Raj (b34l) t13: the fares not yet out → both lines, and "I don\'t have FY2024 fares." (FY2025 is on the Lakeport line)', async () => {
    classify.mockResolvedValueOnce(FARE_PARTIAL);
    const p = planOf(RAJ_B34L_T13);
    const d = await turnDataChecked(p, turn(RAJ_B34L_T13));
    expect(d.releases.map(r => r.id)).toEqual(['lakeport_fare', 'port_avery_per_flight']);
    expect(d.refusals).toEqual(['FY2024 fares']);
    expect(renderDataLines(d, 's').at(-1)).toBe("I don't have FY2024 fares.");
  });
  it('#50 Raj (b34l) t15: the fares already out → the refusal alone, FY2025 not named as missing', async () => {
    classify.mockResolvedValueOnce(FARE_PARTIAL);
    const p = planOf(RAJ_B34L_T13, { revealed: [...RAJ_B34L_T13.revealed, 'lakeport_fare', 'port_avery_per_flight'] });
    const d = await turnDataChecked(p, turn(RAJ_B34L_T13));
    expect(d.releases).toEqual([]);
    expect(d.restates).toEqual([]);
    expect(d.refusals).toEqual(['FY2024 fares']);
    expect(renderDataLines(d, 's').join(' ')).not.toMatch(/FY2025/);
  });
  it('a partial whose missing part and whole ask the line states → full (released, no refusal)', async () => {
    // Constructed on Raj t11's turn: "upgrades after month 12" is all on the upgrade_timing line ("… very few are after month 12.").
    const fx = { ...RAJ, ask: { what: 'upgrades after month 12', itemIds: [], explicit: true, respond: 'release' } };
    classify.mockResolvedValueOnce({ items: [{ id: 'upgrade_timing', answers: 'partial', missing: 'upgrades after month 12' }] });
    // The turn's own coverage step answers this wording before any check, so the check is called directly.
    const p = plan(fx);
    const v = await checkAsk(p, fx.ask.what);
    expect(v).toMatchObject({ mapped: true, ids: ['upgrade_timing'], partial: [], missing: {} });
    expect(decideCheckedAsk(p, fx.ask.what, v)).toEqual({ kind: 'items', ids: ['upgrade_timing'] });
    expect(acted(p, 'itemless_defer')[0].detail).not.toHaveProperty('partial');
  });
  it('#33 Sofia (b31) t10: avg_ticket partial, missing "versus two years ago" (stated by its line, and no noun) → the ask\'s own words', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'avg_ticket', answers: 'partial', missing: 'versus two years ago' }] });
    const fx = { ...SOFIA_T8, ask: { what: 'cost per cup versus two years ago', itemIds: [], explicit: true, respond: 'release' } };
    const d = await turnDataChecked(planOf(fx), turn(fx));
    expect(d.refusals).toEqual(['cost per cup versus two years ago']);
  });
});

describe('fix round 2: the refusal line keeps a plan name\'s capital', () => {
  it('#64 Marcus t17: starter_cohort partial (out) → "I don\'t have data on the Starter cohort beyond month 12."', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'starter_cohort', answers: 'partial', missing: 'Starter cohort beyond month 12' }] });
    const p = plan(MARCUS_T17, { exhibitOnly: ['cohort_notes', 'pro_cohort', 'plan_prices_costs', 'ltv_definition', 'new_customers_by_plan'] });
    const d = await turnDataChecked(p, turn(MARCUS_T17));
    expect(d.restates).toEqual([]);
    expect(d.refusals).toEqual(['data on the Starter cohort beyond month 12']);
    expect(renderDataLines(d, 's').join(' ')).toContain('data on the Starter cohort beyond month 12');
  });
});

// Final review I1 (f0fbaf8..5f73bc8): a coarse verdict with two partials said only the
// first one's missing part. #55, b35h Marcus (70a06d70) t9, launch-001: the check's
// verdict as Haiku gave it (haiku5b2-replay-checks.json) — channels partial, missing
// "store count"; planning_assumptions partial, missing the whole ask — was "I don't
// have store count." with nothing on the benchmark. Now: a partial that falls back to
// the whole ask, or a coarse item out of scope beside a partial, refuses the whole ask;
// otherwise the distinct missing parts are joined ("I don't have X or Y.").
const MARCUS_B35H_T9 = { caseId: 'launch-001', text: "Fair — the exhibit actually says nothing about the 6 million bags. It's entirely cost side: per-bag economics and fixed launch costs. It gives me the hurdle, not whether the hurdle gets cleared.\n\nTo judge reachability I'd want to come at it from distribution and velocity: how many stores Hollis Bay can get the line into, and how many bags per store per week a new better-for-you snack typically turns. If they're in, say, 10,000 stores, 6 million bags is 600 bags per store per year, roughly 12 a week — that feels plausible but I'd want a benchmark from the chip line or a comparable launch.\n\nI'd also want the size and growth of the roasted chickpea or better-for-you segment in the Northeast and Midwest, and what competitors are already on that shelf.\n\nDo we have store count and a velocity benchmark?", ask: { what: 'store count and a velocity benchmark', itemIds: [], explicit: true, respond: 'release' }, phase: 'EXHIBIT', revealed: ['bag_price', 'variable_costs', 'launch_costs', 'recipe_cost'], shown: ['exhibit-1'], found: [] };
const B35H_55 = { items: [
  { id: 'channels', answers: 'partial', missing: 'store count' },
  { id: 'planning_assumptions', answers: 'partial', missing: 'store count and a velocity benchmark' }] };

describe('final review I1: a coarse verdict with two or more partials', () => {
  // Task 61 fix round 2 (the controller's ruling on scopes: a benchmark is met by "past launches"): the planning
  // assumptions "from Hollis Bay's past launches" carry the benchmark scope, so no guard — Haiku's partials decide
  // as before Task 61, the whole ask refused.
  it('#55 Marcus (b35h) t9: one partial\'s missing part is the whole ask → the whole ask refused (no guard: the planning assumptions are from past launches)', async () => {
    classify.mockResolvedValueOnce(B35H_55);
    const p = planOf(MARCUS_B35H_T9);
    const what = MARCUS_B35H_T9.ask.what;
    const v = await checkAsk(p, what);
    expect(v).toMatchObject({ partial: ['channels', 'planning_assumptions'], missing: { channels: 'store count', planning_assumptions: what } });
    expect(v.guard).toBeUndefined();
    expect(decideCheckedAsk(p, what, v)).toEqual({ kind: 'coarse', ids: ['channels', 'planning_assumptions'], missing: ['store count and a velocity benchmark'] });
  });
  it('two partials with valid parts → both parts, joined: {coarse, missing: ["x", "y"]}', () => {
    expect(decideCheckedAsk(plan(RAJ), 'x and y', { mapped: true, ids: ['upgrade_timing', 'price_test_notes'], outOfScope: [], partial: ['upgrade_timing', 'price_test_notes'], missing: { upgrade_timing: 'x', price_test_notes: 'y' } }))
      .toEqual({ kind: 'coarse', ids: ['upgrade_timing', 'price_test_notes'], missing: ['x', 'y'] });
    // The same part twice is said once.
    expect(decideCheckedAsk(plan(RAJ), 'x and y', { mapped: true, ids: ['upgrade_timing', 'price_test_notes'], outOfScope: [], partial: ['upgrade_timing', 'price_test_notes'], missing: { upgrade_timing: 'x', price_test_notes: 'X' } }))
      .toEqual({ kind: 'coarse', ids: ['upgrade_timing', 'price_test_notes'], missing: ['x'] });
  });
  it('an out-of-scope coarse item beside a partial → the whole ask, not the partial\'s phrase', () => {
    expect(decideCheckedAsk(plan(RAJ), 'x and y', { mapped: true, ids: ['price_test_results', 'upgrade_timing'], outOfScope: ['price_test_results'], partial: ['upgrade_timing'], missing: { upgrade_timing: 'y' } }))
      .toEqual({ kind: 'coarse', ids: ['price_test_results', 'upgrade_timing'], missing: ['x and y'] });
  });
  it('#18 Sofia (b30) t14, both items partial with a part each: "I don\'t have current waste rates or bean contracting terms."', async () => {
    classify.mockResolvedValueOnce({ items: [
      { id: 'bean_share_of_cogs', answers: 'partial', missing: 'current waste rates' },
      { id: 'bean_price_change', answers: 'partial', missing: 'bean contracting terms' }] });
    const p = planOf(SOFIA_B30_T14);
    const d = await turnDataChecked(p, turn(SOFIA_B30_T14));
    expect(d.refusals).toEqual(['current waste rates', 'bean contracting terms']);
    expect(renderDataLines(d, 's').at(-1)).toBe("I don't have current waste rates or bean contracting terms.");
  });
});

// Final review I5 (behaviour for Lorenzo to rule on; unchanged here): in a mixed verdict
// a partial whose missing part fails validation gets no refusal beside the full items
// (#18 waste rates, #49 FY2024). Each is now recorded (`partial_dropped`) with the ask,
// the item and Haiku's raw `missing`, so a wave can count them.
describe('final review I5: a dropped partial part is recorded', () => {
  // Lorenzo's ruling on I5 (round 5c ruling 1, Task 61): the guard now refuses the qualifier these dropped
  // parts lacked, so neither leaves a partial_dropped record; Haiku's own partial stays on the check record.
  it('#49 Raj (b34l) t13, second run\'s verdict: lakeport_fare full, port_avery_per_flight partial (missing the whole ask) → both lines and "FY2024 fares" refused; Haiku\'s whole-ask part still logged (Task 61, fix round 2)', async () => {
    classify.mockResolvedValueOnce({ items: [
      { id: 'lakeport_fare', answers: 'full' },
      { id: 'port_avery_per_flight', answers: 'partial', missing: 'the fare trend across FY2024 and FY2025' }] });
    const p = planOf(RAJ_B34L_T13);
    const d = await turnDataChecked(p, turn(RAJ_B34L_T13));
    expect(d.releases.map(r => r.id)).toEqual(['lakeport_fare', 'port_avery_per_flight']);
    expect(d.refusals).toEqual(['FY2024 fares']);
    expect(acted(p, 'partial_dropped').map(e => e.detail)).toMatchObject([{ item: 'port_avery_per_flight', why: 'whole_ask', decision: 'coarse' }]);
    expect(acted(p, 'itemless_defer')[0].detail).toMatchObject({ partial: ['port_avery_per_flight'], missing: { port_avery_per_flight: 'the fare trend across FY2024 and FY2025' },
      guard: { unmet: [{ kind: 'period', text: 'FY2024' }], parts: ['FY2024 fares'] } });
  });
  it('#18 Sofia (b30) t14 shape: "waste rates" cut mid-phrase → the guard refuses "current waste rates"; Haiku\'s "waste rates" kept on the record (Task 61, fix round 2)', async () => {
    const WHAT = 'the bean price change and current waste rates';
    classify.mockResolvedValueOnce({ items: [{ id: 'bean_price_change', answers: 'full' }, { id: 'bean_share_of_cogs', answers: 'partial', missing: 'waste rates' }] });
    const p = planOf(SOFIA_B30_T14);
    await checkAsk(p, WHAT);
    expect(acted(p, 'partial_dropped').map(e => e.detail)).toEqual([{ what: WHAT, item: 'bean_share_of_cogs', missing: 'waste rates', checked: WHAT, why: 'whole_ask', decision: 'items' }]);
    expect(acted(p, 'itemless_defer')[0].detail).toMatchObject({ decision: 'items', guard: { parts: ['current waste rates'] } });
  });
  it('a refused part (valid) leaves no record', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'bean_price_change', answers: 'full' }, { id: 'bean_share_of_cogs', answers: 'partial', missing: 'current bean contracting terms' }] });
    const p = planOf(SOFIA_B30_T14);
    await turnDataChecked(p, turn(SOFIA_B30_T14));
    expect(acted(p, 'partial_dropped')).toEqual([]);
  });
});

// Final review M6: the partial refusals are made after the coverage step (turnData's
// findFalseRefusals/coverageOf), so they get the false-refusal veto themselves: a part
// a ledger item covers is not said, and is logged (`partial_dropped`, false_refusal).
// Constructed on Sofia (b30) t14's plan: the average ticket is a held (and said) item.
describe('final review M6: a partial part the case holds is not refused', () => {
  const WHAT = 'current waste rates and the average ticket';
  it('mixed: bean_price_change full, bean_share_of_cogs partial "the average ticket" → no refusal of the ticket, logged', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'bean_price_change', answers: 'full' }, { id: 'bean_share_of_cogs', answers: 'partial', missing: 'the average ticket' }] });
    const p = planOf(SOFIA_B30_T14);
    const c = decideCheckedAsk(p, WHAT, await checkAsk(p, WHAT));
    // Since Task 61 the guard reads both topics as on neither line (coarse); the veto still drops the ticket.
    expect(c).toEqual({ kind: 'coarse', ids: ['bean_price_change', 'bean_share_of_cogs'], missing: ['current waste rates'], dropped: [{ id: 'bean_share_of_cogs', missing: 'the average ticket', why: 'false_refusal' }] });
    expect(acted(p, 'partial_dropped').map(e => e.detail)).toMatchObject([{ item: 'bean_share_of_cogs', missing: 'the average ticket', why: 'false_refusal' }]);
  });
  it('coarse: two partials, one part the ticket → only "current waste rates" refused', async () => {
    classify.mockResolvedValueOnce({ items: [
      { id: 'bean_share_of_cogs', answers: 'partial', missing: 'current waste rates' },
      { id: 'bean_price_change', answers: 'partial', missing: 'the average ticket' }] });
    const p = planOf(SOFIA_B30_T14);
    expect(decideCheckedAsk(p, WHAT, await checkAsk(p, WHAT))).toEqual({ kind: 'coarse', ids: ['bean_share_of_cogs', 'bean_price_change'], missing: ['current waste rates'],
      dropped: [{ id: 'bean_price_change', missing: 'the average ticket', why: 'false_refusal' }] });
  });
  it('the check\'s other parts are untouched: "current waste rates" and "bean contracting terms" both refused (#18 shape)', () => {
    const p = planOf(SOFIA_B30_T14);
    expect(decideCheckedAsk(p, 'current waste rates and bean contracting terms', { mapped: true, ids: ['bean_share_of_cogs', 'bean_price_change'], outOfScope: [], partial: ['bean_share_of_cogs', 'bean_price_change'], missing: { bean_share_of_cogs: 'current waste rates', bean_price_change: 'bean contracting terms' } }))
      .toEqual({ kind: 'coarse', ids: ['bean_share_of_cogs', 'bean_price_change'], missing: ['current waste rates', 'bean contracting terms'] });
  });
});

// Final review I3 (Lorenzo: "log the classifier's cost and added latency per session"):
// a call the turn stopped waiting for (the 1.5 s cap) still costs its tokens, which
// arrive after the record was written. The usage row carries the ask, and `late` when
// it settles after the cap; the record says it timed out, and its latencyMs is the
// added latency (the cap).
describe('final review I3: the check\'s cost and added latency per session', () => {
  it('a call that settles before the cap: one usage row ("ask_check", the ask, not late); the record carries its tokens and cost', async () => {
    ask.mockImplementationOnce(async (q: { onUsage?: (u: unknown) => void }) => {
      q.onUsage?.({ component: 'ask_check', model: 'claude-haiku-4-5', inputTokens: 1200, outputTokens: 40 });
      return BEAN_PARTIAL;
    });
    const rows: Record<string, unknown>[] = [];
    const p = planOf(SOFIA_T8);
    await turnDataChecked(p, turn(SOFIA_T8), u => rows.push(u as unknown as Record<string, unknown>));
    expect(rows).toEqual([{ component: 'ask_check', model: 'claude-haiku-4-5', inputTokens: 1200, outputTokens: 40, ask: 'coffee beans as a share of COGS today' }]);
    expect(acted(p, 'itemless_defer')[0].detail).not.toHaveProperty('timedOut');
  });
  it('a call that times out: the named deferral at the cap; its usage, arriving later, is logged as a late row for the same ask', async () => {
    let settle: (() => void) | undefined;
    ask.mockImplementationOnce((q: { onUsage?: (u: unknown) => void }) => new Promise(r => {
      settle = () => { q.onUsage?.({ component: 'ask_check', model: 'claude-haiku-4-5', inputTokens: 1300, outputTokens: 150 }); r(BEAN_PARTIAL); };
    }));
    const rows: Record<string, unknown>[] = [];
    const p = planOf(SOFIA_T8);
    vi.useFakeTimers();
    try {
      let d: Awaited<ReturnType<typeof turnDataChecked>> | null = null;
      void turnDataChecked(p, turn(SOFIA_T8), u => rows.push(u as unknown as Record<string, unknown>)).then(x => { d = x; });
      await vi.advanceTimersByTimeAsync(1500);
      expect(d!.defers).toEqual(['coffee beans as a share of COGS today']);
      const rec = p.ctx.checks.entries.filter(e => e.check === 'itemless_defer')[0].detail as Record<string, unknown>;
      expect(rec).toMatchObject({ what: 'coffee beans as a share of COGS today', mapped: null, timedOut: true });
      expect(rec.latencyMs).toBeGreaterThanOrEqual(1500);
      expect(rec).not.toHaveProperty('inputTokens');
      expect(rows).toEqual([]);
      settle!();
      await vi.advanceTimersByTimeAsync(0);
      expect(rows).toEqual([{ component: 'ask_check', model: 'claude-haiku-4-5', inputTokens: 1300, outputTokens: 150, ask: 'coffee beans as a share of COGS today', late: true }]);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Round 5c Task 61, the qualifier guard (Lorenzo, 20 Oct, ruling 1): "If an ask names a
// qualifier the item's line doesn't contain …, that item counts as partial whatever
// Haiku labels it, and the refusal names the qualifier ("I don't have FY2024 fares.",
// "I don't have industry benchmarks.")." The second Haiku run's replies verbatim
// (haiku5b2-verdicts.json `raw`), the candidates' messages verbatim, the ledger as it stood.
const FIONA_B31_T10 = { caseId: 'prof-001', text: "Revenue growth is 1.15; ticket is up 1.10, so transactions are up about 1.15/1.10 ≈ 1.045, roughly 5%. Store count flat, so this is all same-store: 5% more visits and 10% bigger baskets from attachment.\n\nThat actually pushes me off my pricing framing. I was treating \"prices didn't move\" as the cause — but it isn't. Revenue per store is up 15% with zero price action; the business is healthy on the demand side. The entire margin loss traces to input costs rising ~38-40%. Pricing is a lever, not a driver, and I'd be cautious leaning on it: the growth engine here is frequency and attachment, and a broad menu price hike is exactly what breaks both.\n\nSo the thing the data supports is the input cost side. Do we know anything about how they buy beans and dairy — spot versus contract, how many suppliers, any hedging? And has the industry seen the same 40%, or is Brew & Bean paying above market?", ask: { what: 'industry input cost inflation benchmarks', itemIds: [], explicit: true, respond: 'release' }, phase: 'ANALYSIS', revealed: ['menu_price_change', 'avg_ticket', 'stores_count', 'cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'non_bean_input_change', 'bean_price_change'], shown: [] as string[], found: [] };
const RAJ_B34L_T15_TEXT = "Three things. One, demand: Westhaven earns $1,900 a flight at today's load factors. If I add frequency on an existing route, the incremental passengers are the marginal ones — I'd likely fill them only by discounting, so I'd dilute fare on the flights I already run. I'd want to know whether those four routes are demand-constrained or capacity-constrained today, ideally turn-away or booking-curve data.\n\nTwo, a new city: Westhaven's $1,900 is a mature route with an established base. A new destination ramps, and probably loses money year one — which matters a lot given the 12-month deadline.\n\nThree, cost comparability. Variable cost per flight ranges $9,000 to $11,000 here, mostly stage length and airport fees. A longer or more expensive airport changes the math.\n\nAnd since the leases are sunk through 2030, idling planes saves nothing — so the bar isn't \"earn $1,900,\" it's \"beat zero.\"";
const RAW = {
  18: { items: [{ id: 'bean_price_change', answers: 'full' }, { id: 'bean_share_of_cogs', answers: 'partial', missing: 'bean contracting terms' }] },
  36: { items: [{ id: 'non_bean_input_change', answers: 'full' }, { id: 'bean_price_change', answers: 'full' }] },
  49: { items: [{ id: 'lakeport_fare', answers: 'full' }, { id: 'port_avery_per_flight', answers: 'partial', missing: 'FY2025 fare trend for Port Avery' }] },
  50: { items: [{ id: 'lakeport_fare', answers: 'full' }, { id: 'port_avery_per_flight', answers: 'full' }] },
  63: { items: [{ id: 'starter_cohort', answers: 'full' }, { id: 'cohort_notes', answers: 'full' }] },
  66: { items: [{ id: 'plan_cac', answers: 'full' }] },
  12: { items: [{ id: 'cogs_pct', answers: 'full' }, { id: 'labor_pct', answers: 'full' }, { id: 'overhead_pct', answers: 'full' }] },
  67: { items: [{ id: 'cohort_notes', answers: 'full', missing: '' }] },
};
const linesOf = (d: Awaited<ReturnType<typeof turnDataChecked>>) => renderDataLines(d, 's');
const ledgerValue = (caseId: string, id: string) => getCaseById(caseId).dataLedger.find(i => i.id === id)!.value;

describe('Task 61: the second run\'s bare partials — each item partial, the refusal naming the qualifier', () => {
  it('#18 Sofia (b30) t14: both items out → "I don\'t have current waste rates or bean contracting terms." alone (was: the bean price restated, waste rates unmentioned)', async () => {
    classify.mockResolvedValueOnce(RAW[18]);
    const p = planOf(SOFIA_B30_T14);
    const d = await turnDataChecked(p, turn(SOFIA_B30_T14));
    expect(acted(p, 'itemless_defer')[0].detail).toMatchObject({ decision: 'coarse', guard: { parts: ['current waste rates', 'bean contracting terms'] } });
    expect(d.restates).toEqual([]);
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual(['current waste rates', 'bean contracting terms']);
    expect(linesOf(d)).toEqual(["I don't have current waste rates or bean contracting terms."]);
  });
  it('#36 Fiona (b31) t10: the company\'s input-cost changes, out → "I don\'t have industry benchmarks." alone (was: restated, no refusal)', async () => {
    classify.mockResolvedValueOnce(RAW[36]);
    const d = await turnDataChecked(planOf(FIONA_B31_T10), turn(FIONA_B31_T10));
    expect(d.restates).toEqual([]);
    expect(linesOf(d)).toEqual(["I don't have industry benchmarks."]);
  });
  it('#49 Raj (b34l) t13: the fares not yet out → both lines, and "I don\'t have FY2024 fares." (was: Lakeport alone, no word on FY2024)', async () => {
    classify.mockResolvedValueOnce(RAW[49]);
    const p = planOf(RAJ_B34L_T13);
    const d = await turnDataChecked(p, turn(RAJ_B34L_T13));
    expect(d.releases.map(r => r.id)).toEqual(['lakeport_fare', 'port_avery_per_flight']);
    expect(d.refusals).toEqual(['FY2024 fares']);
    expect(linesOf(d).at(-1)).toBe("I don't have FY2024 fares.");
    // Haiku's own part ("FY2025 fare trend for Port Avery", a figure: the ask's words) is logged, not said (fix round 2).
    expect(acted(p, 'partial_dropped').map(e => e.detail)).toMatchObject([{ item: 'port_avery_per_flight', missing: 'FY2025 fare trend for Port Avery', why: 'whole_ask' }]);
  });
  it('#50 Raj (b34l) t15 (the model re-declared the pending ask; Lakeport out): Port Avery\'s line and the refusal; Lakeport not said again', async () => {
    classify.mockResolvedValueOnce(RAW[50]);
    const reads = readsFixture({ caseId: 'prof-002', phase: 'ANALYSIS', revealed: [...RAJ_B34L_T13.revealed, 'aircraft_leases', 'lakeport_fare'], flags: { pressureTest: SATISFIED },
      extraTurns: [{ role: 'candidate', text: RAJ_B34L_T13.text }, { role: 'interviewer', text: "I'll come back to the fare trend across FY2024 and FY2025 shortly." }] });
    const p = planTurn(reads, RAJ_B34L_T15_TEXT, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} }) as ModelPlan;
    const d = await turnDataChecked(p, turn(RAJ_B34L_T13));
    expect(d.releases.map(r => r.id)).toEqual(['port_avery_per_flight']);
    expect(d.restates).toEqual([]);
    expect(linesOf(d)).toEqual([ledgerValue('prof-002', 'port_avery_per_flight'), "I don't have FY2024 fares."]);
  });
  it('#63 Raj (b35q) t11: the Jan–Mar cohort items, out → "I don\'t have later cohorts\' upgrade rates." alone (was: restated, no refusal)', async () => {
    classify.mockResolvedValueOnce(RAW[63]);
    const d = await turnDataChecked(plan(RAJ, { exhibitOnly: ['plan_prices_costs', 'plan_cac', 'ltv_definition'] }), turn(RAJ));
    expect(d.restates).toEqual([]);
    expect(d.releases).toEqual([]);
    expect(linesOf(d)).toEqual(["I don't have later cohorts' upgrade rates."]);
  });
  it('#66 Marisol (b35q) t11: plan_cac on Exhibit 1 → "I don\'t have Pro\'s CAC since January 2025." alone (was: restated, no refusal)', async () => {
    classify.mockResolvedValueOnce(RAW[66]);
    const d = await turnDataChecked(plan(MARISOL, { exhibitOnly: ['plan_prices_costs', 'plan_cac', 'ltv_definition', 'new_customers_by_plan'] }), turn(MARISOL));
    expect(d.restates).toEqual([]);
    expect(linesOf(d)).toEqual(["I don't have Pro's CAC since January 2025."]);
  });
});

describe('Task 61: true full answers stay full', () => {
  it('#12 Fiona (b29) t4: "operating margin over the period" with the cost shares → released with the exhibit, no refusal', async () => {
    classify.mockResolvedValueOnce(RAW[12]);
    const p = planOf(FIONA_T4);
    const d = await turnDataChecked(p, { requests: [FIONA_T4.ask as DeclaredRequest], exhibit: 'exhibit-a', rescueItem: null });
    expect(d.refusals).toEqual([]);
    expect(d.exhibit?.id).toBe('exhibit-a');
    expect(acted(p, 'itemless_defer')[0].detail).not.toHaveProperty('guard');
  });
  it('#67 Tyler (b35q) t11: "churn for upgraded customers measured from their upgrade date" names no qualifier → cohort_notes restated, no refusal', async () => {
    classify.mockResolvedValueOnce(RAW[67]);
    const d = await turnDataChecked(plan(TYLER), turn(TYLER));
    expect(d.restates.map(r => r.id)).toEqual(['cohort_notes']);
    expect(d.refusals).toEqual([]);
  });
  it('the asked period on the line: a FY2025 fare ask against the FY2025 fare → full (released, no refusal)', async () => {
    const what = 'the Lakeport fare in FY2025';
    classify.mockResolvedValueOnce({ items: [{ id: 'lakeport_fare', answers: 'full' }] });
    const p = planOf(RAJ_B34L_T13);
    const v = await checkAsk(p, what);
    expect(v.guard).toBeUndefined();
    expect(decideCheckedAsk(p, what, v)).toEqual({ kind: 'items', ids: ['lakeport_fare'] });
  });
  it('#30 shape, the period on the line: "COGS as a share of revenue today" against cogs_pct ("58% of revenue today") → full', async () => {
    const what = 'COGS as a share of revenue today';
    classify.mockResolvedValueOnce({ items: [{ id: 'cogs_pct', answers: 'full' }] });
    const p = planOf(SOFIA_T8);
    expect(decideCheckedAsk(p, what, await checkAsk(p, what))).toEqual({ kind: 'items', ids: ['cogs_pct'] });
  });
  it('#64 Marcus (b35q) t17: "Starter cohort beyond month 12" — cohort_notes states "after month 12" → both restated as before (Lorenzo\'s note)', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'starter_cohort', answers: 'full' }, { id: 'cohort_notes', answers: 'full' }] });
    const d = await turnDataChecked(plan(MARCUS_T17, { exhibitOnly: ['cohort_notes', 'pro_cohort', 'plan_prices_costs', 'ltv_definition', 'new_customers_by_plan'] }), turn(MARCUS_T17));
    expect(d.restates.map(r => r.id)).toEqual(['starter_cohort', 'cohort_notes']);
    expect(d.refusals).toEqual([]);
  });
});

describe('Task 61: a guard-made partial obeys E1', () => {
  it('not yet out and releasable → its line, then the refusal (#49: both fare lines, then "I don\'t have FY2024 fares.")', async () => {
    classify.mockResolvedValueOnce(RAW[49]);
    const d = await turnDataChecked(planOf(RAJ_B34L_T13), turn(RAJ_B34L_T13));
    expect(linesOf(d)).toEqual([ledgerValue('prof-002', 'lakeport_fare'), ledgerValue('prof-002', 'port_avery_per_flight'), "I don't have FY2024 fares."]);
  });
  it('… an item an exhibit holds (#63, the cohort items not yet out): the exhibit handed over, then the refusal', async () => {
    classify.mockResolvedValueOnce(RAW[63]);
    const p = plan(RAJ, { revealed: RAJ.revealed.filter(id => !['starter_cohort', 'cohort_notes', 'pro_cohort'].includes(id)) });
    const d = await turnDataChecked(p, turn(RAJ));
    expect(d.exhibit?.id).toBe('exhibit-2');
    expect(d.refusals).toEqual(["later cohorts' upgrade rates"]);
    expect(linesOf(d).at(-1)).toBe("I don't have later cohorts' upgrade rates.");
  });
  it('out already → the refusal alone, never a restate without it (#66)', async () => {
    classify.mockResolvedValueOnce(RAW[66]);
    const d = await turnDataChecked(plan(MARISOL), turn(MARISOL));
    expect(d.restates).toEqual([]);
    expect(linesOf(d)).toEqual(["I don't have Pro's CAC since January 2025."]);
  });
  it('gated (the pressure test not answered) → the refusal alone: not given, no deferral, no figure (#63)', async () => {
    classify.mockResolvedValueOnce(RAW[63]);
    const p = plan(RAJ, { pressureTest: AWAITING, revealed: [], shown: [], phase: 'STRUCTURE' });
    const d = await turnDataChecked(p, turn(RAJ));
    expect(d.releases).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(d.gateDefers).toEqual([]);
    expect(linesOf(d)).toEqual(["I don't have later cohorts' upgrade rates."]);
  });
});

describe('Task 61: figures in the refusal are the candidate\'s', () => {
  it('the post-turn number audit accepts "FY2024" in the refusal: the candidate said it ("how did fare fall over FY2024 versus FY2025?")', async () => {
    classify.mockResolvedValueOnce(RAW[49]);
    const p = planOf(RAJ_B34L_T13);
    const d = await turnDataChecked(p, turn(RAJ_B34L_T13));
    const refusal = linesOf(d).at(-1)!;
    expect(refusal).toBe("I don't have FY2024 fares.");
    const revealed = { ...revealedValues(p.state.ledger), ...Object.fromEntries(d.releases.map(r => [r.id, r.value])) };
    expect(auditTurn(refusal, revealed, p.ctx.candidateText)).toEqual({ passed: true, unexplainedNumbers: [] });
    // With nothing revealed and no candidate text the figure would be unexplained: the candidate's message carries it
    // (here competitor_entry's line, "Early in FY2024, …", is out too).
    expect(auditTurn(refusal, {}).unexplainedNumbers).toEqual(['2024']);
    expect(auditTurn(refusal, {}, p.ctx.candidateText).passed).toBe(true);
  });
  it('a figure no candidate turn said → no guard: the verdict decides as Haiku gave it', async () => {
    classify.mockResolvedValueOnce(RAW[49]);
    const p = planOf({ ...RAJ_B34L_T13, text: RAJ_B34L_T15_TEXT });
    const v = await checkAsk(p, RAJ_B34L_T13.ask.what);
    expect(v.guard).toBeUndefined();
    expect(decideCheckedAsk(p, RAJ_B34L_T13.ask.what, v)).toMatchObject({ kind: 'items', ids: ['lakeport_fare'] });
  });
});

describe('Task 61: the guard is the check\'s alone', () => {
  it('the model\'s own mapped request: released or restated as declared, no check, no refusal', async () => {
    const fx = { ...MARISOL, ask: { ...MARISOL.ask, itemIds: ['plan_cac'] } };
    const d = await turnDataChecked(plan(fx, { exhibitOnly: ['plan_prices_costs', 'plan_cac', 'ltv_definition', 'new_customers_by_plan'] }), turn(fx));
    expect(ask).not.toHaveBeenCalled();
    expect(d.refusals).toEqual([]);
    expect(d.restates.map(r => r.id)).toEqual(['plan_cac']);
  });
  it('the message classifier\'s detection with an item (its asks join as mapped requests): no check, no refusal', async () => {
    const asks = { sentences: [], detected: [], open: [], waited: false, fresh: [{ what: "how Pro's CAC has moved since January 2025", ledgerItemIds: ['plan_cac'], response: 'release', explicit: true }], covered: [], dropped: [] };
    const t = withAsks({ requests: [] as DeclaredRequest[], exhibit: null, rescueItem: null }, asks as unknown as TurnAsks);
    const d = await turnDataChecked(plan(MARISOL, { exhibitOnly: ['plan_prices_costs', 'plan_cac', 'ltv_definition', 'new_customers_by_plan'] }), t);
    expect(ask).not.toHaveBeenCalled();
    expect(d.refusals).toEqual([]);
  });
});

// Task 61 fix round 1 (controller's ruling on concern 1, b34l Tyler t2 / #52): "A missing second topic is not a
// gap in the items that answer the other topics." For a topic qualifier, an item whose label or line states its own
// conjunct keeps Haiku's label (a full item goes through every gate, a held one deferred by its name and booked);
// only the missing topic is refused beside it (the mixed-verdict path). Periods and scopes stay per item.
// b34l Tyler (51ad0cb8) t1, prof-002: the candidate's message verbatim; the check's verdict as recorded live.
const TYLER_B34L_T1 = { caseId: 'prof-002', text: "Let me make sure I have the problem right: revenue fell from $200M to $176M over two years, and we went from a $20M operating profit to a $4M loss, so a $24M swing — and load factors are roughly flat, so this isn't an empty-planes story.\n\nI'd structure it in three parts. First, revenue: decompose into number of flights, seats per flight, load factor, and average fare. Since load factor is flat, the revenue drop has to come from fewer flights flown or lower fares per passenger — or a mix shift across the six routes.\n\nSecond, costs: split into fixed (aircraft ownership, maintenance, hub facilities, salaried staff) versus variable (fuel, crew hours, landing fees, distribution). If revenue fell $24M and profit fell $24M, costs stayed roughly flat in total — which is itself a clue.\n\nThird, levers to get back to profit within 12 months: pricing, route rationalization, cost takeout.\n\nCan I start with the revenue side? Specifically, do we have the split of passengers flown and average fare for FY2023 versus FY2025?", ask: { what: 'passengers flown and average fare, FY2023 versus FY2025', itemIds: [], explicit: true, respond: 'release' }, phase: 'STRUCTURE', revealed: [] as string[], shown: [] as string[], found: [] };
const TYLER_52 = { items: ['network_totals', 'route_results_lakeport', 'route_results_port_avery', 'route_results_other', 'lakeport_fare'].map(id => ({ id, answers: 'full' })) };

describe('Task 61 fix round 1: a missing second topic leaves the items answering the other topic as Haiku labelled them', () => {
  it('#52 Tyler (b34l) t1, gated: the held fare deferred by its name and booked; "passengers flown" refused beside it', async () => {
    classify.mockResolvedValueOnce(TYLER_52);
    const p = planOf(TYLER_B34L_T1, { pressureTest: AWAITING });
    const d = await turnDataChecked(p, turn(TYLER_B34L_T1));
    expect(acted(p, 'itemless_defer')[0].detail).toMatchObject({ decision: 'items', guard: { parts: ['passengers flown'], ids: ['network_totals', 'route_results_lakeport', 'route_results_port_avery', 'route_results_other'] } });
    expect(d.releases).toEqual([]);
    expect(d.gatedIds).toEqual(['lakeport_fare']);
    expect(d.refusals).toEqual(['passengers flown']);
    expect(decisionRows(d).filter(r => r.response === 'defer').map(r => r.ledgerItemIds)).toEqual([['lakeport_fare']]);
    const lines = renderDataLines(d, 's').join(' ');
    expect(lines).toMatch(/I don't have passengers flown/);
    expect(lines).toMatch(/fare/i);
    expect(lines).not.toMatch(/\d/);
  });
  it('#52, the pressure test answered and the route results out (the fare\'s release order met): the fare released, then "I don\'t have passengers flown."', async () => {
    classify.mockResolvedValueOnce(TYLER_52);
    const p = planOf(TYLER_B34L_T1, { phase: 'ANALYSIS', revealed: RAJ_B34L_T13.revealed });
    const d = await turnDataChecked(p, turn(TYLER_B34L_T1));
    expect(d.releases.map(r => r.id)).toEqual(['lakeport_fare']);
    expect(renderDataLines(d, 's')).toEqual([ledgerValue('prof-002', 'lakeport_fare'), "I don't have passengers flown."]);
  });
  it('#52, the pressure test answered, the fare held by the release order: "I\'ll come back to the Hub–Lakeport fare", booked, beside the refusal', async () => {
    classify.mockResolvedValueOnce(TYLER_52);
    const d = await turnDataChecked(planOf(TYLER_B34L_T1, { phase: 'ANALYSIS' }), turn(TYLER_B34L_T1));
    expect(d.releases).toEqual([]);
    expect(d.defers).toEqual(['the Hub–Lakeport fare']);
    expect(d.refusals).toEqual(['passengers flown']);
    expect(decisionRows(d).filter(r => r.response === 'defer').map(r => r.ledgerItemIds)).toEqual([['lakeport_fare']]);
  });
  it('constructed: a full item answering one conjunct, out already, beside a missing topic → restated, "I don\'t have current waste rates." beside it', async () => {
    const WHAT = 'the bean price change and current waste rates';
    classify.mockResolvedValueOnce({ items: [{ id: 'bean_price_change', answers: 'full' }] });
    const p = planOf(SOFIA_B30_T14);
    expect(decideCheckedAsk(p, WHAT, await checkAsk(p, WHAT))).toEqual({ kind: 'items', ids: ['bean_price_change'], missing: ['current waste rates'] });
  });
  it('#18 still: neither item states a conjunct → both partial, both topics refused', async () => {
    classify.mockResolvedValueOnce(RAW[18]);
    const p = planOf(SOFIA_B30_T14);
    expect(decideCheckedAsk(p, SOFIA_B30_T14.ask.what, await checkAsk(p, SOFIA_B30_T14.ask.what)))
      .toEqual({ kind: 'coarse', ids: ['bean_price_change', 'bean_share_of_cogs'], missing: ['current waste rates', 'bean contracting terms'] });
  });
  it('a period or scope stays per item: #49\'s Lakeport fare (Haiku "full") is partial for FY2024', async () => {
    classify.mockResolvedValueOnce(RAW[49]);
    const p = planOf(RAJ_B34L_T13);
    const v = await checkAsk(p, RAJ_B34L_T13.ask.what);
    expect(v.guard?.ids).toEqual(['lakeport_fare', 'port_avery_per_flight']);
  });
});

// Task 61 fix round 2 (Opus review of d154476..856195f): the reviewer's repros end to end — the check's verdict
// "full", the line states the period, trend or scope → released (or restated), no refusal.
describe('Task 61 fix round 2: lines that state the qualifier stay full, end to end', () => {
  const P2 = ['network_totals', 'competitor_entry', 'route_results_lakeport', 'route_results_port_avery', 'route_results_other', 'fixed_costs'];
  const e2e = async (caseId: string, text: string, what: string, ids: string[], revealed: string[], phase: Phase = 'ANALYSIS') => {
    classify.mockResolvedValueOnce({ items: ids.map(id => ({ id, answers: 'full' })) });
    const p = planOf({ caseId, text, ask: { what, itemIds: [], explicit: true, respond: 'release' }, phase, revealed, shown: [], found: [] });
    const d = await turnDataChecked(p, { requests: [{ what, itemIds: [], explicit: true, respond: 'release' } as DeclaredRequest], exhibit: null, rescueItem: null });
    return { d, lines: renderDataLines(d, 's'), guard: (acted(p, 'itemless_defer')[0]?.detail as { guard?: unknown } | undefined)?.guard };
  };
  it.each([
    ['prof-002', 'Have wages changed at all over the period? How have wages changed?', 'how wages have changed', ['unit_costs'], P2],
    ['prof-002', 'What was FY2025 revenue on the other four routes?', 'FY2025 revenue on the other four routes', ['route_results_other'], P2.filter(x => x !== 'route_results_other')],
    ['prof-002', 'Has the fleet changed since FY2023?', 'the fleet since FY2023', ['fleet'], P2],
    ['prof-002', 'Have the routes changed since FY2023?', 'changes to the route network since FY2023', ['routes_schedule'], P2],
    ['launch-001', 'What are market prices for chickpea snacks?', 'market prices for chickpea snacks', ['competitor_prices'], []],
  ] as [string, string, string, string[], string[]][])('%s "%s" → the line, no refusal', async (caseId, text, what, ids, revealed) => {
    const { d, lines, guard } = await e2e(caseId, text, what, ids, revealed);
    expect(guard).toBeUndefined();
    expect(d.refusals).toEqual([]);
    expect(lines.join(' ')).not.toMatch(/don't have|not something I have/);
    expect(lines.join(' ')).toContain(ledgerValue(caseId, ids[0]));
  });
  it('pricing-001 "Pro retention over time" (the Pro cohort table, month 1 to 12) → Exhibit 2 handed over, no refusal', async () => {
    const { d, lines, guard } = await e2e('pricing-001', 'How does Pro retention look over time?', 'Pro retention over time', ['pro_cohort'], ['plan_prices_costs', 'plan_cac', 'ltv_definition'], 'EXHIBIT');
    expect(guard).toBeUndefined();
    expect(d.refusals).toEqual([]);
    expect(lines.join(' ')).not.toMatch(/don't have/);
  });
});

// Fix round 2, the controller's ruling on finding 5: a period inside one conjunct applies only to the items that
// answer that conjunct; the other conjunct's items keep Haiku's label and their gates.
describe('Task 61 fix round 2: a period per conjunct', () => {
  it('"the FY2024 fare and the current load factor": the load factor stays full (released); "the FY2024 fare" refused', async () => {
    const what = 'the FY2024 fare and the current load factor';
    classify.mockResolvedValueOnce({ items: [{ id: 'lakeport_fare', answers: 'full' }, { id: 'lakeport_seats_load', answers: 'full' }] });
    const p = planOf(RAJ_B34L_T13);
    const v = await checkAsk(p, what);
    expect(v.guard).toMatchObject({ ids: ['lakeport_fare'], parts: ['the FY2024 fare'] });
    expect(decideCheckedAsk(p, what, v)).toEqual({ kind: 'items', ids: ['lakeport_seats_load'], missing: ['the FY2024 fare'] });
  });
});

// Fix round 2, finding 6: with a guard, Haiku's own whole-ask partial is still logged (`partial_dropped`).
describe('Task 61 fix round 2: telemetry', () => {
  it('mixed path: bean_share_of_cogs partial with the whole ask as its missing part → one whole_ask partial_dropped record beside the guard\'s refusal', async () => {
    const WHAT = 'the bean price change and current waste rates';
    classify.mockResolvedValueOnce({ items: [{ id: 'bean_price_change', answers: 'full' }, { id: 'bean_share_of_cogs', answers: 'partial', missing: WHAT }] });
    const p = planOf(SOFIA_B30_T14);
    const c = decideCheckedAsk(p, WHAT, await checkAsk(p, WHAT));
    expect(c).toMatchObject({ kind: 'items', ids: ['bean_price_change'], missing: ['current waste rates'] });
    expect(acted(p, 'partial_dropped').map(e => e.detail)).toMatchObject([{ item: 'bean_share_of_cogs', checked: WHAT, why: 'whole_ask' }]);
  });
});
