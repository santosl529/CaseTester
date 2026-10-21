// Round 6 Task 76 (a) (Lorenzo, 21 Oct, round 6 rulings, 4: "Vetoed cover → deferral without a Haiku check: fine. The
// deferral must resolve through the E5 stop sequence (delivered, or "We won't get to that"), never left hollow."). Code's
// item-less named deferrals on a tagged case — cover-vetoed (Task 68, `cover_deferred`) and tag mismatches off the check
// (Task 76 (b), `tag_deferred`) — are tracked open in the session's flags (flags.openDeferrals, no DB column) until a
// later turn delivers them (an item released or restated, or the same ask words answered: nothing more said) or the
// first wrap-up turn says "We won't get to … today." once for them; each resolves once (`deferral_resolved`). The
// cover-vetoed pin is Task 68's (turn-data-covers.test.ts): b36 Aldermoor Raj 3fdb20e8 t11 (audit row 18), the model's
// ask and his sentence as said, with the fixture cover "on an advanced therapy" on the forecast.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/db/client', () => ({
  db: {
    query: { sessions: { findFirst: async () => ({ status: 'active' }) } },
    insert: () => ({ values: async (v: Row | Row[]) => { void v; } }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  },
}));
const { classify, ask } = vi.hoisted(() => ({ classify: vi.fn(async (): Promise<unknown> => []), ask: vi.fn() }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: classify, classifyAsk: ask }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan, type TurnKind } from '@/lib/orchestrator/plan-turn';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { turnDataChecked, resolveDeferrals, type OpenDeferral, type TurnData } from '@/lib/orchestrator/turn-data';
import { renderDataLines } from '@/lib/orchestrator/data-decisions';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import { getCaseById } from '@/lib/cases/loader';
import type { ModelTurn, DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';
import { askVia } from './fixtures/ask-check';
import { taggedFactBase } from './fixtures/tagged-cases';

const RAJ_T11 = 'Do we have data on what share of the 200,000 are currently on an advanced therapy versus untreated for severity?';
const RAJ_WHAT = 'advanced therapy usage among the eligible patients';
const PEAK_SAID = "What's the assumed market share for Kelvexa at peak?";
const PEAK_WHAT = "Kelvexa's assumed market share at peak";
const forecastCover = { peak_share_forecast: ['on an advanced therapy'] };
const WONT = `We won't get to ${RAJ_WHAT} today.`;
const PEAK = getCaseById('entry-001').dataLedger.find(i => i.id === 'peak_share_forecast')!.value;

const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const req = (what: string, itemIds: string[] = []): DeclaredRequest => ({ what, itemIds, explicit: true, respond: 'release' });
const modelTurn = (requests: DeclaredRequest[], o: Partial<ModelTurn> = {}): ModelTurn =>
  ({ say: 'Okay.', move: 'acknowledge', requests, exhibit: null, rescueItem: null, question: 'What would you look at next?', ...o } as unknown as ModelTurn);
const outcome = (turn: ModelTurn): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });

// `later`: turns after the deferring one (two more rows each: the next candidate message and its reply).
function plan(text: string, o: { kind?: TurnKind; flags?: Record<string, unknown>; tags?: boolean; revealed?: string[]; later?: number; cover?: boolean } = {}): ModelPlan {
  const extraTurns = Array.from({ length: 2 * (o.later ?? 0) }, (_, i) => ({ role: (i % 2 === 0 ? 'candidate' : 'interviewer') as 'candidate' | 'interviewer', text: i % 2 === 0 ? 'Go on.' : 'Okay.' }));
  const p = planTurn(readsFixture({ phase: 'ANALYSIS', caseId: 'entry-001', revealed: o.revealed ?? [], flags: o.flags, extraTurns }), text,
    { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  p.state.factBase = taggedFactBase('entry-001', { ...(o.cover === false ? {} : { covers: forecastCover }), ...(o.tags === false ? { tags: null } : {}) });
  p.state.distress = Promise.resolve(null);
  p.state.kind = o.kind ?? 'model';
  p.state.pressureTest = { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 1 };
  p.state.checkerLine = null;
  p.state.stageCheckerLine = null;
  p.state.stageCodeLines = [];
  p.state.analysisOwed = false;
  return p;
}
const acts = (p: ModelPlan, check: string) => p.ctx.checks.entries.filter(e => e.check === check);
const openOf = (p: ModelPlan) => p.ctx.flags.openDeferrals as OpenDeferral[] | undefined;
const count = (s: string, x: string) => s.split(x).length - 1;
beforeEach(() => { classify.mockReset(); classify.mockImplementation(async () => []); ask.mockReset(); ask.mockImplementation(askVia(classify)); });

// The turn that defers it: Raj t11 → t12 (the cover vetoed by "currently"; the named deferral, unchecked).
async function deferred(): Promise<{ p: ModelPlan; open: OpenDeferral[] }> {
  const p = plan(RAJ_T11);
  const s = await settleTurn(p, outcome(modelTurn([req(RAJ_WHAT)])));
  expect(s.spokenText).toMatch(/come back to advanced therapy usage among the eligible patients/);
  return { p, open: openOf(p)! };
}

describe('a cover-vetoed deferral is tracked as open', () => {
  it('Raj t11: the named deferral (no check) is booked open with the vetoed cover\'s item and its turn', async () => {
    const { p, open } = await deferred();
    expect(ask).not.toHaveBeenCalled();
    expect(open).toEqual([{ what: RAJ_WHAT, ids: ['peak_share_forecast'], turn: p.ctx.nextTurnIndex + 1 }]);
    expect(acts(p, 'cover_deferred')).toHaveLength(1);
    expect(acts(p, 'deferral_resolved')).toEqual([]);
  });
  it('untagged: no tracking — the check\'s "none" is refused as at BASE, nothing booked open', async () => {
    const p = plan(RAJ_T11, { tags: false });
    await settleTurn(p, outcome(modelTurn([req(RAJ_WHAT)])));
    expect(openOf(p)).toBeUndefined();
  });
  it('untagged: an open list in the flags is never read — a wrap-up turn says nothing for it', async () => {
    const p = plan('My recommendation is to enter.', { kind: 'rec_ask', tags: false, flags: { openDeferrals: [{ what: RAJ_WHAT, ids: ['peak_share_forecast'], turn: 4 }] } });
    const d = await turnDataChecked(p, { requests: [], exhibit: null, rescueItem: null });
    expect(d.wontGetTo).toBeUndefined();
    expect(renderDataLines(d, 's')).toEqual([]);
  });
});

describe('(i) delivered later: resolved, nothing more said', () => {
  it('a later turn releases its item: `deferral_resolved` delivered, no "won\'t get to", the open list empty', async () => {
    const { open } = await deferred();
    const p = plan(PEAK_SAID, { flags: { openDeferrals: open }, later: 1 });
    const s = await settleTurn(p, outcome(modelTurn([req(PEAK_WHAT)])));
    expect(s.newReveals).toEqual(['peak_share_forecast']);
    expect(s.spokenText).toContain(PEAK);
    expect(s.spokenText).not.toMatch(/won't get to|advanced therapy usage/);
    expect(acts(p, 'deferral_resolved').map(a => a.detail)).toEqual([{ what: RAJ_WHAT, how: 'delivered', turn: p.ctx.nextTurnIndex + 1 }]);
    expect(openOf(p)).toEqual([]);
    // …and the wrap-up after it says nothing for it.
    const w = plan('I recommend entering.', { kind: 'rec_ask', flags: { openDeferrals: openOf(p) }, revealed: ['peak_share_forecast'], later: 2 });
    const d = await turnDataChecked(w, { requests: [], exhibit: null, rescueItem: null });
    expect(d.wontGetTo).toBeUndefined();
  });
  it('a later turn restates its item: delivered', async () => {
    const { open } = await deferred();
    const p = plan(PEAK_SAID, { flags: { openDeferrals: open }, revealed: ['peak_share_forecast'], later: 1 });
    await settleTurn(p, outcome(modelTurn([req(PEAK_WHAT)])));
    expect(acts(p, 'deferral_resolved').map(a => a.detail)).toMatchObject([{ what: RAJ_WHAT, how: 'delivered' }]);
    expect(openOf(p)).toEqual([]);
  });
  it('a later data line answering the same ask words (an item released for them): delivered', () => {
    const o: OpenDeferral = { what: RAJ_WHAT, ids: [], turn: 4 };
    const d = { releases: [{ id: 'funnel_rates', value: 'x', earlier: false }], restates: [], exhibit: null, refusals: [], defers: [], gateDefers: [], unmatchedDefers: [], offers: [], gatedIds: [],
      requests: [{ request: req(RAJ_WHAT, ['funnel_rates']), response: 'release' as const, ledgerItemIds: ['funnel_rates'] }] } as TurnData;
    expect(resolveDeferrals([o], d, 8)).toEqual({ open: [], resolved: [{ what: RAJ_WHAT, how: 'delivered', turn: 8 }] });
    // The same words only refused later: closed too — "won't get to" would contradict the refusal.
    expect(resolveDeferrals([o], { ...d, releases: [], requests: [], refusals: [RAJ_WHAT] }, 8).resolved).toEqual([{ what: RAJ_WHAT, how: 'refused', turn: 8 }]);
    // Nothing for it: still open. The turn that said it never resolves it.
    expect(resolveDeferrals([o], { ...d, releases: [], requests: [] }, 8)).toEqual({ open: [o], resolved: [] });
    expect(resolveDeferrals([o], d, 4)).toEqual({ open: [o], resolved: [] });
  });
  it('deferred again in the same words: one open entry, the items merged, the first turn kept', () => {
    const o: OpenDeferral = { what: RAJ_WHAT, ids: ['peak_share_forecast'], turn: 4 };
    const d = { releases: [], restates: [], exhibit: null, refusals: [], defers: [RAJ_WHAT], gateDefers: [], unmatchedDefers: [], offers: [], gatedIds: [], requests: [],
      deferralsOpened: [{ what: RAJ_WHAT, ids: ['funnel_rates'] }] } as unknown as TurnData;
    expect(resolveDeferrals([o], d, 8)).toEqual({ open: [{ what: RAJ_WHAT, ids: ['peak_share_forecast', 'funnel_rates'], turn: 4 }], resolved: [] });
  });
});

describe('(ii) never delivered: "We won\'t get to … today." once, on the first wrap-up turn', () => {
  it('code\'s recommendation ask: said once; `deferral_resolved` wont_get_to; not again at the close', async () => {
    const { open } = await deferred();
    // A model turn before the wrap-up: nothing said for it, still open.
    const mid = plan('Fair, so the pool is smaller than I thought.', { flags: { openDeferrals: open }, later: 1 });
    const m = await settleTurn(mid, outcome(modelTurn([])));
    expect(m.spokenText).not.toMatch(/won't get to/);
    expect(openOf(mid)).toEqual(open);
    // The first wrap-up turn.
    const w = plan('I think I have enough to recommend.', { kind: 'rec_ask', flags: { openDeferrals: openOf(mid) }, later: 2 });
    const s = await settleTurn(w, outcome(modelTurn([])));
    expect(count(s.spokenText, WONT)).toBe(1);
    expect(acts(w, 'deferral_resolved').map(a => a.detail)).toEqual([{ what: RAJ_WHAT, how: 'wont_get_to', turn: w.ctx.nextTurnIndex + 1 }]);
    expect(openOf(w)).toEqual([]);
    // The close after it: nothing.
    const c = plan('Enter, with a partner, priced at parity.', { kind: 'close', flags: { openDeferrals: openOf(w) }, later: 3 });
    const cs = await settleTurn(c, outcome(modelTurn([])));
    expect(cs.spokenText).not.toMatch(/won't get to/);
    expect(acts(c, 'deferral_resolved')).toEqual([]);
  });
  it('two open ones: one line for both ("We won\'t get to that today.")', async () => {
    const open: OpenDeferral[] = [{ what: RAJ_WHAT, ids: ['peak_share_forecast'], turn: 4 }, { what: 'the payer mix by plan', ids: [], turn: 6 }];
    const w = plan('I think I have enough to recommend.', { kind: 'rec_ask', flags: { openDeferrals: open } });
    const d = await turnDataChecked(w, { requests: [], exhibit: null, rescueItem: null });
    expect(d.wontGetTo).toEqual([RAJ_WHAT, 'the payer mix by plan']);
    expect(d.deferralsClosed).toEqual(open);
    expect(renderDataLines(d, 's')).toEqual(["We won't get to that today."]);
  });
  it('never on a turn that already says it in another form: asked again at the wrap-up — "won\'t get to" once', async () => {
    const open: OpenDeferral[] = [{ what: RAJ_WHAT, ids: ['peak_share_forecast'], turn: 4 }];
    const w = plan(RAJ_T11, { kind: 'rec_ask', flags: { openDeferrals: open } });
    const d = await turnDataChecked(w, { requests: [req(RAJ_WHAT)], exhibit: null, rescueItem: null });
    expect(d.wontGetTo).toEqual([RAJ_WHAT]);
    expect(d.deferralsClosed).toBeUndefined();
    expect(renderDataLines(d, 's')).toEqual([WONT]);
    expect(resolveDeferrals(open, d, 9).resolved).toEqual([{ what: RAJ_WHAT, how: 'wont_get_to', turn: 9 }]);
  });
  it('a deferral made on a wrap-up turn is "We won\'t get to …" there already: not tracked (never said again at the close)', async () => {
    const w = plan(RAJ_T11, { kind: 'rec_ask' });
    const d = await turnDataChecked(w, { requests: [req(RAJ_WHAT)], exhibit: null, rescueItem: null });
    expect(d.wontGetTo).toEqual([RAJ_WHAT]);
    expect(d.deferralsOpened).toBeUndefined();
  });
  it('its words refused on the wrap-up turn (row 18 as it ran: the check maps the forecast, its tags disagree): the refusal, no "won\'t get to" beside it', async () => {
    classify.mockResolvedValueOnce([{ what: RAJ_WHAT, ledgerItemIds: ['peak_share_forecast'], response: 'none', explicit: true }]);
    const open: OpenDeferral[] = [{ what: RAJ_WHAT, ids: ['peak_share_forecast'], turn: 4 }];
    const w = plan(RAJ_T11, { kind: 'rec_ask', cover: false, flags: { openDeferrals: open } });
    const d = await turnDataChecked(w, { requests: [req(RAJ_WHAT)], exhibit: null, rescueItem: null });
    expect(d.refusals).toEqual([RAJ_WHAT]);
    expect(d.wontGetTo).toBeUndefined();
    expect(renderDataLines(d, 's')).toEqual([`I don't have ${RAJ_WHAT}.`]);
    expect(resolveDeferrals(open, d, 9).resolved).toEqual([{ what: RAJ_WHAT, how: 'refused', turn: 9 }]);
  });
  it('delivered on the wrap-up turn itself: released, no "won\'t get to"', async () => {
    const open: OpenDeferral[] = [{ what: RAJ_WHAT, ids: ['peak_share_forecast'], turn: 4 }];
    const w = plan(PEAK_SAID, { kind: 'rec_ask', flags: { openDeferrals: open } });
    const d = await turnDataChecked(w, { requests: [req(PEAK_WHAT)], exhibit: null, rescueItem: null });
    expect(d.releases.map(r => r.id)).toEqual(['peak_share_forecast']);
    expect(d.wontGetTo).toBeUndefined();
    expect(resolveDeferrals(open, d, 9).resolved).toEqual([{ what: RAJ_WHAT, how: 'delivered', turn: 9 }]);
  });
  it('a model turn of the recommendation phase once the recommendation is in is a wrap-up turn too', async () => {
    const open: OpenDeferral[] = [{ what: RAJ_WHAT, ids: ['peak_share_forecast'], turn: 4 }];
    const w = plan('Enter with a partner.', { flags: { openDeferrals: open } });
    w.ctx.currentPhase = 'RECOMMENDATION';
    w.state.recommendationReceived = true;
    const d = await turnDataChecked(w, { requests: [], exhibit: null, rescueItem: null });
    expect(d.wontGetTo).toEqual([RAJ_WHAT]);
  });
});
