// Round 5 Task 50 (A4; B2 batch 35 Hollis Bay Jasmine 984d9066 t5 → t6): an
// explicit ask the model replaced still gets its own answer. Her t5 asked "One
// thing I'd want: how many bags of chips does Hollis Bay sell a year?"; guard B
// wrote the turn again and the model declared an offer of the planning
// assumptions instead (explicit:false), so t6 offered them and never answered.
// Lorenzo (20 Oct, on approving the plan): "the Hollis Bay Jasmine t5 expectation
// matches D4/E1 (the chip-sales-flat line with the bag-count refusal)" — why_now's
// line, "I don't have <the bag count>.", and the model's offer still goes out.
// Messages and model turns verbatim from the run records. The live run never
// classified her message, so the detection's `what` is written as the classifier
// writes one (a noun phrase / question in the candidate's words).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DetectedDataRequest } from '@/lib/orchestrator/data-requests';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
// The classifier on the message (detection), and the small-model check on an
// item-less ask ("Could I get <ask>?", turn-data.ts checkAsk): set per test.
let detected: DetectedDataRequest[] | null | 'hang' = [];
let checkVerdict: DetectedDataRequest[] | null = [];
const calls: string[] = [];
vi.mock('@/lib/orchestrator/data-requests', async orig => ({
  ...(await orig<object>()),
  classifyDataRequests: async (p: { candidateText: string }) => {
    calls.push(p.candidateText);
    if (p.candidateText.startsWith('Could I get ')) return checkVerdict;
    return detected === 'hang' ? new Promise(() => {}) : detected;
  },
}));

import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { streamTurnSegments } from '@/lib/orchestrator/stream-turn';
import { eventsFromTurn } from '@/lib/agent/models/turn-events';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import { PHRASE_POOLS } from '@/lib/orchestrator/phrasing';
import { getCaseById } from '@/lib/cases/loader';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

// Jasmine 984d9066 t5, verbatim.
const T5_TEXT = "Variable cost per bag: 0.70 + 0.30 + 0.30 + 0.20 = $1.50. Contribution margin = 3.00 − 1.50 = $1.50, a 50% margin.\n\nFixed year-one costs: 3.0 + 4.5 + 1.5 = $9.0 million. Recipe development is sunk, so it's excluded from the go-forward decision.\n\nBreak-even volume = 9.0M / 1.50 = 6 million bags, which is $18 million in revenue at $3.00 — about 6% of Hollis Bay's current $300 million. Note that's gross; any cannibalization of chips would push the required volume higher, since a lost chip bag takes its own contribution with it.\n\nOne thing I'd want: how many bags of chips does Hollis Bay sell a year? That gives me a velocity benchmark — if the chip line moves, say, 100 million bags across its distribution, 6 million for a new line in year one is plausible; if it's 20 million, it isn't.\n\nMy recommendation: launch, conditionally. Six million bags on $9 million of launch support is an achievable bar given Hollis Bay already has shelf relationships with the exact retailers it needs, and the contribution margin is healthy at 50%, so every incremental bag past breakeven drops real money. The conditions: secure distribution commitments before committing the $1.5 million in shelf fees, and position the chickpeas in the better-for-you set rather than next to the chips to limit cannibalization.\n\nRisks: velocity assumptions are the whole case — if trial doesn't repeat, marketing spend doesn't recur and volume collapses in year two; chickpea input costs are more volatile than potatoes; and a national player entering the segment could outspend them.\n\nNext steps: validate repeat-purchase rate in a test market, lock retailer commitments, and pressure-test the cannibalization rate.\n\nI'm done — can we do another case?";
// The model's t6 (guard B's second write), verbatim from parsedTurn.
const OFFER = { what: 'the volume Hollis Bay can realistically expect in year one, including household and conversion assumptions', itemIds: ['planning_assumptions'], explicit: false, respond: 'defer' as const };
const T6_QUESTION = "You said six million bags is an achievable bar. Walk me through how you'd estimate the volume Hollis Bay can actually expect in year one, and what you'd need to know to do that.";
const T6_TURN: ModelTurn = { move: 'analysis', requests: [OFFER], exhibit: null, rescueItem: null, say: "Understood. Let's stay with this case.", question: T6_QUESTION };
const T5_REVEALED = ['bag_price', 'variable_costs', 'launch_costs', 'recipe_cost'];
const BAGS = { what: 'how many bags of chips Hollis Bay sells a year', ledgerItemIds: [] as string[], response: 'none' as const, explicit: true };
// As said (fix round 2): a count asked as a question is a noun phrase.
const BAGS_SAID = 'the number of bags of chips Hollis Bay sells a year';

// Jasmine t1, verbatim: her opening ask, before the pressure test.
const T1_TEXT = "Let me lay out how I'd think about this. The core question is whether the chickpea line breaks even in year one, so I'd structure it as a profitability build plus two qualifying checks.\n\nFirst, market: size of the US better-for-you salty snack segment, growth rate, and what share Hollis Bay could realistically capture given its Northeast/Midwest footprint and existing retail relationships.\n\nSecond, economics: revenue as shelf-space-weighted distribution times velocity times price, against variable cost per unit — chickpea sourcing, roasting, packaging — plus the fixed costs that matter in year one: new or converted production lines, slotting fees to retailers, and trade/marketing spend to drive trial.\n\nThird, capabilities and risks: can existing plants roast chickpeas or is that capex, can the sales force sell into a different shelf set, and is there cannibalization of the core chip business.\n\nTo start on the economics — do we have the projected price point and volume, and the cost structure for the chickpea line?";
const T2_QUESTION = 'Before we get into numbers: is that structure MECE, and which of those branches would you prioritize for the question the board is asking, and why?';

const WHY_NOW = getCaseById('launch-001').dataLedger.find(i => i.id === 'why_now')!.value;
const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const outcome = (turn: ModelTurn, delivered: string[] = []): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered, undeliveredRevealIds: [] });
const pool = (name: keyof typeof PHRASE_POOLS) => new RegExp(PHRASE_POOLS[name].map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[xX]\\\}/g, '(.+)')).join('|'), 'i');
const REFUSE = pool('refuse');

function plan(text: string, opts: { phase: 'INTRO' | 'EXHIBIT'; revealed: string[]; shown: string[]; elapsedMs: number; ptSatisfied: boolean }): ModelPlan {
  const p = planTurn(readsFixture({ phase: opts.phase, caseId: 'launch-001', revealed: opts.revealed, elapsedMs: opts.elapsedMs }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  p.state.distress = Promise.resolve(null);
  p.state.kind = 'model';
  p.state.pressureTest = opts.ptSatisfied ? { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 3 } : { ...INITIAL_PRESSURE_TEST };
  p.state.requiredExhibit = undefined;
  p.state.analysisOwed = false;
  p.state.owedStage = undefined;
  p.state.checkerLine = null;
  p.state.shownExhibitIds = new Set(opts.shown);
  return p;
}
const t5 = () => plan(T5_TEXT, { phase: 'EXHIBIT', revealed: T5_REVEALED, shown: ['exhibit-1'], elapsedMs: 274_549, ptSatisfied: true });
const t1 = () => plan(T1_TEXT, { phase: 'INTRO', revealed: [], shown: [], elapsedMs: 90_216, ptSatisfied: false });
const checkOf = (p: ModelPlan, name: string) => p.ctx.checks.entries.find(c => c.check === name);
const messageCalls = () => calls.filter(c => !c.startsWith('Could I get '));
// The data line between the model's say and its question.
const dataOf = (spoken: string, say: string, question: string) => {
  expect(spoken.startsWith(`${say} `)).toBe(true);
  expect(spoken.endsWith(` ${question}`)).toBe(true);
  return spoken.slice(say.length + 1, -question.length - 1);
};

beforeEach(() => { detected = []; checkVerdict = []; calls.length = 0; });

describe('an explicit ask the model replaced gets its own answer (A4)', () => {
  it('Jasmine t5 → t6: the chip-sales-flat line, "I don\'t have the number of bags of chips …", and the model\'s offer', async () => {
    detected = [BAGS];
    const p = t5();
    const s = await settleTurn(p, outcome(T6_TURN));
    const data = dataOf(s.spokenText, T6_TURN.say, T6_QUESTION);
    const [line, rest] = [data.slice(0, WHY_NOW.length), data.slice(WHY_NOW.length + 1)];
    expect(line).toBe(WHY_NOW);
    expect(WHY_NOW).toMatch(/^Chip sales are flat/);
    const refusal = rest.slice(0, rest.indexOf(' I can share'));
    expect(refusal).toMatch(REFUSE);
    expect(refusal).toBe(`I don't have ${BAGS_SAID}.`);
    expect(rest.slice(refusal.length + 1)).toMatch(pool('offer'));
    expect(rest).toContain(OFFER.what);
    expect(checkOf(p, 'data_decisions')).toMatchObject({ detail: { releases: ['why_now'], refusals: [BAGS.what], offers: [OFFER.what] } });
    expect(checkOf(p, 'scope_coarse')).toMatchObject({ detail: { asks: [{ what: BAGS.what, ids: ['why_now'] }] } });
    expect(checkOf(p, 'uncovered_asks')).toMatchObject({ decision: 'act', detail: { open: ["One thing I'd want: how many bags of chips does Hollis Bay sell a year?"], answered: [BAGS.what] } });
    // Decided by the case's cover, not the small-model check.
    expect(checkOf(p, 'itemless_defer')).toBeUndefined();
  });

  it('the same when the classifier maps the ask to why_now itself: the count is finer than the item', async () => {
    detected = [{ ...BAGS, ledgerItemIds: ['why_now'] }];
    const p = t5();
    const s = await settleTurn(p, outcome(T6_TURN));
    const data = dataOf(s.spokenText, T6_TURN.say, T6_QUESTION);
    expect(data.startsWith(WHY_NOW)).toBe(true);
    expect(checkOf(p, 'data_decisions')).toMatchObject({ detail: { releases: ['why_now'], refusals: [BAGS.what], offers: [OFFER.what] } });
  });

  it('streamed: Stream and Settle say the same data line, and the message is classified once', async () => {
    detected = [BAGS];
    const reference = await settleTurn(t5(), outcome(T6_TURN));
    calls.length = 0;
    const p = t5();
    const segs: string[] = [];
    const out = await streamTurnSegments(eventsFromTurn(Promise.resolve(T6_TURN)), p, async seg => { if (seg.text) segs.push(seg.text); }, { isDelivered: { value: false } });
    if (out.kind !== 'done') throw new Error('unexpected stop');
    const s = await settleTurn(p, outcome(out.turn, out.delivered));
    expect(s.prefixMismatch).toBe(false);
    expect([...segs, s.tail].join(' ')).toBe(reference.spokenText);
    expect(segs.some(x => x.startsWith(WHY_NOW))).toBe(true);
    expect(messageCalls()).toEqual([T5_TEXT]);
  });

  it('an ask the model declared gets no second line, and the classifier is not waited on', async () => {
    detected = [BAGS];
    const p = t5();
    const declared = { what: 'how many bags of chips Hollis Bay sells per year', itemIds: [] as string[], explicit: true, respond: 'release' as const };
    const s = await settleTurn(p, outcome({ ...T6_TURN, requests: [declared] }));
    expect(s.spokenText.match(/bags of chips/g)?.length).toBe(1);
    expect(s.spokenText.match(/Chip sales are flat/g)?.length).toBe(1);
    expect(checkOf(p, 'uncovered_asks')).toMatchObject({ decision: 'pass', detail: { open: [], answered: [], classified: null } });
  });

  it('an explicit declaration of another item doesn\'t cover the ask: both are answered', async () => {
    detected = [BAGS];
    const p = t5();
    // The model's own t6 declaration, made explicit: it shares only "Hollis Bay" with her ask — a proper name, no cover.
    const other = { ...OFFER, explicit: true, respond: 'release' as const };
    const s = await settleTurn(p, outcome({ ...T6_TURN, requests: [other] }));
    expect(s.spokenText).toContain(WHY_NOW);
    expect(s.spokenText).toContain(BAGS_SAID);
    expect(checkOf(p, 'data_decisions')).toMatchObject({ detail: { releases: expect.arrayContaining(['planning_assumptions', 'why_now']) } });
  });

  it('an offer that shares a word with the ask doesn\'t cover it (an offer answers no ask)', async () => {
    detected = [BAGS];
    const p = t5();
    // The model's t8 offer, verbatim (Jasmine 984d9066): "bags" is in it too.
    const offer = { what: 'the planning assumptions on households, conversion and bags per household', itemIds: ['planning_assumptions'], explicit: false, respond: 'defer' as const };
    const s = await settleTurn(p, outcome({ ...T6_TURN, requests: [offer] }));
    expect(s.spokenText).toContain(WHY_NOW);
    expect(checkOf(p, 'data_decisions')).toMatchObject({ detail: { releases: ['why_now'], refusals: [BAGS.what], offers: [offer.what] } });
  });

  // Fix round 1 (review): coverage is decided per detection, and one shared word is no cover.
  it('Jasmine t5 with an explicit replacement that shares "bags": her ask is still answered', async () => {
    detected = [BAGS];
    const p = t5();
    // The model's t8 declaration, verbatim (Jasmine 984d9066), made explicit: "bags" is in it too.
    const replacement = { what: 'the planning assumptions on households, conversion and bags per household', itemIds: ['planning_assumptions'], explicit: true, respond: 'release' as const };
    const s = await settleTurn(p, outcome({ ...T6_TURN, requests: [replacement] }));
    expect(s.spokenText).toContain(WHY_NOW);
    expect(s.spokenText).toContain(BAGS_SAID);
    expect(checkOf(p, 'uncovered_asks')).toMatchObject({ decision: 'act', detail: { answered: [BAGS.what], covered: [] } });
  });

  it('Jasmine t1: a partly declared sentence — the price point declared, the cost-structure ask is answered too', async () => {
    const price = { what: 'the projected price point and volume', ledgerItemIds: ['bag_price'], response: 'none' as const, explicit: true };
    const cost = { what: 'the cost structure for the chickpea line', ledgerItemIds: ['variable_costs', 'launch_costs'], response: 'none' as const, explicit: true };
    detected = [price, cost];
    const p = t1();
    const declared = { what: 'the projected price point', itemIds: ['bag_price'], explicit: true, respond: 'defer' as const };
    const s = await settleTurn(p, outcome({ move: 'pressure_test', requests: [declared], exhibit: null, rescueItem: null, say: 'Understood.', question: T2_QUESTION }));
    expect(checkOf(p, 'uncovered_asks')).toMatchObject({ decision: 'act', detail: { answered: [cost.what], covered: [price.what] } });
    expect(s.spokenText).toMatch(/cost structure|variable costs|launch costs/i);
    // Gated before the pressure test: deferred, not released.
    expect((checkOf(p, 'data_decisions')!.detail as { releases: string[] }).releases).toEqual([]);
  });

  it('a gated item is not released: Jasmine t1 before the pressure test — the ask is deferred, nothing goes out', async () => {
    detected = [{ what: 'the projected price point and volume, and the cost structure for the chickpea line', ledgerItemIds: ['bag_price', 'variable_costs', 'launch_costs'], response: 'none', explicit: true }];
    const p = t1();
    const s = await settleTurn(p, outcome({ move: 'pressure_test', requests: [], exhibit: null, rescueItem: null, say: 'Understood.', question: T2_QUESTION }));
    const decisions = checkOf(p, 'data_decisions')!.detail as { releases: string[]; exhibit: unknown; gateDefers: string[] };
    expect(decisions.releases).toEqual([]);
    expect(decisions.exhibit).toBeNull();
    expect(s.spokenText).not.toMatch(/\$3\.00|\$0\.70|\$4\.5 million/);
    expect(checkOf(p, 'uncovered_asks')).toMatchObject({ decision: 'act' });
  });

  it('a classifier that doesn\'t answer in time: the turn goes on as the model wrote it', async () => {
    detected = 'hang';
    const p = t5();
    const s = await settleTurn(p, outcome(T6_TURN));
    expect(s.spokenText).not.toContain('Chip sales are flat');
    expect(s.spokenText).toContain(OFFER.what);
    expect(checkOf(p, 'uncovered_asks')).toMatchObject({ decision: 'pass', detail: { timedOut: true, classified: false } });
  }, 5000);

  it('a turn with no asking sentence makes no classifier call', async () => {
    detected = [BAGS];
    // Jasmine t7, verbatim.
    const text = 'Distribution points times bags per store per week times 52, cross-checked against households reached times conversion times bags per buyer.';
    const p = plan(text, { phase: 'EXHIBIT', revealed: T5_REVEALED, shown: ['exhibit-1'], elapsedMs: 274_549, ptSatisfied: true });
    await settleTurn(p, outcome({ ...T6_TURN, requests: [] }));
    expect(calls).toEqual([]);
    expect(checkOf(p, 'uncovered_asks')).toBeUndefined();
  });
});
