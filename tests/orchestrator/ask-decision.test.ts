// Phase 2 S1: the one data decision, in shadow (design §2). Sub-asks from the candidate's own sentences; one outcome
// each; the rulings of 27 Oct (Q1 never refuse an undeclared sub-ask, Q2 head-noun logged, Q3 tag mismatch logged
// and released, Q4 no offers). Nothing here is spoken: these read `shadowAskDecision`'s output only.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [], classifyAsk: async () => null }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnData, type CheckVerdict } from '@/lib/orchestrator/turn-data';
import { shadowAskDecision, subAskTexts, buildSubAsks, disagreement } from '@/lib/orchestrator/ask-decision';
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

const SATISFIED = { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
function plan(text: string, o: { revealed?: string[] } = {}): ModelPlan {
  const p = planTurn(readsFixture({ caseId: 'prof-002', phase: 'ANALYSIS', flags: SATISFIED, revealed: o.revealed }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  return p;
}
const req = (what: string, itemIds: string[] = [], explicit = true): DeclaredRequest => ({ what, itemIds, explicit, respond: 'release' });
const verdict = (v: Partial<CheckVerdict>): CheckVerdict => ({ mapped: false, ids: [], outOfScope: [], partial: [], missing: {}, ...v });
async function shadow(p: ModelPlan, model: DeclaredRequest[], modelWords: string[] = []) {
  const old = turnData(p, { requests: model, exhibit: null, rescueItem: null });
  return shadowAskDecision({ plan: p, model, detections: null, modelWords, old });
}

describe('sub-asks: the candidate\'s sentence split at conjuncts', () => {
  it('two things asked in one sentence are two sub-asks (b36l Marisol t4)', () => {
    expect(subAskTexts('Can I get departures and average fare for FY2023 versus FY2025?')).toHaveLength(2);
  });
  it('a split stays one sub-ask (b38l Tyler t2, b37q Tyler t6)', () => {
    expect(subAskTexts('Do we have the split of the revenue decline between number of passengers flown and average fare?')).toHaveLength(1);
    expect(subAskTexts('Do we have the split of Starter sign-ups by source — paid versus organic?')).toHaveLength(1);
  });
  it('the model\'s declaration is aligned to the sub-ask it shares words with; an unaligned mention is dropped (Q4: no offer)', () => {
    const subs = buildSubAsks(['Can I get departures and average fare for FY2023 versus FY2025?'],
      [req('average fare by year', ['lakeport_fare']), req('load factor', ['lakeport_load'], false)], [], [], x => x);
    expect(subs.find(s => /fare/.test(s.words))!.modelIds).toEqual(['lakeport_fare']);
    expect(subs.some(s => s.modelIds.includes('lakeport_load'))).toBe(false);
  });
});

describe('R6 / R7 and Q1', () => {
  const ASK = 'Interesting. Do we have any data on price elasticity on those four routes?';
  it('a declared ask the check said none to: refused (R6)', async () => {
    const p = plan(ASK);
    p.state.deferChecks.set('price elasticity on those four routes', Promise.resolve(verdict({ mapped: false })));
    const d = await shadow(p, [req('price elasticity on those four routes')]);
    const a = d.asks.find(x => /elasticity/.test(x.words))!;
    expect(a.outcome).toBe('refuse');
    expect(a.rule).toBe('R6');
  });
  it('Q1: the same ask undeclared — no declaration, no detection — is never refused: deferred, the check marked as owed', async () => {
    const p = plan(ASK);
    const d = await shadow(p, []);
    const a = d.asks.find(x => /elasticity/.test(x.words))!;
    expect(a.declared).toBe(false);
    expect(a.outcome).toBe('defer');
    expect(a.wouldCheck).toBe(true);
  });
  it('the model\'s own refusal counts as the evidence (b35h Marisol t24\'s kind)', async () => {
    const p = plan(ASK);
    const d = await shadow(p, [req('price elasticity on those four routes')], ['I don\'t have price elasticity for those routes.']);
    expect(d.asks.find(x => /elasticity/.test(x.words))!.outcome).toBe('refuse');
  });
});

describe('R2: a model-named item that matches is kept', () => {
  it('b38 Jasmine t4: extras_revenue named for the ticket-versus-extras split is released, not dropped by the split rule', async () => {
    const p = plan('Do we have the split of revenue between ticket revenue and extras revenue?');
    const d = await shadow(p, [req('ticket versus extras revenue split', ['extras_revenue'])]);
    const a = d.asks[0];
    // Kept for the ask (R2), then held by the release order in this fixture (no exhibit shown yet): a deferral that
    // names the item, never a refusal or a drop.
    expect(a.rule).toBe('R2');
    expect(a.items).toContain('extras_revenue');
    expect(['release', 'defer']).toContain(a.outcome);
    if (a.outcome === 'defer') expect(a.why).toBe('order');
  });
  it('already out: pointed to, not released again (R5)', async () => {
    const p = plan('Can you remind me of the extras revenue per passenger?', { revealed: ['extras_revenue'] });
    const d = await shadow(p, [req('extras revenue per passenger', ['extras_revenue'])]);
    expect(d.asks[0].outcome).toBe('point');
  });
});

describe('R5: a pointer only to the item asked about', () => {
  it('b38l Tyler t24: elasticity on the four routes is not answered by pointing at the routes line', async () => {
    const p = plan('A stacked set of levers. Do we have price elasticity on the four protected routes?', { revealed: ['route_results_other'] });
    const d = await shadow(p, [req('price elasticity of those four routes', ['route_results_other'])]);
    const a = d.asks.find(x => /elasticity/.test(x.words))!;
    expect(a.outcome).not.toBe('point');
    expect(a.items).not.toContain('route_results_other');
  });
});

describe('the comparison with today', () => {
  it('a disagreement is named old→new', () => {
    expect(disagreement({ old: 'none', outcome: 'refuse', agree: false })).toBe('none→refuse');
    expect(disagreement({ old: 'refuse', outcome: 'refuse', agree: true })).toBe('same');
  });
});

// ── S2: the overlay on today's decisions (applyAskRefusals) ──
import { applyAskRefusals, type AskDecided } from '@/lib/orchestrator/ask-decision';
import type { TurnData } from '@/lib/orchestrator/turn-data';
const today = (o: Partial<TurnData> = {}): TurnData => ({ releases: [], restates: [], exhibit: null, refusals: [], defers: [], gateDefers: [], unmatchedDefers: [], offers: [], requests: [], gatedIds: [], ...o });
const ask = (o: Partial<AskDecided>): AskDecided => ({ words: 'price elasticity on the four routes', whats: ['price elasticity of those four routes'], sentence: null, source: 'candidate', declared: true, outcome: 'refuse', rule: 'R6', evidence: ['check_none'], items: [], old: 'none', oldItems: [], agree: false, ...o });

describe('S2: applyAskRefusals', () => {
  it('a true refusal replaces today\'s hollow deferral, in the declared words', () => {
    const { data, changes } = applyAskRefusals(today({ defers: ['price elasticity of those four routes'], itemlessDefers: ['price elasticity of those four routes'] }), [ask({ old: 'defer' })]);
    expect(data.defers).toEqual([]);
    expect(data.refusals).toEqual(['price elasticity of those four routes']);
    expect(changes[0]).toMatchObject({ from: 'defer', to: 'refuse' });
  });
  it('a true refusal replaces a wrong item restated (b38l Tyler t24)', () => {
    const { data } = applyAskRefusals(today({ restates: [{ id: 'route_results_other', value: 'On the other four routes …' }] }), [ask({ old: 'point', oldItems: ['route_results_other'] })]);
    expect(data.restates).toEqual([]);
    expect(data.refusals).toHaveLength(1);
  });
  it('today\'s refusal is never turned into a deferral in S2', () => {
    const { data, changes } = applyAskRefusals(today({ refusals: ['Nimbrel\'s patent expiry'] }), [ask({ words: 'Nimbrel\'s patent expiry', outcome: 'defer', rule: 'R7', why: 'uncertain', old: 'refuse' })]);
    expect(data.refusals).toEqual(['Nimbrel\'s patent expiry']);
    expect(changes).toEqual([]);
  });
  it('an undeclared sub-ask stays shadow-only (session-1 ruling 1)', () => {
    const { changes } = applyAskRefusals(today(), [ask({ declared: false, source: 'candidate' })]);
    expect(changes).toEqual([]);
  });
  it('an uncertain deferral (R7) is not spoken in S2 — logged only (the first replay\'s false "We won\'t get to …")', () => {
    const a = ask({ outcome: 'defer', rule: 'R7', why: 'uncertain', old: 'none', evidence: undefined });
    expect(applyAskRefusals(today(), [a]).changes).toEqual([]);
  });
  it('no refusal without evidence; none added beside today\'s own refusal or deferral of it; no ask opener in the words', () => {
    expect(applyAskRefusals(today(), [ask({ evidence: [] })]).changes).toEqual([]);
    expect(applyAskRefusals(today({ refusals: ['price elasticity of those routes'] }), [ask({})]).data.refusals).toEqual(['price elasticity of those routes']);
    expect(applyAskRefusals(today(), [ask({ words: 'Do we have the split of the $20M fixed', whats: [] })]).data.refusals).toEqual(['the split of the $20M fixed']);
  });
  it('a restatement is kept when the refusal is only its finer cut (E1)', () => {
    const { data } = applyAskRefusals(today({ restates: [{ id: 'option_b', value: 'Option B …' }] }), [ask({ old: 'point', oldItems: ['option_b'], cut: 'royalty step-downs' })]);
    expect(data.restates).toHaveLength(1);
  });
  it('Q4: code\'s offer line is dropped; releases are never touched', () => {
    const { data } = applyAskRefusals(today({ offers: ['plan economics'], releases: [{ id: 'x', value: 'v', earlier: false }] }), []);
    expect(data.offers).toEqual([]);
    expect(data.releases).toHaveLength(1);
  });
});
