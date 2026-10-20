// Lorenzo, 15 Oct (ruling 5 on the batch-26 fix report): when a stage question
// is due, it wins over the checker's probe. Batch 26 Jordan 6bd9edf3 t19: fix
// 2's swap put "Walk me through that calculation." in place of the model's
// question, which also asked the risk — so the risk was never asked and the
// case didn't close at t21. Due: at or past the stage's deadline, or after the
// time warning; the risk once the recommendation is in. The probe is held back
// and goes out the next turn (it doesn't expire); a correction still goes first,
// before the stage question. A held line may hold the close once an interview
// ("Before we wrap up — …"), never at time-up.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { CheckerClaim, CheckerResult } from '@/lib/orchestrator/math-checker';
import { anyVariant, fill, PHRASE_POOLS } from '@/lib/orchestrator/phrasing';
// The neutral probes vary (brief B rulings, 18 Oct): any version of the line, as said.
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
// Said turns after its t17 claim, the bare probe quotes the claim in his words (round-4 ruling 4).
const QUOTE_17_1 = 'you said “The 16 points is what survived that dilution … which is why the net decline is only 18” — ';
const CALC_WRAP_UPS = PHRASE_POOLS.probe_calc.map(a => `Before we wrap up — ${QUOTE_17_1}${lowerFirst(a)}`);
const saysGotTo = (text: string, x: string) => PHRASE_POOLS.probe_got_to.some(v => text.includes(fill(v, x)));

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
const NEUTRAL: ModelTurn = { move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What would you look at next?' };
const MODEL: { turn: ModelTurn } = { turn: NEUTRAL };
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return { createInterviewerModel: () => ({ runTurn: async () => MODEL.turn, streamTurn: () => eventsFromTurn(Promise.resolve(MODEL.turn)) }) };
});

const { runTurn } = await import('@/lib/orchestrator/session-runner');
const { settleTurn } = await import('@/lib/orchestrator/settle-turn');
const { planTurn } = await import('@/lib/orchestrator/plan-turn');
const { planCheckerFlags } = await import('@/lib/orchestrator/math-checker-live');
const { vetCheckerClaims } = await import('@/lib/orchestrator/math-checker');
const { getCaseById } = await import('@/lib/cases/loader');
const { INITIAL_STAGES } = await import('@/lib/orchestrator/stage-evidence');
const { INITIAL_PRESSURE_TEST } = await import('@/lib/orchestrator/pressure-test');
const { readsFixture } = await import('./fixtures/turn-reads');
const { brainstormAsks } = await import('@/lib/orchestrator/brainstorm');
const { modelPlanFixture } = await import('./fixtures/model-plan');

const MIN = 60_000;
const ANSWERED = { delivered: true, deliveredAt: 2, outcome: 'answered' as const };
const COSTS = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'menu_price_change', 'bean_price_change', 'non_bean_input_change'];

// ── Jordan 6bd9edf3 (batch 26) ──────────────────────────────────────────────
const JORDAN = {
  t17: "I take the 16 points as the arithmetic on the exhibit — 58 minus 42, and 38% is the growth on its own base. I'm not disputing either.\n\nWhere I land differently is on what the exhibit understates. Revenue grew 15% over the same period, so the cost ratios are being measured against a bigger denominator each year. The 16 points is what survived that dilution. Strip the growth out and the underlying pressure is roughly double — call it forty points — which is why the net decline is only 18.\n\nSo no, it doesn't change the recommendation, and honestly it doesn't change the ordering either. Whether the gap is 16 points or forty, procurement and waste are worth one to two points each and pricing is the only lever with the scale. The forty-point read just makes me more insistent that we lead with price and mix rather than treat them as one option among several.\n\nThe data I'd still want is the price-versus-volume split on the non-bean basket.",
  t18: 'Understood. You said growth is masking how bad it is. How does revenue growth enter a margin measured as a percent of revenue?',
  t19: "Fair question. It enters through the denominator, I agree — COGS at 58% is already net of the fact that revenue got bigger. So in strict ratio terms, the 16 points is the clean measure and I shouldn't say growth is hiding anything inside that figure.\n\nWhere I'd still hold the line: the two 8-point steps land sequentially, and the second one lands on a base that's already been eroded. That stacking is why I read the real pressure as closer to forty than sixteen — the compounding isn't visible when you just subtract the endpoints.\n\nBut I'll grant that's a different claim than the one I made, and the denominator point is the sharper version. If you want me to defend it in absolute dollars rather than ratios I'd need the revenue base for each year — do we have that? Either way the ordering stands: pricing and mix first, procurement second.",
  t21: "Let me do it. At $480M, COGS went from 42% — $201.6M — to 58%, $278.4M. That's $76.8M of added cost, 16 points of revenue.\n\nAnd the relation is actually clean: COGS 16 points plus overhead 2 points equals 18, labor flat at zero. That's the entire margin decline, 24 to 6. So the two numbers reconcile without any dilution adjustment — the 16 is simply the biggest slice of the 18.\n\nWhich means my \"survived dilution\" framing was doing no work. I'd still say the compounding across two 8-point steps makes the underlying pressure read closer to forty, and that's the number I'd carry into sizing the fix — $76.8M is the visible bill, but the trajectory implies a bigger hole if nothing changes.\n\nBiggest risk to pricing-first: the entire ticket gain, $6.20 to $6.80, came from more items per visit, not price. Raise prices on exactly those add-on items and customers drop them — we'd lose volume and the margin together. That's why I'd test in a few markets before a chain-wide rollout.",
  // t21 without the redo: the risk answered, the calculation not.
  t21Risk: "Biggest risk to pricing-first: the entire ticket gain, $6.20 to $6.80, came from more items per visit, not price. Raise prices on exactly those add-on items and customers drop them — we'd lose volume and the margin together. That's why I'd test in a few markets before a chain-wide rollout.",
};
const JORDAN_T19_Q = 'With that in hand, walk me through the calculation behind your earlier point that the 16 points is what survived dilution and the net decline is only 18 — how do those two numbers relate? And separately, what is the single biggest risk to your pricing-first recommendation?';
const JORDAN_T19: ModelTurn = { move: 'risk', requests: [], exhibit: null, rescueItem: null, say: 'Understood.', question: JORDAN_T19_Q };
const JORDAN_LINE = 'Walk me through that calculation.';
// The checker's claim 17:1 (batch 26, as recorded), before vetting.
const JORDAN_17_1: CheckerClaim = {
  span: 'The 16 points is what survived that dilution... which is why the net decline is only 18.', quantity: 'Claim that revenue growth diluted the COGS effect and explains why the net decline is 18 points',
  candidateValue: 'growth masks COGS pressure', assumptions: 'Margin decline = COGS +16 and overhead +2 with labor flat', verdict: 'error', correctValue: 18, correctLow: null, correctHigh: null,
  unit: 'percentage points', derivation: 'The 18-point decline is fully explained by the 16-point COGS rise plus the 2-point overhead rise.', errorType: 'conceptual', changesConclusion: false, confidence: 'high',
  probe: 'You said the 16 points is what survived dilution from revenue growth. Which line in the exhibit offsets the COGS increase, given that 16 plus 2 gives the 18?',
  pointer: 'How does that fit with the exhibit, where COGS up 16 points and overhead up 2 points sum to the 18-point margin decline?',
  codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, actualShare: null,
};
const JORDAN_17_0: CheckerClaim = {
  ...JORDAN_17_1, span: 'Strip the growth out and the underlying pressure is roughly double — call it forty points — which is why the net decline is only 18.',
  quantity: 'Underlying COGS margin pressure in points of revenue after stripping out revenue growth', candidateValue: 'about 40 points', correctValue: 16,
  probe: 'You said the underlying pressure is roughly forty points once growth is stripped out. How did you get that figure, and what base is it measured on?', pointer: '',
};
// ── Jasmine 074b0534 (batch 26) ─────────────────────────────────────────────
const JASMINE = {
  t27: "It doesn't on its own — I overstated. A 10% price increase on a base of 100 takes revenue to 110; COGS stays at 58 in dollars, so COGS falls to about 53% of revenue, roughly 5 points. You'd need something closer to a 25-30% increase to recover all 16, which isn't realistic. So price is partial — maybe 5 points — and the rest has to come from input renegotiation, waste, and mix.",
  t29: 'Dairy and packaging renegotiation first — biggest unexplained chunk, fastest to move. Then waste and portion control. Then mix shift. Price alongside.',
  t31: "Holding all dollar costs fixed. Set 58/(1+x) = 42, the old COGS share — that gives 1+x = 1.38, so about 38%, not 25-30%. I was eyeballing it before. Either way it's not feasible on price alone.",
};
const JASMINE_PROBE = 'Walk me through how you got to about 5 points.';
const JASMINE_T31: ModelTurn = { move: 'recommendation', requests: [], exhibit: null, rescueItem: null, say: 'Right.', question: 'Pulling it together for the CEO in a few sentences: what is your final recommendation, in what order, and what would you want confirmed before acting?' };

// ── Settle: what is said on the turn ────────────────────────────────────────
const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const outcome = (turn: ModelTurn) => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });
function settlePlan(o: { id: string; key: string; action: 'probe' | 'correct'; line: string; due: Partial<{ brainstorm: boolean; recommendation: boolean; risk: boolean }>; recReceived?: boolean; wasHeld?: boolean; flagged?: number[] }) {
  const plan = modelPlanFixture({ distress: null, candidateText: JORDAN.t19, revealed: COSTS });
  plan.state.pressureTest = { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 2 };
  plan.state.requiredExhibit = undefined; plan.state.analysisOwed = false; plan.state.owedStage = undefined;
  plan.state.shownExhibitIds = new Set(['exhibit-a']);
  plan.state.recommendationReceived = o.recReceived ?? false;
  plan.state.stages = { ...plan.state.stages, brainstormAsked: true, recommendationAsked: true, recommendationAskCount: 1, recommendationReceived: o.recReceived ?? false };
  plan.state.stagesDue = { brainstorm: false, recommendation: false, risk: false, ...o.due };
  plan.state.checkerLine = { id: o.id, key: o.key, action: o.action, line: o.line, ...(o.wasHeld ? { wasHeld: true } : {}), undo: { attempt: undefined, step: o.action === 'probe' ? o.key : null, mathChecker: { handled: [] } } };
  plan.ctx.flags.mathChecker = { handled: [o.id] };
  plan.ctx.flags.stepProbes = { [o.key]: 1 };
  plan.state.recomputeAttempts[o.key] = 1;
  const figs = (o.line.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  plan.state.flaggedFigures = [...plan.state.flaggedFigures, ...figs, ...(o.flagged ?? [])];
  plan.state.derivedValueTexts.push(...figs.map(String));
  plan.ctx.events.push({ category: 'math_checker', subtype: 'flag', payload: { id: o.id, outcome: o.action, reason: 'attempt 1', key: o.key } });
  return plan;
}
const checkOf = (plan: ReturnType<typeof settlePlan>) => plan.ctx.checks.entries.find(c => c.check === 'checker_line');

describe('Settle: a due stage question keeps the question; the probe waits', () => {
  it('Jordan t19 (15:33, recommendation in at t15): the risk is due — the model\'s question stays whole, the probe is held back', async () => {
    const plan = settlePlan({ id: '17:1', key: 'checker:growth masks COGS pressure', action: 'probe', line: JORDAN_LINE, due: { risk: true }, recReceived: true, flagged: [16, 18, 40] });
    const s = await settleTurn(plan, outcome(JORDAN_T19));
    expect(s.spokenText).toBe(`Understood. ${JORDAN_T19_Q}`);
    expect(s.spokenText).toMatch(/single biggest risk/);
    expect(plan.ctx.flags.mathChecker).toEqual({ handled: [], held: '17:1' });
    expect(plan.state.recomputeAttempts['checker:growth masks COGS pressure']).toBeUndefined();
    expect(plan.ctx.events.find(e => e.category === 'math_checker' && e.subtype === 'flag')?.payload).toMatchObject({ id: '17:1', outcome: 'undelivered', reason: expect.stringMatching(/risk question is due/) });
    expect(checkOf(plan)).toMatchObject({ detail: { heard: false, heldFor: 'risk' } });
  });
  it('the same turn with the risk not due (no recommendation yet, before 16:00): fix 2 stands — the probe replaces the question', async () => {
    const plan = settlePlan({ id: '17:1', key: 'checker:growth masks COGS pressure', action: 'probe', line: JORDAN_LINE, due: {}, flagged: [16, 18, 40] });
    const s = await settleTurn(plan, outcome(JORDAN_T19));
    expect(s.spokenText).toBe(`Understood. ${JORDAN_LINE}`);
  });
  it('Jasmine t31 (11:04, recommendation deadline 16:00, no time warning): the recommendation ask is not due — the probe goes first, as fix 2', async () => {
    const plan = settlePlan({ id: '27:2', key: 'checker:about 5 points', action: 'probe', line: JASMINE_PROBE, due: {} });
    const s = await settleTurn(plan, outcome(JASMINE_T31));
    expect(s.spokenText).toBe(`Right. ${JASMINE_PROBE}`);
    expect(checkOf(plan)).toMatchObject({ detail: { by: 'code', heard: true } });
  });
  // Batch 29 Jordan ea27d1f6 t11: the probe took his recommendation ask, the
  // "recommendation" label stayed, and t13 was read as the reply to it.
  it('a recommendation ask the probe replaced keeps no "recommendation" label (Jordan b29 t11)', async () => {
    const JORDAN_B29_T11: ModelTurn = { move: 'recommendation', requests: [], exhibit: null, rescueItem: null, say: 'Got it, a broad set of levers.', question: 'Pulling that together, what is your recommendation to the CEO: which levers would you pull first, and in what sequence?' };
    const plan = settlePlan({ id: '7:1', key: 'checker:offsets absorb ~20 points', action: 'probe', line: JORDAN_LINE, due: {} });
    const s = await settleTurn(plan, outcome(JORDAN_B29_T11));
    expect(s.spokenText).toBe(`Got it, a broad set of levers. ${JORDAN_LINE}`);
    store.session = { id: plan.ctx.sessionId, status: 'active', flagsJsonb: {} };
    await s.persist({ firstSegmentMs: null, streamed: false });
    const moves = (store.session.flagsJsonb as { moves: Record<number, string> }).moves;
    expect(moves[plan.ctx.nextTurnIndex + 1]).toBeUndefined();
    // Asked in the model's words, the label stands.
    const asked = settlePlan({ id: '7:1', key: 'checker:offsets absorb ~20 points', action: 'probe', line: JORDAN_LINE, due: {} });
    asked.state.checkerLine = null;
    const t = await settleTurn(asked, outcome(JORDAN_B29_T11));
    store.session = { id: asked.ctx.sessionId, status: 'active', flagsJsonb: {} };
    await t.persist({ firstSegmentMs: null, streamed: false });
    expect((store.session.flagsJsonb as { moves: Record<number, string> }).moves[asked.ctx.nextTurnIndex + 1]).toBe('recommendation');
  });
  it('past 16:00 the same recommendation ask is due: it stays, and the probe is held back', async () => {
    const plan = settlePlan({ id: '27:2', key: 'checker:about 5 points', action: 'probe', line: JASMINE_PROBE, due: { recommendation: true } });
    const s = await settleTurn(plan, outcome(JASMINE_T31));
    expect(s.spokenText).toBe(`Right. ${JASMINE_T31.question}`);
    expect(plan.ctx.flags.mathChecker).toEqual({ handled: [], held: '27:2' });
  });
  it('a correction is no probe: it goes first, then the due stage question (Lorenzo, 15 Oct)', async () => {
    const correction = 'COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base.';
    const plan = settlePlan({ id: '15:0', key: 'checker:about 40 points', action: 'correct', line: correction, due: { risk: true }, recReceived: true, flagged: [16, 18, 40] });
    const s = await settleTurn(plan, outcome(JORDAN_T19));
    expect(s.spokenText).toBe(`Understood. ${correction} ${JORDAN_T19_Q}`);
    expect(plan.ctx.flags.mathChecker).toEqual({ handled: ['15:0'] });
  });
  it('a line held back once already is not held again: it goes before the due stage question', async () => {
    const plan = settlePlan({ id: '27:2', key: 'checker:about 5 points', action: 'probe', line: JASMINE_PROBE, due: { recommendation: true }, wasHeld: true });
    const s = await settleTurn(plan, outcome(JASMINE_T31));
    expect(s.spokenText).toBe(`Right. ${JASMINE_PROBE} ${JASMINE_T31.question}`);
    expect(plan.ctx.flags.mathChecker).toEqual({ handled: ['27:2'] });
  });
});

// ── Plan: which stages are due ──────────────────────────────────────────────
describe('Plan: due is the deadline, the time warning, or (the risk) the recommendation in', () => {
  const dueAt = (min: number, o: { stages?: Record<string, unknown>; flags?: Record<string, unknown> } = {}) => {
    const reads = readsFixture({ phase: 'RECOMMENDATION', elapsedMs: Math.round(min * MIN), revealed: COSTS,
      flags: { pressureTest: { state: 'satisfied', askedAt: 2 }, stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, exhibit: { delivered: true, deliveredAt: 4, outcome: 'answered' }, ...o.stages }, ...o.flags } });
    (reads as { exhibitRows: unknown[] }).exhibitRows = [{ id: 'x1', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: 0 }];
    const p = planTurn(reads, 'Dairy and packaging renegotiation first.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    return p.state.stagesDue;
  };
  const brainstormIn = { brainstorm: { delivered: true, deliveredAt: 8, outcome: 'answered' } };
  it('the brainstorm from the exhibit budget\'s end (13:20)', () => {
    expect(dueAt(13).brainstorm).toBe(false);
    expect(dueAt(13.5).brainstorm).toBe(true);
    expect(dueAt(13.5, { stages: brainstormIn }).brainstorm).toBe(false);   // done
  });
  it('Jasmine t31 (11:04): the recommendation asked, not given — not due; past 16:00 it is; after the time warning it is', () => {
    const asked = { ...brainstormIn, recommendation: { delivered: true, deliveredAt: 20, asks: 1 } };
    expect(dueAt(11.07, { stages: asked }).recommendation).toBe(false);
    expect(dueAt(16.2, { stages: asked }).recommendation).toBe(true);
    expect(dueAt(11.07, { stages: asked, flags: { timeWarningFired: true } }).recommendation).toBe(true);
  });
  it('Jordan t19 (15:33): the recommendation in at t15, the risk not asked — the risk is due; asked, it isn\'t', () => {
    const recIn = { ...brainstormIn, recommendation: { delivered: true, deliveredAt: 14, asks: 1, outcome: 'answered' } };
    expect(dueAt(15.55, { stages: recIn, flags: { stall: { recommendationDelivered: true } } }).risk).toBe(true);
    expect(dueAt(15.55, { stages: { ...recIn, risk: { delivered: true, deliveredAt: 20 } }, flags: { stall: { recommendationDelivered: true } } }).risk).toBe(false);
    expect(dueAt(15.55, { stages: brainstormIn }).risk).toBe(false);
  });
});

// ── The checker's plan: a held line doesn't expire, and goes first ─────────
describe('planCheckerFlags: a held line waits for its turn', () => {
  const caseData = getCaseById('prof-001');
  const claims = vetCheckerClaims([JORDAN_17_0, JORDAN_17_1], { caseData, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: [JORDAN.t17] });
  const row = { category: 'math_checker', subtype: 'verdict', turnIndex: 17, payloadJsonb: { candidateTurnIndex: 17, latencyMs: 5000, model: 'm', claims, codeFlags: [], stamps: [] } };
  const turnRows = [17, 19, 21].map(i => ({ turnIndex: i, role: 'candidate', text: 'I would look at the competitive response next.' }));
  const planAt = (held?: string) => planCheckerFlags({ rows: [row], handled: [], turnRows, candidateText: 'And the store footprint.', candidateTurnIndex: 23, currentFlags: [], attempts: {}, underTimePressure: false, candidateFigures: [], caseData, revealedIds: COSTS, held });
  it('three messages after the claim it has expired…', () => {
    expect(planAt().decisions).toContainEqual(expect.objectContaining({ id: '17:1', outcome: 'expired' }));
  });
  it('…unless a due stage held it back: then it is raised', () => {
    const p = planAt('17:1');
    expect(p.selected).toMatchObject({ id: '17:1', line: JORDAN_LINE });
  });
});

// ── Through the real runner ────────────────────────────────────────────────
const at = (min: number) => { store.session = { ...store.session, startedAt: new Date(Date.now() - min * MIN) }; };
const flush = () => new Promise(r => setTimeout(r, 0));
const flags = () => store.session.flagsJsonb as Row;
const decisionsFor = (id: string) => store.events.filter(e => e.category === 'math_checker' && e.subtype === 'flag' && (e.payloadJsonb as { id: string }).id === id).map(e => (e.payloadJsonb as { outcome: string; reason: string }));

function seedJordan(o: { heldCloseHold?: boolean; recMathProbed?: boolean } = {}) {
  const startedAt = new Date(Date.now() - 15.55 * MIN);
  store.session = {
    id: 's1', userId: 'u1', caseId: 'prof-001', phase: 'RECOMMENDATION', elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
    abandonPhase: null, startedAt, completedAt: null, coverageJsonb: null,
    flagsJsonb: {
      conduct: { warnings: 0 }, lastMessageElapsedMs: Math.round(13.92 * MIN), recMathProbed: o.recMathProbed ?? true,
      mathChecker: { handled: [], keys: { 'checker:about 40 points': { figures: [40], since: 5 } }, closed: ['checker:about 40 points'] }, ...(o.heldCloseHold ? { heldCloseHold: true } : {}),
      pressureTest: { ...INITIAL_PRESSURE_TEST, state: 'satisfied', askedAt: 2, satisfiedAt: 3, structureGiven: true },
      stall: { recommendationDelivered: true }, stagesEnforced: { exhibit: true },
      stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, analysis: { delivered: true, deliveredAt: 6, outcome: 'answered' }, exhibit: { delivered: true, deliveredAt: 4, outcome: 'answered' }, brainstorm: { delivered: true, deliveredAt: 12, outcome: 'answered' }, recommendation: { delivered: true, deliveredAt: 14, asks: 1, outcome: 'answered' } },
    },
  };
  const rows = Array.from({ length: 19 }, (_, i) => i === 17 ? { role: 'candidate', text: JORDAN.t17 } : i === 18 ? { role: 'interviewer', text: JORDAN.t18 }
    : i % 2 === 0 ? { role: 'interviewer', text: i === 0 ? 'Your client is Brew & Bean. How would you approach this?' : 'Go on.' } : { role: 'candidate', text: 'I would look at the cost lines next.' });
  store.turns = rows.map((t, i) => ({ id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 40_000, latencyMs: null }));
  store.revealed = COSTS.map((ledgerItemId, i) => ({ id: `r${i}`, sessionId: 's1', ledgerItemId, revealedAtMs: startedAt.getTime() }));
  store.exhibits = [{ id: 'e0', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: startedAt.getTime() }];
  const claims = vetCheckerClaims([JORDAN_17_0, JORDAN_17_1], { caseData: getCaseById('prof-001'), revealedIds: COSTS, shownExhibitIds: ['exhibit-a'], candidateTexts: [JORDAN.t17] });
  store.events = [{ sessionId: 's1', category: 'math_checker', subtype: 'verdict', turnIndex: 17, phase: 'RECOMMENDATION', payloadJsonb: { candidateTurnIndex: 17, latencyMs: 5815, model: 'claude-sonnet-5-5', claims, codeFlags: [], stamps: [] } }];
  calls.length = 0;
  MODEL.turn = NEUTRAL;
}

describe("Lorenzo's acceptance test — Jordan 6bd9edf3: the risk at t19, the error resolved before the close", () => {
  beforeEach(() => seedJordan());
  // Since 16 Oct (close-hold.ts) t21's own figures, not yet checked, hold the close one turn: the stage's follow-up.
  it('t19 keeps the risk question and holds the probe; t21, his redo states the right figure — the flag is answered; the follow-up, then the close', async () => {
    at(15.55);
    MODEL.turn = JORDAN_T19;
    const r19 = await runTurn('s1', JORDAN.t19);
    expect(r19.interviewerText).toContain(JORDAN_T19_Q);
    expect(r19.interviewerText).not.toContain(JORDAN_LINE);
    expect((flags().mathChecker as Row).held).toBe('17:1');
    expect((flags().stageEvidence as Row & { risk: { delivered: boolean } }).risk.delivered).toBe(true);
    MODEL.turn = NEUTRAL;
    at(17.10);
    const r21 = await runTurn('s1', JORDAN.t21);
    expect(r21.ended).toBe(false);
    expect(decisionsFor('17:1').at(-1)).toMatchObject({ outcome: 'stale' });
    expect((flags().closeHold as Row).waits).toEqual([21]);
    at(17.9);
    const r23 = await runTurn('s1', 'Test it in a few markets first, and watch add-on attach rates weekly.');
    expect(r23.ended).toBe(true);
  });
  it('a t21 that leaves the calculation unfixed: code says the held line before the close ("Before we wrap up —"), then closes', async () => {
    at(15.55);
    MODEL.turn = JORDAN_T19;
    await runTurn('s1', JORDAN.t19);
    MODEL.turn = NEUTRAL;
    at(17.10);
    const r21 = await runTurn('s1', JORDAN.t21Risk);
    expect(r21.ended).toBe(false);
    expect(CALC_WRAP_UPS).toContain(r21.interviewerText);
    expect(flags().heldCloseHold).toBe(true);
    expect(flags().recMathProbed).toBe(true);   // the conclusion-changing hold's own counter, untouched (already spent at t15)
    // The final answers' verdicts landed clean (close-hold.ts); the redo of code's probe is not waited on: the close.
    for (const c of calls) c.resolve({ claims: [], model: 'claude-sonnet-5-5', latencyMs: 6000, stopReason: 'end_turn' });
    await flush(); await flush();
    at(17.9);
    const r23 = await runTurn('s1', 'It is just 16 plus 2: the COGS rise and the overhead rise make the 18.');
    expect(r23.ended).toBe(true);
  });
  it('its counter is its own: the conclusion-changing close hold (recMathProbed) stays unspent', async () => {
    seedJordan({ recMathProbed: false });
    at(15.55);
    MODEL.turn = JORDAN_T19;
    await runTurn('s1', JORDAN.t19);
    MODEL.turn = NEUTRAL;
    at(17.10);
    const r21 = await runTurn('s1', JORDAN.t21Risk);
    expect(CALC_WRAP_UPS).toContain(r21.interviewerText);
    expect(flags().heldCloseHold).toBe(true);
    expect(flags().recMathProbed).toBe(false);
  });
  // Since 16 Oct t17 is a final answer (after the recommendation at t15): its flag is probed once at the close whatever the held-line counter.
  it('a second held line, in the final answers: still probed once before the close', async () => {
    seedJordan({ heldCloseHold: true });
    at(15.55);
    MODEL.turn = JORDAN_T19;
    await runTurn('s1', JORDAN.t19);
    MODEL.turn = NEUTRAL;
    at(17.10);
    const r21 = await runTurn('s1', JORDAN.t21Risk);
    expect(r21.ended).toBe(false);
    expect(CALC_WRAP_UPS).toContain(r21.interviewerText);
    expect((flags().closeHold as Row).probed).toEqual([{ key: expect.stringMatching(/growth masks/), at: 21 }]);
  });
  it('limit: at time-up the hold is skipped and the line goes to the report', async () => {
    at(15.55);
    MODEL.turn = JORDAN_T19;
    await runTurn('s1', JORDAN.t19);
    MODEL.turn = NEUTRAL;
    at(20.1);
    const r21 = await runTurn('s1', JORDAN.t21Risk);
    expect(r21.ended).toBe(true);
    expect(decisionsFor('17:1').at(-1)).toMatchObject({ outcome: 'unresolved_at_close', reason: 'time up' });
  });
  // Since 16 Oct: in the final answers it is probed once, whatever its rating; the redo then closes.
  it('a flag that doesn\'t change the conclusion and no stage held back: in the final answers, probed once before the close', async () => {
    // The risk was asked at t19 in the model's words with the probe said too — nothing held.
    store.session = { ...store.session, flagsJsonb: { ...flags(), stageEvidence: { ...(flags().stageEvidence as Row), risk: { delivered: true, deliveredAt: 18 } }, mathChecker: { handled: [] } } };
    at(17.10);
    const r = await runTurn('s1', JORDAN.t21Risk);
    expect(r.ended).toBe(false);
    // Its registry cleared here, the first of t17's two flags goes first: "forty points".
    expect(r.interviewerText).toMatch(/^Before we wrap up — you said the underlying pressure is roughly forty points/);
    expect(decisionsFor('17:0').at(-1)).toMatchObject({ outcome: 'probe' });
    for (const c of calls) c.resolve({ claims: [], model: 'claude-sonnet-5-5', latencyMs: 6000, stopReason: 'end_turn' });
    await flush(); await flush();
    at(17.9);
    // The redo holds nothing; t17's other flag gets its own one probe; then the close.
    const r23 = await runTurn('s1', 'It is still forty points, I think.');
    // The session's second wrap-up probe: its lead varies (phrasing.ts), the probe doesn't.
    expect(PHRASE_POOLS.probe_calc.some(a => new RegExp(`^(?:${anyVariant('wrap_up', `${QUOTE_17_1}${lowerFirst(a)}`).source})$`).test(r23.interviewerText))).toBe(true);
    expect((flags().closeHold as Row).probed).toHaveLength(2);
    at(18.6);
    const r25 = await runTurn('s1', 'Sixteen plus two is the eighteen.');
    expect(r25.ended).toBe(true);   // the redo of code's probe: the close
  });
});

describe('a due-stage variant: Jasmine\'s probe held back by a recommendation ask past 16:00 goes out the next turn, not expired', () => {
  const JAS_27_2: CheckerClaim = {
    span: 'So price is partial — maybe 5 points', quantity: 'Margin recovered by a 10% price rise', candidateValue: 'about 5 points', assumptions: '10% price rise, flat volume, all cost dollars fixed',
    verdict: 'error', correctValue: 8.5, correctLow: null, correctHigh: null, unit: 'points of margin', derivation: 'Costs of 94 on revenue 110 is 85.5%, so the margin goes from 6% to 14.5%, a gain of 8.5 points.',
    errorType: 'conceptual', changesConclusion: false, confidence: 'medium',
    probe: 'You said a 10% increase recovers maybe 5 points. Does that figure include the effect on labor and overhead as a share of revenue?', pointer: '',
    codeQuantity: { kind: 'gain', price: 10, stepId: null, target: null }, actualShare: null,
  };
  function seedJasmine() {
    const startedAt = new Date(Date.now() - 15.9 * MIN);
    store.session = {
      id: 's1', userId: 'u1', caseId: 'prof-001', phase: 'RECOMMENDATION', elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
      abandonPhase: null, startedAt, completedAt: null, coverageJsonb: { structure: 20, quantitative: 20, dataExhibit: 20, judgment: 20, creativity: 20, synthesis: 20, communication: 20, pushback: 20 },   // coverage short: no coverage ask
      flagsJsonb: {
        conduct: { warnings: 0 }, pressureTest: { ...INITIAL_PRESSURE_TEST, state: 'satisfied', askedAt: 2, satisfiedAt: 3, structureGiven: true }, stagesEnforced: { exhibit: true },
        stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, analysis: { delivered: true, deliveredAt: 6, outcome: 'answered' }, exhibit: { delivered: true, deliveredAt: 4, outcome: 'answered' }, brainstorm: { delivered: true, deliveredAt: 10, outcome: 'answered' } },
      },
    };
    const rows = Array.from({ length: 27 }, (_, i) => i % 2 === 0 ? { role: 'interviewer', text: i === 0 ? 'Your client is Brew & Bean. How would you approach this?' : 'Go on.' } : { role: 'candidate', text: 'I would look at the cost lines next.' });
    store.turns = rows.map((t, i) => ({ id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 30_000, latencyMs: null }));
    store.revealed = COSTS.map((ledgerItemId, i) => ({ id: `r${i}`, sessionId: 's1', ledgerItemId, revealedAtMs: startedAt.getTime() }));
    store.exhibits = [{ id: 'e0', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: startedAt.getTime() }];
    store.events = []; calls.length = 0; MODEL.turn = NEUTRAL;
  }
  beforeEach(seedJasmine);
  it('t27 the claim; its verdict lands after t29; t31 (16:30) the model asks for the recommendation (due; the deadline ask yields to the math line) — held; t33, three messages on, the probe goes out on the model turn', async () => {
    at(15.9); await runTurn('s1', JASMINE.t27);
    at(15.95); await runTurn('s1', JASMINE.t29);
    calls.find(c => c.message === JASMINE.t27)!.resolve({ claims: [JAS_27_2], model: 'claude-sonnet-5-5', latencyMs: 9000, stopReason: 'end_turn' });
    await flush(); await flush();
    at(16.5);
    MODEL.turn = JASMINE_T31;
    const r31 = await runTurn('s1', JASMINE.t31);
    expect(r31.interviewerText).toContain(JASMINE_T31.question);
    expect(r31.interviewerText).not.toContain(JASMINE_PROBE);
    expect((flags().mathChecker as Row).held).toBe('27:0');
    MODEL.turn = NEUTRAL;
    at(17.0);
    const r33 = await runTurn('s1', 'I would start with dairy renegotiation and a phased price rise.');
    expect(saysGotTo(r33.interviewerText, 'about 5 points')).toBe(true);   // JASMINE_PROBE, in any version
    expect(decisionsFor('27:0').map(d => d.outcome)).toEqual(['undelivered', 'probe']);
    expect((flags().mathChecker as Row).held).toBeUndefined();
  });
  // batch 24 4bf008f t19/t21 (replay): the brainstorm due at 15:49 held the probe, and at t21 code's coverage ask would have taken the turn.
  it('a held line takes the next turn over code\'s coverage ask (it yields, as the deadlines yield to a math line)', async () => {
    store.session = { ...store.session, flagsJsonb: { ...flags(), stageEvidence: { ...(flags().stageEvidence as Row), brainstorm: { delivered: false } } } };
    at(13.0); await runTurn('s1', JASMINE.t27);
    at(13.2); await runTurn('s1', JASMINE.t29);
    calls.find(c => c.message === JASMINE.t27)!.resolve({ claims: [JAS_27_2], model: 'claude-sonnet-5-5', latencyMs: 9000, stopReason: 'end_turn' });
    await flush(); await flush();
    at(14.0);
    MODEL.turn = { move: 'brainstorm', requests: [], exhibit: null, rescueItem: null, say: 'Right.', question: "Beyond what we've discussed, what else could the client do?" };
    const r31 = await runTurn('s1', JASMINE.t31);
    expect(r31.interviewerText).toContain('what else could the client do?');
    expect((flags().mathChecker as Row).held).toBe('27:0');
    MODEL.turn = NEUTRAL;
    store.session = { ...store.session, coverageJsonb: { structure: 80, quantitative: 80, dataExhibit: 80, judgment: 80, creativity: 80, synthesis: 80, communication: 80, pushback: 80 } };
    at(14.6);
    const r33 = await runTurn('s1', 'Waste control, mix shift toward brewed coffee, and loyalty pricing.');
    expect(saysGotTo(r33.interviewerText, 'about 5 points')).toBe(true);   // JASMINE_PROBE, in any version
    expect(r33.interviewerText).not.toMatch(/recommendation/);
  });
});

// ── R7 (Lorenzo, 19 Oct): a stage deadline yields to a checker line at most once ──
// Batch 32 Aldermoor Marisol: a checker line every turn from 6:32 to 22:07 —
// the brainstorm never asked, the survey exhibit only with the time warning.
// A correction rides on the overdue stage turn (said first, by code); a probe
// yields once, then the stage goes and the probe is held for the next model turn.
describe('R7 through the runner: the overdue brainstorm and the checker line', () => {
  const CLAIM = 'A 10% price increase recovers about 5 points of margin, and the underlying pressure is about 40 points.';
  const PRICE: CheckerClaim = {
    span: 'A 10% price increase recovers about 5 points of margin', quantity: 'margin gain', candidateValue: 'about 5 points', assumptions: '',
    verdict: 'error', correctValue: 8.5, correctLow: null, correctHigh: null, unit: 'points', derivation: '', errorType: 'conceptual',
    changesConclusion: true, confidence: 'high', probe: 'You said a 10% price rise recovers about 5 points. Which cost lines did you include?', pointer: '',
    codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null }, actualShare: null,
  };
  const FORTY: CheckerClaim = { ...JORDAN_17_0, span: 'the underlying pressure is about 40 points', candidateValue: 'about 40 points' };
  const asksBrainstorm = (text: string) => brainstormAsks(getCaseById('prof-001')).some(a => text.includes(a));
  function seedOwed(o: { attempts?: Record<string, number> } = {}) {
    const startedAt = new Date(Date.now() - 13.5 * MIN);
    store.session = {
      id: 's1', userId: 'u1', caseId: 'prof-001', phase: 'EXHIBIT', elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
      abandonPhase: null, startedAt, completedAt: null, coverageJsonb: { structure: 20, quantitative: 20, dataExhibit: 20, judgment: 20, creativity: 20, synthesis: 20, communication: 20, pushback: 20 },
      flagsJsonb: {
        conduct: { warnings: 0 }, pressureTest: { ...INITIAL_PRESSURE_TEST, state: 'satisfied', askedAt: 2, satisfiedAt: 3, structureGiven: true }, stagesEnforced: { exhibit: true },
        ...(o.attempts ? { recomputeAttempts: o.attempts } : {}),
        stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, analysis: { delivered: true, deliveredAt: 2, outcome: 'answered' }, exhibit: { delivered: true, deliveredAt: 2, outcome: 'answered' } },
      },
    };
    const rows = [
      { role: 'interviewer', text: 'Your client is Brew & Bean. How would you approach this?' }, { role: 'candidate', text: 'I would split profit into revenue and costs.' },
      { role: 'interviewer', text: 'Go on.' }, { role: 'candidate', text: CLAIM }, { role: 'interviewer', text: 'What would you look at next?' },
    ];
    store.turns = rows.map((t, i) => ({ id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 30_000, latencyMs: null }));
    store.revealed = COSTS.map((ledgerItemId, i) => ({ id: `r${i}`, sessionId: 's1', ledgerItemId, revealedAtMs: startedAt.getTime() }));
    store.exhibits = [{ id: 'e0', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: startedAt.getTime() }];
    const claims = vetCheckerClaims([PRICE, FORTY], { caseData: getCaseById('prof-001'), revealedIds: COSTS, shownExhibitIds: ['exhibit-a'], candidateTexts: [CLAIM] });
    store.events = [{ sessionId: 's1', category: 'math_checker', subtype: 'verdict', turnIndex: 3, phase: 'EXHIBIT', payloadJsonb: { candidateTurnIndex: 3, latencyMs: 6000, model: 'claude-sonnet-5-5', claims, codeFlags: [], stamps: [] } }];
    calls.length = 0; MODEL.turn = NEUTRAL;
  }
  it('a correction due at 13:30: one turn — code says the correction, then the brainstorm; the flag is booked and closed', async () => {
    seedOwed({ attempts: { 'pricing:gain@5': 1 } });
    at(13.5);
    const r = await runTurn('s1', 'Next I would look at the competitors.');
    expect(r.interviewerText).toMatch(/^From today's 6% margin, a 10% price rise lifts margin about 8\.5 points, not 5\./);
    expect(asksBrainstorm(r.interviewerText)).toBe(true);
    const mc = flags().mathChecker as { handled: string[]; closed: string[] };
    expect(mc.handled).toContain('3:0');
    expect(mc.closed).toContain('pricing:gain@5');
    expect((flags().recomputeAttempts as Record<string, number>)['pricing:gain@5']).toBe(2);
    expect(decisionsFor('3:0').at(-1)).toMatchObject({ outcome: 'correct' });
    expect((flags().stageEvidence as Row & { brainstorm: { delivered: boolean } }).brainstorm.delivered).toBe(true);
    expect(flags().stageYielded).toBeUndefined();
  });
  it('past 16:00 with the recommendation never asked: code\'s recommendation ask, the correction before it (the model\'s "say" first)', async () => {
    seedOwed({ attempts: { 'pricing:gain@5': 1 } });
    store.session = { ...store.session, phase: 'BRAINSTORM', flagsJsonb: { ...flags(), stageEvidence: { ...(flags().stageEvidence as Row), brainstorm: { delivered: true, deliveredAt: 2, outcome: 'answered' } } } };
    at(16.2);
    MODEL.turn = { ...NEUTRAL, say: 'Understood.' };
    const r = await runTurn('s1', 'Next I would look at the competitors.');
    expect(r.interviewerText).toMatch(/^Understood\. From today's 6% margin, a 10% price rise lifts margin about 8\.5 points, not 5\. \S/);
    expect(r.interviewerText).toMatch(/recommendation/i);
    expect((flags().mathChecker as { closed: string[] }).closed).toContain('pricing:gain@5');
    expect((flags().stageEvidence as Row & { recommendation: { delivered: boolean } }).recommendation.delivered).toBe(true);
  });
  it('probes due on three turns: 13:30 the probe (the deadline yields), 14:00 the brainstorm (the next probe held), 14:30 the held probe', async () => {
    seedOwed();
    at(13.5);
    const r5 = await runTurn('s1', 'Next I would look at the competitors.');
    expect(r5.interviewerText).toMatch(/Which cost lines did you include\?/);
    expect(asksBrainstorm(r5.interviewerText)).toBe(false);
    expect(flags().stageYielded).toEqual({ brainstorm: true });
    at(14.0);
    const r7 = await runTurn('s1', 'Labor and overhead, I think.');
    expect(asksBrainstorm(r7.interviewerText)).toBe(true);
    expect(saysGotTo(r7.interviewerText, 'about 40 points')).toBe(false);
    expect((flags().mathChecker as Row).held).toBe('3:1');
    at(14.5);
    const r9 = await runTurn('s1', 'Pricing, procurement and waste reduction.');
    expect(saysGotTo(r9.interviewerText, 'about 40 points') || /forty points|40 points/.test(r9.interviewerText)).toBe(true);
    expect((flags().mathChecker as Row).held).toBeUndefined();
  });
});

// Review fix 3 (controller's ruling on R7, 19 Oct): code's own correction rides on an overdue recommendation ask, before code's question.
describe("Settle: code's own correction on an overdue recommendation ask", () => {
  const LINE = 'That 25 is points of COGS, not points of revenue: about 10.5 points of revenue.';
  const recAskPlan = () => {
    const plan = modelPlanFixture({ distress: null, candidateText: 'I would lead with pricing.', revealed: COSTS, kind: 'rec_ask' });
    plan.state.pressureTest = { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 2 };
    plan.state.requiredExhibit = undefined; plan.state.analysisOwed = false; plan.state.owedStage = undefined;
    plan.state.stageCodeLines = [LINE];
    plan.state.derivedValueTexts.push('25', '10.5');
    return plan;
  };
  it('said first, before code\'s recommendation ask (the model\'s "say" already spoken)', async () => {
    const s = await settleTurn(recAskPlan(), outcome({ ...NEUTRAL, say: 'Understood.', question: '' }));
    expect(s.spokenText.startsWith(`Understood. ${LINE} `)).toBe(true);
    expect(s.spokenText).toMatch(/recommend/i);
  });
  it('not twice when the model already said it from its hint', async () => {
    const s = await settleTurn(recAskPlan(), outcome({ ...NEUTRAL, say: `Understood. ${LINE}`, question: '' }));
    expect(s.spokenText.split(LINE)).toHaveLength(2);
  });
});
