// Round 6 Task 68 (Lorenzo, 21 Oct: "A cover match vetoes a refusal. It may
// release the matched item only if the item's tags (company; forecast vs current;
// quantity) also agree with the ask. Otherwise defer, through the existing E5 stop
// sequence."): on a tagged case a cover-matched item goes out only when tagsAgree and
// outsideAskScope pass, whatever path gives it (fix round 1: the coverage step R1,
// covers_added, the scope rules' cover exemption, the check's ids). An ask whose every
// cover match fails is the named deferral (`cover_deferred`), never "I don't have <ask>",
// and never checked (fix round 1, controller ruling: no model call BASE didn't make).
// R3's per-store `request_covers` becomes `covers_added` on tagged cases (audit row 6).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
const { classify, ask } = vi.hoisted(() => ({ classify: vi.fn(async (): Promise<unknown> => []), ask: vi.fn() }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: classify, classifyAsk: ask }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnDataChecked, askSentenceFor, checkAsk } from '@/lib/orchestrator/turn-data';
import type { FactBase } from '@/lib/orchestrator/fact-check';
import { readsFixture } from './fixtures/turn-reads';
import { askVia } from './fixtures/ask-check';
import { taggedFactBase } from './fixtures/tagged-cases';

const SATISFIED = { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
const plan = (caseId: string, said: string, fb: FactBase): ModelPlan => {
  const p = planTurn(readsFixture({ phase: 'ANALYSIS', flags: SATISFIED, caseId }), said, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  p.state.factBase = fb;
  return p;
};
const turn = (what: string, itemIds: string[] = []) => ({ requests: [{ what, itemIds, explicit: true, respond: 'release' as const }], exhibit: null, rescueItem: null });
const acts = (p: ModelPlan, check: string) => p.ctx.checks.entries.filter(e => e.check === check);
beforeEach(() => { classify.mockReset(); classify.mockImplementation(async () => []); ask.mockReset(); ask.mockImplementation(askVia(classify)); });

// Audit row 18 (b36 Aldermoor Raj 3fdb20e8 t11 → t12): the model's ask and the
// candidate's sentence, as said. The cover "on an advanced therapy" on the forecast
// is a fixture stand-in for a cover hit (the check mapped the ask to the forecast).
const RAJ_T11 = 'Do we have data on what share of the 200,000 are currently on an advanced therapy versus untreated for severity?';
const RAJ_WHAT = 'advanced therapy usage among the eligible patients';
const forecastCover = { peak_share_forecast: ['on an advanced therapy'] };

describe('the tag gate on the coverage step (R1)', () => {
  it('a forecast item covering a "currently" ask: not released; the named deferral, not a refusal, and no check', async () => {
    const p = plan('entry-001', RAJ_T11, taggedFactBase('entry-001', { covers: forecastCover }));
    const d = await turnDataChecked(p, turn(RAJ_WHAT));
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'itemless_defer')).toEqual([]);
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual([]);
    expect(d.defers).toEqual([RAJ_WHAT]);
    expect(d.itemlessDefers).toEqual([RAJ_WHAT]);
    expect(d.requests.map(r => [r.response, r.ledgerItemIds])).toEqual([['defer', []]]);
    expect(acts(p, 'cover_gate')[0]?.detail).toMatchObject({ asks: [{ what: RAJ_WHAT, deferred: [{ id: 'peak_share_forecast', why: 'forecast' }] }] });
    expect(acts(p, 'cover_deferred')[0]?.detail).toEqual({ asks: [RAJ_WHAT] });
  });
  it('… a check that would map it back to the vetoed item is never asked: nothing released', async () => {
    classify.mockResolvedValue([{ what: RAJ_WHAT, ledgerItemIds: ['peak_share_forecast'], response: 'none', explicit: true }]);
    const p = plan('entry-001', RAJ_T11, taggedFactBase('entry-001', { covers: forecastCover }));
    const d = await turnDataChecked(p, turn(RAJ_WHAT));
    expect(ask).not.toHaveBeenCalled();
    expect(d.releases).toEqual([]);
    expect(d.itemlessDefers).toEqual([RAJ_WHAT]);
  });
  // Row 18 as it ran (no cover): the check maps the ask to the forecast; its tags disagree.
  it('the check\'s ids pass tagsAgree: the forecast for a "currently" ask is dropped, and the ask refused (row 18)', async () => {
    classify.mockResolvedValueOnce([{ what: RAJ_WHAT, ledgerItemIds: ['peak_share_forecast'], response: 'none', explicit: true }]);
    const p = plan('entry-001', RAJ_T11, taggedFactBase('entry-001'));
    const d = await turnDataChecked(p, turn(RAJ_WHAT));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual([RAJ_WHAT]);
    expect(acts(p, 'itemless_defer')[0]?.detail).toMatchObject({ mapped: false, tagDropped: ['peak_share_forecast'] });
  });
  it('… beside another ask the check maps (the turn decided again): still the named deferral', async () => {
    const OTHER = "Aldermoor's European Kelvexa sales trend";
    classify.mockImplementation(async (...args: unknown[]) => ((args[0] as { candidateText: string }).candidateText.includes(OTHER)
      ? [{ what: OTHER, ledgerItemIds: ['company_size'], response: 'none', explicit: true }] : []));
    const p = plan('entry-001', RAJ_T11, taggedFactBase('entry-001', { covers: forecastCover }));
    const d = await turnDataChecked(p, { ...turn(RAJ_WHAT), requests: [...turn(RAJ_WHAT).requests, ...turn(OTHER).requests] });
    expect(d.releases.map(r => r.id)).toEqual(['company_size']);   // the other ask's (its "European" refused beside it: the qualifier guard)
    expect(d.refusals).not.toContain(RAJ_WHAT);
    expect(d.itemlessDefers).toEqual([RAJ_WHAT]);
    expect(ask.mock.calls.map(c => c[0].what)).toEqual([OTHER]);
    expect(acts(p, 'cover_deferred')[0]?.detail).toEqual({ asks: [RAJ_WHAT] });
  });
  it('the same case untagged: the sentence isn\'t read, the check\'s "none" is refused, as at BASE', async () => {
    const p = plan('entry-001', RAJ_T11, taggedFactBase('entry-001', { covers: forecastCover, tags: null }));
    const d = await turnDataChecked(p, turn(RAJ_WHAT));
    expect(d.refusals).toEqual([RAJ_WHAT]);
    expect(d.defers).toEqual([]);
    expect(acts(p, 'cover_gate')).toEqual([]);
  });
  it('tags agreeing: the covered item is released, no check', async () => {
    const p = plan('entry-001', "What's the assumed market share for Kelvexa at peak?", taggedFactBase('entry-001'));
    const d = await turnDataChecked(p, turn("Kelvexa's assumed market share at peak"));
    expect(d.releases.map(r => r.id)).toEqual(['peak_share_forecast']);
    expect(ask).not.toHaveBeenCalled();
  });
  it('an entity mismatch in the candidate\'s sentence (row 19, Raj t13): the Kelvexa patents line is not given for Nimbrel\'s', async () => {
    // The model's ask without the name; "patent expiry" a fixture cover on the patents line.
    const p = plan('entry-001', "Do we have Nimbrel's patent expiry and any oral competitors in late-stage trials?", taggedFactBase('entry-001', { covers: { patents: ['patent expiry'] } }));
    const d = await turnDataChecked(p, turn('patent expiry'));
    expect(d.releases).toEqual([]);
    expect(d.itemlessDefers).toEqual(['patent expiry']);
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'cover_gate')[0]?.detail).toMatchObject({ asks: [{ deferred: [{ id: 'patents', why: 'entity' }] }] });
  });
  // Round 6 Task 71 (controller ruling X1, 21 Oct): after the pressure test a cover vetoed only on scope
  // gets E1's form — the item's line and "I don't have <the cut>.", unchecked — not the named deferral.
  // Option A's line waits on its exhibit (the release order): the cut refused alone, unchecked.
  it('a scope miss on a covered item (a one-off cost of an annual line), after the pressure test: E1\'s form — the cut refused, no deferral (X1)', async () => {
    const p = plan('entry-001', 'What would the one-off cost of building a team be?', taggedFactBase('entry-001'));
    const d = await turnDataChecked(p, turn('the one-off cost of building a team'));
    expect(d.releases).toEqual([]);
    expect(acts(p, 'cover_gate')[0]?.detail).toMatchObject({ asks: [{ coarse: [{ what: 'the one-off cost of building a team', ids: ['option_a'] }] }] });
    expect(d.refusals).toEqual(['the one-off cost of building a team']);
    expect(d.defers).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'cover_gate')[0]?.detail).toMatchObject({ asks: [{ deferred: [{ id: 'option_a', why: 'scope', rule: 'one_off' }] }] });
  });
});

// Fix round 1 (controller ruling, 21 Oct): an ask left only with hits dropped by the
// exclusion or the geography veto is answered without the check.
describe('an ask whose only cover hits were excluded', () => {
  it('another company\'s ask (exclusion): the named deferral, no check', async () => {
    const p = plan('prof-002', "What are the entrant's avoidable fixed costs?", taggedFactBase('prof-002'));
    const d = await turnDataChecked(p, turn("the entrant's avoidable fixed costs"));
    expect(ask).not.toHaveBeenCalled();
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual([]);
    expect(d.itemlessDefers).toEqual(["the entrant's avoidable fixed costs"]);
    expect(acts(p, 'cover_gate')[0]?.detail).toMatchObject({ asks: [{ excluded: [{ what: "the entrant's avoidable fixed costs", why: 'entity' }] }] });
    // Task 76 (a): tracked open with the excluded hit's item until it resolves.
    expect(d.deferralsOpened).toEqual([{ what: "the entrant's avoidable fixed costs", ids: ['aircraft_leases'] }]);
  });
  it('the model\'s ask matching nothing, its sentence\'s only hit another company\'s (row 19, Raj t13): the named deferral, no check', async () => {
    // "patent expiry" a fixture cover on the Kelvexa patents line; the model's ask a stand-in that misses it.
    const p = plan('entry-001', "Do we have Nimbrel's patent expiry and any oral competitors in late-stage trials?", taggedFactBase('entry-001', { covers: { patents: ['patent expiry'] } }));
    const d = await turnDataChecked(p, turn("Nimbrel's patent end date"));
    expect(ask).not.toHaveBeenCalled();
    expect(d.itemlessDefers).toEqual(["Nimbrel's patent end date"]);
    expect(d.deferralsOpened).toEqual([{ what: "Nimbrel's patent end date", ids: ['patents'] }]);   // Task 76 (a): the sentence's excluded hit
  });
  it('row 20, Aldermoor Marcus t5 (geography): refused, unchecked — not the US price', async () => {
    const p = plan('entry-001', "Do we have Kelvexa's current European net price per patient per year?", taggedFactBase('entry-001'));
    const d = await turnDataChecked(p, turn('European net price per patient per year'));
    expect(ask).not.toHaveBeenCalled();
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual(['European net price per patient per year']);
  });
  it('a list: the covered entry given, the excluded one deferred, the plain rest checked', async () => {
    const p = plan('prof-002', 'Could I get the fleet details?', taggedFactBase('prof-002'));
    const d = await turnDataChecked(p, turn("Larkspur's new aircraft added, the entrant's avoidable fixed costs, and the hub's parking fees"));
    expect(d.releases.map(r => r.id)).toEqual(['fleet']);
    expect(d.itemlessDefers).toEqual(["the entrant's avoidable fixed costs"]);
    expect(ask.mock.calls.map(c => c[0].what)).toEqual(["the hub's parking fees"]);
  });
});

// Fix round 1: the scope part of the gate on the other paths a cover-matched item takes.
describe('the gate\'s scope on covers_added, R3\'s cover exemption and the check\'s scope', () => {
  const ONE_OFF = 'the one-off cost of building a team';
  it('covers_added: a one-off ask adds no annual line its cover names', async () => {
    const p = plan('entry-001', 'What would the one-off cost of building a team be?', taggedFactBase('entry-001'));
    await turnDataChecked(p, turn(ONE_OFF, ['option_b']));
    expect(acts(p, 'covers_added')).toEqual([]);
  });
  it('R3: a mapped item its cover names but the one-off cut rules out is not exempt — dropped from the ask, then E1\'s coarse item (X1)', async () => {
    const p = plan('entry-001', 'What would the one-off cost of building a team be?', taggedFactBase('entry-001'));
    const d = await turnDataChecked(p, turn(ONE_OFF, ['option_a']));
    expect(acts(p, 'request_scope')[0]?.detail).toEqual({ scoped: [{ what: ONE_OFF, ids: ['option_a'] }] });
    // Emptied, the ask meets the coverage step's gate: after the pressure test, E1's form (X1), unchecked —
    // Option A's line waits on its exhibit, so the cut is refused alone.
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual([ONE_OFF]);
    expect(d.itemlessDefers).toBeUndefined();
    expect(ask).not.toHaveBeenCalled();
  });
  it('the check\'s scope (answersAsk): a cover hit failing the gate doesn\'t force the item in', async () => {
    classify.mockResolvedValueOnce([{ what: ONE_OFF, ledgerItemIds: ['option_a'], response: 'none', explicit: true }]);
    const p = plan('entry-001', 'What would the one-off cost of building a team be?', taggedFactBase('entry-001'));
    expect((await checkAsk(p, ONE_OFF)).outOfScope).toEqual(['option_a']);
  });
});

// Fix round 2 (Lorenzo, 15 Oct, batch-25 ruling 7, "transaction volume per store": the
// case's own phrase carrying the cut means the item answers it — on every case): the
// gate's scope rules read no cut, split or basis inside the matched cover phrase; one
// outside it still scopes the item out (the one-off test above too).
describe('ruling 7 on a tagged case: a cut inside the matched cover phrase keeps the item', () => {
  it('"price per patient per year" (CUT "per year" inside the phrase): Kelvexa\'s pricing is released', async () => {
    const what = "Kelvexa's US price per patient per year";
    const p = plan('entry-001', `What is ${what}?`, taggedFactBase('entry-001'));
    const d = await turnDataChecked(p, turn(what));
    expect(d.releases.map(r => r.id)).toEqual(['kelvexa_pricing']);
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'cover_gate')).toEqual([]);
  });
  it('"current treatment mix" (the split word inside the phrase): the current treatment line is released', async () => {
    const p = plan('entry-001', "What's the current treatment mix?", taggedFactBase('entry-001'));
    const d = await turnDataChecked(p, turn('the current treatment mix'));
    expect(d.releases.map(r => r.id)).toEqual(['current_treatment']);
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'cover_gate')).toEqual([]);
  });
  it('"how firm the 70%" (the basis words inside the phrase): the ramp-up line is released', async () => {
    const p = plan('prof-002', 'How firm is the 70% load factor?', taggedFactBase('prof-002'));
    const d = await turnDataChecked(p, turn('how firm the 70% is'));
    expect(d.releases.map(r => r.id)).toEqual(['new_route_rampup']);
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'cover_gate')).toEqual([]);
  });
  it('a cut outside the phrase ("… by market") still scopes the item out: E1 — the line and the cut refused (X1)', async () => {
    const what = "Kelvexa's US price per patient per year by market";
    const p = plan('entry-001', `What is ${what}?`, taggedFactBase('entry-001'));
    const d = await turnDataChecked(p, turn(what));
    expect(d.releases.map(r => r.id)).toEqual(['kelvexa_pricing']);
    expect(d.refusals).toEqual([what]);
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'cover_gate')[0]?.detail).toMatchObject({ asks: [{ deferred: [{ id: 'kelvexa_pricing', why: 'scope' }] }] });
  });
  it('a split outside the phrase ("the split of" fuel price changes) still scopes the item out — E1: the line and the split refused (X1)', async () => {
    const p = plan('prof-002', 'Can I see the split of fuel price changes?', taggedFactBase('prof-002'));
    const d = await turnDataChecked(p, turn('the split of fuel price changes'));
    expect(d.releases.map(r => r.id)).toEqual(['fuel_prices']);
    expect(d.refusals).toEqual(['the split of fuel price changes']);
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'cover_gate')[0]?.detail).toMatchObject({ asks: [{ deferred: [{ id: 'fuel_prices', why: 'scope' }] }] });
  });
});

// Round 6 Task 71 X1: a change item asked for a split is a sibling, never E1's coarse item (E1's ruling,
// 20 Oct): the fuel trend line is not given for a split of the fuel cost breakdown; the cut refused alone.
describe('X1 keeps E1\'s sibling rule', () => {
  it('"the split of the fuel cost breakdown": no fuel trend line, the ask refused alone, unchecked', async () => {
    const p = plan('prof-002', 'Can I see the split of the fuel cost breakdown?', taggedFactBase('prof-002'));
    const d = await turnDataChecked(p, turn('the split of the fuel cost breakdown'));
    // Phase 1 review F6: the cover gate logs which scope rule fired, as request_scope does.
    expect(acts(p, 'cover_gate')[0]?.detail).toMatchObject({ asks: [{ deferred: [{ id: 'fuel_prices', why: 'scope', rule: 'split_of_head' }], coarse: [{ what: 'the split of the fuel cost breakdown', ids: [] }] }] });
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual(['the split of the fuel cost breakdown']);
    expect(ask).not.toHaveBeenCalled();
  });
});

// R4 (answersAsk): a check verdict's item the candidate's sentence covers, through the
// gate, is in the ask's scope. Tyler t5's sentence (b37 Hollis Bay, audit row 12); the
// count-carrying cover on why_now and the model's count ask are fixture stand-ins (a count
// is coverageOf's, so the gate passes it; outsideAskScope's count rule alone would rule
// the figure-less line out).
describe('the check verdict\'s scope reads the candidate\'s sentence (R4)', () => {
  it('mapped to why_now: in scope', async () => {
    classify.mockResolvedValueOnce([{ what: 'number of chip units sold', ledgerItemIds: ['why_now'], response: 'none', explicit: true }]);
    const p = plan('launch-001', 'Do we have a sense of how many bags of chips Hollis Bay moves a year?', taggedFactBase('launch-001', { covers: { why_now: ['how many bags of chips'] } }));
    expect((await checkAsk(p, 'number of chip units sold')).outOfScope).toEqual([]);
  });
});

// Audit row 6 (b36 Larkspur Tyler t5 → t6): only the Lakeport fare went out.
const TYLER_T5 = "I'd want to know fares and passenger counts specifically on Lakeport and Port Avery. Do we have average fare by route?";
const byRoute = { lakeport_fare: ['average fare by route', 'fare by route'], port_avery_per_flight: ['average fare by route', 'fare by route'] };
describe('covers_added (R3)', () => {
  it('Tyler t5: the model maps "average fare by route" to the Lakeport fare; the covers add Port Avery\'s', async () => {
    const p = plan('prof-002', TYLER_T5, taggedFactBase('prof-002', { covers: byRoute }));
    const d = await turnDataChecked(p, turn('average fare by route', ['lakeport_fare']));
    expect(acts(p, 'covers_added').map(e => e.detail)).toEqual([{ asks: [{ what: 'average fare by route', added: ['port_avery_per_flight'] }] }]);
    expect(d.requests.flatMap(r => r.ledgerItemIds)).toEqual(expect.arrayContaining(['lakeport_fare', 'port_avery_per_flight']));
  });
  it('a cover whose item\'s tags disagree adds nothing', async () => {
    const p = plan('prof-002', "Do we have the entrant's average fare by route?", taggedFactBase('prof-002', { covers: { ...byRoute, competitor_costs: ['average fare by route'] } }));
    await turnDataChecked(p, turn("the entrant's average fare by route", ['competitor_costs']));
    expect(acts(p, 'covers_added')).toEqual([]);
  });
  it('a forecast item for a "current" ask adds nothing (the tag filter)', async () => {
    const p = plan('prof-002', 'What is the current fare on the new routes, and the Lakeport fare?', taggedFactBase('prof-002'));
    await turnDataChecked(p, turn('current fare on the new routes and the Lakeport fare', ['lakeport_fare']));
    expect(acts(p, 'covers_added')).toEqual([]);
  });
  it('untagged: the per-store rule only — nothing added', async () => {
    const p = plan('prof-002', TYLER_T5, taggedFactBase('prof-002', { covers: byRoute, tags: null }));
    const d = await turnDataChecked(p, turn('average fare by route', ['lakeport_fare']));
    expect(acts(p, 'covers_added')).toEqual([]);
    expect(d.requests.flatMap(r => r.ledgerItemIds)).not.toContain('port_avery_per_flight');
  });
});

describe('askSentenceFor', () => {
  const sentences = ["I'd want to know fares and passenger counts specifically on Lakeport and Port Avery.", 'Do we have average fare by route?'];
  it('the asking sentence sharing the most content words with the ask', () => {
    expect(askSentenceFor('average fare by route', sentences)).toBe('Do we have average fare by route?');
    expect(askSentenceFor('passenger counts on the two routes', sentences)).toBe(sentences[0]);
  });
  it('ties go to the first; none shared, undefined', () => {
    expect(askSentenceFor('fares', sentences)).toBe(sentences[0]);
    expect(askSentenceFor('aircraft leases', sentences)).toBeUndefined();
    expect(askSentenceFor('fares', [])).toBeUndefined();
  });
  it('case names aside', () => {
    expect(askSentenceFor('Lakeport load', ['How is Lakeport doing?', 'And the load factor?'], ['Lakeport'])).toBe('And the load factor?');
  });
});

// Task 69 fix rounds 1–2 (controller rulings on C1, C2): b37 Hollis Bay, the candidate's turns verbatim.
const T27_SAID = "Fair — it isn't. The 60% is a survey-intent-to-purchase conversion, and these 500,000 are already described as buying households, post-conversion. Applying it converts the same step twice. I withdraw it.\n\nSo the clean read: 500,000 households × 3 bags = 1.5 million bags × $1.50 contribution = $2.25 million, less $1.5 million program cost = $0.75 million net positive. It pays for itself and it directly attacks the 45% taste objection, which is the single biggest barrier in the survey.\n\nThat also moves the total case: 9 million bags plus 1.5 million is 10.5 million bags. Contribution $15.75 million, less $9 million launch costs, less $1.5 million sampling = $5.25 million first-year profit.\n\nOne thing I'd want to flag — 500 stores over 10 weekends is a fairly narrow footprint. Do we know how many stores carry Hollis Bay in total? If it's several thousand, there may be room to scale this up.";   // Marisol 7f6c40ea t27
const T7_SAID = "On the price: $3.99 is what the bag actually transacts at, and it's the only price tied to a physical bag — the $3.00 is what Hollis Bay invoices on a shipment, which bundles the retailer's economics in. Since I'm building a per-bag contribution, I'd rather anchor on the per-bag figure the exhibit gives me and let the retailer's cut sit on the cost side, where it's already captured in the $1.5 million of shelf fees we pay them. Double-counting the retailer margin would understate contribution.\n\nOn recipe development: $1.2 million is a real cash outlay Hollis Bay made on this specific line. The board's test is whether the launch breaks even, and a line that doesn't recover its development spend hasn't broken even in any meaningful sense. If I strip it out, I'd be flattering the project by $1.2 million.\n\nSo I'll stay at roughly 4.1 million bags. Do we have a distribution estimate — number of stores Hollis Bay can get into next spring?";   // Marisol 7f6c40ea t7
const HOLLIS_TYLER_T5 = "Let me set it up. Variable cost per bag: ingredients you said $0.75, packaging $0.30, roasting labor and energy $0.30, freight $0.20. That's 0.75 + 0.30 + 0.50 — sorry, 0.30 plus 0.20 is 0.50 — so 1.55 per bag total variable.\n\nPrice we receive is $3.00, so contribution margin is 3.00 − 1.55 = $1.45 a bag. That's just under half the revenue, which is healthy.\n\nFixed launch costs: roasting line $3.0M, marketing $4.5M, shelf fees $1.5M = $9.0M. Recipe development I'd exclude — $1.2M already spent, sunk, shouldn't drive a go/no-go.\n\nBreak-even volume = 9.0 / 1.45 ≈ 6.2 million bags.\n\nIn revenue that's about 6.2 × $3.00 ≈ $18.6M to Hollis Bay, so roughly 6% of current sales.\n\nDo we have a sense of how many bags of chips Hollis Bay moves a year? That'd tell me whether 6.2 million is a stretch for our distribution.";   // Tyler 64-tyler t5
describe('launch-001 as the case holds it (Task 69 fix round 1)', () => {
  const T27_WHAT = 'the total number of stores carrying Hollis Bay';
  it('Marisol t27: a count asked in total — not cover-matched; checked, and the check\'s refusal stands, as at BASE', async () => {
    const p = plan('launch-001', T27_SAID, taggedFactBase('launch-001'));
    const d = await turnDataChecked(p, turn(T27_WHAT));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual([T27_WHAT]);
    expect(d.itemlessDefers ?? []).toEqual([]);
    expect(acts(p, 'cover_gate')).toEqual([]);
    expect(acts(p, 'cover_deferred')).toEqual([]);
  });
  it('Marisol t7: "a distribution estimate by number of stores" still gives retailer_support, unchecked', async () => {
    const p = plan('launch-001', T7_SAID, taggedFactBase('launch-001'));
    const d = await turnDataChecked(p, turn('a distribution estimate by number of stores'));
    expect(ask).not.toHaveBeenCalled();
    expect(d.releases.map(r => r.id)).toEqual(['retailer_support']);
    expect(d.refusals).toEqual([]);
  });
  it('Tyler t5: "annual chip bag volume" — why_now\'s line and the refusal of the count (the A4 coarse form)', async () => {
    const p = plan('launch-001', HOLLIS_TYLER_T5, taggedFactBase('launch-001'));
    const d = await turnDataChecked(p, turn('annual chip bag volume'));
    expect(ask).not.toHaveBeenCalled();
    expect(d.releases.map(r => r.id)).toEqual(['why_now']);
    expect(d.refusals).toEqual(['annual chip bag volume']);
  });
});
