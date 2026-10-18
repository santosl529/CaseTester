// Lorenzo, 15 Oct (batch-26 fix-report ruling 2): a late recommendation ask
// also asks for the biggest risk. "Late" is the time warning, or code's
// recommendation ask past the recommendation deadline (the brainstorm
// budget's end). Batch 26 Blake 4755c03a with the checker on: the probe at t17
// pushed each stage a turn later, the recommendation came only with the time
// warning (t23, 18:28.6), and time-up (t25) left no turn for the risk
// question. One combined line now records both stages, and the end gate
// closes on the next substantive reply. The grace ask at time-up is not in the
// ruling and is unchanged.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { CheckerClaim, CheckerResult } from '@/lib/orchestrator/math-checker';
import { poolPattern } from '@/lib/orchestrator/phrasing';

type Row = Record<string, unknown>;
const store = { session: {} as Row, turns: [] as Row[], revealed: [] as Row[], exhibits: [] as Row[], events: [] as Row[] };
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', async () => {
  const { getTableName } = await import('drizzle-orm');
  const target = (t: unknown) => ({ session_turns: store.turns, revealed_data: store.revealed, exhibits_shown: store.exhibits, session_events: store.events } as Record<string, Row[]>)[getTableName(t as never)];
  return {
    db: {
      query: {
        sessions: { findFirst: async () => ({ ...store.session }) },
        sessionTurns: { findMany: async () => [...store.turns].sort((a, b) => (a.turnIndex as number) - (b.turnIndex as number)) },
        exhibitsShown: { findMany: async () => [...store.exhibits] },
        revealedData: { findMany: async () => [...store.revealed] },
        sessionEvents: { findMany: async () => store.events.filter(e => e.category === 'data_request' || e.category === 'math_checker') },
      },
      insert: (t: unknown) => ({ values: async (v: Row | Row[]) => { target(t)?.push(...(Array.isArray(v) ? v : [v])); } }),
      update: () => ({ set: (v: Row) => ({ where: async () => { if (store.session.status === 'active') store.session = { ...store.session, ...v }; } }) }),
    },
  };
});
vi.mock('@/lib/analytics', async orig => ({ ...(await orig<object>()), logEvent: async () => {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/hint-check', async orig => ({ ...(await orig<object>()), checkHintDelivered: async () => null }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => ({ given: true, reason: '' }) }));
const calls: { message: string; resolve: (r: CheckerResult) => void }[] = [];
vi.mock('@/lib/orchestrator/math-checker', async orig => ({
  ...(await orig<object>()),
  checkMathClaims: (a: { input: { message: string } }) => new Promise<CheckerResult>(resolve => { calls.push({ message: a.input.message, resolve }); }),
}));
const MODEL: { turn: ModelTurn } = { turn: { move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What would you look at next?' } };
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return { createInterviewerModel: () => ({ runTurn: async () => MODEL.turn, streamTurn: () => eventsFromTurn(Promise.resolve(MODEL.turn)) }) };
});

const { runTurn } = await import('@/lib/orchestrator/session-runner');
const { TIME_WARNING_SCRIPTS, GRACE_ASK_SCRIPTS, hasCloseCue, pickScript } = await import('@/lib/agent/prompts/scripts');
const { LATE_RECOMMENDATION_ASKS, BLOCKED_CLOSE_PROBES, asksRecommendationAsk, asksRiskQuestion, isClosingTurn } = await import('@/lib/orchestrator/spoken-close');
const { updateStages, stagesFromRecord, INITIAL_STAGES } = await import('@/lib/orchestrator/stage-evidence');
const { answersRecommendationAsk, classifyTurn } = await import('@/lib/orchestrator/stall');
const { suppliesRecommendation } = await import('@/lib/orchestrator/synthesis-guard');
const { planTurn } = await import('@/lib/orchestrator/plan-turn');
const { settleTurn } = await import('@/lib/orchestrator/settle-turn');
const { readsFixture } = await import('./fixtures/turn-reads');
const { modelPlanFixture } = await import('./fixtures/model-plan');
const { INITIAL_PRESSURE_TEST } = await import('@/lib/orchestrator/pressure-test');

const MIN = 60_000;
const LATE_LINES = [...TIME_WARNING_SCRIPTS, ...LATE_RECOMMENDATION_ASKS];

describe('the late lines ask for the recommendation and the biggest risk, as one question', () => {
  it.each(LATE_LINES)('%s', line => {
    expect(asksRecommendationAsk(line)).toBe(true);
    expect(asksRiskQuestion(line, false)).toBe(true);
    expect(line.match(/\?/g) ?? []).toHaveLength(1);
    expect(line.trim().endsWith('?')).toBe(true);
    expect(isClosingTurn(line)).toBe(false);
    expect(hasCloseCue(line)).toBe(false);
    expect(suppliesRecommendation(line)).toBe(false);
  });
  it('the on-time recommendation ask and the grace ask are unchanged: no risk in them', () => {
    for (const line of [...BLOCKED_CLOSE_PROBES.recommendation, ...GRACE_ASK_SCRIPTS]) expect(asksRiskQuestion(line, true)).toBe(false);
  });
});

describe('the stage record from a delivered combined line', () => {
  const ANSWERED = { delivered: true, deliveredAt: 2, outcome: 'answered' as const };
  const before = { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, exhibit: { delivered: true, deliveredAt: 16, outcome: 'answered' as const }, brainstorm: { delivered: true, deliveredAt: 22, outcome: 'answered' as const } };
  const pt = { ...INITIAL_PRESSURE_TEST, state: 'satisfied' as const };
  const turn = (o: { turnIndex: number; candidateText: string; question: string; recAsked?: boolean; recommendationDelivered?: boolean; move?: string }) => ({
    exhibitShown: false, released: false, recAsked: false, recommendationDelivered: false, pressureTest: pt, candidateFigures: 3, ...o,
  });
  it.each(LATE_LINES)('records the recommendation and the risk as asked: %s', line => {
    const r = updateStages(before, turn({ turnIndex: 24, candidateText: 'Broad input inflation against frozen prices.', question: line, recAsked: true, move: 'code_rec_ask' }));
    expect(r.recommendation).toMatchObject({ delivered: true, deliveredAt: 24, asks: 1 });
    expect(r.risk).toMatchObject({ delivered: true, deliveredAt: 24 });
    const s = stagesFromRecord(r, false);
    expect(s).toMatchObject({ recommendationAsked: true, riskAsked: true });
  });
  const REPLY = "My recommendation: raise menu prices about 10% now, in two steps, and renegotiate dairy and packaging contracts. The biggest risk is traffic loss, so I'd pilot the increase in a few markets first and watch transactions.";
  it('a reply giving both is read as the recommendation received, and resolves the risk', () => {
    expect(answersRecommendationAsk(REPLY, classifyTurn(REPLY, null).kind)).toBe(true);
    let r = updateStages(before, turn({ turnIndex: 24, candidateText: 'Broad input inflation.', question: TIME_WARNING_SCRIPTS[0], recAsked: true, move: 'code_rec_ask' }));
    r = updateStages(r, turn({ turnIndex: 26, candidateText: REPLY, question: '', recommendationDelivered: true }));
    expect(r.recommendation.outcome).toBe('answered');
    expect(r.risk.outcome).toBe('answered');
  });
});

// prof-001's recommendation deadline: the brainstorm budget's end, 16:00.
describe("code's recommendation ask: late past the deadline, as before until then", () => {
  const ANSWERED = { delivered: true, deliveredAt: 2, outcome: 'answered' as const };
  const CORE = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change'];
  const LOW = { structure: 20, quantitative: 20, dataExhibit: 20, judgment: 20, creativity: 20, synthesis: 20, communication: 20, pushback: 20 };
  const FULL = { structure: 80, quantitative: 80, dataExhibit: 80, judgment: 80, creativity: 80, synthesis: 80, communication: 80, pushback: 80 };
  const planAt = (min: number, coverage = LOW) => {
    const reads = readsFixture({ phase: 'BRAINSTORM', elapsedMs: Math.round(min * MIN), revealed: CORE,
      flags: { pressureTest: { state: 'satisfied', askedAt: 2 }, stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, exhibit: { delivered: true, deliveredAt: 4, outcome: 'answered' }, brainstorm: { delivered: true, deliveredAt: 18, outcome: 'answered' } } } });
    (reads as { exhibitRows: unknown[] }).exhibitRows = [{ id: 'x1', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: 0 }];
    (reads.session as { coverageJsonb: unknown }).coverageJsonb = coverage;
    const p = planTurn(reads, "Occupancy and overhead — I haven't touched either.", { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    return p.state;
  };
  it('Blake t21 (16:56): the deadline ask is late', () => {
    const s = planAt(16.931);
    expect(s.kind).toBe('rec_ask');
    expect(s.recAskLate).toBe(true);
  });
  it('a coverage ask past 16:00 is late too; one before it is not', () => {
    expect(planAt(16.5, FULL)).toMatchObject({ kind: 'rec_ask', recAskLate: true });
    expect(planAt(9, FULL)).toMatchObject({ kind: 'rec_ask', recAskLate: false });
    expect(planAt(15.9, FULL)).toMatchObject({ kind: 'rec_ask', recAskLate: false });
  });
  const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
  const settleAsk = async (late: boolean) => {
    const plan = modelPlanFixture({ distress: null, candidateText: 'Broad input inflation against frozen prices.', kind: 'rec_ask' });
    plan.state.pressureTest = { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 2 };
    plan.state.recAskLate = late;
    const s = await settleTurn(plan, { turn: { move: 'other', requests: [], exhibit: null, rescueItem: null, say: 'Understood.', question: '' }, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [] });
    return s.spokenText;
  };
  it('Settle says a late ask from the combined pool, an on-time one from the old pool', async () => {
    const seed = 's1:3';
    expect(await settleAsk(true)).toBe(`Understood. ${pickScript([...LATE_RECOMMENDATION_ASKS], seed)}`);
    expect(await settleAsk(false)).toBe(`Understood. ${pickScript([...BLOCKED_CLOSE_PROBES.recommendation], seed)}`);
  });
});

// ── Lorenzo's acceptance test: Blake 4755c03a with the checker on ──────────
// Blake's real clock (minutes since the start) and his real messages. The
// checker's flag on t15's "twelve to thirteen points" lands before t17, so
// t17 carries its probe and the deadlines yield a turn: the analysis line at
// t19, the brainstorm at t21, and the recommendation only with the time
// warning at t23 — which now asks the risk too, before time-up.
const BLAKE = { t13: 10.773, t15: 12.316, t17: 13.856, t19: 15.392, t21: 16.931, t23: 18.476, t25: 20.02 };
const SAID = {
  t14: "Mature versus new stores, understood. Overhead and rent are 14% of revenue, up slightly from 12%. With the overhead and rent figures in hand, how do they compare with your occupancy estimate, and what does that tell you about where the eighteen points sit?",
  t15: "Overhead up two points — so that's two of the eighteen, meaningful but not the story. I don't think I got the rent split, but I'd still expect occupancy to be carrying some of this given the new-unit drag.\n\nSo the arithmetic as I hold it: labor zero, overhead two, occupancy call it three or four on the new-store leases, and that leaves roughly twelve to thirteen points sitting in COGS. Which is right in line with what I'd expect from a doubling in green coffee plus dairy up a quarter, on a line that started around 30% of revenue.\n\nSo the eighteen points are overwhelmingly a commodity-inflation story, amplified by two years of frozen menu prices and some overhead creep from scaling. Labor's actually their bright spot — 22% and stable is genuinely well-run.\n\nI'm comfortable saying input costs are the root cause and pricing is the lever.",
  t17: "Fair — that's my estimate, not your data. It's built from the industry norm of 10-12% occupancy for specialty coffee plus an assumption that aggressive unit growth pushed them to the mid-teens. I should have flagged it as an assumption rather than folding it into the arithmetic as if it were given.\n\nThat said, I'd defend the shape of it. They grew revenue 15% with flat prices, which means volume and new units, and new units reliably carry above-average rent as a percent of sales during ramp. So three to four points is a reasonable planning number even if the actual figure comes back at two or six.\n\nAnd it doesn't really move the conclusion. Labor is confirmed flat at 22%, overhead is confirmed at two points. Whatever occupancy turns out to be, the large residual still sits in COGS, and the bean and dairy inflation over this window is more than enough to fill it.",
  t19: "Ah — if that 14% is overhead and rent together, then occupancy is inside that line, and the whole bucket only moved two points. So my three to four points of rent drag doesn't exist as a separate item; I double-counted it.\n\nThat tightens things rather than loosening them. Labor flat at zero, occupancy and overhead combined at two, so roughly sixteen of the eighteen points are sitting in COGS. Which is actually closer to my original estimate of COGS going from 30% to the mid-forties than the version where I carved out rent.\n\nSo the picture is cleaner: this is almost entirely a cost-of-goods problem. Beans and dairy up sharply, menu prices untouched for two years, and a lean labor model that's already been optimized so there's nothing left to cut there.\n\nThat makes pricing the primary lever, with procurement second. Should I take it to a recommendation?",
  t21: "I'd want the COGS line broken out — beans, dairy, cups and lids, food and pastry — so we can see which component actually moved. My expectation is green coffee is the bulk of it, with dairy second, but the split would tell us whether this is one commodity or broad-based.\n\nI'd also look at waste and shrink. Specialty chains typically run 3-5% waste on milk and pastry, and if that's drifted up with new, untrained staff at new stores, it inflates COGS without any input price moving at all.\n\nAnd I'd benchmark their bean contracts. A lot of chains buy spot or on short contracts, which means they took the full arabica spike. Peers who hedged twelve or eighteen months out absorbed much less of it. If Brew & Bean is unhedged, that's both the explanation and a fixable lever.\n\nBut directionally I'm already confident: unhedged commodity exposure against frozen prices.",
  t23: "Okay, so my bean thesis was overstated — beans are only a quarter of COGS, and up 40%, not double. Let me blend it: 25% × 40% plus 75% × 37.5% is 10 plus 28.1, so about 38% across the whole COGS line. It's broad-based inflation, not a coffee story.\n\nNow the size. If COGS started at 30% of revenue, a 38% increase takes it to roughly 41.5%, so about 11.5 points of margin. Add the two points of overhead and rent, and I'm at 13.5 of the 18. There's still four or five points I can't account for.\n\nThat residual bothers me. It could be waste and shrink at new stores, or my 30% starting COGS could be off — if it was actually closer to 38-40%, the same inflation rate would produce the full gap.\n\nSo: broad input inflation against frozen prices is the core. Can I get the actual COGS as a percent of revenue, prior and current?",
};
// The checker's verdict on t15 (batch 26, as recorded), before vetting.
const BLAKE_T15_CLAIM: CheckerClaim = {
  span: 'occupancy call it three or four on the new-store leases, and that leaves roughly twelve to thirteen points sitting in COGS',
  quantity: 'COGS contribution as residual of the 18-point decline', candidateValue: '12-13 points',
  assumptions: 'Occupancy of 3-4 points is separate from the 2-point overhead; the candidate has not been shown the COGS figure',
  verdict: 'error', correctValue: 16, correctLow: null, correctHigh: null, unit: 'points',
  derivation: 'Overhead/rent is the 14% line, already revealed, which includes rent. Residual is 18 - 0 - 2 = 16 points.', errorType: 'conceptual',
  changesConclusion: false, confidence: 'medium',
  probe: 'You said occupancy adds three or four points on top of overhead up two. How does that fit with overhead being 14% of revenue, up from 12%?',
  pointer: 'How does that fit with the overhead and rent line you were given, 14% of revenue, up from 12%?',
  codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, actualShare: null,
};
const PROBE = 'Walk me through how you got to 12-13 points.';
const LOW = { structure: 20, quantitative: 20, dataExhibit: 20, judgment: 20, creativity: 20, synthesis: 20, communication: 20, pushback: 20 };

function seedBlake() {
  const startedAt = new Date(Date.now() - BLAKE.t15 * MIN);
  const ANSWERED = { delivered: true, deliveredAt: 2, outcome: 'answered' as const };
  store.session = {
    id: 's1', userId: 'u1', caseId: 'prof-001', phase: 'ANALYSIS', elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
    abandonPhase: null, startedAt, completedAt: null, coverageJsonb: LOW,
    flagsJsonb: {
      conduct: { warnings: 0 }, lastMessageElapsedMs: Math.round(BLAKE.t13 * MIN),
      pressureTest: { ...INITIAL_PRESSURE_TEST, state: 'satisfied', askedAt: 2, satisfiedAt: 3, structureGiven: true },
      stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, analysis: { delivered: true, deliveredAt: 6, outcome: 'answered' } },
    },
  };
  const rows = Array.from({ length: 15 }, (_, i) => i % 2 === 0
    ? { role: 'interviewer', text: i === 14 ? SAID.t14 : i === 0 ? 'Your client is Brew & Bean. How would you approach this?' : 'Go on.' }
    : { role: 'candidate', text: i === 1 ? 'I would split profit into revenue and costs.' : 'I would look at the cost lines next.' });
  store.turns = rows.map((t, i) => ({ id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 40_000, latencyMs: null }));
  store.revealed = ['menu_price_change', 'labor_pct', 'overhead_pct'].map((ledgerItemId, i) => ({ id: `r${i}`, sessionId: 's1', ledgerItemId, revealedAtMs: startedAt.getTime() }));
  store.exhibits = []; store.events = []; calls.length = 0;
}
// The session clock at the candidate's message.
const at = (min: number) => { store.session = { ...store.session, startedAt: new Date(Date.now() - min * MIN) }; };
const flush = () => new Promise(r => setTimeout(r, 0));
const kindOf = (turnIndex: number) => (store.events.find(e => e.category === 'check' && e.subtype === 'turn_kind' && e.turnIndex === turnIndex)?.payloadJsonb as { detail?: { kind?: string } } | undefined)?.detail?.kind;
const stages = () => (store.session.flagsJsonb as Row).stageEvidence as ReturnType<typeof updateStages>;

describe("Blake 4755c03a, checker on, on his real clock: the risk is asked before time-up", () => {
  beforeEach(seedBlake);
  it('t15 the exhibit, t17 the checker probe, t19 the analysis line, t21 the brainstorm, t23 the time warning with the recommendation and the risk', async () => {
    at(BLAKE.t15);
    const r15 = await runTurn('s1', SAID.t15);
    expect(kindOf(15)).toBe('stage_exhibit');
    expect(r15.interviewerText).toMatch(/Here's an exhibit/);
    const c15 = calls.find(c => c.message === SAID.t15)!;
    c15.resolve({ claims: [BLAKE_T15_CLAIM], model: 'claude-sonnet-5-5', latencyMs: 7174, stopReason: 'end_turn' });
    await flush(); await flush();

    at(BLAKE.t17);
    MODEL.turn = { move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: 'Understood.', question: 'How does that fit with the overhead and rent line you were given, 14% of revenue, up from 12%?' };
    const r17 = await runTurn('s1', SAID.t17);
    expect(kindOf(17)).toBe('model');
    expect(r17.interviewerText).toContain(PROBE);

    at(BLAKE.t19);
    const r19 = await runTurn('s1', SAID.t19);
    expect(kindOf(19)).toBe('stage_analysis');
    expect(r19.interviewerText).toMatch(/what's driving the margin drop/i);

    at(BLAKE.t21);
    await runTurn('s1', SAID.t21);
    expect(kindOf(21)).toBe('stage_brainstorm');
    expect(stages().brainstorm.delivered).toBe(true);

    at(BLAKE.t23);
    const r23 = await runTurn('s1', SAID.t23);
    expect(kindOf(23)).toBe('time_warning');
    expect(TIME_WARNING_SCRIPTS).toContain(r23.interviewerText.replace(/^.*?(?=We're|Time's)/, ''));
    expect(asksRecommendationAsk(r23.interviewerText)).toBe(true);
    expect(r23.interviewerText).toMatch(/biggest risk/);
    expect(stages().recommendation.delivered).toBe(true);
    expect(stages().risk).toMatchObject({ delivered: true, deliveredAt: 24 });

    // Blake's real t25 came at time-up: the close, with the risk asked.
    at(BLAKE.t25);
    const r25 = await runTurn('s1', "My 30% starting point was wrong — the actual base was 42%. COGS up 16 points, overhead and rent up 2, labor flat. That's the full 18. Want my recommendation?");
    expect(r25.ended).toBe(true);
    expect(stages().risk.delivered).toBe(true);
  });

  // Lorenzo, 16 Oct (close-hold.ts): its figures not yet checked, it holds the close one turn — the stage's follow-up — until time-up.
  it('a reply before time-up that gives the recommendation and the risk: the follow-up, then the close', async () => {
    for (const [min, text] of [[BLAKE.t15, SAID.t15], [BLAKE.t17, SAID.t17], [BLAKE.t19, SAID.t19], [BLAKE.t21, SAID.t21], [BLAKE.t23, SAID.t23]] as const) {
      at(min);
      await runTurn('s1', text);
      if (min === BLAKE.t15) { calls[0].resolve({ claims: [BLAKE_T15_CLAIM], model: 'claude-sonnet-5-5', latencyMs: 7174, stopReason: 'end_turn' }); await flush(); await flush(); }
    }
    at(19.6);
    const r = await runTurn('s1', "My recommendation: raise menu prices about 10% now, in two steps, and renegotiate dairy and packaging contracts. The biggest risk is traffic loss, so I'd pilot the increase in a few markets first and watch transactions.");
    expect(r.ended).toBe(false);
    expect(kindOf(25)).toBe('close_wait');
    at(19.9);
    const r27 = await runTurn('s1', 'Dairy contracts first — they are the fastest to move.');
    expect(r27.ended).toBe(true);
    expect(poolPattern('close_complete').test(r27.interviewerText)).toBe(true);
  });
});
