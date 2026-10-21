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
  it('a scope miss on a covered item (a one-off cost of an annual line): deferred, not released', async () => {
    const p = plan('entry-001', 'What would the one-off cost of building a team be?', taggedFactBase('entry-001'));
    const d = await turnDataChecked(p, turn('the one-off cost of building a team'));
    expect(d.releases).toEqual([]);
    expect(d.defers).toEqual(['the one-off cost of building a team']);
    expect(ask).not.toHaveBeenCalled();
    expect(acts(p, 'cover_gate')[0]?.detail).toMatchObject({ asks: [{ deferred: [{ id: 'option_a', why: 'scope' }] }] });
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
  });
  it('the model\'s ask matching nothing, its sentence\'s only hit another company\'s (row 19, Raj t13): the named deferral, no check', async () => {
    // "patent expiry" a fixture cover on the Kelvexa patents line; the model's ask a stand-in that misses it.
    const p = plan('entry-001', "Do we have Nimbrel's patent expiry and any oral competitors in late-stage trials?", taggedFactBase('entry-001', { covers: { patents: ['patent expiry'] } }));
    const d = await turnDataChecked(p, turn("Nimbrel's patent end date"));
    expect(ask).not.toHaveBeenCalled();
    expect(d.itemlessDefers).toEqual(["Nimbrel's patent end date"]);
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
  it('R3: a mapped item its cover names but the one-off cut rules out is not exempt — dropped from the ask, never given or booked', async () => {
    const p = plan('entry-001', 'What would the one-off cost of building a team be?', taggedFactBase('entry-001'));
    const d = await turnDataChecked(p, turn(ONE_OFF, ['option_a']));
    expect(acts(p, 'request_scope')[0]?.detail).toEqual({ scoped: [{ what: ONE_OFF, ids: ['option_a'] }] });
    // Emptied, the ask meets the coverage step's gate: the named deferral, unchecked.
    expect(d.requests.flatMap(r => r.ledgerItemIds)).toEqual([]);
    expect(d.itemlessDefers).toEqual([ONE_OFF]);
    expect(ask).not.toHaveBeenCalled();
  });
  it('the check\'s scope (answersAsk): a cover hit failing the gate doesn\'t force the item in', async () => {
    classify.mockResolvedValueOnce([{ what: ONE_OFF, ledgerItemIds: ['option_a'], response: 'none', explicit: true }]);
    const p = plan('entry-001', 'What would the one-off cost of building a team be?', taggedFactBase('entry-001'));
    expect((await checkAsk(p, ONE_OFF)).outOfScope).toEqual(['option_a']);
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
