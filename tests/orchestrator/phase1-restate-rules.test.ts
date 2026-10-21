// Phase 1 4.1 (`restateRules`; Lorenzo, 22 Oct: "Restatements: if the asked thing is in an exhibit, point to it and give
// its one-line summary; read a number only if that specific figure was asked; restate only the matched item's line, and
// never the same item twice within 4 turns."). b38 Larkspur Tyler cee7d399: t20 released the connecting share; t21 asked
// "the revenue attributable to those connecting passengers on the onward legs" (the model mapped it to
// route_results_other + connecting_passengers, both out) and t22 restated both — the connecting line and the 90-word
// Exhibit 1 line; t23 asked "price elasticity on the four protected routes" (the check mapped it to route_results_other)
// and t24 restated the 90-word line again. The exhibit summary is Stream 2's overlay field: a fixture here.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
const { ask } = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [], classifyAsk: ask }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnDataChecked } from '@/lib/orchestrator/turn-data';
import { renderDataLines } from '@/lib/orchestrator/data-decisions';
import { getCaseById } from '@/lib/cases/loader';
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

const larkspur = getCaseById('prof-002');
const line = (id: string) => larkspur.dataLedger.find(i => i.id === id)!.value;
const CONNECTING = line('connecting_passengers');
const OTHER = line('route_results_other');
// b38 Tyler t20 as delivered (the connecting share and the ramp-up), and his t21 / t23 asking paragraphs verbatim.
const T20 = `Understood. On variable cost, you said $8,800 per flight. ${CONNECTING} ${line('new_route_rampup')} Where did that figure come from, and how does it line up with the planning estimate for those routes?`;
const T21 = 'The connecting traffic worries me too. If 20% of Lakeport and Port Avery passengers connect onward, exiting strips feed revenue off the four healthy routes.\n\nDo we have the revenue attributable to those connecting passengers on the onward legs?';
const T21_ASK: DeclaredRequest = { what: 'Revenue attributable to connecting passengers on the onward legs (the four healthy routes)', itemIds: ['route_results_other', 'connecting_passengers'], explicit: true, respond: 'release' };
const T23 = 'Fifth, revisit the $20M fixed base — it was never scrutinized.\n\nDo we have price elasticity on the four protected routes?';
const T23_WHAT = 'price elasticity on the four uncontested routes';
const SUMMARY = 'It has revenue and contribution by route, and the network totals, for both years.';

const SATISFIED = { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
// `said`: interviewer lines before this one, newest last (each after a candidate turn); `summary`: Exhibit 1's fixture summary.
function plan(text: string, o: { said?: string[]; summary?: boolean; revealed?: string[] } = {}): ModelPlan {
  const extraTurns = (o.said ?? []).flatMap(t => [{ role: 'candidate' as const, text: 'Go on.' }, { role: 'interviewer' as const, text: t }]);
  const p = planTurn(readsFixture({ caseId: 'prof-002', phase: 'BRAINSTORM', flags: SATISFIED, extraTurns, revealed: o.revealed ?? ['connecting_passengers', 'route_results_other', 'route_results_lakeport', 'route_results_port_avery', 'network_totals', 'fixed_costs'] }), text,
    { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  p.state.shownExhibitIds.add('exhibit-1');
  if (o.summary) p.state.caseData = { ...p.state.caseData, exhibits: p.state.caseData.exhibits.map(e => (e.id === 'exhibit-1' ? { ...e, summary: SUMMARY } : e)) };
  return p;
}
const turn = (requests: DeclaredRequest[]) => ({ requests, exhibit: null, rescueItem: null });
const acted = (p: ModelPlan, check: string) => p.ctx.checks.entries.filter(e => e.check === check);
const env = process.env.ENGINE_SWITCHES;
const on = () => { process.env.ENGINE_SWITCHES = 'prof-002=restateRules'; };
beforeEach(() => { ask.mockReset(); ask.mockImplementation(async () => ({ items: [{ id: 'route_results_other', answers: 'full' }] })); delete process.env.ENGINE_SWITCHES; });
afterEach(() => { if (env === undefined) delete process.env.ENGINE_SWITCHES; else process.env.ENGINE_SWITCHES = env; });

describe('b38 Tyler t22: the onward-leg revenue ask', () => {
  it('off: both lines restated, as live', async () => {
    const p = plan(T21, { said: [T20] });
    const d = await turnDataChecked(p, turn([T21_ASK]));
    expect(d.restates.map(r => r.id).sort()).toEqual(['connecting_passengers', 'route_results_other']);
  });
  it('on: only the item the ask names (the connecting share), and that one said two turns ago — named, not said again', async () => {
    on();
    const p = plan(T21, { said: [T20] });
    const d = await turnDataChecked(p, turn([T21_ASK]));
    expect(d.restates).toEqual([]);
    expect(d.recentRestates).toEqual(['connecting passengers on those routes']);
    const lines = renderDataLines(d, 's');
    expect(lines).toEqual(['I gave you connecting passengers on those routes a moment ago.']);
    expect(lines.join(' ')).not.toContain(OTHER);
    expect(acted(p, 'restate_rules').map(e => e.detail)).toEqual([{ unmatched: ['route_results_other'], recent: ['connecting_passengers'] }]);
  });
  it('on, the connecting share said five turns back (outside the window): its line, alone', async () => {
    on();
    const p = plan(T21, { said: [T20, 'Okay.', 'Go on.'] });
    const d = await turnDataChecked(p, turn([T21_ASK]));
    expect(d.restates.map(r => r.id)).toEqual(['connecting_passengers']);
    expect(renderDataLines(d, 's').join(' ')).toContain(CONNECTING);
  });
});

describe('b38 Tyler t24: elasticity on the four routes, mapped by the check to the Exhibit 1 line', () => {
  it('off: the 90-word line again', async () => {
    const p = plan(T23, { said: [`As the exhibit shows: ${OTHER}`] });
    const d = await turnDataChecked(p, turn([{ what: T23_WHAT, itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.restates.map(r => r.id)).toEqual(['route_results_other']);
    expect(renderDataLines(d, 's').join(' ')).toContain(OTHER);
  });
  it('on, the line said at t22: never twice within four turns — named', async () => {
    on();
    const p = plan(T23, { said: [`As the exhibit shows: ${OTHER}`] });
    const d = await turnDataChecked(p, turn([{ what: T23_WHAT, itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(['I gave you the results on the other four routes a moment ago.']);
  });
  it('on, not said recently, Exhibit 1 on screen with a summary: the pointer and the summary, no figures', async () => {
    on();
    const p = plan(T23, { summary: true });
    const d = await turnDataChecked(p, turn([{ what: T23_WHAT, itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.restates).toEqual([{ id: 'route_results_other', value: OTHER, exhibit: undefined, pointer: SUMMARY }].map(r => (r.exhibit === undefined ? { id: r.id, value: r.value, pointer: r.pointer } : r)));
    const lines = renderDataLines(d, 's');
    expect(lines).toEqual([`You'll find that on the exhibit — ${SUMMARY}`]);
    expect(lines.join(' ')).not.toMatch(/\d/);
    expect(acted(p, 'restate_rules').map(e => e.detail)).toEqual([{ pointed: ['route_results_other'] }]);
  });
  it('on, no summary (no overlay yet): the line, once', async () => {
    on();
    const p = plan(T23);
    const d = await turnDataChecked(p, turn([{ what: T23_WHAT, itemIds: [], explicit: true, respond: 'release' }]));
    expect(renderDataLines(d, 's').join(' ')).toContain(OTHER);
  });
});

describe('a number only if that specific figure was asked', () => {
  it('"What was Westhaven\'s contribution again?" — the line is read, summary or not', async () => {
    on();
    const text = "What was Westhaven's contribution again?";
    const p = plan(text, { summary: true });
    const d = await turnDataChecked(p, turn([{ what: "Westhaven's contribution", itemIds: ['route_results_other'], explicit: true, respond: 'release' }]));
    expect(d.restates.map(r => r.pointer)).toEqual([undefined]);
    expect(renderDataLines(d, 's').join(' ')).toContain(OTHER);
  });
  it('two items on the same exhibit: one pointer', async () => {
    on();
    const text = 'Can you remind me how the Lakeport and Port Avery routes did?';
    const p = plan(text, { summary: true });
    const d = await turnDataChecked(p, turn([{ what: 'the Lakeport and Port Avery route results', itemIds: ['route_results_lakeport', 'route_results_port_avery'], explicit: true, respond: 'release' }]));
    expect(d.restates.map(r => r.pointer)).toEqual([SUMMARY, SUMMARY]);
    expect(renderDataLines(d, 's')).toEqual([`You'll find that on the exhibit — ${SUMMARY}`]);
  });
});

describe('matching keeps every item when the ask names none of them', () => {
  it('"Can I see those again?" — the restated items all stay', async () => {
    on();
    const p = plan('Can I see those again?');
    const d = await turnDataChecked(p, turn([{ what: 'the route results again', itemIds: ['route_results_lakeport', 'route_results_port_avery'], explicit: true, respond: 'release' }]));
    expect(d.restates.map(r => r.id).sort()).toEqual(['route_results_lakeport', 'route_results_port_avery']);
  });
});

describe('a prompt fact said within four turns is not said again', () => {
  const PLANES = "Larkspur's planes are about as full as they were two years ago.";
  it('"the fare and volume split" two turns after the planes-as-full fact: routes_schedule only', async () => {
    on();
    const p = plan('Do we have the fare and volume split?', { said: [`As I mentioned: ${PLANES}`] });
    const d = await turnDataChecked(p, turn([{ what: 'the fare and volume split', itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.restates.map(r => r.id)).not.toContain('planes_as_full');
    expect(renderDataLines(d, 's').join(' ')).not.toContain(PLANES);
    expect(acted(p, 'restate_rules').map(e => e.detail)).toContainEqual({ recent: ['planes_as_full'] });
  });
  it('off: said again', async () => {
    const p = plan('Do we have the fare and volume split?', { said: [`As I mentioned: ${PLANES}`] });
    const d = await turnDataChecked(p, turn([{ what: 'the fare and volume split', itemIds: [], explicit: true, respond: 'release' }]));
    expect(d.restates.map(r => r.id)).toContain('planes_as_full');
  });
});
