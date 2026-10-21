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
import { turnDataChecked, answerGate, decideCheckedAsk, startMessageAsks } from '@/lib/orchestrator/turn-data';
import { renderDataLines, decisionRows } from '@/lib/orchestrator/data-decisions';
import { unmetQualifiers, askQualifiers, gateReading } from '@/lib/orchestrator/ask-qualifiers';
import { tagsAgree } from '@/lib/orchestrator/item-tags';
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { getCaseById } from '@/lib/cases/loader';
import { readsFixture } from './fixtures/turn-reads';
import { askVia } from './fixtures/ask-check';
import { taggedFactBase } from './fixtures/tagged-cases';
import { GATE_CORPUS } from './fixtures/gate-corpus';
import { GATE_68B } from './fixtures/gate-68b';
import { AUDIT_T71 } from './fixtures/audit-t71';
import { entitiesNamed } from '@/lib/orchestrator/item-tags';
import { coverageDetail } from '@/lib/orchestrator/fact-check';
import { CaseSchema } from '@/lib/cases/schema';

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
    // Fix round 1 (F3): the drop leaves only funnel_rates, out already ("full" by the check) — not restated; the refusal alone.
    expect(d.restates).toEqual([]);
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
  // Fix round 1 (F1): no topic test on the model's mapping — the chickpea costs go on the entity ("chip", no client word), the ask refused whole.
  it('no new check call: the model maps row 10\'s ask to the chickpea costs — dropped (entity), the ask refused, checkAsk never called', async () => {
    const fx: Fx = { ...MARCUS_B37H_T5, requests: [req('chip cost of goods and gross margin over the last few years', ['variable_costs'])] };
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'itemless_defer')).toEqual([]);
    expect(d.releases).toEqual([]);
    expect(d.exhibit).toBeNull();
    expect(d.unmatchedDefers).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have chip cost of goods and gross margin over the last few years."]);
    expect(acts(p, 'answer_gate')[0].detail).toEqual({ asks: [{ what: 'chip cost of goods and gross margin over the last few years', path: 'mapped', refuse: ['chip cost of goods and gross margin over the last few years'], drop: ['variable_costs'], partial: [] }] });
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
  it('a group step\'s per-item asks are gated under the ask they came from: "the per-flight economics in FY2024" — the period read, the lines out → the refusal alone', async () => {
    const fx: Fx = { ...MARISOL_B36L_T11, text: 'Do we have the per-flight economics in FY2024?', requests: [req('the per-flight economics in FY2024', ['lakeport_fare'])] };   // constructed
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'request_group')).toHaveLength(1);
    expect(d.restates).toEqual([]);
    expect(d.refusals).toHaveLength(1);
    expect(acts(p, 'answer_gate')[0].detail).toMatchObject({ asks: [{ what: 'the per-flight economics in FY2024', path: 'mapped' }] });
  });
  it('fix round 1 (F1): no topic test off the check — "the per-flight economics, and the pilot headcount" mapped by the model: no refusal from the gate', async () => {
    const fx: Fx = { ...MARISOL_B36L_T11, text: 'Do we have the per-flight economics, and the pilot headcount?', requests: [req('the per-flight economics, and the pilot headcount', ['lakeport_fare'])] };   // constructed
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(d.refusals).toEqual([]);
    expect(acts(p, 'answer_gate')).toEqual([]);
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

// Task 70 fix round 1 (the review and the controller's interim replay, r6-t70 vs r6-t69).
describe('fix round 1', () => {
  // F1 (controller ruling, 21 Oct): the topic test runs on the Haiku check's verdicts only.
  it.each(GATE_CORPUS.map(f => [f.tag, f.keep, f] as const))('F1 %s: %s kept, no gate refusal', async (_tag, keep, f) => {
    const fx: Fx = { caseId: f.caseId, phase: f.phase as Phase, revealed: f.revealed, shown: [], text: f.text, requests: f.requests.map(r => req(r.what, r.itemIds)) };
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    const gate = acts(p, 'answer_gate').flatMap(e => (e.detail as { asks: { drop: string[]; partial: string[]; refuse: string[] }[] }).asks);
    expect(gate.flatMap(g => [...g.drop, ...g.partial])).not.toContain(keep);
    expect(gate.flatMap(g => g.refuse)).toEqual([]);
    expect(decisionRows(d).flatMap(r => r.ledgerItemIds)).toContain(keep);
    expect(ask).not.toHaveBeenCalled();
  });
  // F2: a missing topic beside full items is refused on the check path (round 5c's guard), nothing dropped or partial.
  const RAJ_B34A_T17: Fx = {
    caseId: 'entry-001', phase: 'BRAINSTORM', shown: ['exhibit-1', 'exhibit-2', 'exhibit-3'],
    revealed: ['us_adults', 'funnel_rates', 'peak_share_forecast', 'kelvexa_pricing', 'option_a', 'option_b', 'option_shared', 'nimbrel', 'trial_comparison', 'survey_design', 'reasons_to_prescribe', 'barriers_to_prescribing'],
    text: "Running both: Build gives 200,000 × 20% × $8,000 = $320 million net sales, less $80 million selling costs = $240 million to Aldermoor. Partner gives 200,000 × 25% × $8,000 = $400 million net sales, of which we keep 30% = $120 million, with no costs.\n\nSo build is worth roughly twice as much to Aldermoor — $240m versus $120m — and it's the only option that clears the board's $300 million net sales test on the client's own P&L. The partner delivers more patients but we only book the royalty.\n\nThe trade is risk and time: build costs $80 million a year from day one, takes 12–18 months, and the 20% share depends on us solving exactly the two barriers the survey flagged. Partner is faster and capital-light but caps the upside and cedes the US relationship permanently.\n\nOne thing I'd want: what's the partner deal term, and does the royalty step down or do we get rights back?",
    requests: [req('the partner deal terms, including royalty step-downs and rights reversion')],
  };
  it('F2 b34a Raj t17: the check maps option_b (out); the missing topic is refused as on the untagged case', async () => {
    const run = async (tagged: boolean) => {
      classify.mockResolvedValueOnce({ items: [{ id: 'option_b', answers: 'full' }] });
      const p = plan(RAJ_B34A_T17);
      if (!tagged) p.state.factBase = taggedFactBase('entry-001', { tags: null });
      return { d: await turnDataChecked(p, turn(RAJ_B34A_T17)), p };
    };
    const untagged = await run(false);
    const tagged = await run(true);
    expect(untagged.d.refusals.join(' ')).toMatch(/royalty step-downs/i);
    expect(tagged.d.refusals).toEqual(untagged.d.refusals);
    expect(renderDataLines(tagged.d, 's')).toEqual(renderDataLines(untagged.d, 's'));
    expect(acts(tagged.p, 'itemless_defer')[0].detail).toMatchObject({ guard: { ids: [] } });
  });
  // F3: b36a Raj t11 (above): the drop leaves funnel_rates only, out already — the refusal alone.
  it('F3 b36a Raj t11: no restatement of the out sibling; the refusal and the trial line only', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'funnel_rates', answers: 'full' }, { id: 'peak_share_forecast', answers: 'full' }] });
    const d = await turnDataChecked(plan(RAJ_B36A_T11), turn(RAJ_B36A_T11));
    expect(renderDataLines(d, 's')).toEqual([value('entry-001', 'trial_comparison'), "I don't have advanced therapy usage among the eligible patients."]);
  });
  it('a tag part said whole beside a full item not yet out: funnel_rates released, the forecast\'s part refused beside it', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'funnel_rates', answers: 'full' }, { id: 'peak_share_forecast', answers: 'full' }] });
    const d = await turnDataChecked(plan({ ...RAJ_B36A_T11, revealed: ['nimbrel', 'current_treatment'] }), turn(RAJ_B36A_T11));
    expect(d.releases.map(r => r.id)).toEqual(['funnel_rates', 'trial_comparison']);
    expect(d.refusals).toEqual(['advanced therapy usage among the eligible patients']);
  });
  it('F3 is the gate\'s: the forecast out already too, funnel_rates still restated (no drop left a sibling not yet out)', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'funnel_rates', answers: 'full' }, { id: 'peak_share_forecast', answers: 'full' }] });
    const d = await turnDataChecked(plan({ ...RAJ_B36A_T11, revealed: [...RAJ_B36A_T11.revealed, 'peak_share_forecast'] }), turn(RAJ_B36A_T11));
    expect(d.restates.map(r => r.id)).toEqual(['funnel_rates']);
  });
  it('a vetoed gate part on the check path is credited to its own item (nimbrel), not the first drop (patents)', () => {
    const p = plan(RAJ_B36A_T13);
    p.state.factBase = taggedFactBase('entry-001', { covers: { pipeline: ['late-stage oral competitors'] } });   // a fixture cover: the part names held data
    // The verdict as the gate records it (the coverage step would have covered this part first: decided directly).
    const parts = ["Nimbrel's patent expiry", 'late-stage oral competitors'];
    const c = decideCheckedAsk(p, "Nimbrel's patent expiry and late-stage oral competitors", { mapped: false, ids: [], outOfScope: [], partial: [], missing: {},
      guard: { unmet: [], parts, ids: [], drop: ['patents', 'nimbrel'], said: [parts[0]], of: { [parts[0]]: 'patents', [parts[1]]: 'nimbrel' } } });
    expect(c).toEqual({ kind: 'refuse', missing: ["Nimbrel's patent expiry"], dropped: [{ id: 'nimbrel', missing: 'late-stage oral competitors', why: 'false_refusal' }] });
  });
  it('the ramp a line states meets a trend (r6): "takes 6–12 months to reach … in the first year"', () => {
    const ramp = { id: 'new_route_rampup', label: 'How long new routes take to mature', value: value('prof-002', 'new_route_rampup') };
    expect(unmetQualifiers('how new routes build toward 70% over time', [ramp], [], { r6: true })).toEqual([]);
    expect(unmetQualifiers('how new routes build toward 70% over time', [{ ...ramp, value: 'New routes reach a 70% load factor.' }], [], { r6: true }).map(q => q.text)).toEqual(['over time']);
  });
  it('an entity\'s item meets a competitor or benchmark scope (r6): Nimbrel\'s net price is the benchmark', () => {
    const nimbrel = { id: 'nimbrel', label: 'Nimbrel', value: 'Its net price is about $9,000 per patient per year.' };
    expect(unmetQualifiers('a net price benchmark for current treatment', [{ ...nimbrel, other: true }], [], { r6: true })).toEqual([]);
    expect(unmetQualifiers('a net price benchmark for current treatment', [nimbrel], [], { r6: true }).map(q => q.text)).toEqual(['benchmark']);
  });
});

// Task 70 fix round 2 (the re-review, and Task 68b from the controller's interim replays).
describe('fix round 2', () => {
  // A (controller ruling): the comparator scope rule is for rival entities only — Hollis Bay's chips are its own business.
  it.each([
    ['the competitive landscape for chips', 'why_now'],
    ['competitor benchmarks for chip sales', 'why_now'],
    ['a benchmark for cannibalization', 'cannibalization'],
  ])('A: launch-001 "%s" → %s, its line and the refusal beside it (E1), as before fix round 1', async (what, id) => {
    const fx = asked('launch-001', what, [id], { phase: 'ANALYSIS' });
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(d.releases.map(r => r.id)).toEqual([id]);
    expect(d.refusals).toHaveLength(1);
    expect(acts(p, 'answer_gate')[0].detail).toMatchObject({ asks: [{ path: 'mapped', partial: [id] }] });
  });
  it('A: the rival flag — prof-002\'s competitor and entry-001\'s Nimbrel are rivals, launch-001\'s chips are not; the schema checks it', () => {
    expect(getCaseById('prof-002').factAnchors!.tags!.entities.map(e => e.rival)).toEqual([true]);
    expect(getCaseById('entry-001').factAnchors!.tags!.entities.map(e => e.rival)).toEqual([true]);
    expect(getCaseById('launch-001').factAnchors!.tags!.entities.map(e => e.rival)).toEqual([undefined]);
    const c = getCaseById('launch-001');
    const withTags = (entities: unknown) => ({ ...c, factAnchors: { ...c.factAnchors!, tags: { ...c.factAnchors!.tags!, entities } } });
    expect(CaseSchema.safeParse(withTags([{ ...c.factAnchors!.tags!.entities[0], rival: 'yes' }])).success).toBe(false);
    expect(CaseSchema.safeParse(withTags([{ ...c.factAnchors!.tags!.entities[0], rivals: true }])).success).toBe(false);
    expect(CaseSchema.safeParse(withTags([{ ...c.factAnchors!.tags!.entities[0], rival: true }])).success).toBe(true);
  });
  // B: the comparator's other side names no other entity, but the client wherever it is said; it stops at a line break.
  it('B: "how Nimbrel compares against Kelvexa in trials" and "chip sales versus the chickpea line" name both sides', () => {
    const aldermoor = taggedFactBase('entry-001');
    const hollis = taggedFactBase('launch-001');
    expect(entitiesNamed('how Nimbrel compares against Kelvexa in trials', aldermoor)).toEqual(['nimbrel', 'client']);
    expect(tagsAgree('how Nimbrel compares against Kelvexa in trials', 'trial_comparison', aldermoor)).toMatchObject({ agree: true });
    expect(entitiesNamed('chip sales versus the chickpea line', hollis)).toEqual(['chips', 'client']);
    expect(entitiesNamed("what price point they're targeting versus the chips?", hollis)).toEqual([]);
    expect(entitiesNamed("the price point versus our\nthe low-cost carrier's fares", taggedFactBase('prof-002'))).toEqual(['competitor', 'client']);
  });
  it('68b-6 in the coverage step: a sentence hit is read in its own clause — the competitor in the other clause excludes nothing', () => {
    const p2 = taggedFactBase('prof-002');
    const sentence = 'Do we have average fare by route, and whether a competitor entered on any of the six?';
    expect(coverageDetail('the fare picture', p2, { sentence }).items).toEqual(expect.arrayContaining(['lakeport_fare', 'port_avery_per_flight']));
  });
  it('B: the coverage step\'s entity read gains no exclusion from the comparator (a client item stays covered)', () => {
    const p2 = taggedFactBase('prof-002');
    expect(coverageDetail('average fare by route versus the entrant', p2).items).toEqual(expect.arrayContaining(['lakeport_fare', 'port_avery_per_flight']));
    expect(coverageDetail('average fare by route versus the entrant', p2).dropped).toEqual([]);
  });
  // C: a ramp line meets a forward or ramp trend only.
  it('C: the ramp line meets "over time" / "build", never growth or the last few years', () => {
    const ramp = { id: 'new_route_rampup', label: 'How long new routes take to mature', value: value('prof-002', 'new_route_rampup') };
    expect(unmetQualifiers('how new routes build toward 70% over time', [ramp], [], { r6: true })).toEqual([]);
    expect(unmetQualifiers('the ramp trend on new routes', [ramp], [], { r6: true })).toEqual([]);
    expect(unmetQualifiers('load factor growth on new routes', [ramp], [], { r6: true }).map(q => q.text)).toEqual(['growth']);
    expect(unmetQualifiers('how new route load factors grew over the last few years', [ramp], [], { r6: true }).map(q => q.text)).toEqual(['grew', 'over the last few years']);
    expect(unmetQualifiers('the new route load factor trend', [ramp], [], { r6: true }).map(q => q.text)).toEqual(['trend']);
    // A past trend with a ramp word is still past.
    expect(unmetQualifiers('how fast new routes ramped up over the last few years', [ramp], [], { r6: true }).map(q => q.text)).toEqual(['over the last few years']);
  });

  // D: Task 68b, each from its turn as it ran.
  const run68b = async (key: string) => {
    const f = GATE_68B[key];
    const p = planTurn(readsFixture({ caseId: f.caseId, phase: f.phase as Phase, revealed: f.revealed, flags: { pressureTest: f.pressureTest } }), f.text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    for (const id of f.shown) p.state.shownExhibitIds.add(id);
    return { p, d: await turnDataChecked(p, { requests: f.requests, exhibit: null, rescueItem: null }) };
  };
  it('68b-1 b35h Jasmine t10: the scope reads the covered entry — retailer_support released for "store count"; only "bags per store per week" goes on', async () => {
    const { p, d } = await run68b('D1');
    expect(d.releases.map(r => r.id)).toEqual(['retailer_support']);
    expect(acts(p, 'cover_gate')).toEqual([]);
    expect(acts(p, 'cover_deferred')).toEqual([]);
    expect(ask.mock.calls.map(c => (c[0] as { what: string }).what)).toEqual(['bags per store per week']);
  });
  it('68b-2 b34a Jasmine t2 (before the pressure test): the covered item deferred by its name and booked, not the finer cut', async () => {
    const { p, d } = await run68b('D2');
    const lines = renderDataLines(d, 's');
    expect(lines).toContain("I'll come back to current US treatment shortly.");
    expect(lines.join(' ')).not.toMatch(/come back to[^.]*drug class/);
    expect(decisionRows(d).filter(r => r.response === 'defer').map(r => r.ledgerItemIds)).toContainEqual(['current_treatment']);
    expect(acts(p, 'cover_gate')[0].detail).toMatchObject({ asks: [{ named: ['current_treatment'] }] });
    expect(acts(p, 'cover_deferred')).toEqual([]);
    // What nothing covers goes on as at BASE: the item-less check (here mocked to none: refused).
    expect(ask.mock.calls.map(c => (c[0] as { what: string }).what)).toEqual(["US prevalence of Corlan's disease"]);
    expect(lines).toContain("I don't have US prevalence of Corlan's disease.");
  });
  it('68b-3 is tagged-only: prof-001 lines lower-case the first word as before (no proper words)', async () => {
    const fx = asked('prof-001', 'European store counts');
    const p = plan(fx);
    const d = await turnDataChecked(p, turn(fx));
    expect(d.properWords).toBeUndefined();
    expect(renderDataLines(d, 's')).toEqual(["I don't have european store counts."]);
  });
  it('68b-3 b36a Marcus t6: "European" keeps its capital in the refusal', async () => {
    const { d } = await run68b('D3');
    expect(renderDataLines(d, 's')[0]).toMatch(/^I don't have European net price per patient per year/);
  });
  it('68b-4 b36l Jasmine t2: a period-only entry joins its neighbour — the rest reads "average fare, FY2023 vs FY2025"', async () => {
    const { p } = await run68b('D4');
    expect(acts(p, 'refusal_covered')[0].detail).toMatchObject({ covered: [{ ids: ['network_totals'], rest: 'average fare, FY2023 vs FY2025' }] });
    expect(coverageDetail('total departures and average fare, FY2023 vs FY2025', taggedFactBase('prof-002')).rest).toBe('average fare, FY2023 vs FY2025');
  });
  it('68b-5 b34a Marcus t10: insurance_coverage names Nimbrel on its own line — kept, E1: its line and the share refused', async () => {
    const { d } = await run68b('D5');
    expect(d.releases.map(r => r.id)).toEqual(['insurance_coverage']);
    expect(d.refusals).toEqual(['the share of covered lives where Nimbrel has exclusive or preferred status']);
    expect(tagsAgree('the share of covered lives where Nimbrel has exclusive or preferred status', 'insurance_coverage', taggedFactBase('entry-001'))).toEqual({ agree: true, coarse: true });
    expect(tagsAgree("Nimbrel's patent expiry", 'patents', taggedFactBase('entry-001'))).toEqual({ agree: false, why: 'entity' });
  });
  it('68b-6 b34l Marisol t6: the competitor is the other clause\'s — the route results go on Exhibit 1, nothing deferred', async () => {
    const { p, d } = await run68b('D6');
    expect(d.exhibit?.id).toBe('exhibit-1');
    expect(d.defers).toEqual([]);
    expect(acts(p, 'answer_gate')).toEqual([]);
  });
  it('68b-6 b36a Raj t11 still: "currently" sits in the clause matching the ask — the forecast dropped', async () => {
    classify.mockResolvedValueOnce({ items: [{ id: 'funnel_rates', answers: 'full' }, { id: 'peak_share_forecast', answers: 'full' }] });
    const p = plan(RAJ_B36A_T11);
    await turnDataChecked(p, turn(RAJ_B36A_T11));
    expect(acts(p, 'itemless_defer')[0].detail).toMatchObject({ tagDropped: ['peak_share_forecast'] });
  });
});

// Round 6 Task 71 (the audit's code-only fixes; Lorenzo, 21 Oct, round 6: "4. The audit's 12 code-only
// rule fixes"; docs/superpowers/plans/2026-10-21-data-path-audit.md Part 3). Each turn verbatim from the
// runs (fixtures/audit-t71.ts); the check's mapping as recorded (`itemless_defer` found).
describe('Task 71: the audit\'s code-only fixes, through the turn', () => {
  const run71 = async (key: string, found?: { items: { id: string; answers: string }[] }, o: { kind?: string } = {}) => {
    const f = AUDIT_T71[key];
    const p = planTurn(readsFixture({ caseId: f.caseId, phase: f.phase as Phase, revealed: f.revealed, flags: { pressureTest: f.pressureTest } }), f.text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    for (const id of f.shown) p.state.shownExhibitIds.add(id);
    p.state.kind = (o.kind ?? f.kind) as typeof p.state.kind;
    if (found) classify.mockResolvedValueOnce(found);
    return { p, d: await turnDataChecked(p, { requests: f.requests, exhibit: null, rescueItem: null }) };
  };
  it('row 8, b36l Marcus t19 (rec_ask): the launch cost is out of the recurring line\'s scope — refused alone, nothing restated', async () => {
    const { d } = await run71('F1', { items: [{ id: 'new_routes_cost_flights', answers: 'full' }] });
    expect(d.restates).toEqual([]);
    expect(d.releases).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have launch costs for the new routes."]);
  });
  it('row 13, b37h Tyler t17 (rec_ask): a basis ask — neither line restated, the basis refused', async () => {
    const { d } = await run71('F3', { items: [{ id: 'planning_assumptions', answers: 'full' }, { id: 'survey_design', answers: 'full' }] });
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have data on how the 500,000 household estimate was derived."]);
  });
  it('row 14, b37q Tyler t5: E1 — how customers sign up, and the split by source refused beside it', async () => {
    const { p, d } = await run71('F4');
    expect(d.releases.map(r => r.id)).toEqual(['signup_channels']);
    expect(d.refusals).toEqual(['the split of Starter sign-ups by source']);
    expect(renderDataLines(d, 's')).toEqual([value('pricing-001', 'signup_channels'), "I don't have the split of Starter sign-ups by source."]);
    expect(acts(p, 'scope_coarse')).toHaveLength(1);
    expect(ask).not.toHaveBeenCalled();
  });
  it('row 16, b37q Marcus t9: "I\'d need to multiply by expected tenure on each plan" is no need for the plan economics — no offer', async () => {
    const { d } = await run71('F5');
    expect(d.offers).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual([]);
  });
  it.each([
    ['the spoken name', 'To settle it, I still need the plan economics.'],
    ['two label words', 'Whether this holds depends on the monthly cost to serve on each plan.'],
  ])('row 16 keeps a need that says %s (tagged): offered', async (_, text) => {
    const f = AUDIT_T71.F5;
    const p = planTurn(readsFixture({ caseId: f.caseId, phase: f.phase as Phase, revealed: f.revealed, flags: { pressureTest: f.pressureTest } }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    const d = await turnDataChecked(p, { requests: f.requests, exhibit: null, rescueItem: null });
    expect(d.offers).toEqual(['plan economics: monthly price and cost to serve for Pro and Starter']);
  });
  it('row 6, b36l Tyler t5: the passenger-count mention an asking sentence names is released, not offered', async () => {
    const { p, d } = await run71('F6');
    // Asked with the fare, it goes out on the Hub–Lakeport exhibit that shows both (Rule 10's covering exhibit).
    expect(d.exhibit).toMatchObject({ id: 'exhibit-2' });
    expect(d.exhibit?.covers).toEqual(expect.arrayContaining(['lakeport_fare', 'lakeport_seats_load']));
    expect(decisionRows(d).find(r => r.what === 'load factor on Lakeport and Port Avery')).toMatchObject({ explicit: true, response: 'release' });
    expect(d.offers).toEqual([]);
    expect(renderDataLines(d, 's').join(' ')).not.toMatch(/I can share/);
    expect(acts(p, 'mention_asked')[0].detail).toEqual({ asks: [{ what: 'load factor on Lakeport and Port Avery', ids: ['lakeport_seats_load'] }] });
  });
  // Fix round 1 (review I1): a one-word name phrase ("load in the first year" → "load") names nothing on
  // its own — the reviewer's probe: Tyler t5 verbatim with a mention of the ramp-up line.
  it('fix round 1: "Since load factor is roughly flat overall, …" doesn\'t ask for the ramp-up line — it stays a mention', async () => {
    const f = AUDIT_T71.F6;
    const p = planTurn(readsFixture({ caseId: f.caseId, phase: f.phase as Phase, revealed: f.revealed, flags: { pressureTest: f.pressureTest } }), f.text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    for (const id of f.shown) p.state.shownExhibitIds.add(id);
    const rampup = req('how long new routes take to ramp up', ['new_route_rampup'], { explicit: false });
    const d = await turnDataChecked(p, { requests: [...f.requests, rampup], exhibit: null, rescueItem: null });
    expect(d.releases.map(r => r.id)).not.toContain('new_route_rampup');
    expect(acts(p, 'mention_asked')[0].detail).toEqual({ asks: [{ what: 'load factor on Lakeport and Port Avery', ids: ['lakeport_seats_load'] }] });
  });
  // Fix round 1 (controller replay): a label's acronym said as written is a need on its own (tagged).
  it('fix round 1, b37q Jasmine t5: "Next steps: get CAC by plan, …" keeps the acquisition-cost offer', async () => {
    const { d } = await run71('F5J');
    expect(d.offers).toEqual(['the acquisition cost per customer']);   // said by its spoken name
  });
  it('row 21, b36a Marcus t23: a split of the $80 million — Option A\'s line is not restated; the split refused alone', async () => {
    const { d } = await run71('F8', { items: [{ id: 'option_a', answers: 'full' }] });
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have the split of the $80 million between rep cost and market access."]);
  });
  it('row 11, b37h Marcus t9 (launch-001, tagged): "What I\'d want is …" starts the message classifier', async () => {
    const text = "Noted, I'll assume we don't have it. What I'd want is distribution math: how many stores Hollis Bay can get the line into, and velocity — bags per store per week.";
    const p = planTurn(readsFixture({ caseId: 'launch-001', phase: 'EXHIBIT', revealed: [], flags: { pressureTest: SATISFIED } }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    const asks = await startMessageAsks(p);
    expect(asks?.sentences).toEqual(["What I'd want is distribution math: how many stores Hollis Bay can get the line into, and velocity — bags per store per week."]);
    expect(classify).toHaveBeenCalledTimes(1);
  });
  // X1 (controller ruling, 21 Oct): a cover vetoed only on scope, on a turn after the pressure test — b34a
  // Jasmine t2's ask as it ran (68b item 2), the pressure test satisfied: E1's form, not the named deferral.
  it('X1: a cover vetoed only on scope after the pressure test — the item\'s line and "I don\'t have <the cut>", unchecked', async () => {
    const f = GATE_68B.D2;
    const p = planTurn(readsFixture({ caseId: f.caseId, phase: f.phase as Phase, revealed: f.revealed, flags: { pressureTest: SATISFIED } }), f.text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    const d = await turnDataChecked(p, { requests: f.requests, exhibit: null, rescueItem: null });
    expect(d.releases.map(r => r.id)).toEqual(['current_treatment']);
    const lines = renderDataLines(d, 's');
    expect(lines).toEqual([value('entry-001', 'current_treatment'), "I don't have current treatment breakdown by drug class or US prevalence of Corlan's disease."]);
    expect(lines.join(' ')).not.toMatch(/come back to/);
    expect(acts(p, 'cover_deferred')).toEqual([]);
    // Only what nothing covers goes to the check, as at BASE; the cut never does.
    expect(ask.mock.calls.map(c => (c[0] as { what: string }).what)).toEqual(["US prevalence of Corlan's disease"]);
  });
  it('X1: the item out already — the cut refused alone, unchecked', async () => {
    const f = GATE_68B.D2;
    const p = planTurn(readsFixture({ caseId: f.caseId, phase: f.phase as Phase, revealed: ['current_treatment'], flags: { pressureTest: SATISFIED } }), f.text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    const d = await turnDataChecked(p, { requests: f.requests, exhibit: null, rescueItem: null });
    expect(d.releases).toEqual([]);
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have current treatment breakdown by drug class or US prevalence of Corlan's disease."]);
    expect(ask.mock.calls.map(c => (c[0] as { what: string }).what)).not.toContain('current treatment breakdown by drug class');
  });
});
