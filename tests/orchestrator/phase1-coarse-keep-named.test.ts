// Phase 1 4.2 (`coarseKeepNamed`; Lorenzo, 22 Oct: "The coarse rule: never drop an item the model named when that item
// matches the ask (batch 38 Jasmine t4). Log which scope rule fired."). b38 Larkspur Jasmine 3f928012 t3 → t4: the model
// mapped "the ticket versus extras revenue split" to `extras_revenue`; `split_of_item` read "extras revenue split" as a
// split of the extras line and dropped it; the check's coarse verdict released the Port Avery line and code said "I don't
// have the ticket versus extras revenue split." — though extras revenue is one side of the split asked. With the switch:
// the item the model named, said as one side of the split ("versus extras revenue", "between ticket and ancillary"), is
// kept; the rule is logged. Off: today's decisions exactly.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
const { ask } = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [], classifyAsk: ask }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnDataChecked } from '@/lib/orchestrator/turn-data';
import { renderDataLines, namedAsPart, scopeRule } from '@/lib/orchestrator/data-decisions';
import { getCaseById } from '@/lib/cases/loader';
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

// b38 Larkspur Jasmine 3f928012 t3, verbatim, and the model's two requests as declared.
const JASMINE_T3 = "Fair push. Price × volume is MECE for ticket revenue, but it isn't MECE for total revenue — I've ignored ancillary revenue: bags, seat selection, change fees, cargo, and any co-brand or loyalty income. For a regional carrier that can be 10–15% of the top line, so a collapse there could sit entirely outside my price/volume branch. I'd also flag mix as a distinct driver: same fares per route but a shift toward shorter, cheaper routes drops the blended fare without any true price decline.\n\nSo revised revenue branch: ticket revenue (departures × seats × load × fare, with route mix) plus ancillary revenue.\n\nDo we have the revenue split between ticket and ancillary for FY2023 and FY2025, and the departure count each year? Those two should let me isolate whether this is a top-line volume story or a fare/ancillary story.";
const SPLIT = 'the ticket versus extras revenue split';
const T3_ASKS: DeclaredRequest[] = [
  { what: SPLIT, itemIds: ['extras_revenue'], explicit: true, respond: 'release' },
  { what: 'departure counts for each year', itemIds: ['network_totals'], explicit: true, respond: 'release' },
];
// The check's recorded verdict at t4 (itemless_defer): extras_revenue full, the two fare lines partial.
const T4_VERDICT = { items: [{ id: 'extras_revenue', answers: 'full' }, { id: 'lakeport_fare', answers: 'partial', missing: SPLIT }, { id: 'port_avery_per_flight', answers: 'partial', missing: SPLIT }] };

const SATISFIED = { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
const plan = (text: string): ModelPlan => {
  const p = planTurn(readsFixture({ caseId: 'prof-002', phase: 'STRUCTURE', flags: SATISFIED }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  return p;
};
const turn = (requests: DeclaredRequest[]) => ({ requests, exhibit: null, rescueItem: null });
const acted = (p: ModelPlan, check: string) => p.ctx.checks.entries.filter(e => e.check === check);
const env = process.env.ENGINE_SWITCHES;
beforeEach(() => { ask.mockReset(); ask.mockImplementation(async () => T4_VERDICT); });
afterEach(() => { if (env === undefined) delete process.env.ENGINE_SWITCHES; else process.env.ENGINE_SWITCHES = env; });

describe('b38 Jasmine t4: the ticket versus extras revenue split', () => {
  it('off: as live — extras_revenue ruled out, the check, the Port Avery line and the refusal', async () => {
    delete process.env.ENGINE_SWITCHES;
    const p = plan(JASMINE_T3);
    const d = await turnDataChecked(p, turn(T3_ASKS));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(d.releases.map(r => r.id)).toEqual(['port_avery_per_flight', 'network_totals']);
    expect(d.refusals).toEqual([SPLIT]);
    expect(acted(p, 'request_scope').map(e => e.detail)).toEqual([{ scoped: [{ what: SPLIT, ids: ['extras_revenue'] }] }]);
    expect(acted(p, 'coarse_keep_named')).toEqual([]);
  });
  it('on: extras_revenue kept for the ask (one side of the split) — deferred with Exhibit 2, no check, no refusal', async () => {
    process.env.ENGINE_SWITCHES = 'prof-002=coarseKeepNamed';
    const p = plan(JASMINE_T3);
    const d = await turnDataChecked(p, turn(T3_ASKS));
    expect(ask).not.toHaveBeenCalled();
    expect(d.refusals).toEqual([]);
    expect(d.releases.map(r => r.id)).toEqual(['network_totals']);
    // extras_revenue is on Exhibit 2, not ready before Exhibit 1: deferred by the ask's words and booked to its item.
    expect(d.defers).toEqual([SPLIT]);
    expect(d.requests.find(r => r.request.what === SPLIT)).toMatchObject({ response: 'defer', ledgerItemIds: ['extras_revenue'] });
    expect(renderDataLines(d, 's').join(' ')).not.toMatch(/I don't have/);
    expect(acted(p, 'coarse_keep_named').map(e => e.detail)).toEqual([{ asks: [{ what: SPLIT, ids: ['extras_revenue'] }] }]);
    expect(acted(p, 'request_scope')).toEqual([]);
  });
  it('on: the Haiku path logs which rule ruled an item out (outOfScopeRules)', async () => {
    process.env.ENGINE_SWITCHES = 'prof-002=coarseKeepNamed';
    const p = plan(JASMINE_T3);
    // The model left it unmapped: the check maps it; the scope rule's verdict on extras_revenue is logged by name.
    await turnDataChecked(p, turn([{ ...T3_ASKS[0], itemIds: [] }]));
    const rec = acted(p, 'itemless_defer').map(e => e.detail as { outOfScope?: string[]; outOfScopeRules?: Record<string, string> });
    expect(rec[0].outOfScope).toEqual(['extras_revenue']);
    expect(rec[0].outOfScopeRules).toEqual({ extras_revenue: 'split_of_item' });
  });
});

describe('what keeps an item: named as one side of the split, by a split rule only', () => {
  const larkspur = getCaseById('prof-002');
  const extras = larkspur.dataLedger.find(i => i.id === 'extras_revenue')!;
  const names = [extras.label, extras.spoken ?? '', 'extras', 'ancillary', 'extras revenue'];
  it('"versus <name>", "<name> versus", "between … and <name>" name it as a side', () => {
    expect(namedAsPart([SPLIT], names)).toBe(true);
    expect(namedAsPart(['the extras revenue versus ticket revenue split'], names)).toBe(true);
    expect(namedAsPart(['Do we have the revenue split between ticket and ancillary for FY2023 and FY2025?'], names)).toBe(true);
    expect(namedAsPart(['the split between ancillary and ticket revenue'], names)).toBe(true);
  });
  it('a split of the item itself is no side of it (b32 Larkspur "the ancillary revenue split"; "breakdown of extras revenue by type")', () => {
    expect(namedAsPart(['the ancillary revenue split'], names)).toBe(false);
    expect(namedAsPart(['a breakdown of extras revenue by type'], names)).toBe(false);
    expect(namedAsPart(['Split of the $20M fixed costs and whether portions are avoidable'], ['fixed costs'])).toBe(false);
    expect(scopeRule('the ancillary revenue split', extras, ['ancillary revenue'])).toBe('split_of_item');
  });
  it('on: a split of the named item itself is still dropped, its rule logged (b32 Larkspur Marisol 9-b17c59 t14)', async () => {
    process.env.ENGINE_SWITCHES = 'prof-002=coarseKeepNamed';
    const p = plan('Do we have the ancillary revenue split?');
    await turnDataChecked(p, turn([{ what: 'the ancillary revenue split', itemIds: ['extras_revenue'], explicit: true, respond: 'release' }]));
    expect(acted(p, 'request_scope').map(e => e.detail)).toEqual([{ scoped: [{ what: 'the ancillary revenue split', ids: ['extras_revenue'], rules: { extras_revenue: 'split_of_item' } }] }]);
    expect(acted(p, 'coarse_keep_named')).toEqual([]);
  });
  it('on: a passing mention (explicit: false) is not kept — only an explicit ask the model mapped', async () => {
    process.env.ENGINE_SWITCHES = 'prof-002=coarseKeepNamed';
    const p = plan(JASMINE_T3);
    await turnDataChecked(p, turn([{ ...T3_ASKS[0], explicit: false }]));
    expect(acted(p, 'coarse_keep_named')).toEqual([]);
    expect(acted(p, 'request_scope').map(e => e.detail)).toEqual([{ scoped: [{ what: SPLIT, ids: ['extras_revenue'], rules: { extras_revenue: 'split_of_item' } }] }]);
  });
  it('on: a cut rule still drops a named side — only a split rule is undone ("… split by month")', async () => {
    process.env.ENGINE_SWITCHES = 'prof-002=coarseKeepNamed';
    const what = 'the fixed costs versus variable costs split by month';
    const p = plan('Do we have the fixed versus variable cost split by month?');
    await turnDataChecked(p, turn([{ what, itemIds: ['fixed_costs'], explicit: true, respond: 'release' }]));
    expect(acted(p, 'coarse_keep_named')).toEqual([]);
    expect(acted(p, 'request_scope').map(e => e.detail)).toEqual([{ scoped: [{ what, ids: ['fixed_costs'], rules: { fixed_costs: 'cut' } }] }]);
  });
});
