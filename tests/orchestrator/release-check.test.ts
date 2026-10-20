// Round 5 Task 51 (A5; B2 batch 35 Hollis Bay Marisol a14ca044 t9 → t10): a model
// release whose item the message never names is checked before release. Her t9
// asked whether the roasting line's lease recurs and "Do we have a sense of what
// marketing looks like in year two, or is the $4.5 million a one-time launch
// push?"; the model declared a release of longer_term_goals ("Hollis Bay's goals
// beyond year one, including year-two marketing and line costs") and code said
// "Hollis Bay's hope is that the line becomes a growth platform…". Expected:
// refused, no longer_term_goals. Messages and model turns verbatim from the run
// records; the detections are written as the classifier writes them, in her words.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DetectedDataRequest } from '@/lib/orchestrator/data-requests';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
// The classifier on the message (the check), and the small-model check on an
// item-less ask (classifyAsk, served through this file's detection mock as "Could I get <ask>?" — a test adapter, fixtures/ask-check.ts; production sends the ask to the check's own prompt): set per test.
let detected: DetectedDataRequest[] | null | 'hang' = [];
let checkVerdict: DetectedDataRequest[] | null = [];
const calls: string[] = [];
vi.mock('@/lib/orchestrator/data-requests', async orig => {
  const { askVia } = await import('./fixtures/ask-check');
  const detect = async (p: { candidateText: string }) => {
    calls.push(p.candidateText);
    if (p.candidateText.startsWith('Could I get ')) return checkVerdict;
    return detected === 'hang' ? new Promise(() => {}) : detected;
  };
  return { ...(await orig<object>()), classifyDataRequests: detect, classifyAsk: askVia(detect) };
});

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { streamTurnSegments } from '@/lib/orchestrator/stream-turn';
import { uncheckedReleases } from '@/lib/orchestrator/turn-data';
import { namesItem, namesNothing, matchAskDetections } from '@/lib/orchestrator/request-signal';
import { eventsFromTurn } from '@/lib/agent/models/turn-events';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import { PHRASE_POOLS } from '@/lib/orchestrator/phrasing';
import { getCaseById } from '@/lib/cases/loader';
import type { ModelTurn, DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

// Marisol a14ca044 t9, verbatim.
const T9_TEXT = "$3.0 million for the roasting line plus $4.5 million marketing gets me to $7.5 million. Add $1.5 million in shelf fees, that's $9.0 million. Then the $1.2 million recipe development brings it to $10.2 million.\n\nAnd without recipe development it's $9.0 million, which over $1.50 contribution is exactly 6.0 million bags. So the two figures are 6.0 and 6.8 million bags.\n\nOne thing I'd want to sanity check is whether the $3.0 million roasting line is truly a first-year-only cost or an annual lease that recurs. If it recurs, year one break-even is the right number but year two economics look very different — we'd still be carrying $3.0 million of line cost against a much smaller marketing spend. Do we have a sense of what marketing looks like in year two, or is the $4.5 million a one-time launch push?";
// The interviewer's t7 question, the one before her t9 (verbatim).
const T7_QUESTION = 'You said the fixed costs total $10.2 million. How did you do that calculation?';
// The model's t9, verbatim from parsedTurn.
const GOALS = { what: "Hollis Bay's goals beyond year one, including year-two marketing and line costs", itemIds: ['longer_term_goals'], explicit: true, respond: 'release' as const };
const T9_QUESTION = 'On revenue: you put break-even revenue at $20.4 million, about 7% of the business. What volume and cost base is that built on?';
const T9_TURN: ModelTurn = { move: 'analysis', requests: [GOALS], exhibit: null, rescueItem: null, say: 'Got it.', question: T9_QUESTION };
// The question as said in this test context (an existing filter cuts its lead-in).
const T9_TAIL = 'What volume and cost base is that built on?';
const T9_REVEALED = ['bag_price', 'variable_costs', 'launch_costs', 'recipe_cost'];
// Her two asks, in her words.
const LEASE = { what: 'whether the $3.0 million roasting line is truly a first-year-only cost or an annual lease that recurs', ledgerItemIds: ['launch_costs'], response: 'none' as const, explicit: true };
const MARKETING = { what: 'what marketing looks like in year two', ledgerItemIds: [] as string[], response: 'none' as const, explicit: true };

const launch = getCaseById('launch-001');
const GOALS_LINE = launch.dataLedger.find(i => i.id === 'longer_term_goals')!.value;
const LAUNCH_LINE = launch.dataLedger.find(i => i.id === 'launch_costs')!.value;
const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const outcome = (turn: ModelTurn, delivered: string[] = []): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered, undeliveredRevealIds: [] });
const pool = (name: keyof typeof PHRASE_POOLS) => new RegExp(PHRASE_POOLS[name].map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[xX]\\\}/g, '(.+)')).join('|'), 'i');

type PlanOpts = { caseId?: string; phase: 'STRUCTURE' | 'ANALYSIS' | 'EXHIBIT'; revealed: string[]; shown: string[]; ptSatisfied: boolean; lastQuestion?: string; open?: { ledgerItemId: string; what: string }[] };
function plan(text: string, o: PlanOpts): ModelPlan {
  const p = planTurn(readsFixture({ phase: o.phase, caseId: o.caseId ?? 'launch-001', revealed: o.revealed, elapsedMs: 459_442 }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  p.state.distress = Promise.resolve(null);
  p.state.kind = 'model';
  p.state.pressureTest = o.ptSatisfied ? { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 3 } : { ...INITIAL_PRESSURE_TEST, state: 'awaiting', askedAt: 2, probe: 'Is that structure MECE?', intents: ['mece'] };
  p.state.requiredExhibit = undefined;
  p.state.analysisOwed = false;
  p.state.owedStage = undefined;
  p.state.checkerLine = null;
  p.state.shownExhibitIds = new Set(o.shown);
  p.state.lastQuestion = o.lastQuestion ?? null;
  p.state.openDataRequests = (o.open ?? []).map(x => ({ ...x, turnIndex: 1 })) as never;
  return p;
}
const t9 = (over: Partial<PlanOpts> = {}) => plan(T9_TEXT, { phase: 'EXHIBIT', revealed: T9_REVEALED, shown: ['exhibit-1'], ptSatisfied: true, lastQuestion: T7_QUESTION, ...over });
const checkOf = (p: ModelPlan, name: string) => p.ctx.checks.entries.find(c => c.check === name);
const messageCalls = () => calls.filter(c => !c.startsWith('Could I get '));

beforeEach(() => { detected = []; checkVerdict = []; calls.length = 0; });

describe('a model release the message never names is checked (A5)', () => {
  it('Marisol t9: longer_term_goals is not released; both her asks are refused (the case holds neither)', async () => {
    detected = [LEASE, MARKETING];
    const p = t9();
    expect(uncheckedReleases(p, T9_TURN.requests)).toEqual([{ what: GOALS.what, raw: 'longer_term_goals', id: 'longer_term_goals' }]);
    const s = await settleTurn(p, outcome(T9_TURN));
    expect(s.spokenText).not.toContain(GOALS_LINE);
    expect(s.spokenText).not.toMatch(/goals beyond year one/i);
    // Her lease ask asks whether the line's cost recurs; launch_costs states only the
    // first-year figure: "I don't have …", not the launch costs said again (4b; the
    // finer-cut scope rule, data-decisions.ts RECURRENCE_ASK).
    expect(s.spokenText).not.toContain(LAUNCH_LINE);
    expect(s.spokenText).not.toMatch(pool('restate'));
    expect(s.spokenText).toBe(`Got it. I don't have data on ${LEASE.what} or data on ${MARKETING.what}. ${T9_TAIL}`);
    const decisions = checkOf(p, 'data_decisions')?.detail as { releases: string[]; refusals: string[] };
    expect(decisions.releases).toEqual([]);
    expect(decisions.refusals).toEqual([LEASE.what, MARKETING.what]);
    // The lease ask: its coarse item is out already — refused alone, unchecked (E1).
    expect(checkOf(p, 'scope_coarse')).toMatchObject({ detail: { alreadyOut: [{ what: LEASE.what, ids: ['launch_costs'] }] } });
    expect(checkOf(p, 'release_checked')).toMatchObject({ decision: 'act', detail: { checked: [{ what: GOALS.what, id: 'longer_term_goals' }], confirmed: [], withdrawn: ['longer_term_goals'], classified: true } });
    const d = checkOf(p, 'release_checked')!.detail as { latencyMs: unknown; waitMs: unknown };
    expect(typeof d.latencyMs).toBe('number');
    expect(typeof d.waitMs).toBe('number');
    // The marketing ask went through the item-less check (Task 45): mapped to none, refused.
    expect(checkOf(p, 'itemless_defer')).toMatchObject({ detail: { what: MARKETING.what, mapped: false, decision: 'refuse' } });
  });

  it('a detection that maps the item confirms it: released', async () => {
    detected = [{ ...MARKETING, ledgerItemIds: ['longer_term_goals'] }];
    const p = t9();
    const s = await settleTurn(p, outcome(T9_TURN));
    expect(s.spokenText).toContain(GOALS_LINE);
    expect(checkOf(p, 'release_checked')).toMatchObject({ decision: 'pass', detail: { confirmed: ['longer_term_goals'], withdrawn: [] } });
  });

  it('no verdict (the classifier failed): the release stands — nothing is withheld unchecked', async () => {
    detected = null;
    const p = t9();
    const s = await settleTurn(p, outcome(T9_TURN));
    expect(s.spokenText).toContain(GOALS_LINE);
    expect(checkOf(p, 'release_checked')).toMatchObject({ decision: 'pass', detail: { confirmed: ['longer_term_goals'], withdrawn: [], classified: false } });
  });

  it('no detection at all: the release is dropped, never refused in the model\'s words', async () => {
    detected = [];
    const p = t9();
    const s = await settleTurn(p, outcome(T9_TURN));
    expect(s.spokenText.startsWith('Got it. ')).toBe(true);
    expect(s.spokenText).not.toContain(GOALS_LINE);
    expect(s.spokenText).not.toMatch(/goals beyond year one/i);
    expect(s.spokenText).not.toMatch(pool('refuse'));
    expect(s.spokenText).not.toMatch(pool('defer'));
    expect(checkOf(p, 'data_decisions')).toMatchObject({ detail: { releases: [], refusals: [], defers: [] } });
    expect(checkOf(p, 'release_checked')).toMatchObject({ decision: 'act', detail: { withdrawn: ['longer_term_goals'] } });
  });

  it('a gated item the check finds is not released: before the pressure test, the launch costs are held', async () => {
    detected = [LEASE, MARKETING];
    const p = t9({ phase: 'ANALYSIS', revealed: [], shown: [], ptSatisfied: false });
    const s = await settleTurn(p, outcome(T9_TURN));
    const decisions = checkOf(p, 'data_decisions')?.detail as { releases: string[]; exhibit: string | null };
    expect(decisions.releases).toEqual([]);
    expect(decisions.exhibit).toBeNull();
    // launch_costs (gated) is the lease ask's coarse item: the gate holds it, and the
    // finer cut goes through the check — mapped to none here, so refused.
    expect(s.spokenText).not.toContain(LAUNCH_LINE);
    expect(s.spokenText).toContain(`I don't have data on ${LEASE.what}`);
    // longer_term_goals is neither released nor promised.
    expect(s.spokenText).not.toContain(GOALS_LINE);
    expect(s.spokenText).not.toMatch(/goals beyond year one/i);
    expect(checkOf(p, 'release_checked')).toMatchObject({ decision: 'act', detail: { withdrawn: ['longer_term_goals'] } });
  });

  it('streamed: Stream and Settle say the same data line, and the message is classified once', async () => {
    detected = [LEASE, MARKETING];
    const reference = await settleTurn(t9(), outcome(T9_TURN));
    calls.length = 0;
    const p = t9();
    const segs: string[] = [];
    const out = await streamTurnSegments(eventsFromTurn(Promise.resolve(T9_TURN)), p, async seg => { if (seg.text) segs.push(seg.text); }, { isDelivered: { value: false } });
    if (out.kind !== 'done') throw new Error('unexpected stop');
    const s = await settleTurn(p, outcome(out.turn, out.delivered));
    expect(s.prefixMismatch).toBe(false);
    expect([...segs, s.tail].join(' ')).toBe(reference.spokenText);
    expect(segs[0]).toBe('Got it.');   // the model's say goes out before the check is waited on
    expect(messageCalls()).toEqual([T9_TEXT]);
  });

  it('a slow classifier is waited on at most 1.5 s, then the release stands', async () => {
    detected = 'hang';
    const p = t9();
    const t0 = Date.now();
    const s = await settleTurn(p, outcome(T9_TURN));
    expect(Date.now() - t0).toBeLessThan(2500);
    expect(s.spokenText).toContain(GOALS_LINE);
    expect(checkOf(p, 'release_checked')).toMatchObject({ decision: 'pass', detail: { classified: false, timedOut: true } });
  }, 5000);
});

// prof-001 releases from the corpus whose asks are paraphrased or pointed at
// ("Do we have the cost breakdown per cup…", "the COGS line split") — the
// message's asking sentences alone don't name every item released, the message
// does (or an earlier ask is open): no check, released as before.
type CorpusTurn = { run: string; phase: 'STRUCTURE' | 'ANALYSIS' | 'EXHIBIT'; ptSatisfied: boolean; revealed: string[]; shown: string[]; open?: { ledgerItemId: string; what: string }[]; text: string; requests: DeclaredRequest[] };
const COST3 = ['cogs_pct', 'labor_pct', 'overhead_pct'];
const rel = (what: string, itemIds: string[]): DeclaredRequest => ({ what, itemIds, explicit: true, respond: 'release' });
const PROF: CorpusTurn[] = [
  {
    run: 'b28 Blake 32f0a72b t7', phase: 'ANALYSIS', ptSatisfied: true, revealed: [], shown: [],
    text: "The two-year P&L with costs broken out as a percent of revenue, both years side by side. That's the one view that tells me which line actually moved and by how much, rather than me assuming it was coffee and wages.\n\nSpecifically I'd want the COGS line split — green coffee versus dairy versus packaging and cups — because my whole hypothesis rests on green coffee, and if it turns out dairy or packaging drove it, that's a different fix entirely.\n\nAnd one thing I suspect gets skipped: the menu-price history. Did Brew & Bean raise prices at all over the two years? Most specialty chains took 8 to 10% of price in that window. If Brew & Bean held prices flat while input costs rose, that's the whole story right there and it's a very easy recommendation.\n\nBut working from priors, my base case is still prime cost expansion of roughly 10 to 12 points, with green coffee the single largest contributor.",
    requests: [rel('the cost lines as a percent of revenue, both years', COST3), rel('the menu price history', ['menu_price_change'])],
  },
  {
    run: 'b30 Anika 910aefe2 t3', phase: 'STRUCTURE', ptSatisfied: false, revealed: [], shown: [],
    text: "Cost per cup first. Revenue grew 15%, so the volume-and-price side of my tree is broadly working — stores, cups, and price can't be collapsing if the top line is up. That means the margin loss is almost certainly on the cost side, either input costs per cup rising or store-level fixed costs rising faster than the cups they're spread over. Margin going 24% to 6% is a 18-point swing; that's too big for mix alone.\n\nSecond priority is cups per store, because if revenue growth came from opening stores rather than selling more per store, then fixed cost per cup is rising even with flat rent — that's a cost-per-cup story too, just driven by the denominator.\n\nWhat it doesn't capture directly: anything above the store, so corporate overhead, marketing, interest expense, and one-time items like write-offs. I'd treat those as a fifth bucket sitting outside the per-cup math rather than force them in.\n\nDo we have the cost breakdown per cup, and separately, has menu pricing changed over the two years?",
    requests: [rel('the cost breakdown', COST3), rel('menu pricing changes over the two years', ['menu_price_change'])],
  },
  {
    run: 'b31 Sofia e0f7d46c t5', phase: 'EXHIBIT', ptSatisfied: true, revealed: COST3, shown: ['exhibit-a'],
    text: "Okay, this is clean. Labor is flat at 22 the whole time, so that's not the story. Overhead creeps from 12 to 14, two points — minor.\n\nCOGS is the driver: 42 to 58. That's a 16-point move. Let me size it: 16 divided by 42 is about a 38% increase in COGS, so roughly 38 percentage points of revenue is where the pressure is coming from. That swamps everything else and explains basically the entire 18-point margin decline.\n\nSo the question becomes what's inside COGS. For a coffee chain that's green coffee, dairy, cups and lids, food items, and packaging. Two hypotheses: input prices rose, or product mix shifted toward lower-margin items like food and specialty drinks.\n\nDo we have a breakdown of COGS by category across those two years? And separately — have menu prices changed at all over this period?",
    requests: [rel('the COGS breakdown by category', ['bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change']), rel('menu price changes', ['menu_price_change'])],
  },
  {
    run: 'b28 Jordan 591cff13 t7 (menu prices: asked earlier, open)', phase: 'EXHIBIT', ptSatisfied: true, revealed: [...COST3, 'bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change'], shown: ['exhibit-a'],
    open: [{ ledgerItemId: 'menu_price_change', what: 'menu price changes over the two years' }],
    text: "Sure. I took it as two sequential hits: 42 to 50 is eight points, then 50 to 58 is another eight, and because each year's increase lands on an already-compressed base, I was treating the cumulative drag as roughly double the headline — so call it 38 to 40 points of pressure on margin from COGS.\n\nReconciling it with the 18-point decline: the two don't net out, and that's actually the interesting part. If COGS alone is pushing something like 40 points of pressure and margin only fell 18, then roughly half of it got absorbed somewhere — most plausibly by the 15% revenue growth spreading fixed overhead across more volume, which is consistent with overhead only moving two points despite more stores.\n\nSo my read is COGS is the whole story and then some, and operating leverage is masking part of it.\n\nOn the inputs you gave: beans were a quarter of COGS and up 40%, everything else up 37.5% — so the increases are nearly uniform. That says a broad commodity shock, not a bean-specific one. Any sense of whether transaction volume grew in line with the 15%?",
    requests: [rel('menu price changes over 2 years', ['menu_price_change']), rel('transaction volume growth', ['avg_ticket', 'stores_count'])],
  },
];

describe('prof-001 releases with paraphrased asks are not checked (corpus)', () => {
  for (const c of PROF) {
    it(c.run, () => {
      const p = plan(c.text, { caseId: 'prof-001', phase: c.phase, revealed: c.revealed, shown: c.shown, ptSatisfied: c.ptSatisfied, open: c.open });
      expect(uncheckedReleases(p, c.requests)).toEqual([]);
    });
  }

  it('b28 Blake t7 settled: the cost lines and the menu prices go out, and the classifier is never asked', async () => {
    const c = PROF[0];
    const p = plan(c.text, { caseId: 'prof-001', phase: c.phase, revealed: c.revealed, shown: c.shown, ptSatisfied: true });
    await settleTurn(p, outcome({ move: 'analysis', requests: c.requests, exhibit: null, rescueItem: null, say: 'Okay.', question: 'What stands out?' }));
    const decisions = checkOf(p, 'data_decisions')?.detail as { releases: string[]; exhibit: string | null };
    expect([...decisions.releases, ...(decisions.exhibit ? [decisions.exhibit] : [])]).toEqual(expect.arrayContaining(['menu_price_change']));
    expect(checkOf(p, 'release_checked')).toBeUndefined();
  });
});

describe('the word test (request-signal.ts namesItem, namesNothing)', () => {
  const CLIENT = ['Brew & Bean'];
  it('a proper name is taken out as a name: "beans" still names the bean items, "Brew & Bean" alone does not', () => {
    expect(namesItem('Beans are the lever.', ['Coffee bean price change over 2 years'], CLIENT)).toBe(true);
    expect(namesItem('Brew & Bean is the client.', ['Coffee bean price change over 2 years'], CLIENT)).toBe(false);
  });
  // Fix round 1 (review): one proper-name rule for every caller — a word of a proper
  // name said alone ("snacks" of "Hollis Bay Snacks") names an item only through the
  // item's own label / spoken name / names, never through its covers.
  const HB = ['Hollis Bay', 'Hollis Bay Snacks'];
  const comp = launch.dataLedger.find(i => i.id === 'competition_general')!;
  const compOwn = [comp.label, comp.spoken ?? '', ...(launch.factAnchors?.names.competition_general ?? [])];
  const compCovers = launch.factAnchors?.covers?.competition_general ?? [];
  it('"snacks" alone names no item through its covers (competition_general: "who else sells chickpea snacks")', () => {
    expect(compCovers).toContain('who else sells chickpea snacks');
    expect(namesItem('And the snacks?', compOwn, HB, compCovers)).toBe(false);
    expect(namesItem('Hollis Bay Snacks?', compOwn, HB, compCovers)).toBe(false);
    // A common word of its covers still names it.
    expect(namesItem('Is there a dominant brand?', compOwn, HB, compCovers)).toBe(true);
  });
  it('Task 49 regression: a held-item detection is not kept on "snacks" alone', () => {
    const detection = { what: 'who the competitors are', ledgerItemIds: ['competition_general'] };
    const held = { text: 'And the snacks?', isHeld: () => true, itemNames: () => compOwn, caseNames: HB };
    expect(matchAskDetections([], [detection], held)).toEqual({ kept: [], dropped: [detection] });
  });
  it('a pointer names nothing: the model, reading the conversation, resolves it — no check', () => {
    expect(namesNothing('Can I see the data?', CLIENT)).toBe(true);
    expect(namesNothing('Could you share them?', CLIENT)).toBe(true);
    expect(namesNothing(T9_TEXT, ['Hollis Bay'])).toBe(false);
    const p = plan('Can I see the data?', { caseId: 'prof-001', phase: 'ANALYSIS', revealed: [], shown: [], ptSatisfied: true });
    expect(uncheckedReleases(p, [rel('the store count', ['stores_count'])])).toEqual([]);
  });
});
