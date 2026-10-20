// Round 5 E1 (Lorenzo, 20 Oct; batch 34 Aldermoor Marisol t14, Jasmine t4,
// serious): an explicit ask a scope rule empties as a finer cut keeps the
// coarse item the model named — given under every gate, with "I don't have
// <the ask>." for the finer cut (logged `scope_coarse`); with no coarse item
// going out, it goes through the small-model check like any other refusal.
// This reverses the round-2 exception that refused it whole, unchecked.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
const { classify } = vi.hoisted(() => ({ classify: vi.fn(async (): Promise<unknown> => []) }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: classify }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null }));
// Aldermoor without D1's covers (Task 37 added "treatment mix", "breakdown by
// drug class", … to current_treatment and nimbrel, which exempt those asks from
// the scope rules): the case as B1 ran it, so the scope path is exercised.
vi.mock('@/lib/cases/loader', async orig => {
  const real = await orig<typeof import('@/lib/cases/loader')>();
  const entry = real.getCaseById('entry-001');
  const d1 = new Set(['treatment mix', 'current treatment mix', 'treatment breakdown', 'breakdown by drug class', 'competitor mix', 'mix across treated patients', "nimbrel's share of treated patients"]);
  const covers = Object.fromEntries(Object.entries(entry.factAnchors?.covers ?? {}).map(([id, phrases]) => [id, (phrases as string[]).filter(p => !d1.has(p))]));
  const variant = { ...entry, id: 'entry-nocovers', factAnchors: { ...entry.factAnchors!, covers } };
  return { ...real, getCaseById: (id: string) => (id === 'entry-nocovers' ? variant : real.getCaseById(id)) };
});

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { turnDataChecked } from '@/lib/orchestrator/turn-data';
import { renderDataLines } from '@/lib/orchestrator/data-decisions';
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

const SATISFIED = { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };
const plan = (caseId: string, text: string, o: { phase?: 'STRUCTURE' | 'EXHIBIT' | 'BRAINSTORM'; revealed?: string[]; shown?: string[]; flags?: Record<string, unknown> } = {}): ModelPlan => {
  const p = planTurn(readsFixture({ caseId, phase: o.phase ?? 'EXHIBIT', revealed: o.revealed, flags: { ...SATISFIED, ...o.flags } }), text,
    { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  for (const id of o.shown ?? []) p.state.shownExhibitIds.add(id);
  return p;
};
const turn = (requests: DeclaredRequest[], exhibit: string | null = null) => ({ requests, exhibit, rescueItem: null });
const acted = (p: ModelPlan, check: string) => p.ctx.checks.entries.filter(e => e.check === check);
beforeEach(() => { classify.mockReset(); classify.mockImplementation(async () => []); });

const CURRENT_TREATMENT = 'For moderate-to-severe patients, the main option in the US today is Nimbrel, an injectable advanced therapy.';

// B1 Aldermoor Marisol t13 (a1133734), verbatim; the model's request as declared.
const MARISOL_T13 = "Fair — it's the same number twice, not two sources.\n\nWhat moves 20% up: Kelvexa is a once-daily oral in a disease where, if the competition is injectable biologics, convenience is a real driver — patients and prescribers trade down on efficacy for pills. Also a clean safety profile, no lab monitoring, and no step-therapy requirement from payers.\n\nWhat moves it down: if payers put us behind one or two preferred biologics, we only see second-line patients; if the orals already there are cheap generics; and if we have no US salesforce, uptake is slower regardless of the label.\n\nEvidence I'd look for: the current treatment mix in Corlan's — what share of those 1.0 million treated patients sit on each class today — plus analogue launches, so uptake curves for the last once-daily oral entering an autoimmune market dominated by injectables. Do we have the competitor mix across the treated pool?\n\nAlso worth noting: 2038 gives us thirteen years, so the five-year ramp is comfortably inside exclusivity.";
const MARISOL_T13_ASK = { what: 'the current treatment mix across treated patients', itemIds: ['current_treatment'], explicit: true, respond: 'release' as const };
const MARISOL_T13_REVEALED = ['funnel_rates', 'patents', 'us_adults', 'peak_share_forecast', 'kelvexa_pricing'];

// B1 Aldermoor Jasmine t3 (4e89a7cc), verbatim; the model's three requests as declared.
const JASMINE_T3 = "It's broadly MECE — size, attractiveness, entry mode — though one gap is risk: manufacturing and supply for the US, legal/liability, and the capital at risk if we build and miss. I'd fold that under entry mode as a fourth test.\n\nI'd prioritize branch one. It's a gating question: the board has a hard $300M threshold, so if the bottom-up sizing doesn't clear it under reasonable share and price assumptions, the entry-mode work is moot. It's also the branch where a single number — net price per patient-year — swings the answer most, since US net prices typically run well above European ones.\n\nAlso, to calibrate peak share: do we have Kelvexa's European sales trajectory since 2022 — how share built year over year and where it plateaued? That's the best analog we have for US uptake.";
const JASMINE_T3_ASKS = [
  { what: "US prevalence of Corlan's disease and the patient funnel", itemIds: ['funnel_rates'], explicit: true, respond: 'release' as const },
  { what: 'current US treatment breakdown by drug class', itemIds: ['current_treatment'], explicit: true, respond: 'release' as const },
  { what: "Kelvexa's European sales trajectory since 2022", itemIds: [], explicit: true, respond: 'release' as const },
];

describe('an ask the scope rule empties keeps its coarse item (E1), without D1\'s covers', () => {
  it('Marisol t13: the current_treatment line, and the finer cut refused beside it — no check', async () => {
    const p = plan('entry-nocovers', MARISOL_T13, { revealed: MARISOL_T13_REVEALED });
    const d = await turnDataChecked(p, turn([MARISOL_T13_ASK], 'exhibit-2'));
    expect(acted(p, 'request_scope')).toHaveLength(1);
    expect(d.releases.map(r => r.id)).toEqual(['current_treatment']);
    expect(d.refusals).toEqual(['the current treatment mix across treated patients']);
    expect(classify).not.toHaveBeenCalled();
    const lines = renderDataLines(d, 's');
    expect(lines).toContain(CURRENT_TREATMENT);
    expect(lines).toContain("I don't have the current treatment mix across treated patients.");
    // The order renderDataLineParts composes: the item's line, the exhibit, then the refusal.
    expect(lines.indexOf(CURRENT_TREATMENT)).toBeLessThan(lines.indexOf("I don't have the current treatment mix across treated patients."));
    expect(acted(p, 'scope_coarse').map(e => e.detail)).toEqual([{ asks: [{ what: 'the current treatment mix across treated patients', ids: ['current_treatment'] }] }]);
    expect(d.requests.map(r => [r.request.what, r.response, r.ledgerItemIds])).toEqual([
      ['the current treatment mix across treated patients', 'release', ['current_treatment']],
      ['the current treatment mix across treated patients', 'refuse', []],
    ]);
  });
  it('Jasmine t3: the current_treatment line with "I don\'t have current US treatment breakdown by drug class."; the item-less ask still checked', async () => {
    const p = plan('entry-nocovers', JASMINE_T3, { phase: 'STRUCTURE' });
    classify.mockResolvedValueOnce([]);
    const d = await turnDataChecked(p, turn(JASMINE_T3_ASKS));
    // The funnel goes out on Exhibit 1, as in B1; the coarse item as its line.
    expect(d.exhibit?.id).toBe('exhibit-1');
    expect(d.releases.map(r => r.id)).toEqual(['current_treatment']);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify.mock.calls[0]).toEqual([expect.objectContaining({ candidateText: "Could I get Kelvexa's European sales trajectory since 2022?" })]);
    expect(d.refusals).toEqual(['current US treatment breakdown by drug class', "Kelvexa's European sales trajectory since 2022"]);
    const lines = renderDataLines(d, 's');
    expect(lines).toContain(CURRENT_TREATMENT);
    expect(lines).toContain("I don't have current US treatment breakdown by drug class or Kelvexa's European sales trajectory since 2022.");
  });
  it('with D1\'s covers (the real case): the ask is in scope and released as today — no refusal', async () => {
    const p = plan('entry-001', MARISOL_T13, { revealed: MARISOL_T13_REVEALED });
    const d = await turnDataChecked(p, turn([MARISOL_T13_ASK], 'exhibit-2'));
    expect(acted(p, 'request_scope')).toHaveLength(0);
    expect(acted(p, 'scope_coarse')).toHaveLength(0);
    expect(d.releases.map(r => r.id)).toEqual(['current_treatment']);
    expect(d.refusals).toEqual([]);
  });
});

// B1 Aldermoor Marisol t23 (Task 42's one-off cut, carried here): option_a is on
// Exhibit 3, already shown.
const MARISOL_T23 = "That came from the version where I had the royalty reversed. I'd computed Option B as $400M × 70% = $280M to Aldermoor, and Option A as $320M − $80M = $240M, so $280M − $240M = $40M in B's favour.\n\nThat's wrong on the premise. With the royalty read correctly, Option B gives Aldermoor $400M × 30% = $120M, and Option A gives $240M. So the gap is $240M − $120M = $120M, and it runs the other way — A beats B by $120M on what Aldermoor keeps.\n\nThe $40M number should be struck.\n\nThe one thing that still favours B is timing: six months versus 12–18, so B reaches peak sooner and we bank revenue a year earlier. But on an annual peak basis A is twice as good, and with patents to 2038 we have thirteen years to amortise the build. Do we know the one-off cost to stand up the US team, separate from the $80M annual?";
const MARISOL_T23_ASK = { what: 'One-off cost to stand up the US team under Option A, separate from the $80M annual cost', itemIds: ['option_a'], explicit: true, respond: 'release' as const };

describe('a coarse item already out, or held back', () => {
  // Controller ruling on E1 (20 Oct): Lorenzo's 13 Oct 4b stands — a coarse item
  // already out (said, or on a shown exhibit) is not said again; the finer cut is
  // refused alone, unchecked (the answer is in front of the candidate).
  it('Marisol t23: option_a already on Exhibit 3 → the one-off cost refused alone; no restate, no check', async () => {
    const revealed = ['survey_design', 'reasons_to_prescribe', 'barriers_to_prescribing', 'option_a', 'option_b', 'option_shared', 'funnel_rates', 'patents', 'insurance_coverage', 'us_adults', 'peak_share_forecast', 'net_sales_definition', 'kelvexa_pricing'];
    const p = plan('entry-001', MARISOL_T23, { revealed, shown: ['exhibit-2', 'exhibit-1', 'exhibit-3'], flags: { exhibitOnly: ['option_a', 'option_b', 'option_shared'] } });
    const d = await turnDataChecked(p, turn([MARISOL_T23_ASK]));
    expect(d.releases).toEqual([]);
    expect(d.restates).toEqual([]);
    expect(classify).not.toHaveBeenCalled();
    expect(renderDataLines(d, 's')).toEqual(["I don't have one-off cost to stand up the US team under Option A, separate from the $80M annual cost."]);
    expect(acted(p, 'scope_coarse').map(e => e.detail)).toEqual([{ alreadyOut: [{ what: MARISOL_T23_ASK.what, ids: ['option_a'] }] }]);
  });
  // prof-001: "COGS and labor by month" — a cut neither line has; both lines hold the asked quantity whole.
  const BY_MONTH_BOTH = { what: 'COGS and labor by month', itemIds: ['cogs_pct', 'labor_pct'], explicit: true, respond: 'release' as const };
  it('every coarse item already said → the refusal alone, no check call', async () => {
    const p = plan('prof-001', 'Do we have COGS and labor by month?', { revealed: ['cogs_pct', 'labor_pct'] });
    const d = await turnDataChecked(p, turn([BY_MONTH_BOTH]));
    expect(classify).not.toHaveBeenCalled();
    expect(d.releases).toEqual([]);
    expect(d.restates).toEqual([]);
    expect(renderDataLines(d, 's')).toEqual(["I don't have COGS and labor by month."]);
  });
  it('one coarse item out, one not: the one not yet out is released, the other not said again', async () => {
    const p = plan('prof-001', 'Do we have COGS and labor by month?', { revealed: ['cogs_pct'] });
    const d = await turnDataChecked(p, turn([BY_MONTH_BOTH]));
    expect(classify).not.toHaveBeenCalled();
    expect(d.releases.map(r => r.id)).toEqual(['labor_pct']);
    expect(d.restates).toEqual([]);
    expect(d.refusals).toEqual(['COGS and labor by month']);
  });
  // Review Focus 1: a fix that releases more never releases what the case holds back.
  it('Marisol t23 before Exhibit 1 is out: option_a waits on the release order → not released; the ask is checked', async () => {
    const p = plan('entry-001', MARISOL_T23, { revealed: [] });
    classify.mockResolvedValueOnce([]);
    const d = await turnDataChecked(p, turn([MARISOL_T23_ASK]));
    expect(d.releases).toEqual([]);
    expect(d.restates).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(d.refusals).toEqual([MARISOL_T23_ASK.what]);
    expect(acted(p, 'scope_coarse')).toHaveLength(0);
    expect(renderDataLines(d, 's').join(' ')).not.toMatch(/\$80 million|Option A is/);
  });
  // Round 5 E5 (b): the check maps it back to option_a, out of the one-off ask's
  // scope — a coarse item that can't go yet: the refusal stands, nothing released.
  it('… and when the check maps it back to option_a (out of scope, held): the refusal stands, still nothing released', async () => {
    const p = plan('entry-001', MARISOL_T23, { revealed: [] });
    classify.mockResolvedValueOnce([{ what: MARISOL_T23_ASK.what, ledgerItemIds: ['option_a'], response: 'none', explicit: true }]);
    const d = await turnDataChecked(p, turn([MARISOL_T23_ASK]));
    expect(d.releases).toEqual([]);
    expect(d.defers).toEqual([]);
    expect(d.refusals).toEqual([MARISOL_T23_ASK.what]);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(renderDataLines(d, 's').join(' ')).not.toMatch(/\$80 million|Option A is/);
  });
  it('the pressure-test gate holds the coarse item: not released, no gate deferral for it, the ask checked', async () => {
    const p = plan('entry-001', MARISOL_T23, { revealed: [], flags: { pressureTest: { state: 'awaiting', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: false, structureAsked: false, awaitingReplies: 0 } } });
    classify.mockResolvedValueOnce([]);
    const d = await turnDataChecked(p, turn([MARISOL_T23_ASK]));
    expect(d.releases).toEqual([]);
    expect(d.gateDefers).toEqual([]);
    expect(d.gatedIds).toEqual([]);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(d.refusals).toEqual([MARISOL_T23_ASK.what]);
  });
});

// prof-001, from the replay corpus: batch 31 Sofia e0f7d46c t17 — "the current
// COGS split by category" mapped to the two input price changes, which the
// split-vs-change rule drops. They are topic siblings of the ask, not the asked
// quantity at a coarser cut (controller ruling, 20 Oct, replay r5-44): today's
// line stays — the refusal alone, nothing released, no check (the replay has no
// verdict for a new check, and no verdict is a named deferral).
const SOFIA_T17 = "The margin drop is a COGS problem, almost entirely. COGS went from 42% to 58% of revenue — 16 points — and overhead added 2. Labor held flat at 22. That's the full 18-point decline from 24% to 6%, with nothing left unexplained.\n\nAnd the reason it flowed straight to the bottom line is that menu prices haven't moved in two years. So every dollar of input inflation was absorbed rather than passed through. Revenue grew 15%, but that's volume or new stores, not price — so they're selling more units at progressively worse unit margins, which actually makes the problem worse as they scale.\n\nTo pin it down I'd need three things: the current COGS split by category, to see if it's beans specifically or broad-based; waste and spoilage, to separate market inflation from operational leakage; and the store-level distribution of margin, to see if this is all 200 locations or a concentrated subset. The category split is the highest-value ask.";
describe('prof-001: a split ask mapped to change items (topic siblings, not coarse items)', () => {
  it('b31 Sofia t17: "I don\'t have the current COGS split by category." alone — no release, no check', async () => {
    const p = plan('prof-001', SOFIA_T17, { phase: 'BRAINSTORM', revealed: ['bean_share_of_cogs', 'menu_price_change', 'cogs_pct', 'labor_pct', 'overhead_pct'], shown: ['exhibit-a'] });
    const d = await turnDataChecked(p, turn([{ what: 'the current COGS split by category', itemIds: ['bean_price_change', 'non_bean_input_change'], explicit: true, respond: 'release' }]));
    expect(acted(p, 'request_scope')).toHaveLength(1);
    expect(classify).not.toHaveBeenCalled();
    expect(d.releases).toEqual([]);
    expect(d.restates).toEqual([]);
    expect(acted(p, 'scope_coarse')).toHaveLength(0);
    expect(renderDataLines(d, 's')).toEqual(["I don't have the current COGS split by category."]);
  });
});

// A finer ask the model answered with only an exhibit (4b, 13 Oct; Marcus 71a04add
// t12): refused unchecked, as before E1 — beside the exhibit when it is handed
// over (logged `scope_coarse`), alone when the exhibit is already on screen.
describe('a finer ask backed by an exhibit', () => {
  const ASK = { what: 'the split within the non-bean input costs', itemIds: ['exhibit-a'], explicit: true, respond: 'release' as const };
  it('the exhibit handed over this turn: "I don\'t have …" beside it, no check', async () => {
    const p = plan('prof-001', 'Do we have the split within that non-bean bucket?', { revealed: ['bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change'] });
    const d = await turnDataChecked(p, turn([ASK]));
    expect(d.exhibit?.id).toBe('exhibit-a');
    expect(d.refusals).toEqual([ASK.what]);
    expect(classify).not.toHaveBeenCalled();
    expect(acted(p, 'scope_coarse').map(e => e.detail)).toEqual([{ asks: [{ what: ASK.what, ids: ['exhibit-a'] }] }]);
  });
  it('the exhibit already shown: the refusal alone, no check (its answer is on screen)', async () => {
    const p = plan('prof-001', 'Do we have the split within that non-bean bucket?', { revealed: ['bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change', 'cogs_pct', 'labor_pct', 'overhead_pct'], shown: ['exhibit-a'] });
    const d = await turnDataChecked(p, turn([ASK]));
    expect(d.exhibit).toBeNull();
    expect(classify).not.toHaveBeenCalled();
    expect(renderDataLines(d, 's')).toEqual([`I don't have ${ASK.what}.`]);
  });
});

// Review finding (task 44 fix round 3): a coarse ask's refusal must not pull in a
// siblings-only ask the coverage step remapped to held items — "I don't have the
// split within the non-bean input costs …" beside its own price-change lines or deferral.
describe('a coarse ask beside a siblings-only ask the coverage step remapped', () => {
  const ASKS = [
    { what: 'number of stores by region', itemIds: ['stores_count'], explicit: true, respond: 'release' as const },
    { what: 'the split within the non-bean input costs', itemIds: ['non_bean_input_change'], explicit: true, respond: 'release' as const },
  ];
  const TEXT = 'Could I get the number of stores by region, and the split within the non-bean input costs?';
  it('pressure test satisfied: the store count with "I don\'t have number of stores by region."; the price changes released, not refused', async () => {
    const p = plan('prof-001', TEXT);
    const d = await turnDataChecked(p, turn(ASKS));
    expect(d.refusals).toEqual(['number of stores by region']);
    expect(d.releases.map(r => r.id)).toEqual(['stores_count', 'bean_price_change', 'non_bean_input_change']);
    expect(renderDataLines(d, 's').join(' ')).not.toMatch(/I don't have the split within the non-bean/);
    expect(classify).not.toHaveBeenCalled();
  });
  it('pressure test open: the price changes held by the gate are not also refused', async () => {
    const p = plan('prof-001', TEXT, { flags: { pressureTest: { state: 'awaiting', askedAt: 2, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: false, structureAsked: false, awaitingReplies: 0 } } });
    const d = await turnDataChecked(p, turn(ASKS));
    expect(d.refusals).toEqual(['number of stores by region']);
    expect(d.releases.map(r => r.id)).toEqual(['stores_count']);
    expect(d.gatedIds).toEqual(['bean_price_change', 'non_bean_input_change']);
    const said = renderDataLines(d, 's').join(' ');
    expect(said).not.toMatch(/I don't have the split within the non-bean/);
    expect(said).toMatch(/coffee bean price change/);
  });
});

// Review Focus 1, the release cap: a coarse item over the cap is not deferred
// out loud for an ask that didn't name it; the ask goes to the check.
describe('a coarse item over the release cap', () => {
  it('three releases first, then "COGS by month": cogs_pct not released or promised; the ask checked', async () => {
    const p = plan('prof-001', 'Could I get total revenue, the average ticket, menu price changes and COGS by month?');
    classify.mockResolvedValueOnce([]);
    const d = await turnDataChecked(p, turn([
      { what: 'total revenue', itemIds: ['revenue_total'], explicit: true, respond: 'release' },
      { what: 'average ticket', itemIds: ['avg_ticket'], explicit: true, respond: 'release' },
      { what: 'menu price changes', itemIds: ['menu_price_change'], explicit: true, respond: 'release' },
      { what: 'COGS by month', itemIds: ['cogs_pct'], explicit: true, respond: 'release' },
    ]));
    expect(d.releases.map(r => r.id)).toEqual(['revenue_total', 'avg_ticket', 'menu_price_change']);
    expect(d.defers).toEqual([]);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(d.refusals).toEqual(['COGS by month']);
    expect(acted(p, 'scope_coarse')).toHaveLength(0);
    expect(renderDataLines(d, 's').join(' ')).not.toMatch(/COGS is 58%|come back to/);
  });
});
