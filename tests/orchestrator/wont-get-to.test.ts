// Round-3 ruling 4 (Lorenzo, 19 Oct): "Close turns: all deferrals, item-backed
// included, become "We won't get to <ask> today."; if the ask label is long or a
// list, "We won't get to that today."" Long: more than 8 words as said; a list:
// two or more asks, or a label with a comma or " and ". An item said "won't get
// to" is not promised: it leaves the open-requests queue (unless asked again) but
// stays asked-but-unanswered for the report.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
const { classify } = vi.hoisted(() => ({ classify: vi.fn(async (): Promise<unknown> => []) }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: classify }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan, type TurnKind, type TurnReads } from '@/lib/orchestrator/plan-turn';
import { turnDataChecked } from '@/lib/orchestrator/turn-data';
import { renderDataLines, decisionRows, itemBackedDefers } from '@/lib/orchestrator/data-decisions';
import { toDataRequestEvents } from '@/lib/orchestrator/data-requests';
import { summarizeDataRequests } from '@/lib/scoring/data-coverage';
import { readsFixture } from './fixtures/turn-reads';
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { checkDataTurn } from '@/lib/eval/data-check';
import { factBaseFor } from '@/lib/orchestrator/fact-check';
import { getCaseById } from '@/lib/cases/loader';
import type { CorpusTurn } from '@/lib/eval/run-corpus';

beforeEach(() => { classify.mockReset(); classify.mockImplementation(async () => []); });

const plan = (kind: TurnKind | 'model', reads: TurnReads = readsFixture({ phase: 'STRUCTURE' })): ModelPlan => {
  const p = planTurn(reads, 'Could I get that?', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  if (kind !== 'model') p.state.kind = kind;
  return p;
};
const turn = (...requests: DeclaredRequest[]) => ({ requests, exhibit: null, rescueItem: null });
const COGS: DeclaredRequest = { what: 'COGS as % of revenue', itemIds: ['cogs_pct'], explicit: true, respond: 'defer' };

describe('a close: every deferral is "We won\'t get to … today."', () => {
  it('an item-backed defer → the line, holding nothing', async () => {
    const d = await turnDataChecked(plan('close'), turn(COGS));
    expect(renderDataLines(d, 's')).toEqual(["We won't get to COGS as a percent of revenue today."]);
    expect(d.defers).toEqual([]);
    expect(itemBackedDefers(d)).toEqual([]);
    expect(d.wontGetTo).toEqual(['COGS as a percent of revenue']);
  });
  it.each(['close_wait', 'grace_ask', 'time_warning', 'rec_ask'] as TurnKind[])('%s: an item-backed defer → the line', async kind => {
    const d = await turnDataChecked(plan(kind), turn(COGS));
    expect(renderDataLines(d, 's').join(' ')).toMatch(/^We won't get to .+ today\.$/);
  });
  it('a gate defer → the line', async () => {
    const d = await turnDataChecked(plan('close'), turn({ ...COGS, respond: 'release' }));
    expect(d.gatedIds).toEqual(['cogs_pct']);
    expect(d.gateDefers).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["We won't get to COGS as a percent of revenue today."]);
  });
  it('a 12-word label → "We won\'t get to that today."', async () => {
    const what = 'the full history of the coffee bean prices our client has paid';
    expect(what.split(' ')).toHaveLength(12);
    const d = await turnDataChecked(plan('close'), turn({ what, itemIds: ['bean_price_change'], explicit: true, respond: 'defer' }));
    expect(renderDataLines(d, 's')).toEqual(["We won't get to that today."]);
  });
  it('an item-less named deferral with a long label → "that" too', async () => {
    const what = "Aldermoor's European Kelvexa sales trend by region and quarter since 2022";
    classify.mockResolvedValueOnce(null);
    const d = await turnDataChecked(plan('close'), turn({ what, itemIds: [], explicit: true, respond: 'defer' }));
    expect(renderDataLines(d, 's')).toEqual(["We won't get to that today."]);
  });
  it('a two-item group → "that"', async () => {
    const d = await turnDataChecked(plan('close'), turn({ what: "what's inside COGS", itemIds: ['bean_share_of_cogs', 'non_bean_input_change'], explicit: true, respond: 'defer' }));
    expect(renderDataLines(d, 's')).toEqual(["We won't get to that today."]);
  });
  it('two asks deferred → one line, "that"', async () => {
    const d = await turnDataChecked(plan('close'), turn(COGS, { what: 'Average transaction value', itemIds: ['avg_ticket'], explicit: true, respond: 'defer' }));
    expect(renderDataLines(d, 's')).toEqual(["We won't get to that today."]);
  });
  it('a label joining two items with " and " → "that"', async () => {
    const d = await turnDataChecked(plan('close'), turn({ what: 'store counts and ticket size', itemIds: ['stores_count'], explicit: true, respond: 'defer' }));
    expect(renderDataLines(d, 's')).toEqual(["We won't get to that today."]);
  });
  it('the request row is marked: logged with wontGetTo, response still defer', async () => {
    const d = await turnDataChecked(plan('close'), turn(COGS));
    const rows = decisionRows(d);
    expect(rows).toEqual([{ what: 'COGS as % of revenue', ledgerItemIds: ['cogs_pct'], response: 'defer', explicit: true, wontGetTo: true }]);
    expect(toDataRequestEvents(rows, { candidateTurnIndex: 9, interviewerTurnIndex: 10, revealedIds: new Set() })[0].payload).toMatchObject({ wontGetTo: true });
  });
});

describe('mid-case: "I\'ll come back to…"', () => {
  it('an item-backed defer', async () => {
    const d = await turnDataChecked(plan('model'), turn(COGS));
    expect(renderDataLines(d, 's')).toEqual(["I'll come back to COGS as a percent of revenue shortly."]);
    expect(d.wontGetTo ?? []).toEqual([]);
    expect(decisionRows(d)[0]).not.toHaveProperty('wontGetTo');
  });
  it('a long label stays named', async () => {
    const what = 'the full history of the coffee bean prices our client has paid';
    const d = await turnDataChecked(plan('model'), turn({ what, itemIds: ['bean_price_change'], explicit: true, respond: 'defer' }));
    expect(renderDataLines(d, 's')).toEqual([`I'll come back to ${what} shortly.`]);
  });
});

// The rows the queue is read from (plan-turn.ts): an item said "won't get to" is not promised.
describe('the open-requests queue after a "won\'t get to"', () => {
  const row = (turnIndex: number, ids: string[], extra: Record<string, unknown> = {}, subtype = 'defer') => ({
    id: `e${turnIndex}`, sessionId: 's1', category: 'data_request', subtype, turnIndex, phase: 'ANALYSIS', createdAt: new Date(),
    payloadJsonb: { what: 'COGS as % of revenue', ledgerItemIds: ids, interviewerTurnIndex: turnIndex + 1, revealedByNow: false, explicit: true, ...extra },
  });
  const withRows = (rows: ReturnType<typeof row>[]) => ({ ...readsFixture({ phase: 'ANALYSIS' }), dataRequestEventRows: rows }) as unknown as TurnReads;
  const catalog = [{ id: 'cogs_pct', label: 'COGS as % of revenue' }];
  it('an ask, then "won\'t get to" at the close: out of the queue, still a coverage gap', () => {
    const rows = [row(3, ['cogs_pct']), row(9, ['cogs_pct'], { wontGetTo: true })];
    expect(plan('model', withRows(rows)).state.openDataRequests).toEqual([]);
    expect(summarizeDataRequests(rows, catalog, []).requestedUnanswered.map(r => r.ledgerItemId)).toEqual(['cogs_pct']);
  });
  it('asked again after it: back in the queue', () => {
    const rows = [row(3, ['cogs_pct']), row(9, ['cogs_pct'], { wontGetTo: true }), row(11, ['cogs_pct'])];
    expect(plan('model', withRows(rows)).state.openDataRequests.map(o => [o.ledgerItemId, o.turnIndex])).toEqual([['cogs_pct', 11]]);
  });
  it('a "won\'t get to" the candidate didn\'t hear (logged as none) closes nothing', () => {
    const rows = [row(3, ['cogs_pct']), row(9, ['cogs_pct'], { wontGetTo: true }, 'none')];
    expect(plan('model', withRows(rows)).state.openDataRequests.map(o => o.ledgerItemId)).toEqual(['cogs_pct']);
  });
  it('other items of a row stay', () => {
    const rows = [row(3, ['cogs_pct', 'labor_pct']), row(9, ['cogs_pct'], { wontGetTo: true })];
    expect(plan('model', withRows(rows)).state.openDataRequests.map(o => o.ledgerItemId)).toEqual(['labor_pct']);
  });
});

// The fact check (lib/eval/data-check.ts D9) reads "…that today." as the answer to the asks it was said for.
describe('the fact check', () => {
  const fb = factBaseFor(getCaseById('prof-001') as never);
  const t = (data: string): CorpusTurn => ({
    t: 20, candidateText: 'Could I get the coffee bean price change and the menu price changes?', phase: 'WRAP', kind: 'close', move: null,
    segments: [{ kind: 'data', author: 'code', text: data }], heard: data, revealedBefore: [], releasedNow: [], shownBefore: [], exhibitNow: null, seeded: false,
  });
  it('"We won\'t get to that today." answers the asks', () => {
    expect(checkDataTurn(t("We won't get to that today."), fb).filter(f => f.rule === 'D9')).toEqual([]);
  });
  it('no line: unanswered', () => {
    expect(checkDataTurn(t(''), fb).filter(f => f.rule === 'D9')).toHaveLength(1);
  });
});
