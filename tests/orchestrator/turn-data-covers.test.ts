// Round 6 Task 68 (Lorenzo, 21 Oct: "A cover match vetoes a refusal. It may
// release the matched item only if the item's tags (company; forecast vs current;
// quantity) also agree with the ask. Otherwise defer, through the existing E5 stop
// sequence."): on a tagged case the coverage step (R1, turn-data.ts) releases a
// covered item only when tagsAgree and outsideAskScope pass; otherwise the ask stays
// item-less and goes to the check, and a check that maps it to nothing makes it the
// named deferral (`cover_deferred`), never "I don't have <ask>". R3's per-store
// `request_covers` becomes `covers_added` on tagged cases (audit row 6).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
const { classify, ask } = vi.hoisted(() => ({ classify: vi.fn(async (): Promise<unknown> => []), ask: vi.fn() }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: classify, classifyAsk: ask }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnDataChecked, askSentenceFor } from '@/lib/orchestrator/turn-data';
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
  it('a forecast item covering a "currently" ask: not released; the ask reaches the check; the check\'s "none" is the named deferral, not a refusal', async () => {
    const p = plan('entry-001', RAJ_T11, taggedFactBase('entry-001', { covers: forecastCover }));
    const d = await turnDataChecked(p, turn(RAJ_WHAT));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0].what).toBe(RAJ_WHAT);
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual([]);
    expect(d.defers).toEqual([RAJ_WHAT]);
    expect(d.itemlessDefers).toEqual([RAJ_WHAT]);
    expect(d.requests.map(r => [r.response, r.ledgerItemIds])).toEqual([['defer', []]]);
    expect(acts(p, 'cover_gate')[0]?.detail).toMatchObject({ asks: [{ what: RAJ_WHAT, deferred: [{ id: 'peak_share_forecast', why: 'forecast' }] }] });
    expect(acts(p, 'cover_deferred')[0]?.detail).toEqual({ asks: [RAJ_WHAT] });
  });
  it('… the check mapping it to an item decides as before (E5)', async () => {
    classify.mockResolvedValueOnce([{ what: RAJ_WHAT, ledgerItemIds: ['funnel_rates'], response: 'none', explicit: true }]);
    const p = plan('entry-001', RAJ_T11, taggedFactBase('entry-001', { covers: forecastCover }));
    const d = await turnDataChecked(p, turn(RAJ_WHAT));
    expect(d.releases.map(r => r.id)).toEqual(['funnel_rates']);
    expect(acts(p, 'cover_deferred')).toEqual([]);
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
    expect(acts(p, 'cover_gate')[0]?.detail).toMatchObject({ asks: [{ deferred: [{ id: 'patents', why: 'entity' }] }] });
  });
  it('a scope miss on a covered item (a one-off cost of an annual line): deferred, not released', async () => {
    const p = plan('entry-001', 'What would the one-off cost of building a team be?', taggedFactBase('entry-001'));
    const d = await turnDataChecked(p, turn('the one-off cost of building a team'));
    expect(d.releases).toEqual([]);
    expect(d.defers).toEqual(['the one-off cost of building a team']);
    expect(acts(p, 'cover_gate')[0]?.detail).toMatchObject({ asks: [{ deferred: [{ id: 'option_a', why: 'scope' }] }] });
  });
});

// R4 (answersAsk): a check verdict's item the candidate's sentence covers is in the ask's
// scope. The sentence is Marisol 7f6c40ea t7's (b37 Hollis Bay, audit row 5); the model's
// ask is a stand-in carrying a cut ("by store") the scope rules put retailer_support out of.
describe('the check verdict\'s scope reads the candidate\'s sentence (R4)', () => {
  const T7 = 'Do we have a distribution estimate — number of stores Hollis Bay can get into next spring?';
  it('mapped to retailer_support: in scope, released whole — no refusal of the ask', async () => {
    classify.mockResolvedValueOnce([{ what: 'distribution estimate by store', ledgerItemIds: ['retailer_support'], response: 'none', explicit: true }]);
    const p = plan('launch-001', T7, taggedFactBase('launch-001'));
    const d = await turnDataChecked(p, turn('distribution estimate by store'));
    expect(acts(p, 'itemless_defer')[0]?.detail).not.toHaveProperty('outOfScope');
    expect(d.releases.map(r => r.id)).toEqual(['retailer_support']);
    expect(d.refusals).toEqual([]);
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
