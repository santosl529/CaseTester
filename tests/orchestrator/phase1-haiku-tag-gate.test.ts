// Phase 1 4.3 (`haikuTagGate`; Lorenzo, 22 Oct: "Haiku positives: must pass the tag gate (entity, period, quantityKind
// against the ask). A mismatch defers; it never releases and never refuses."). The item tags are the overlay's (contract
// §1); Stream 2 writes them, so these tests set fixture tags on the ledger item. b38 Larkspur Marcus 316baba1 t23 → t24:
// "Do we have revenue per passenger by extra type?" — the check mapped "extras revenue by type" to extras_revenue as full
// and code restated the $20 line (graded borderline: the "by type" cut got no word). With the switch and extras_revenue
// tagged a level (no split), the positive fails the gate on its kind: no restatement, no refusal — the named deferral,
// tracked open. Off, or an item with no tags: today's decision.
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
import { askTags, itemTagsAgree, type ItemTags } from '@/lib/orchestrator/item-tags';
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';
import { taggedFactBase } from './fixtures/tagged-cases';

// b38 Larkspur Marcus 316baba1 t23, its last paragraphs verbatim; the model's request as declared.
const MARCUS_T23 = "On channels: they sell almost entirely through their own website. Listing on OTAs and the GDS puts them in front of travelers who never visit the site, and interline agreements at the hub bring in connecting passengers they can't reach today.\n\nDo we have revenue per passenger by extra type? I'd want to see where the $20 actually comes from.";
const WHAT = 'extras revenue by type';
const EXTRAS = 'Extras revenue — bags, seat selection and snacks — was $20 per passenger in both years.';
const LEVEL: ItemTags = { entity: 'client', period: ['historical', 'current'], quantityKind: ['level'] };

const SATISFIED = { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
function plan(text: string, o: { revealed?: string[]; tags?: Record<string, ItemTags>; untagged?: true } = {}): ModelPlan {
  const p = planTurn(readsFixture({ caseId: 'prof-002', phase: 'BRAINSTORM', flags: SATISFIED, revealed: o.revealed }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  // The overlay (Stream 2) tags every item; a test that wants an untagged item clears it (`untagged`).
  if (o.tags || o.untagged) p.state.caseData = { ...p.state.caseData, dataLedger: p.state.caseData.dataLedger.map(i => (o.tags?.[i.id] ? { ...i, tags: o.tags[i.id] as NonNullable<typeof i.tags> } : o.untagged ? { ...i, tags: undefined } : i)) };
  return p;
}
const req = (what: string, itemIds: string[] = []): DeclaredRequest => ({ what, itemIds, explicit: true, respond: 'release' });
const turn = (requests: DeclaredRequest[]) => ({ requests, exhibit: null, rescueItem: null });
const acted = (p: ModelPlan, check: string) => p.ctx.checks.entries.filter(e => e.check === check);
const env = process.env.ENGINE_SWITCHES;
const on = () => { process.env.ENGINE_SWITCHES = 'prof-002=haikuTagGate'; };
beforeEach(() => { ask.mockReset(); ask.mockImplementation(async () => ({ items: [{ id: 'extras_revenue', answers: 'full' }] })); delete process.env.ENGINE_SWITCHES; });
afterEach(() => { if (env === undefined) delete process.env.ENGINE_SWITCHES; else process.env.ENGINE_SWITCHES = env; });

describe('b38 Marcus t24: extras revenue by type', () => {
  it('off: the check\'s full item restated, as live', async () => {
    const p = plan(MARCUS_T23, { revealed: ['extras_revenue'], tags: { extras_revenue: LEVEL } });
    const d = await turnDataChecked(p, turn([req(WHAT)]));
    expect(d.restates.map(r => r.id)).toEqual(['extras_revenue']);
    expect(acted(p, 'haiku_tag_gate')).toEqual([]);
  });
  it('on, extras_revenue tagged a level: no restatement, no refusal — the named deferral, tracked', async () => {
    on();
    const p = plan(MARCUS_T23, { revealed: ['extras_revenue'], tags: { extras_revenue: LEVEL } });
    const d = await turnDataChecked(p, turn([req(WHAT)]));
    expect(d.restates).toEqual([]);
    expect(d.releases).toEqual([]);
    expect(d.refusals).toEqual([]);
    expect(d.defers).toEqual([WHAT]);
    expect(renderDataLines(d, 's').join(' ')).not.toContain(EXTRAS);
    expect(d.deferralsOpened).toEqual([{ what: WHAT, ids: ['extras_revenue'] }]);
    expect(acted(p, 'haiku_tag_gate').map(e => e.detail)).toEqual([{ what: WHAT, gated: [{ id: 'extras_revenue', why: 'kind' }], deferred: true }]);
    expect((acted(p, 'itemless_defer')[0].detail as { tagGate?: unknown }).tagGate).toEqual([{ id: 'extras_revenue', why: 'kind' }]);
  });
  it('on, an item with no tags (a case with no overlay): today\'s restatement', async () => {
    on();
    const p = plan(MARCUS_T23, { revealed: ['extras_revenue'], untagged: true });
    const d = await turnDataChecked(p, turn([req(WHAT)]));
    expect(d.restates.map(r => r.id)).toEqual(['extras_revenue']);
    expect(acted(p, 'haiku_tag_gate')).toEqual([]);
  });
  it('on, the item tagged a split too: it passes — restated', async () => {
    on();
    const p = plan(MARCUS_T23, { revealed: ['extras_revenue'], tags: { extras_revenue: { ...LEVEL, quantityKind: ['level', 'split'] } } });
    const d = await turnDataChecked(p, turn([req(WHAT)]));
    expect(d.restates.map(r => r.id)).toEqual(['extras_revenue']);
  });
});

describe('a mismatch is taken off only when the rest decides the same way; else the ask is deferred', () => {
  it('two full items, one mismatched: the other given, the mismatched one not, nothing refused', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [{ id: 'fuel_prices', answers: 'full' }, { id: 'unit_costs', answers: 'full' }] }));
    const p = plan('How have our airport charges and staffing moved over time?', { tags: {
      fuel_prices: { entity: 'client', period: ['historical', 'current'], quantityKind: ['trend'] },
      unit_costs: { entity: 'client', period: ['current'], quantityKind: ['level'] },
    } });
    const d = await turnDataChecked(p, turn([req('the trend in airport charges and staffing over time')]));
    expect(d.releases.map(r => r.id)).toEqual(['fuel_prices']);
    expect(d.refusals).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(acted(p, 'haiku_tag_gate').map(e => e.detail)).toEqual([{ what: 'the trend in airport charges and staffing over time', gated: [{ id: 'unit_costs', why: 'kind' }], deferred: false }]);
  });
  it('a full item mismatched beside a partial one: taking it off would refuse the ask — deferred instead', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [{ id: 'extras_revenue', answers: 'full' }, { id: 'port_avery_per_flight', answers: 'partial', missing: 'extras revenue by type' }] }));
    const p = plan(MARCUS_T23, { revealed: ['extras_revenue', 'port_avery_per_flight'], tags: { extras_revenue: LEVEL } });
    const d = await turnDataChecked(p, turn([req(WHAT)]));
    expect(d.refusals).toEqual([]);
    expect(d.restates).toEqual([]);
    expect(d.defers).toEqual([WHAT]);
  });
  it('a partial item is no positive: never gated (E1 gives it as the coarse item)', async () => {
    on();
    ask.mockImplementation(async () => ({ items: [{ id: 'extras_revenue', answers: 'partial', missing: 'by type' }] }));
    const p = plan(MARCUS_T23, { revealed: ['extras_revenue'], tags: { extras_revenue: LEVEL } });
    await turnDataChecked(p, turn([req(WHAT)]));
    expect(acted(p, 'haiku_tag_gate')).toEqual([]);
  });
});

describe('the ask\'s tags, read by code', () => {
  const fb = taggedFactBase('prof-002');
  it('kinds from the model\'s words only, plainly said', () => {
    expect(askTags('extras revenue by type', '', fb).kinds).toEqual(['split']);
    expect(askTags('growth in the eligible pool over recent years', '', fb).kinds).toEqual(['trend']);
    expect(askTags('One-off cost to stand up the US team', '', fb).kinds).toEqual(['one-off']);
    expect(askTags('whether the roasting line cost recurs', '', fb).kinds).toEqual(['recurring']);
    expect(askTags('the total number of stores carrying Hollis Bay', '', fb).kinds).toEqual(['total']);
    // A rate is no recurring kind, nor "annual" revenue.
    expect(askTags("Kelvexa's net price per patient per year", '', fb).kinds).toEqual([]);
    expect(askTags('total annual revenue', '', fb).kinds).toEqual([]);
    // The candidate's sentence adds no kind.
    expect(askTags('the fixed costs', 'Do we have the fixed costs and their breakdown?', fb).kinds).toEqual([]);
  });
  it('periods from the words and the sentence', () => {
    expect(askTags('the forecast peak share', '', fb).periods).toEqual(['forecast']);
    expect(askTags('the fare', 'What is the fare today?', fb).periods).toEqual(['current']);
    expect(askTags('fuel prices over the last two years', '', fb).periods).toEqual(['historical']);
    expect(askTags('the fare', 'Now, what is the fare?', fb).periods).toEqual([]);
  });
  it('entity: another company named and not the item\'s', () => {
    const t = askTags("the entrant's cost per seat", '', fb);
    expect(t.entities).toEqual(['competitor']);
    expect(itemTagsAgree(t, { entity: 'client', period: ['current'], quantityKind: ['level'] })).toEqual({ agree: false, why: 'entity' });
    expect(itemTagsAgree(t, { entity: 'competitor', period: ['current'], quantityKind: ['level'] })).toEqual({ agree: true });
    // Client words never exclude another entity's item (one-directional, as tagsAgree).
    expect(itemTagsAgree(askTags('our cost disadvantage per seat', '', fb), { entity: 'competitor', period: ['current'], quantityKind: ['level'] })).toEqual({ agree: true });
  });
  it('period and kind: a mismatch only when the item has none the ask names', () => {
    const tags: ItemTags = { entity: 'client', period: ['historical', 'current'], quantityKind: ['level', 'trend'] };
    expect(itemTagsAgree({ entities: [], periods: ['forecast'], kinds: [] }, tags)).toEqual({ agree: false, why: 'period' });
    expect(itemTagsAgree({ entities: [], periods: ['forecast', 'current'], kinds: [] }, tags)).toEqual({ agree: true });
    expect(itemTagsAgree({ entities: [], periods: [], kinds: ['split'] }, tags)).toEqual({ agree: false, why: 'kind' });
    expect(itemTagsAgree({ entities: [], periods: [], kinds: ['trend'] }, tags)).toEqual({ agree: true });
    expect(itemTagsAgree({ entities: ['competitor'], periods: ['forecast'], kinds: ['split'] }, undefined)).toEqual({ agree: true });
  });
});
