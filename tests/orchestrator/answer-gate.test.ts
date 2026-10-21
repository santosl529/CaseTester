// Round 6 Task 70 (Lorenzo, 21 Oct: "The guard on every path that gives a data line, not
// just the check's labels, with the company and forecast/current tags inside it. When it
// finds a topic unmet, refuse that part ("I don't have <part>") rather than releasing the
// item as a coarse answer."). The answer gate (turn-data.ts answerGate) on a tagged case:
// the check's verdicts (in place of the round-5c qualifier guard), the model's mapped asks,
// the message's detections, the coverage step and the names remap. A topic, entity or
// forecast unmet drops the items answering that part and refuses it; a period or scope unmet
// keeps E1's form. Every part is said unchecked (no model call BASE didn't make). Untagged
// prof-001: no gate. Fixtures: the candidate's message, the model's requests and the check's
// mapping verbatim from batches 34, 36 and 37 (oct 20 runs 1-5; audit rows 2, 10, 15, 18, 19,
// 22, docs/superpowers/plans/2026-10-21-data-path-audit.md), the ledger state as it stood.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
const { classify, ask } = vi.hoisted(() => ({ classify: vi.fn(async (): Promise<unknown> => []), ask: vi.fn() }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: classify, classifyAsk: ask }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnDataChecked, answerGate } from '@/lib/orchestrator/turn-data';
import { renderDataLines } from '@/lib/orchestrator/data-decisions';
import { unmetQualifiers, askQualifiers, gateReading } from '@/lib/orchestrator/ask-qualifiers';
import { tagsAgree } from '@/lib/orchestrator/item-tags';
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { getCaseById } from '@/lib/cases/loader';
import { readsFixture } from './fixtures/turn-reads';
import { askVia } from './fixtures/ask-check';
import { taggedFactBase } from './fixtures/tagged-cases';

const SATISFIED = { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false };
type Fx = { caseId: string; text: string; requests: DeclaredRequest[]; phase: Phase; revealed: string[]; shown: string[] };
const plan = (fx: Fx): ModelPlan => {
  const p = planTurn(readsFixture({ caseId: fx.caseId, phase: fx.phase, revealed: fx.revealed, flags: { pressureTest: SATISFIED } }), fx.text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  for (const id of fx.shown) p.state.shownExhibitIds.add(id);
  return p;
};
const turn = (fx: Fx, requests = fx.requests) => ({ requests, exhibit: null, rescueItem: null });
const acts = (p: ModelPlan, check: string) => p.ctx.checks.entries.filter(e => e.check === check);
const value = (caseId: string, id: string) => getCaseById(caseId).dataLedger.find(i => i.id === id)!.value;
const req = (what: string, itemIds: string[] = [], o: Partial<DeclaredRequest> = {}): DeclaredRequest => ({ what, itemIds, explicit: true, respond: 'release', ...o });
beforeEach(() => { classify.mockReset(); classify.mockImplementation(async () => []); ask.mockReset(); ask.mockImplementation(askVia(classify)); });

// b36 Larkspur Marisol 5907649a t11 → t12 (audit row 2): the check mapped "how many flights a day
// the entrant runs on each route" to 8 Larkspur items "full" and the new routes' line went out.
const MARISOL_B36L_T11: Fx = {
  caseId: 'prof-002', phase: 'EXHIBIT', shown: ['exhibit-1', 'exhibit-2'],
  revealed: ['routes_schedule', 'route_results_lakeport', 'route_results_port_avery', 'route_results_other', 'network_totals', 'fixed_costs', 'port_avery_per_flight', 'lakeport_seats_load', 'lakeport_fare', 'extras_revenue', 'lakeport_variable_cost', 'competitor_entry'],
  text: "I applied Port Avery's 33% decline to Lakeport's FY2025 fare of $120, which is the ending figure, not the base. The percentage should go on the starting year. And in any case I didn't need it — the exhibit gives me $200 in FY2023 directly, a 40% fall. So Lakeport's drop is steeper than Port Avery's 33%.\n\nSo the story is clean: a low-cost entrant on two of six routes, Larkspur matched fares, kept load factor, and gave up $24M of revenue straight off the bottom line.\n\nNow, on fixing it. Lakeport loses $600 per flight. If I take Port Avery's fare erosion of $80 per passenger and apply it to Lakeport's 60 passengers, that's $4,800 per flight of lost revenue — so recovering even part of that closes the gap quickly.\n\nDo we know anything about the entrant's cost per seat, or how many flights a day they're running on each route?",
  requests: [req("the entrant's cost per seat and fares", ['competitor_costs']), req('how many flights a day the entrant runs on each route')],
};
const EIGHT = ['routes_schedule', 'route_results_lakeport', 'route_results_port_avery', 'route_results_other', 'network_totals', 'lakeport_seats_load', 'port_avery_per_flight', 'new_routes_cost_flights'];

// b37 Hollis Bay Marcus ddbb070b t5 → t6 (audit row 10): the chickpea costs given as a coarse item, with Exhibit 1.
const MARCUS_B37H_T5: Fx = {
  caseId: 'launch-001', phase: 'STRUCTURE', shown: [], revealed: [],
  text: "Fair — I'm inferring it rather than evidencing it. Flat sales with rising commodity costs is a pattern I've seen a lot in packaged food, and nothing so far contradicts it. But I'd concede I'm ahead of the data.\n\nFor it to fail breakeven, you'd basically need the fixed cost base — the new line, slotting fees, launch marketing — to be large relative to realistic year-one volume, or for retailers to refuse the shelf space. Both are solvable with pricing, which is why I still land on launch.\n\nOne thing that would help: do we have Hollis Bay's chip cost of goods broken out over the last three or four years — ingredients, oil, packaging, freight — and how gross margin moved over that period? That would confirm the input cost story directly.\n\nEven without it, I'd hold the recommendation: launch, premium price the chickpeas, take price on chips.",
  requests: [req('chip cost of goods and gross margin over the last few years')],
};
const MARCUS_B37H_T5_FOUND = { items: [{ id: 'variable_costs', answers: 'full' }, { id: 'bag_price', answers: 'partial', missing: 'chip cost of goods and gross margin over the last few years' }] };

// b36 Aldermoor Raj 3fdb20e8 t11 → t12 (audit row 18) and t13 → t14 (row 19).
const RAJ_B36A_T11: Fx = {
  caseId: 'entry-001', phase: 'ANALYSIS', shown: [], revealed: ['funnel_rates', 'nimbrel', 'current_treatment'],
  text: "Nimbrel at $9,000 is a third of what I assumed, so the required share triples.\n\n$300M ÷ $9,000 = ~33,000 patients. Out of 200,000 eligible, that's about 17% share — not 5%. That's a much harder ask against an eight-year incumbent that most advanced-therapy patients already use.\n\nTwo levers close the gap. One, price: Kelvexa is once-daily oral versus a fortnightly injection, which is a real convenience and adherence advantage, so a premium to $9,000 may be defensible — at $15,000 we'd only need 20,000 patients, about 10% share. Two, pool expansion: oral administration could pull in treated patients who refuse injections and currently sit on older therapy.\n\nDo we have data on what share of the 200,000 are currently on an advanced therapy versus untreated for severity? And is there any efficacy comparison between Kelvexa and Nimbrel?",
  requests: [req('advanced therapy usage among the eligible patients'), req('the efficacy comparison between Kelvexa and Nimbrel', ['trial_comparison'])],
};
const RAJ_B36A_T13: Fx = {
  caseId: 'entry-001', phase: 'ANALYSIS', shown: [], revealed: ['funnel_rates', 'nimbrel', 'current_treatment', 'peak_share_forecast', 'trial_comparison'],
  text: "Three things, in order.\n\nOne, the payer evidence. Efficacy is only similar, so US payers won't fund a big premium on convenience alone unless we can show lower total cost of care — fewer infections and no infusion/injection administration costs. I'd test with 8–10 pharmacy benefit managers what tier and rebate Kelvexa gets at $12–15k, and whether they'd impose step-through Nimbrel first. A step edit alone could delay us past the five-year peak.\n\nTwo, patient and physician switching. The 20% forecast likely assumes switchers, but stable patients on an eight-year incumbent rarely move. I'd split the 200,000 into new starts per year versus existing Nimbrel patients, and target new starts — if new starts are only 15–20,000 a year, 33,000 patients takes most of those for several years, which is what makes five years tight.\n\nThree, Nimbrel's response — loss of exclusivity timing, and whether it can rebate down to defend.\n\nDo we have Nimbrel's patent expiry and any oral competitors in late-stage trials?",
  requests: [
    req("Nimbrel's patent expiry and late-stage oral competitors"),
    req('Kelvexa US pricing, rebates and time on treatment', ['kelvexa_pricing'], { explicit: false }),
    req('US insurance coverage and prior approval', ['insurance_coverage'], { explicit: false }),
  ],
};

// b36 Aldermoor Marisol 6f57da6e t5 → t6 (audit row 22): the static funnel restated for "growth".
const MARISOL_B36A_T5: Fx = {
  caseId: 'entry-001', phase: 'ANALYSIS', shown: [], revealed: ['funnel_rates'],
  text: "I'll assume roughly 260 million US adults — tell me if you'd rather I use a different base.\n\nSo prevalence: 260 million × 1.6% = 4.16 million with Corlan's.\nDiagnosed: 50% of 4.16 million = 2.08 million.\nTreated with prescription medicine: 50% of 2.08 million = 1.04 million.\n\nNow the severity cut. Moderate-to-severe is a disease characteristic, so I'd read that 20% against the prevalent population rather than the treated slice: 20% × 4.16 million = 832,000 patients eligible for Kelvexa.\n\nTo get from patients to dollars I need two more things: the peak share of that eligible pool Kelvexa captures, and net price per patient per year — net of rebates to US payers, which can be steep. Compliance and persistency matter too, since not everyone stays on a year.\n\nDo we have data on how the eligible pool has grown over the last few years? Diagnosis rates often drift up.",
  requests: [req('the number of US adults', ['us_adults']), req('growth in the eligible pool over recent years')],
};

// b37 Quillpath Tyler a2a5921b t17 → t18 (audit row 15): "2024" on the line and two years met the trend.
const TYLER_B37Q_T17: Fx = {
  caseId: 'pricing-001', phase: 'EXHIBIT', shown: ['exhibit-1', 'exhibit-2', 'exhibit-3'],
  revealed: ['pro_cohort', 'starter_cohort', 'cohort_notes', 'plan_prices_costs', 'plan_cac', 'ltv_definition', 'signup_channels', 'new_customers_by_plan'],
  text: "This is the cannibalization check, and it's not clean. Pro sign-ups fell from 500 a month to 350 — 150 lost per month, a 30% drop. Total volume nearly tripled, 500 to 1,350, so there's real new demand, but some share of those 150 are people who'd have bought Pro at $100 and now self-select into Starter at $40.\n\nThe question is how many. If all 150 are true cannibalization, the cost is 150 × $3,900 = $585,000 a month in lost Pro LTV, less the $1,200 CAC saved on each, so about $405,000 net.\n\nAgainst that, Starter delivers 1,000 sign-ups × $1,340 of total value = $1,340,000 a month, less acquisition: 1,000 × $288 = $288,000, so roughly $1.05 million net. That more than covers the worst-case cannibalization.\n\nDo we know whether Pro sign-ups were already trending down through 2024, before Starter launched?",
  requests: [req('the 2024 trend in Pro sign-ups before Starter launched')],
};

// b34 Larkspur Marisol e6432db0 t29 → t30 (the controller's one-directional ruling, 21 Oct): "our"
// excluded the competitor's cost line, and she got a hollow named deferral.
const MARISOL_B34L_T29: Fx = {
  caseId: 'prof-002', phase: 'BRAINSTORM', shown: ['exhibit-1', 'exhibit-2', 'exhibit-3'],
  revealed: ['lakeport_seats_load', 'lakeport_fare', 'extras_revenue', 'lakeport_variable_cost', 'port_avery_per_flight', 'network_totals', 'competitor_entry', 'route_results_lakeport', 'route_results_port_avery', 'route_results_other', 'fixed_costs', 'new_routes_plan', 'new_routes_cost_flights', 'new_routes_context', 'competitor_costs', 'new_route_rampup'],
  text: "A few levers, and the gap is small — we're only about $0.2M short.\n\nFirst, extras. $20 per passenger is low; bags and seat selection are the highest-margin dollars in the business and they don't trigger a competitive response the way headline fares do. On the four uncontested routes we're carrying 60 passengers across 9,000 flights — 540,000 passengers. Even $5 more per passenger is $2.7M, which closes the gap by itself.\n\nSecond, price on the four protected routes. Cedar Bluff, Granite Falls, Millbrook and Westhaven have no entrant and are flat year over year; modest increases there are low-risk.\n\nThird, stage the exit — keep the contested routes running while the new ones ramp rather than taking both hits at once.\n\nFourth, the $9,200 cost per flight. The entrant is 30% below us on cost. Do we have a breakdown of where our cost disadvantage sits — labor, aircraft size, or utilization?",
  requests: [req('the cost disadvantage breakdown by labor, aircraft size and utilization')],
};

describe('the answer gate on the check\'s verdicts (in place of the qualifier guard)', () => {
  it('b36l Marisol t11 (row 2): 8 Larkspur items for "the entrant" — all dropped, the ask refused, no new-routes line', async () => {
    classify.mockResolvedValueOnce({ items: EIGHT.map(id => ({ id, answers: 'full' })) });
    const p = plan(MARISOL_B36L_T11);
    const d = await turnDataChecked(p, turn(MARISOL_B36L_T11));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(d.releases.map(r => r.id)).toEqual(['competitor_costs']);
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's').join(' ')).not.toContain(value('prof-002', 'new_routes_cost_flights'));
    expect(d.refusals).toEqual(['how many flights a day the entrant runs on each route']);
    expect(acts(p, 'itemless_defer')[0].detail).toMatchObject({ mapped: false, tagDropped: EIGHT, guard: { parts: ['how many flights a day the entrant runs on each route'], drop: EIGHT } });
    expect(acts(p, 'answer_gate')[0].detail).toEqual({ asks: [{ what: 'how many flights a day the entrant runs on each route', path: 'check', refuse: ['how many flights a day the entrant runs on each route'], drop: EIGHT, partial: [] }] });
  });
  it('b37h Marcus t5 (row 10): both topics unmet — the chickpea costs and the bag price dropped, no Exhibit 1, both parts refused', async () => {
    classify.mockResolvedValueOnce(MARCUS_B37H_T5_FOUND);
    const p = plan(MARCUS_B37H_T5);
    const d = await turnDataChecked(p, turn(MARCUS_B37H_T5));
    expect(d.releases).toEqual([]);
    expect(d.exhibit).toBeNull();
    expect(renderDataLines(d, 's')).toEqual(["I don't have chip cost of goods or gross margin over the last few years."]);
    expect(acts(p, 'itemless_defer')[0].detail).toMatchObject({ decision: 'refuse', guard: { parts: ['chip cost of goods', 'gross margin over the last few years'], drop: ['variable_costs', 'bag_price'] } });
    expect(acts(p, 'scope_coarse')).toEqual([]);
  });
  it('b36a Raj t13 (row 19): Kelvexa\'s patents dropped for "Nimbrel\'s patent expiry" (entity), both parts refused', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'patents', answers: 'full' }, { id: 'nimbrel', answers: 'partial', missing: 'late-stage oral competitors' }] });
    const p = plan(RAJ_B36A_T13);
    const d = await turnDataChecked(p, turn(RAJ_B36A_T13));
    expect(d.releases).toEqual([]);
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's')).toContain("I don't have Nimbrel's patent expiry or late-stage oral competitors.");
    expect(acts(p, 'itemless_defer')[0].detail).toMatchObject({ tagDropped: ['patents'], guard: { drop: ['patents', 'nimbrel'] } });
  });
  it('b36a Raj t11 (row 18): the forecast peak share dropped for "currently on an advanced therapy" (the sentence), the ask refused', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'funnel_rates', answers: 'full' }, { id: 'peak_share_forecast', answers: 'full' }] });
    const p = plan(RAJ_B36A_T11);
    const d = await turnDataChecked(p, turn(RAJ_B36A_T11));
    expect(d.releases.map(r => r.id)).toEqual(['trial_comparison']);
    // funnel_rates, out already and "full" by the check, is restated as the check mapped it; the forecast's part is said beside it.
    expect(d.restates.map(r => r.id)).toEqual(['funnel_rates']);
    expect(renderDataLines(d, 's').join(' ')).not.toContain(value('entry-001', 'peak_share_forecast'));
    expect(d.refusals).toEqual(['advanced therapy usage among the eligible patients']);
    expect(acts(p, 'itemless_defer')[0].detail).toMatchObject({ tagDropped: ['peak_share_forecast'], guard: { said: ['advanced therapy usage among the eligible patients'] } });
  });
  it('b36a Marisol t5 (row 22): "growth … over recent years" unmet, the funnel out already → the refusal alone, no restatement', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'funnel_rates', answers: 'full' }] });
    const p = plan(MARISOL_B36A_T5);
    const d = await turnDataChecked(p, turn(MARISOL_B36A_T5));
    expect(d.releases.map(r => r.id)).toEqual(['us_adults']);
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual([value('entry-001', 'us_adults'), "I don't have growth in the eligible pool over recent years."]);
    expect(acts(p, 'itemless_defer')[0].detail).toMatchObject({ decision: 'coarse', guard: { ids: ['funnel_rates'] } });
  });
  it('b37q Tyler t17 (row 15): a trend within 2024 unmet by "500 Pro in 2024" → the refusal alone', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'new_customers_by_plan', answers: 'full' }] });
    const p = plan(TYLER_B37Q_T17);
    const d = await turnDataChecked(p, turn(TYLER_B37Q_T17));
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have the 2024 trend in Pro sign-ups before Starter launched."]);
  });
});

// Constructed asks (no corpus turn has these shapes): the candidate's sentence is the ask as a
// question; prof-002 as at b36l Marisol t11 with the Lakeport fare not yet out (its exhibit order met).
const asked = (caseId: string, what: string, itemIds: string[] = [], o: Partial<Fx> = {}): Fx => ({
  caseId, phase: 'ANALYSIS', shown: [], revealed: [], text: `Do we have ${what}?`, requests: [req(what, itemIds)], ...o,
});
const FARE_READY = { revealed: MARISOL_B36L_T11.revealed.filter(id => id !== 'lakeport_fare'), shown: ['exhibit-1', 'exhibit-2'] };
describe('the answer gate on the model\'s mapped asks', () => {
  it('a met period stays a plain release: "the average one-way fare on Hub–Lakeport in FY2025" → lakeport_fare, no gate', async () => {
    const fx = asked('prof-002', 'the average one-way fare on Hub–Lakeport in FY2025', ['lakeport_fare'], FARE_READY);
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(d.releases.map(r => r.id)).toEqual(['lakeport_fare']);
    expect(d.refusals).toEqual([]);
    expect(acts(p, 'answer_gate')).toEqual([]);
  });
  it('no new check call: the model maps row 10\'s ask to the chickpea costs — dropped, both parts refused, checkAsk never called', async () => {
    const fx: Fx = { ...MARCUS_B37H_T5, requests: [req('chip cost of goods and gross margin over the last few years', ['variable_costs'])] };
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'itemless_defer')).toEqual([]);
    expect(d.releases).toEqual([]);
    expect(d.exhibit).toBeNull();
    expect(d.unmatchedDefers).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have chip cost of goods or gross margin over the last few years."]);
    expect(acts(p, 'answer_gate')[0].detail).toEqual({ asks: [{ what: 'chip cost of goods and gross margin over the last few years', path: 'mapped', refuse: ['chip cost of goods', 'gross margin over the last few years'], drop: ['variable_costs'], partial: [] }] });
  });
  it('a model-mapped entity mismatch: "the entrant\'s flights per day" mapped to Larkspur\'s network totals — dropped, refused, unchecked', async () => {
    const fx: Fx = { ...MARISOL_B36L_T11, requests: [req('how many flights a day the entrant runs on each route', ['network_totals'])] };   // the model's mapping constructed
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(ask).not.toHaveBeenCalled();
    expect(d.restates).toEqual([]);
    expect(d.refusals).toEqual(['how many flights a day the entrant runs on each route']);
  });
  it('a tag part a kept item states is answered by it: the Lakeport fare dropped for "the entrant\'s … fares", no refusal beside the competitor line', async () => {
    const fx: Fx = { ...MARISOL_B36L_T11, requests: [req("the entrant's cost per seat and fares", ['competitor_costs', 'lakeport_fare'])] };   // the model's mapping constructed
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(d.releases.map(r => r.id)).toEqual(['competitor_costs']);
    expect(d.restates).toEqual([]);
    expect(d.refusals).toEqual([]);
    expect(acts(p, 'answer_gate')[0].detail).toMatchObject({ asks: [{ path: 'mapped', drop: ['lakeport_fare'], refuse: [] }] });
  });
  it('a group step\'s per-item asks are gated under the ask they came from: "the per-flight economics, and the pilot headcount" — the second topic refused', async () => {
    const fx: Fx = { ...MARISOL_B36L_T11, text: 'Do we have the per-flight economics, and the pilot headcount?', requests: [req('the per-flight economics, and the pilot headcount', ['lakeport_fare'])] };   // constructed
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'request_group')).toHaveLength(1);
    expect(d.refusals).toEqual(['the pilot headcount']);
    expect(acts(p, 'answer_gate')[0].detail).toMatchObject({ asks: [{ what: 'the per-flight economics, and the pilot headcount', path: 'mapped', refuse: ['the pilot headcount'] }] });
  });
  it('a period unmet on a model-mapped item not yet out: its line, and the period part refused beside it (E1)', async () => {
    const fx = asked('prof-002', 'the Hub–Lakeport fare in FY2024', ['lakeport_fare'], FARE_READY);
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(ask).not.toHaveBeenCalled();
    expect(d.releases.map(r => r.id)).toEqual(['lakeport_fare']);
    expect(renderDataLines(d, 's')).toEqual([value('prof-002', 'lakeport_fare'), "I don't have the FY2024 Hub–Lakeport fare."]);
  });
  it('a gate part a cover names is not said (M6 veto, `partial_dropped` false_refusal); nothing left → the named deferral, unchecked', async () => {
    // "chip volume" is why_now's cover, asked by the turn's other request: refusing it would refuse data the case holds.
    const fx: Fx = { ...MARCUS_B37H_T5, requests: [req('chip volume', ['variable_costs']), req('why now', ['why_now'])] };
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(ask).not.toHaveBeenCalled();
    expect(d.releases.map(r => r.id)).toEqual(['why_now']);
    expect(d.refusals).toEqual([]);
    expect(d.itemlessDefers).toEqual(['chip volume']);
    expect(acts(p, 'partial_dropped')[0].detail).toMatchObject({ checked: 'chip volume', why: 'false_refusal', decision: 'answer_gate:mapped' });
  });
});

describe('the answer gate on the coverage step and the names remap', () => {
  it('R1: a covered line asked for FY2024 → the line (not out) and the period part refused beside it, unchecked', async () => {
    const fx = asked('prof-002', 'the avoidable fixed costs in FY2024');
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(ask).not.toHaveBeenCalled();
    expect(d.releases.map(r => r.id)).toEqual(['aircraft_leases']);
    expect(d.refusals).toEqual(['the FY2024 avoidable fixed costs']);
    expect(acts(p, 'answer_gate')[0].detail).toMatchObject({ asks: [{ path: 'covered', partial: ['aircraft_leases'] }] });
  });
  it('R1: a scope part its own covered line answers only coarsely — the line, and the part refused beside it (the M6 veto sets the part\'s own item aside)', async () => {
    const fx = asked('entry-001', 'the industry-average annual cost per patient');
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(ask).not.toHaveBeenCalled();
    expect(d.releases.map(r => r.id)).toEqual(['kelvexa_pricing']);
    expect(d.refusals).toEqual(['the industry-average annual cost per patient']);
    expect(acts(p, 'partial_dropped')).toEqual([]);
  });
  it('R2: "the new routes plan today" names the plan lines — the two forecasts dropped (forecast), the context line given, unchecked', async () => {
    const fx = asked('prof-002', 'the new routes plan today', [], FARE_READY);
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(ask).not.toHaveBeenCalled();
    expect(d.releases.map(r => r.id)).toEqual(['new_routes_context']);
    expect(acts(p, 'answer_gate')[0].detail).toMatchObject({ asks: [{ path: 'remapped', drop: ['new_routes_plan', 'new_routes_cost_flights'], refuse: [] }] });
  });
  it('C3 at turn level: "the revenue split between fares and volume, and the competitor\'s schedule" keeps Larkspur\'s lines; only the schedule goes on, as at BASE', async () => {
    const fx = asked('prof-002', "the revenue split between fares and volume, and the competitor's schedule", [], FARE_READY);   // constructed: no corpus ask mixes the two
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(d.restates.map(r => r.id)).toEqual(['routes_schedule', 'planes_as_full']);
    expect(acts(p, 'cover_gate')).toEqual([]);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toMatchObject({ what: "the competitor's schedule" });
  });
  it('b34l Marisol t29 (one-directional entity rule): "our cost disadvantage" keeps the competitor\'s cost line', async () => {
    const p = plan(MARISOL_B34L_T29);
    const d = await turnDataChecked(p, turn(MARISOL_B34L_T29));
    expect(d.restates.map(r => r.id)).toEqual(['competitor_costs']);
    expect(acts(p, 'cover_gate')).toEqual([]);
    expect(acts(p, 'cover_deferred')).toEqual([]);
  });
});

describe('the one-directional entity rule (controller ruling, 21 Oct)', () => {
  const p2 = taggedFactBase('prof-002');
  it('client words never exclude another entity\'s item', () => {
    expect(tagsAgree('Do we have a breakdown of where our cost disadvantage sits — labor, aircraft size, or utilization?', 'competitor_costs', p2)).toEqual({ agree: true });
    expect(tagsAgree("Larkspur's cost per seat", 'competitor_costs', p2)).toEqual({ agree: true });
  });
  it('another entity still excludes a client item, and a different entity an entity\'s item', () => {
    expect(tagsAgree('how many flights a day the entrant runs on each route', 'network_totals', p2)).toEqual({ agree: false, why: 'entity' });
    const two = taggedFactBase('prof-002', { tags: { clientWords: ['Larkspur'], entities: [{ id: 'competitor', words: ['entrant'], items: ['competitor_costs'] }, { id: 'legacy', words: ['larger airlines'], items: ['competition_general'] }], forecast: [] } });
    expect(tagsAgree("the entrant's connecting itineraries", 'competition_general', two)).toEqual({ agree: false, why: 'entity' });
    expect(tagsAgree("the larger airlines' and the entrant's itineraries", 'competition_general', two)).toEqual({ agree: true });
  });
});

describe('the round-6 grammar (tagged cases only)', () => {
  const funnel = { id: 'funnel_rates', label: 'Patient funnel rates', value: value('entry-001', 'funnel_rates') };
  const signups = { id: 'new_customers_by_plan', label: 'New customers per month by plan, before and after Starter launched', value: value('pricing-001', 'new_customers_by_plan') };
  it('row 22: growth and "over recent years" ask for a trend — r6 only', () => {
    expect(askQualifiers('growth in the eligible pool over recent years', true).map(q => q.text)).toEqual(['growth', 'over recent years']);
    expect(askQualifiers('growth in the eligible pool over recent years')).toEqual([]);
    expect(askQualifiers('how it grew in recent years', true).map(q => q.text)).toEqual(['grew', 'in recent years']);
    expect(askQualifiers('has it grown over the last few years', true).map(q => q.text)).toEqual(['grown', 'over the last few years']);
    expect(unmetQualifiers('growth in the eligible pool over recent years', [funnel], [], { r6: true }).map(q => q.text)).toEqual(['growth', 'over recent years']);
  });
  it('row 15: a trend tied to one year is met only by two dated points inside it', () => {
    expect(unmetQualifiers('the 2024 trend in Pro sign-ups before Starter launched', [signups], [], { r6: true }).map(q => q.text)).toEqual(['trend']);
    expect(unmetQualifiers('the 2024 trend in Pro sign-ups before Starter launched', [signups])).toEqual([]);   // BASE: two years on the line
    expect(unmetQualifiers('the Pro sign-up trend through 2024', [signups], [], { r6: true }).map(q => q.text)).toEqual(['trend']);
    const monthly = { ...signups, value: 'New Pro customers were 520 in January 2024, 505 in June 2024 and 490 in December 2024.' };
    const once = { ...signups, value: 'New Pro customers were 520 in January 2024 and 480 in January 2025.' };
    expect(unmetQualifiers('the 2024 trend in Pro sign-ups before Starter launched', [once], [], { r6: true }).map(q => q.text)).toEqual(['trend']);
    expect(unmetQualifiers('the 2024 trend in Pro sign-ups before Starter launched', [monthly], [], { r6: true })).toEqual([]);
    expect(unmetQualifiers('the Pro sign-up trend during FY2024', [{ ...signups, value: 'Pro sign-ups were 520 in Q1 FY2024 and 480 in Q4 FY2024.' }], [], { r6: true })).toEqual([]);
    // Two years asked: not tied to one, read as before.
    expect(unmetQualifiers('the Pro sign-up trend from 2024 to 2025', [signups], [], { r6: true })).toEqual([]);
  });
});

describe('gateReading', () => {
  const fare = { id: 'fare', label: 'Average fare', value: 'The average fare fell from $200 in FY2023 to $120 in FY2025.', years: ['2023', '2025'] };
  const fleet = { id: 'fleet', label: 'Fleet size', value: 'The fleet is nine regional jets.' };
  it('topics: false (the covers decide the topic) — only the items stating an unmet period\'s conjunct are partial', () => {
    const r = gateReading('the FY2024 average fare, and the fleet size', [fare, fleet], [], { topics: false });
    expect(r.unmet.map(q => q.text)).toEqual(['FY2024']);
    expect(r.partial).toEqual(['fare']);
    expect(r.topicDrop).toEqual([]);
  });
  it('… a topic no item states is not read; a period in a conjunct no item states is the coverage step\'s rest', () => {
    expect(gateReading('the FY2024 average fare, and the crew wage bill', [fare], [], { topics: false }).unmet.map(q => q.text)).toEqual(['FY2024']);
    expect(gateReading('the average fare, and the FY2024 crew wage bill', [fare], [], { topics: false }).unmet).toEqual([]);
  });
  it('topics: true — a second topic no item states drops the items stating no conjunct', () => {
    const r = gateReading('the crew wage bill and the pilot headcount', [fare, fleet], [], { topics: true });
    expect(r.topicDrop).toEqual(['fare', 'fleet']);
    expect(r.partial).toEqual([]);
  });
});

describe('untagged prof-001: no gate, decisions as before', () => {
  const PROF1 = { caseId: 'prof-001', phase: 'ANALYSIS' as Phase, shown: [], revealed: [], text: 'Do we have industry benchmarks for the average ticket?' };
  it('answerGate is null; a model-mapped ask with a scope its line lacks is released as declared', async () => {
    const fx: Fx = { ...PROF1, requests: [req('industry benchmarks for the average ticket', ['avg_ticket'])] };
    const p = plan(fx);
    expect(answerGate(p, 'industry benchmarks for the average ticket', ['avg_ticket'])).toBeNull();
    const d = await turnDataChecked(p, turn(fx));
    expect(d.releases.map(r => r.id)).toEqual(['avg_ticket']);
    expect(d.refusals).toEqual([]);
    expect(acts(p, 'answer_gate')).toEqual([]);
  });
  it('… the same case with tags: the gate reads the scope (the gate is the only difference)', async () => {
    const fx: Fx = { ...PROF1, requests: [req('industry benchmarks for the average ticket', ['avg_ticket'])] };
    const p = plan(fx);
    const c = getCaseById('prof-001');
    p.state.factBase = { ...p.state.factBase, tags: { clientWords: [], entities: [], forecast: [] }, answerGate: true };
    expect(c.factAnchors?.tags).toBeUndefined();
    const d = await turnDataChecked(p, turn(fx));
    expect(d.refusals).toEqual(['industry benchmarks']);
  });
});
