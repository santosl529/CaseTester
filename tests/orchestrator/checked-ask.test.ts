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
import { turnDataChecked, decideCheckedAsk, checkAsk } from '@/lib/orchestrator/turn-data';
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
  it('Marisol t11: plan_cac, on Exhibit 1, restated as the exhibit shows', async () => {
    classify.mockResolvedValueOnce(MARISOL.found);
    const p = plan(MARISOL, { exhibitOnly: ['plan_prices_costs', 'plan_cac', 'ltv_definition', 'new_customers_by_plan'] });
    const d = await turnDataChecked(p, turn(MARISOL));
    expect(d.restates).toEqual([{ id: 'plan_cac', value: value('plan_cac'), exhibit: true }]);
    expect(d.defers).toEqual([]);
    expect(renderDataLines(d, 's')).toHaveLength(1);
    expect(renderDataLines(d, 's')[0]).toContain(value('plan_cac'));
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
  it('Raj t11 (mixed): upgrade_timing released now; starter_cohort and cohort_notes, already said, not restated', async () => {
    classify.mockResolvedValueOnce(RAJ.found);
    const p = plan(RAJ, { exhibitOnly: ['plan_prices_costs', 'plan_cac', 'ltv_definition'] });
    const d = await turnDataChecked(p, turn(RAJ));
    expect(d.releases.map(r => r.id)).toEqual(['upgrade_timing']);
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual([value('upgrade_timing')]);
    expect(d.defers).toEqual([]);
    expect(d.refusals).toEqual([]);
    expect(renderDataLines(d, 's').join(' ')).not.toContain('upgrade rates for later cohorts');
  });
  // A gated item: the Starter cohort and its notes (ANALYSIS data) before the
  // structure is settled; upgrade_timing is clarifying data, never gated, so it goes.
  it('… before the pressure test is answered: the gated cohort items deferred by their names, booked, no figure; upgrade_timing still goes', async () => {
    classify.mockResolvedValueOnce(RAJ.found);
    const p = plan(RAJ, { pressureTest: AWAITING, revealed: [], shown: [], phase: 'STRUCTURE' });
    const d = await turnDataChecked(p, turn(RAJ));
    expect(d.releases.map(r => r.id)).toEqual(['upgrade_timing']);
    expect(d.gatedIds).toEqual(['starter_cohort', 'cohort_notes']);
    expect(d.gateDefers).toEqual(["the Starter cohort's status", 'the notes on the cohorts']);
    expect(d.itemlessDefers).toBeUndefined();
    const line = renderDataLines(d, 's').at(-1)!;
    expect(line).toContain("the Starter cohort's status and the notes on the cohorts");
    expect(line).not.toContain('upgrade rates for later cohorts');
    expect(line).not.toMatch(NO_FIGURE);
    expect(decisionRows(d).filter(r => r.response === 'defer').map(r => r.ledgerItemIds)).toEqual([['starter_cohort'], ['cohort_notes']]);
  });
  it('… held over the release cap: deferred by its spoken name ("I\'ll come back to when customers upgrade"), booked, no figure', async () => {
    classify.mockResolvedValueOnce([{ what: 'upgrade rates for later cohorts', ledgerItemIds: ['why_pro_fell', 'buyer_profile', 'competitor_prices', 'upgrade_timing'], response: 'none', explicit: true }]);
    const p = plan(RAJ);
    const d = await turnDataChecked(p, turn(RAJ));
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
    classify.mockResolvedValueOnce([{ what: 'upgrade rates for later cohorts', ledgerItemIds: ['why_pro_fell', 'buyer_profile', 'competitor_prices', 'upgrade_timing'], response: 'none', explicit: true }]);
    const p = plan(RAJ);
    p.state.kind = 'close';
    const d = await turnDataChecked(p, turn(RAJ));
    expect(d.defers).toEqual([]);
    expect(renderDataLines(d, 's').at(-1)).toBe("We won't get to when customers upgrade today.");
    expect(decisionRows(d).find(r => r.ledgerItemIds.includes('upgrade_timing'))).toMatchObject({ response: 'defer', wontGetTo: true });
  });
});

// Final review (20 Oct), Review Focus 1 on the items path (Task 45): a check-mapped item the release order holds
// back is deferred by its name and booked, never released. Raj's ask as the check might map it to the price test's
// notes, on Exhibit 4, which waits on Exhibits 1-3 (only Exhibit 1 is shown).
describe('(d) a mapped item held by the release order', () => {
  const NOTES = [{ what: 'upgrade rates for later cohorts', ledgerItemIds: ['price_test_notes'], response: 'none', explicit: true }];
  it('Raj t11 → price_test_notes, Exhibit 4 not ready: "I\'ll come back to the notes on the price test", booked, nothing released', async () => {
    classify.mockResolvedValueOnce(NOTES);
    const p = plan(RAJ);
    const d = await turnDataChecked(p, turn(RAJ));
    expect(acted(p, 'checked_ask').map(e => e.detail)).toEqual([{ asks: [{ what: 'upgrade rates for later cohorts', kind: 'items', ids: ['price_test_notes'] }] }]);
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
    expect(renderDataLines(d, 's')).toEqual(["I don't have week-by-week sign-ups."]);
    expect(renderDataLines(d, 's').join(' ')).not.toMatch(NO_FIGURE);
  });
  it('mixed full + partial (Tyler t11): the full item decides as today (cohort_notes, out: restated); the partial one (upgrade_timing) is not given, its missing part refused (fix round 2)', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'upgrade_timing', answers: 'partial', missing: 'churn for upgraded customers' }, { id: 'cohort_notes', answers: 'full' }] });
    const p = plan(TYLER);
    const d = await turnDataChecked(p, turn(TYLER));
    expect(d.restates.map(r => r.id)).toEqual(['cohort_notes']);
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual(['churn for upgraded customers']);
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
      q.onUsage?.({ component: 'data_request', model: 'claude-haiku-4-5', inputTokens: 1200, outputTokens: 40 });
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
      .toEqual({ kind: 'coarse', ids: ['upgrade_timing'], missing: 'x' });
    expect(decideCheckedAsk(p(), 'x', { mapped: true, ids: ['upgrade_timing', 'price_test_notes'], outOfScope: [], partial: ['upgrade_timing'], missing: { upgrade_timing: 'x' } }))
      .toEqual({ kind: 'items', ids: ['price_test_notes'], missing: ['x'] });
    // Out of scope and partial both coarse; the partial's missing part speaks.
    expect(decideCheckedAsk(p(), 'x', { mapped: true, ids: ['price_test_results', 'upgrade_timing'], outOfScope: ['price_test_results'], partial: ['upgrade_timing'], missing: { upgrade_timing: 'y' } }))
      .toEqual({ kind: 'coarse', ids: ['price_test_results', 'upgrade_timing'], missing: 'y' });
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
  it('#18 Sofia (b30) t14: bean_price_change full (out: restated) and bean_share_of_cogs partial → the restate and "I don\'t have current waste rates and bean contracting terms."', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'bean_price_change', answers: 'full' }, { id: 'bean_share_of_cogs', answers: 'partial', missing: 'current bean contracting terms' }] });
    const p = planOf(SOFIA_B30_T14);
    const d = await turnDataChecked(p, turn(SOFIA_B30_T14));
    expect(d.restates.map(r => r.id)).toEqual(['bean_price_change']);
    expect(d.releases).toEqual([]);
    // "current bean contracting terms" is not a span of the ask: the ask's own words.
    expect(d.refusals).toEqual(['current waste rates and bean contracting terms']);
    const lines = renderDataLines(d, 's');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('current waste rates and bean contracting terms');
    expect(lines.join(' ')).not.toMatch(/25% of COGS/);   // the partial item itself is not said
    expect(acted(p, 'checked_ask')[0].detail).toMatchObject({ asks: [{ kind: 'items', ids: ['bean_price_change'], missing: ['current waste rates and bean contracting terms'] }] });
  });
});

describe('fix round 2: a missing part the item\'s line states is no missing part', () => {
  it('#49 Raj (b34l) t13: the fares not yet out → both lines, and "I don\'t have the fare trend across FY2024." (FY2025 is on the Lakeport line)', async () => {
    classify.mockResolvedValueOnce(FARE_PARTIAL);
    const p = planOf(RAJ_B34L_T13);
    const d = await turnDataChecked(p, turn(RAJ_B34L_T13));
    expect(d.releases.map(r => r.id)).toEqual(['lakeport_fare', 'port_avery_per_flight']);
    expect(d.refusals).toEqual(['the fare trend across FY2024']);
    expect(renderDataLines(d, 's').at(-1)).toMatch(/the fare trend across FY2024\b(?! and)/i);
  });
  it('#50 Raj (b34l) t15: the fares already out → the refusal alone, FY2025 not named as missing', async () => {
    classify.mockResolvedValueOnce(FARE_PARTIAL);
    const p = planOf(RAJ_B34L_T13, { revealed: [...RAJ_B34L_T13.revealed, 'lakeport_fare', 'port_avery_per_flight'] });
    const d = await turnDataChecked(p, turn(RAJ_B34L_T13));
    expect(d.releases).toEqual([]);
    expect(d.restates).toEqual([]);
    expect(d.refusals).toEqual(['the fare trend across FY2024']);
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
