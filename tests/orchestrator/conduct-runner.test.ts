// Rule 17 conduct through the real runner (round-3 fix 4): a listed slur ends
// the session at once; one the lists miss is caught by the model layer (the
// backstop conduct.ts said was not built) before anything of the turn is
// delivered; an ambiguous stem is the model's call; innocent uses never end
// a session. Internal fixture: tests/orchestrator/fixtures/conduct-internal.json.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import fx from './fixtures/conduct-internal.json';

type Row = Record<string, unknown>;
const store = { session: {} as Row, turns: [] as Row[], revealed: [] as Row[], exhibits: [] as Row[], events: [] as Row[] };
let conductVerdict: (text: string) => { label: string; reason: string } | null = () => ({ label: 'none', reason: '' });
const conductCalls: string[] = [];
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: async () => { throw new Error('no math checker calls in tests'); } }));
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({
  ...(await orig<object>()),
  classifyConductModel: async (p: { candidateText: string }) => { conductCalls.push(p.candidateText); return conductVerdict(p.candidateText); },
}));
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
      // Honours "only while active": an update to an ended session is dropped.
      update: () => ({ set: (v: Row) => ({ where: async () => { if (store.session.status === 'active') store.session = { ...store.session, ...v }; } }) }),
    },
  };
});
vi.mock('@/lib/analytics', async orig => ({ ...(await orig<object>()), logEvent: async () => {} }));
const distressCalls: { candidateText: string; earlier?: { disclosure: string } }[] = [];
let distressVerdict: (p: { candidateText: string; earlier?: { disclosure: string } }) => { label: string; reason: string } | null = () => ({ label: 'none', reason: '' });
vi.mock('@/lib/orchestrator/distress', async orig => ({
  ...(await orig<object>()),
  classifyDistress: async (p: { candidateText: string; earlier?: { disclosure: string } }) => { distressCalls.push(p); return distressVerdict(p); },
}));
const classified: unknown[][] = [];
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => classified.shift() ?? [] }));
vi.mock('@/lib/orchestrator/hint-check', async orig => ({ ...(await orig<object>()), checkHintDelivered: async () => null }));

const modelQueue: ModelTurn[] = [];
const prompts: string[] = [];
const onModel: () => void = () => {};
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    createInterviewerModel: () => ({
      runTurn: async () => modelQueue[0],
      streamTurn: (ctx: { turnSystem?: string }) => {
        prompts.push(ctx.turnSystem ?? '');
        onModel();
        const t = modelQueue.shift();
        if (!t) throw new Error('model queue empty');
        return eventsFromTurn(Promise.resolve(t));
      },
    }),
  };
});
const judgeVerdict: { answered: boolean; reason: string } | null = null;
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({
  ...(await orig<object>()),
  judgeProbeAnswer: async () => judgeVerdict,
  judgeStructureGiven: async () => ({ given: false, reason: '' }),
}));

const { runTurn } = await import('@/lib/orchestrator/session-runner');

const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: 'Understood.', question: 'What would you look at next?', ...over });
function seed(warnings = 0) {
  const startedAt = new Date(Date.now() - 6 * 60_000);
  store.session = { id: 's1', userId: 'u1', caseId: 'prof-001', phase: 'ANALYSIS', elapsedMs: 0, phaseStartedAt: startedAt, status: 'active', abandonPhase: null, startedAt, completedAt: null, coverageJsonb: null,
    flagsJsonb: { conduct: { warnings }, pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } } };
  store.turns = [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Revenue and costs.' }, { role: 'interviewer', text: 'Go on.' }]
    .map((t, i) => ({ id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null }));
  store.revealed = []; store.exhibits = []; store.events = [];
}
const delivered: string[] = [];
async function say(text: string) {
  modelQueue.length = 0;
  modelQueue.push(T(), T());
  delivered.length = 0;
  return runTurn('s1', text, { onSegment: async seg => { delivered.push(seg.text); } });
}
const conductEvents = () => store.events.filter(e => e.category === 'conduct');

beforeEach(() => { conductCalls.length = 0; conductVerdict = () => ({ label: 'none', reason: '' }); distressVerdict = () => ({ label: 'none', reason: '' }); });

describe('Rule 17-C3: the session ends at once, with no warning and no report', () => {
  it('a real listed slur (internal fixture): ended by the word list, the model never called', async () => {
    seed();
    const r = await say(fx.listedSlur);
    expect(r).toMatchObject({ interviewerText: "We're going to end the session here.", ended: true, scoringSuppressed: true });
    expect(store.session.status).toBe('terminated');
    expect(modelQueue).toHaveLength(2);
    expect(conductEvents()[0]).toMatchObject({ subtype: 'C3', payloadJsonb: { reason: 'slur', layer: 'regex' } });
  });

  it('a slur the lists don\'t hold: the model layer ends it, and nothing of the drafted turn is delivered', async () => {
    seed();
    conductVerdict = () => ({ label: 'C3', reason: 'slur aimed at a group' });
    const r = await say(fx.unlistedSlurStandIn);
    expect(r).toMatchObject({ interviewerText: "We're going to end the session here.", ended: true, scoringSuppressed: true });
    expect(delivered).toEqual(["We're going to end the session here."]);
    expect(store.session.status).toBe('terminated');
    expect(conductEvents().at(-1)).toMatchObject({ subtype: 'C3', payloadJsonb: { layer: 'model' } });
  });

  it('batch 18, Travis: the placeholder the lists missed is caught by the model layer', async () => {
    seed();
    conductVerdict = () => ({ label: 'C3', reason: 'group-targeting slur at the interviewer' });
    expect((await say(fx.travisPlaceholder)).ended).toBe(true);
  });

  it('an ambiguous stem aimed at someone is the model\'s call: C3 ends it; anything else, the case goes on (no warning from the model)', async () => {
    seed();
    conductVerdict = () => ({ label: 'C3', reason: 'disability slur at the interviewer' });
    expect((await say(fx.ambiguousDirected)).ended).toBe(true);
    seed();
    conductVerdict = () => ({ label: 'C2', reason: 'hostile' });
    const r = await say(fx.ambiguousDirected);
    expect(r.ended).toBe(false);
    expect(store.session.status).toBe('active');
    expect(conductEvents().map(e => e.subtype)).toEqual(['C3_confirm']);
  });
});

describe('innocent uses never end a session', () => {
  it.each(fx.innocent)('%s', async text => {
    seed();
    const r = await say(text);
    expect(r.ended).toBe(false);
    expect(store.session.status).toBe('active');
  });

  it('reported speech is never a warning (batch 1, Omar)', async () => {
    seed();
    const r = await say("I gather the CEO basically said you're an idiot if you think it's labor. So, costs.");
    expect(r.interviewerText).not.toMatch(/keep this professional/);
  });
});
