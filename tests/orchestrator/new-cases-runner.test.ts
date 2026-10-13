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

const modelQueue: ModelTurn[] = [];
const prompts: string[] = [];
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    createInterviewerModel: () => ({
      runTurn: async () => modelQueue[0],
      streamTurn: (ctx: { turnSystem?: string }) => {
        prompts.push(ctx.turnSystem ?? '');
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

function seed(p: { caseId: string; phase: string; flags?: Row; revealed?: string[]; shown?: string[]; elapsedMin?: number; coverage?: Row | null }) {
  const startedAt = new Date(Date.now() - (p.elapsedMin ?? 8) * 60_000);
  const turns = [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Revenue and costs.' }, { role: 'interviewer', text: 'Go on.' }];
  store.session = {
    id: 's1', userId: 'u1', caseId: p.caseId, phase: p.phase, elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
    abandonPhase: null, startedAt, completedAt: null, coverageJsonb: p.coverage ?? null, flagsJsonb: { conduct: { warnings: 0 }, ...p.flags },
  };
  store.turns = turns.map((t, i) => ({ id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null }));
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

beforeEach(() => { modelQueue.length = 0; prompts.length = 0; classified.length = 0; judgeVerdict = null; });

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
    expect(prompts.at(-1)).toMatch(/id: "exhibit-3" — [^\n]*\(not yet — it comes after the earlier exhibits/);
    expect(prompts.at(-1)).not.toMatch(/id: "exhibit-2" — [^\n]*\(not yet/);
  });
});

describe('the recommendation ask does not force out data still waiting on the order', () => {
  it("an open ask for the new-route plan stays held at code's recommendation ask while Exhibit 2 isn't out", async () => {
    const ALL_COVERED = { structure: 90, quantitative: 90, dataExhibit: 90, judgment: 90, creativity: 90, synthesis: 90, communication: 90, pushback: 90 };
    seed({ caseId: 'prof-002', phase: 'ANALYSIS', elapsedMin: 13, coverage: ALL_COVERED, shown: ['exhibit-1'],
      revealed: ['route_results_lakeport', 'route_results_port_avery', 'lakeport_fare'],
      flags: { ...PT_SATISFIED, stageEvidence: {
        structure: { delivered: true, outcome: 'answered' }, pressure_test: { delivered: true, outcome: 'answered' }, analysis: { delivered: true, outcome: 'answered' },
        exhibit: { delivered: true, outcome: 'answered' }, brainstorm: { delivered: true, outcome: 'answered' }, recommendation: { delivered: false }, risk: { delivered: false }, pending: null } } });
    store.events.push({ category: 'data_request', subtype: 'defer', turnIndex: 1, payloadJsonb: { what: 'the new-route plan', ledgerItemIds: ['new_routes_plan'], interviewerTurnIndex: 2, revealedByNow: false, explicit: true } });
    const r = await say('So the fare cut explains it.', T());
    expect(r.interviewerText).toMatch(/recommendation|tell the CEO/i);
    expect(store.revealed.map(x => x.ledgerItemId)).not.toContain('new_routes_plan');
    expect(r.interviewerText).not.toMatch(/come back to/);
  });
});
