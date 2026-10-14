// The four AI Casing cases (13 Oct) through the real runner: each case's
// exhibit order, its own brainstorm (none for Quillpath), the analysis gate
// and the close — the database, the interviewer model and the background
// classifiers mocked, no paid calls.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';

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
        sessionEvents: { findMany: async () => store.events.filter(e => e.category === 'data_request') },
      },
      insert: (t: unknown) => ({ values: async (v: Row | Row[]) => { target(t)?.push(...(Array.isArray(v) ? v : [v])); } }),
      update: () => ({ set: (v: Row) => ({ where: async () => { if (store.session.status === 'active') store.session = { ...store.session, ...v }; } }) }),
    },
  };
});
vi.mock('@/lib/analytics', async orig => ({ ...(await orig<object>()), logEvent: async () => {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => ({ label: 'none', reason: '' }) }));
const classified: unknown[][] = [];
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => classified.shift() ?? [] }));
vi.mock('@/lib/orchestrator/hint-check', async orig => ({ ...(await orig<object>()), checkHintDelivered: async () => null }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: async () => { throw new Error('no math checker calls in tests'); } }));
// A Hollis Bay variant no case ships: its first exhibit waits for the
// brainstorm and none is required — the exhibit-stage paths that read the
// release order (Plan's owed stage, Settle's held conclusion ask, code's stage line).
vi.mock('@/lib/cases/loader', async orig => {
  const real = await orig<typeof import('@/lib/cases/loader')>();
  const hollis = real.getCaseById('launch-001');
  const variant = { ...hollis, id: 'launch-variant', exhibits: hollis.exhibits.map((e, i) => ({ ...e, required: false, after: i === 0 ? ['brainstorm'] : [`exhibit-${i}`] })) };
  return { ...real, getCaseById: (id: string) => (id === 'launch-variant' ? variant : real.getCaseById(id)) };
});

const modelQueue: ModelTurn[] = [];
const prompts: string[] = [];
const stables: string[] = [];
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    createInterviewerModel: () => ({
      runTurn: async () => modelQueue[0],
      streamTurn: (ctx: { turnSystem?: string; systemPrompt?: string }) => {
        prompts.push(ctx.turnSystem ?? '');
        stables.push(ctx.systemPrompt ?? '');
        const t = modelQueue.shift();
        if (!t) throw new Error('model queue empty');
        return eventsFromTurn(Promise.resolve(t));
      },
    }),
  };
});
let judgeVerdict: { answered: boolean; reason: string } | null = null;
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({
  ...(await orig<object>()),
  judgeProbeAnswer: async () => judgeVerdict,
  judgeStructureGiven: async () => ({ given: true, reason: '' }),
}));

const { runTurn } = await import('@/lib/orchestrator/session-runner');

const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What would you look at next?', ...over });
const PT_SATISFIED = { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };

// prof-002 runs a 25-minute clock (Lorenzo, 13 Oct): its time-pressure and time-up minutes sit 5 later.
function seed(p: { caseId: string; phase: string; flags?: Row; revealed?: string[]; shown?: string[]; elapsedMin?: number; coverage?: Row | null; turns?: { role: string; text: string }[] }) {
  const startedAt = new Date(Date.now() - (p.elapsedMin ?? 8) * 60_000);
  const turns = p.turns ?? [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Revenue and costs.' }, { role: 'interviewer', text: 'Go on.' }];
  store.session = {
    id: 's1', userId: 'u1', caseId: p.caseId, phase: p.phase, elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
    abandonPhase: null, startedAt, completedAt: null, coverageJsonb: p.coverage ?? null, flagsJsonb: { conduct: { warnings: 0 }, ...p.flags },
  };
  // Turns just before now: a gap since the last line would be credited as a silence pause and slow the clock.
  store.turns = turns.map((t, i) => ({ id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: Date.now() - (turns.length - i) * 20_000, latencyMs: null }));
  store.revealed = (p.revealed ?? []).map((ledgerItemId, i) => ({ id: `r${i}`, sessionId: 's1', ledgerItemId, revealedAtMs: startedAt.getTime() }));
  store.exhibits = (p.shown ?? []).map((exhibitId, i) => ({ id: `e${i}`, sessionId: 's1', exhibitId, shownAtMs: startedAt.getTime() }));
  store.events = [];
}
const shownIds = () => store.exhibits.map(e => e.exhibitId);
async function say(text: string, model?: ModelTurn) {
  modelQueue.length = 0;
  if (model) modelQueue.push(model, model);
  return runTurn('s1', text, {});
}

beforeEach(() => { modelQueue.length = 0; prompts.length = 0; stables.length = 0; classified.length = 0; judgeVerdict = null; });

describe('exhibit release order through the runner (Larkspur 1 → 2 → 3)', () => {
  it('the new-route exhibit asked for before the per-flight exhibit is deferred, not shown', async () => {
    seed({ caseId: 'prof-002', phase: 'ANALYSIS', flags: PT_SATISFIED, shown: ['exhibit-1'] });
    const r = await say('Can I see the planning estimates for the new routes?',
      T({ requests: [{ what: 'the planning estimates for the new routes', itemIds: ['exhibit-3'], explicit: true, respond: 'release' }], exhibit: 'exhibit-3' }));
    expect(shownIds()).toEqual(['exhibit-1']);
    expect(r.interviewerText).toMatch(/I'll come back to the planning estimates for the new routes shortly\./);
    expect(r.interviewerText).not.toMatch(/Here's an exhibit/);
  });

  it("the model's handover of Exhibit 2 before Exhibit 1 is dropped; Exhibit 1 goes out", async () => {
    seed({ caseId: 'prof-002', phase: 'ANALYSIS', flags: PT_SATISFIED });
    await say('Where is the decline coming from?', T({ exhibit: 'exhibit-2' }));
    expect(shownIds()).toEqual([]);
    await say('Which routes are losing money?', T({ exhibit: 'exhibit-1' }));
    expect(shownIds()).toEqual(['exhibit-1']);
  });

  it('an ask for the fare before Exhibit 1 waits, is not re-deferred every turn, and goes out once Exhibit 1 is shown', async () => {
    seed({ caseId: 'prof-002', phase: 'ANALYSIS', flags: PT_SATISFIED });
    const asked = await say("What's the fare on Hub–Lakeport?", T({ requests: [{ what: 'the Hub–Lakeport fare', itemIds: ['lakeport_fare'], explicit: true, respond: 'release' }] }));
    expect(asked.interviewerText).toMatch(/I'll come back to the Hub–Lakeport fare shortly\./);
    const next = await say('Okay, I would look at revenue by route.', T());
    expect(next.interviewerText).not.toMatch(/come back to/);
    expect(store.revealed.map(r => r.ledgerItemId)).not.toContain('lakeport_fare');
    await say('Let me look at the routes.', T({ exhibit: 'exhibit-1' }));
    expect(shownIds()).toEqual(['exhibit-1']);
    await say('Lakeport and Port Avery are the problem.', T());
    expect(store.revealed.map(r => r.ledgerItemId)).toContain('lakeport_fare');
  });

  it('the model is told which exhibits are not yet available', async () => {
    seed({ caseId: 'prof-002', phase: 'ANALYSIS', flags: PT_SATISFIED, shown: ['exhibit-1'] });
    await say('Okay.', T());
    expect(prompts.at(-1)).toMatch(/id: "exhibit-3" — [^\n]*\(not yet — its turn in the case's order hasn't come/);
    expect(prompts.at(-1)).not.toMatch(/id: "exhibit-2" — [^\n]*\(not yet/);
  });
});

describe('the recommendation ask does not force out data still waiting on the order', () => {
  // Under time pressure (no required-exhibit hold): Exhibit 2 goes out with the ask, Exhibit 3's data stays waiting.
  it("an open ask for the new-route plan stays held at code's recommendation ask while Exhibit 2 isn't out", async () => {
    const ALL_COVERED = { structure: 90, quantitative: 90, dataExhibit: 90, judgment: 90, creativity: 90, synthesis: 90, communication: 90, pushback: 90 };
    seed({ caseId: 'prof-002', phase: 'ANALYSIS', elapsedMin: 23.7, coverage: ALL_COVERED, shown: ['exhibit-1'],
      revealed: ['route_results_lakeport', 'route_results_port_avery', 'lakeport_fare'],
      flags: { ...PT_SATISFIED, stageEvidence: {
        structure: { delivered: true, outcome: 'answered' }, pressure_test: { delivered: true, outcome: 'answered' }, analysis: { delivered: true, outcome: 'answered' },
        exhibit: { delivered: true, outcome: 'answered' }, brainstorm: { delivered: true, outcome: 'answered' }, recommendation: { delivered: false }, risk: { delivered: false }, pending: null } } });
    store.events.push({ category: 'data_request', subtype: 'defer', turnIndex: 1, payloadJsonb: { what: 'the new-route plan', ledgerItemIds: ['new_routes_plan'], interviewerTurnIndex: 2, revealedByNow: false, explicit: true } });
    const r = await say('So the fare cut explains it.', T());
    expect(r.interviewerText).toMatch(/recommendation|tell the CEO/i);
    expect(r.interviewerText).toMatch(/Here's an exhibit: Hub–Lakeport/);
    expect(store.revealed.map(x => x.ledgerItemId)).not.toContain('new_routes_plan');
    expect(r.interviewerText).not.toMatch(/come back to/);
  });
});

const ALL_COVERED = { structure: 90, quantitative: 90, dataExhibit: 90, judgment: 90, creativity: 90, synthesis: 90, communication: 90, pushback: 90 };
const stagesWith = (over: Row) => ({
  structure: { delivered: true, outcome: 'answered' }, pressure_test: { delivered: true, outcome: 'answered' }, analysis: { delivered: true, outcome: 'answered' },
  exhibit: { delivered: true, outcome: 'answered' }, brainstorm: { delivered: false }, recommendation: { delivered: false }, risk: { delivered: false }, pending: null, ...over,
});
const stageRecord = () => (store.session.flagsJsonb as Row).stageEvidence as Record<string, { delivered: boolean; codeAsked?: boolean }>;

describe("each case's own brainstorm", () => {
  it("code's brainstorm stage line is Aldermoor's own question, not a generic or profitability one", async () => {
    seed({ caseId: 'entry-001', phase: 'ANALYSIS', elapsedMin: 13, coverage: ALL_COVERED, shown: ['exhibit-1', 'exhibit-2', 'exhibit-3'],
      revealed: ['funnel_rates', 'peak_share_forecast', 'kelvexa_pricing'], flags: { ...PT_SATISFIED, stageEvidence: stagesWith({}) } });
    const r = await say('So the US market clears the bar.');
    expect(r.interviewerText).toBe('If Aldermoor builds its own team, how could it reduce the risk of a slow start?');
    expect(stageRecord().brainstorm).toMatchObject({ delivered: true, codeAsked: true });
  });

  it("the model asking Hollis Bay's own question is the brainstorm: code doesn't ask another", async () => {
    seed({ caseId: 'launch-001', phase: 'EXHIBIT', elapsedMin: 12, shown: ['exhibit-1', 'exhibit-2', 'exhibit-3'],
      revealed: ['bag_price', 'variable_costs', 'launch_costs', 'purchase_intent', 'planning_assumptions'], flags: { ...PT_SATISFIED, stageEvidence: stagesWith({}) } });
    await say('Break-even looks reachable.', T({ move: 'brainstorm', question: 'What could Hollis Bay do to get shoppers to try its chickpea snacks — and to keep buying them?' }));
    expect(stageRecord().brainstorm.delivered).toBe(true);
    // The recommendation can now be asked with nothing owed.
    (store.session as Row).coverageJsonb = ALL_COVERED;
    const r = await say('Sampling, a lower trial price, recipe cards, and a subscription pack.', T());
    expect(r.interviewerText).not.toMatch(/what else could the client do|other levers|chickpea snacks/i);
  });

  it("the model's early recommendation ask, held for the brainstorm, becomes Hollis Bay's question", async () => {
    seed({ caseId: 'launch-001', phase: 'EXHIBIT', elapsedMin: 12, shown: ['exhibit-1', 'exhibit-2', 'exhibit-3'],
      revealed: ['bag_price', 'variable_costs', 'launch_costs', 'purchase_intent', 'planning_assumptions'], flags: { ...PT_SATISFIED, stageEvidence: stagesWith({}) } });
    const r = await say('So it breaks even.', T({ move: 'recommendation', question: "What's your recommendation to the client?" }));
    expect(r.interviewerText).toBe('What could Hollis Bay do to get shoppers to try its chickpea snacks — and to keep buying them?');
  });

  it('Quillpath closes after the recommendation and its risk with no brainstorm ever asked', async () => {
    seed({ caseId: 'pricing-001', phase: 'RECOMMENDATION', elapsedMin: 15, shown: ['exhibit-1', 'exhibit-2', 'exhibit-3', 'exhibit-4'],
      revealed: ['plan_prices_costs', 'plan_cac', 'starter_cohort', 'new_customers_by_plan'],
      turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Keep Starter.' }, { role: 'interviewer', text: "What's your recommendation to the client?" },
        { role: 'candidate', text: 'Keep Starter at $40 because upgrades make it worth $1,400.' }, { role: 'interviewer', text: "What's the biggest risk to that recommendation, and how would you test for it?" }],
      flags: { ...PT_SATISFIED, stageEvidence: stagesWith({ recommendation: { delivered: true, outcome: 'answered' }, risk: { delivered: true }, pending: 'risk' }),
        stall: { ladderLevel: 0, consecutiveNoProgress: 0, consecutiveClarify: 0, lastCandidateQuestion: null, recommendationDelivered: true } } });
    const r = await say('The risk is that upgrades slow down; I would watch the upgrade rate monthly.');
    expect(r.ended).toBe(true);
    expect(r.interviewerText).not.toMatch(/what else|other levers|brainstorm/i);
  });
});

describe('the case brainstorm reaches the end gate and the model', () => {
  it("Hollis Bay closes after the recommendation and its risk, its own brainstorm asked earlier (no coverage signal, 10 min)", async () => {
    seed({ caseId: 'launch-001', phase: 'RECOMMENDATION', elapsedMin: 10, shown: ['exhibit-1', 'exhibit-2', 'exhibit-3'],
      revealed: ['bag_price', 'variable_costs', 'launch_costs', 'purchase_intent', 'planning_assumptions'],
      turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Break-even first.' },
        { role: 'interviewer', text: 'What could Hollis Bay do to get shoppers to try its chickpea snacks — and to keep buying them?' },
        { role: 'candidate', text: 'Sampling, trial packs, recipes.' }, { role: 'interviewer', text: "What's your recommendation to the client?" },
        { role: 'candidate', text: 'Launch, with sampling.' }, { role: 'interviewer', text: "What's the biggest risk to that recommendation, and how would you test for it?" }],
      flags: { ...PT_SATISFIED, stageEvidence: stagesWith({ brainstorm: { delivered: true, outcome: 'answered' }, recommendation: { delivered: true, outcome: 'answered' }, risk: { delivered: true }, pending: 'risk' }),
        stall: { ladderLevel: 0, consecutiveNoProgress: 0, consecutiveClarify: 0, lastCandidateQuestion: null, recommendationDelivered: true } } });
    const r = await say('Repeat purchase could be weak; I would track it in a test market.', T());
    expect(r.ended).toBe(true);
  });

  it("the model is told each case's brainstorm question, and that Quillpath has none", async () => {
    seed({ caseId: 'launch-001', phase: 'ANALYSIS', flags: PT_SATISFIED });
    await say('Okay.', T());
    expect(stables.at(-1)).toContain('ask one open brainstorming question ("What could Hollis Bay do to get shoppers to try its chickpea snacks — and to keep buying them?")');
    seed({ caseId: 'pricing-001', phase: 'ANALYSIS', flags: PT_SATISFIED });
    await say('Okay.', T());
    expect(stables.at(-1)).toContain('this case has no brainstorm stage');
  });
});

describe('exhibit notes reach the screen', () => {
  it("Larkspur's Exhibit 1 goes out with its footnotes", async () => {
    seed({ caseId: 'prof-002', phase: 'ANALYSIS', flags: PT_SATISFIED });
    const r = await say('Which routes are losing money?', T({ exhibit: 'exhibit-1' }));
    expect(r.exhibit?.notes).toMatch(/Contribution = revenue − variable costs/);
    expect(r.interviewerText).not.toMatch(/Contribution = revenue/);   // shown, never spoken
  });
});

describe("code's brainstorm waits a turn when its own data line hands over data (batch 21 D8, Fiona t14)", () => {
  it('the decisive figure goes out with a question about it; the brainstorm comes next turn', async () => {
    seed({ caseId: 'prof-001', phase: 'EXHIBIT', elapsedMin: 11, coverage: ALL_COVERED, shown: ['exhibit-a'],
      revealed: ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'bean_price_change'], flags: { ...PT_SATISFIED, stageEvidence: stagesWith({}) } });
    classified.push([{ what: 'the other input price changes', ledgerItemIds: ['non_bean_input_change'], explicit: true, response: 'release' }]);
    const r = await say("So yes — please share the other input price changes. That's the test.");
    expect(r.interviewerText).toMatch(/^Other input costs — dairy, packaging, and food — are up 37\.5% over the past two years\. /);
    expect(r.interviewerText).not.toMatch(/what else could the client do|other levers|protect margin/i);
    expect(stageRecord().brainstorm.delivered).toBe(false);
    const next = await say('That closes it: broad inflation explains all 16 points.');
    expect(next.interviewerText).toMatch(/what else could the client do|other levers|protect margin/i);
    expect(stageRecord().brainstorm).toMatchObject({ delivered: true, codeAsked: true });
  });
});

describe('required exhibits (Lorenzo, 13 Oct)', () => {
  const RISKED = (over: Row = {}) => ({ ...PT_SATISFIED, stageEvidence: stagesWith({ brainstorm: { delivered: true, outcome: 'answered' }, recommendation: { delivered: true, outcome: 'answered' }, risk: { delivered: true }, pending: 'risk' }),
    stall: { ladderLevel: 0, consecutiveNoProgress: 0, consecutiveClarify: 0, lastCandidateQuestion: null, recommendationDelivered: true }, ...over });
  const TURNS = [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Fares fell.' },
    { role: 'interviewer', text: "What else could Larkspur do to make sure it's profitable in the first year?" }, { role: 'candidate', text: 'Phase the exit.' },
    { role: 'interviewer', text: "What's your recommendation to the client?" }, { role: 'candidate', text: 'I recommend exiting both routes.' },
    { role: 'interviewer', text: "What's the biggest risk to that recommendation, and how would you test for it?" }];
  const CORE = ['route_results_lakeport', 'route_results_port_avery', 'lakeport_fare'];

  it('the case does not close while a required exhibit is unshown: code hands it over, then closes', async () => {
    seed({ caseId: 'prof-002', phase: 'RECOMMENDATION', elapsedMin: 12, shown: ['exhibit-1', 'exhibit-2'], revealed: CORE, turns: TURNS, flags: RISKED() });
    const r = await say('The risk is ramp-up; I would phase it.');
    expect(r.ended).toBe(false);
    expect(shownIds()).toEqual(['exhibit-1', 'exhibit-2', 'exhibit-3']);
    expect(r.interviewerText).toMatch(/^Here's an exhibit: Proposed new routes/);
    const next = await say('It adds about $11.8M.');
    expect(next.ended).toBe(true);
  });

  it('under time pressure there is no hold: the next required exhibit goes out with the recommendation ask', async () => {
    seed({ caseId: 'prof-002', phase: 'ANALYSIS', elapsedMin: 23.7, shown: ['exhibit-1'], revealed: CORE, flags: PT_SATISFIED });
    const r = await say('So the fare cut explains it.', T({ move: 'recommendation', question: "What's your recommendation to the CEO?" }));
    expect(r.interviewerText).toMatch(/^Here's an exhibit: Hub–Lakeport.*\(\$\)\. .*recommendation to the CEO\?$/);   // the time warning is the ask here
    expect(shownIds()).toEqual(['exhibit-1', 'exhibit-2']);
  });

  it("…and with the model's own recommendation ask once the time warning has gone out", async () => {
    const LOW = { structure: 20, quantitative: 20, dataExhibit: 20, judgment: 20, creativity: 20, synthesis: 20, communication: 20, pushback: 20 };   // code doesn't ask
    seed({ caseId: 'prof-002', phase: 'ANALYSIS', elapsedMin: 23.9, coverage: LOW, shown: ['exhibit-1'], revealed: CORE, flags: { ...PT_SATISFIED, timeWarningFired: true } });
    const r = await say('So the fare cut explains it.', T({ move: 'recommendation', question: "What's your recommendation to the CEO?" }));
    expect(r.interviewerText).toMatch(/^Here's an exhibit: Hub–Lakeport.*\(\$\)\. What's your recommendation to the CEO\?$/);
  });

  it('not at time-up: the close is not held', async () => {
    seed({ caseId: 'prof-002', phase: 'RECOMMENDATION', elapsedMin: 25.5, shown: ['exhibit-1', 'exhibit-2'], revealed: CORE, turns: TURNS, flags: RISKED() });
    const r = await say('The risk is ramp-up.');
    expect(r.ended).toBe(true);
    expect(shownIds()).toEqual(['exhibit-1', 'exhibit-2']);
  });
});

// Hollis Bay's guide asks the brainstorm before Exhibit 3: sampling is a
// likely brainstorm answer, and the sampling proposal shown first gives it
// away (Lorenzo, 13 Oct). Exhibit 3 comes after the brainstorm; under time
// pressure it goes out with the recommendation ask, as other required exhibits do.
describe('Hollis Bay: the sampling exhibit after the brainstorm', () => {
  const CORE_OUT = ['bag_price', 'variable_costs', 'launch_costs', 'purchase_intent', 'planning_assumptions'];
  const BEFORE = { caseId: 'launch-001', phase: 'EXHIBIT', elapsedMin: 12, coverage: ALL_COVERED, shown: ['exhibit-1', 'exhibit-2'], revealed: CORE_OUT };

  it('a recommendation ask with Exhibit 3 owed gets the brainstorm first, then the exhibit, then the ask', async () => {
    seed({ ...BEFORE, flags: { ...PT_SATISFIED, stageEvidence: stagesWith({}) } });
    const r = await say('So it breaks even in year one.', T({ move: 'recommendation', question: "What's your recommendation to the client?" }));
    expect(r.interviewerText).toBe('What could Hollis Bay do to get shoppers to try its chickpea snacks — and to keep buying them?');
    expect(shownIds()).toEqual(['exhibit-1', 'exhibit-2']);
    const next = await say('Sampling in stores, a trial-size bag, recipe ideas on the pack.', T({ move: 'recommendation', question: "What's your recommendation to the client?" }));
    expect(shownIds()).toEqual(['exhibit-1', 'exhibit-2', 'exhibit-3']);
    expect(next.interviewerText).toMatch(/^Here's an exhibit: Proposal — In-store sampling program/);
    expect(next.interviewerText).not.toMatch(/recommendation/i);
  });

  it('the candidate asking for the sampling proposal before the brainstorm is told it comes later', async () => {
    seed({ ...BEFORE, coverage: null, flags: { ...PT_SATISFIED, stageEvidence: stagesWith({}) } });   // nothing due: a model turn
    const r = await say('Could I see the sampling proposal?', T({ requests: [{ what: 'the sampling proposal', itemIds: ['exhibit-3'], explicit: true, respond: 'release' }], exhibit: 'exhibit-3' }));
    expect(shownIds()).not.toContain('exhibit-3');
    expect(r.interviewerText).toMatch(/I'll come back to the sampling proposal shortly\./);
    expect(prompts.at(-1)).toMatch(/exhibit-3[^\n]*not yet/i);
  });

  it('once the brainstorm was asked, the sampling proposal goes out when asked for', async () => {
    seed({ ...BEFORE, flags: { ...PT_SATISFIED, stageEvidence: stagesWith({ brainstorm: { delivered: true, outcome: 'answered' } }) } });
    await say('Could I see the sampling proposal?', T({ requests: [{ what: 'the sampling proposal', itemIds: ['exhibit-3'], explicit: true, respond: 'release' }], exhibit: 'exhibit-3' }));
    expect(shownIds()).toEqual(['exhibit-1', 'exhibit-2', 'exhibit-3']);
  });

  it('the model is told Exhibit 3 is not yet available until the brainstorm was asked', async () => {
    seed({ ...BEFORE, coverage: null, flags: { ...PT_SATISFIED, stageEvidence: stagesWith({ brainstorm: { delivered: true, outcome: 'answered' } }) } });
    await say('Okay.', T());
    expect(prompts.at(-1)).not.toMatch(/id: "exhibit-3" — [^\n]*\(not yet/);
    seed({ ...BEFORE, coverage: null, flags: { ...PT_SATISFIED, stageEvidence: stagesWith({}) } });
    await say('Okay.', T());
    expect(prompts.at(-1)).toMatch(/id: "exhibit-3" — [^\n]*\(not yet — its turn in the case's order hasn't come/);
  });

  it('an open ask for the sampling plan waits for the brainstorm, then goes out', async () => {
    const open = { category: 'data_request', subtype: 'defer', turnIndex: 1, payloadJsonb: { what: 'the sampling plan', ledgerItemIds: ['sampling_program'], interviewerTurnIndex: 2, revealedByNow: false, explicit: true } };
    seed({ ...BEFORE, coverage: null, flags: { ...PT_SATISFIED, stageEvidence: stagesWith({}) } });
    store.events.push(open);
    await say('Okay, the survey says trial is the issue.', T());
    expect(store.revealed.map(x => x.ledgerItemId)).not.toContain('sampling_program');
    seed({ ...BEFORE, coverage: null, flags: { ...PT_SATISFIED, stageEvidence: stagesWith({ brainstorm: { delivered: true, outcome: 'answered' } }) } });
    store.events.push(open);
    await say('Okay, the survey says trial is the issue.', T());
    expect(store.revealed.map(x => x.ledgerItemId)).toContain('sampling_program');
  });

  it('under time pressure, no brainstorm asked: Exhibit 3 goes out with the recommendation ask', async () => {
    seed({ ...BEFORE, elapsedMin: 18.7, flags: { ...PT_SATISFIED, stageEvidence: stagesWith({}) } });
    const r = await say('So it breaks even.', T({ move: 'recommendation', question: "What's your recommendation to the CEO?" }));
    expect(shownIds()).toEqual(['exhibit-1', 'exhibit-2', 'exhibit-3']);
    expect(r.interviewerText).toMatch(/^Here's an exhibit: Proposal — In-store sampling program.*recommendation to the CEO\?$/);
  });
});

describe('an exhibit-stage exhibit that waits for the brainstorm (variant: Exhibit 1 after the brainstorm, none required)', () => {
  const NOTHING_SHOWN = { caseId: 'launch-variant', phase: 'ANALYSIS', elapsedMin: 12, revealed: ['bag_price', 'variable_costs', 'launch_costs', 'purchase_intent', 'planning_assumptions'] };
  const NO_EXHIBIT = (over: Row = {}) => ({ ...PT_SATISFIED, stageEvidence: stagesWith({ exhibit: { delivered: false }, ...over }) });

  it('before the brainstorm no exhibit is owed: code asks the brainstorm', async () => {
    seed({ ...NOTHING_SHOWN, coverage: ALL_COVERED, flags: NO_EXHIBIT() });
    const r = await say('So it breaks even.');
    expect(r.interviewerText).toBe('What could Hollis Bay do to get shoppers to try its chickpea snacks — and to keep buying them?');
    expect(shownIds()).toEqual([]);
  });

  it("after it, the exhibit stage is owed and code's stage line hands Exhibit 1 over", async () => {
    seed({ ...NOTHING_SHOWN, coverage: ALL_COVERED, flags: NO_EXHIBIT({ brainstorm: { delivered: true, outcome: 'answered' } }) });
    const r = await say('So it breaks even.');
    expect(shownIds()).toEqual(['exhibit-1']);
    expect(r.interviewerText).toMatch(/^Here's an exhibit: Roasted chickpea snacks/);
  });

  it("the model's early recommendation ask is held for Exhibit 1 once the brainstorm was asked", async () => {
    seed({ ...NOTHING_SHOWN, coverage: null, flags: NO_EXHIBIT({ brainstorm: { delivered: true, outcome: 'answered' } }) });
    const r = await say('So it breaks even.', T({ move: 'recommendation', question: "What's your recommendation to the client?" }));
    expect(r.interviewerText).toMatch(/Here's an exhibit: Roasted chickpea snacks/);
    expect(r.interviewerText).not.toMatch(/recommendation/i);
  });
});

// Lorenzo, 13 Oct (Larkspur review ruling a; Marcus 27c2d0fb t22): "the fixed
// costs" names a cost line, not a fixed/variable cut — the ask names the
// aircraft leases, which the case holds, so they go out; nothing is refused.
describe('an ask inside the fixed costs that names the aircraft leases', () => {
  it('releases the aircraft leases instead of "I don\'t have…"', async () => {
    seed({ caseId: 'prof-002', phase: 'BRAINSTORM', flags: PT_SATISFIED, shown: ['exhibit-1', 'exhibit-2', 'exhibit-3'] });
    const what = 'what sits inside the fixed costs, including aircraft leases';
    const r = await say('Do we know what sits inside the $20M?', T({ move: 'brainstorm', say: 'Right.', requests: [{ what, itemIds: ['aircraft_leases'], explicit: true, respond: 'release' }] }));
    expect(r.interviewerText).toContain('All nine aircraft are leased through 2030');
    expect(r.interviewerText).not.toMatch(/I don't have/);
    expect(store.revealed.map(x => x.ledgerItemId)).toContain('aircraft_leases');
  });
});

// Lorenzo, 13 Oct (Larkspur rulings a, round 2; Omar 9bbf41bc t9): the
// competitor line says it flies larger planes — that part is given; the
// frequency, which the case doesn't hold, is still refused.
describe("the LCC's frequency and aircraft size", () => {
  it('gives the competitor line and refuses only the frequency', async () => {
    seed({ caseId: 'prof-002', phase: 'ANALYSIS', flags: PT_SATISFIED, shown: ['exhibit-1'] });
    const r = await say("Do we have the LCC's frequency and aircraft size on these routes?",
      T({ say: 'Mm-hm.', requests: [{ what: "the low-cost carrier's frequency and aircraft size", itemIds: [], explicit: true, respond: 'release' }] }));
    expect(r.interviewerText).toMatch(/it flies larger planes/);
    expect(r.interviewerText).toMatch(/I don't have the low-cost carrier's frequency\./);
    expect(r.interviewerText).not.toMatch(/aircraft size\./);
  });
});
