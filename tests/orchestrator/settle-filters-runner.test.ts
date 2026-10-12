// Settle filters through the real runner (batch-19 review step 2, 12 Oct):
// the question on a turn that delivered data doesn't treat it as still to
// come (Haiku 5.5, 21 of 24 runs), and grading in "say" or the question is
// withheld (Rule 1).
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
let judgeVerdict: { answered: boolean; reason: string } | null = null;
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({
  ...(await orig<object>()),
  judgeProbeAnswer: async () => judgeVerdict,
  judgeStructureGiven: async () => ({ given: false, reason: '' }),
}));

const { runTurn } = await import('@/lib/orchestrator/session-runner');

const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What would you look at next?', ...over });
const SATISFIED = { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } };

function seed(p: { phase: string; flags?: Row; revealed?: string[] }) {
  const startedAt = new Date(Date.now() - 8 * 60_000);
  const turns = [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Revenue and costs.' }, { role: 'interviewer', text: 'Go on.' }];
  store.session = {
    id: 's1', userId: 'u1', caseId: 'prof-001', phase: p.phase, elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
    abandonPhase: null, startedAt, completedAt: null, coverageJsonb: null, flagsJsonb: { conduct: { warnings: 0 }, ...p.flags },
  };
  store.turns = turns.map((t, i) => ({ id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null }));
  store.revealed = (p.revealed ?? []).map((ledgerItemId, i) => ({ id: `r${i}`, sessionId: 's1', ledgerItemId, revealedAtMs: startedAt.getTime() }));
  store.exhibits = []; store.events = [];
}
async function say(text: string, model: ModelTurn) {
  modelQueue.length = 0;
  modelQueue.push(model, model);
  return runTurn('s1', text, {});
}
const check = (name: string) => store.events.find(e => e.category === 'check' && e.subtype === name)?.payloadJsonb as Row | undefined;
const BEAN_ASK = [
  { what: 'coffee bean price change over two years', itemIds: ['bean_price_change'], explicit: true, respond: 'release' as const },
  { what: 'non-bean input price change', itemIds: ['non_bean_input_change'], explicit: true, respond: 'release' as const },
];

beforeEach(() => { modelQueue.length = 0; prompts.length = 0; classified.length = 0; judgeVerdict = null; distressVerdict = () => ({ label: 'none', reason: '' }); });

describe('data released this turn is already heard when the question plays', () => {
  it('Tyler t8 (batch 19): "Once you have those two figures, how much…" → "With those two figures, how much…"', async () => {
    seed({ phase: 'EXHIBIT', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct', 'menu_price_change', 'bean_share_of_cogs'], flags: SATISFIED });
    const r = await say('Beans at 25% of COGS two years ago — do we know what they are now?', T({
      say: 'Got it.', requests: BEAN_ASK, question: 'Once you have those two figures, how much of the COGS increase do they explain, and what is left over?',
    }));
    expect(r.interviewerText).toMatch(/up 40%[\s\S]*up 37\.5%[\s\S]*With those two figures, how much of the COGS increase do they explain, and what is left over\?$/);
    expect(r.interviewerText).not.toMatch(/Once you have/);
    expect(check('pending_data')).toMatchObject({ decision: 'act' });
  });

  it('a question on a turn that delivered nothing is left alone', async () => {
    seed({ phase: 'EXHIBIT', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: SATISFIED });
    const r = await say('Okay, so COGS is the story.', T({ question: 'Before we get to the input prices, what would you expect them to show?' }));
    expect(r.interviewerText).toMatch(/Before we get to the input prices, what would you expect them to show\?$/);
  });

  it("code's own pressure-test probe drops \"Before we get into the data:\" when the turn released data", async () => {
    seed({ phase: 'STRUCTURE', flags: { pressureTest: { state: 'not_asked', reasks: 0, codeAsked: false, gatedTurns: 1, structureGiven: true, structureAsked: false } } });
    const r = await say('Could I get total revenue and the cost breakdown?', T({
      requests: [
        { what: 'total revenue', itemIds: ['revenue_total'], explicit: true, respond: 'release' },
        { what: 'the cost breakdown', itemIds: ['cogs_pct'], explicit: true, respond: 'release' },
      ],
      question: 'How would you use revenue to size it?',
    }));
    expect(r.interviewerText).toMatch(/Total revenue is \$480M a year\./);
    expect(r.interviewerText).toMatch(/(What might be missing from your structure|Which branch would you start with, and why|What result would break this structure)\?$/);
    expect(r.interviewerText).not.toMatch(/Before we get into the data/);
  });
});

describe('grading is withheld (Rule 1)', () => {
  it('a verdict in "say" is not spoken; the question is', async () => {
    seed({ phase: 'STRUCTURE', flags: SATISFIED });
    const r = await say('Profit is revenue minus costs; I would split costs into fixed and variable.', T({ say: 'Clear structure, with revenue and cost branches.', question: 'What would tell you the cost side is the story?' }));
    expect(r.interviewerText).toBe('What would tell you the cost side is the story?');
    expect(check('vetoes')?.detail).toMatchObject({ withheld: [{ reason: 'grading', field: 'say' }] });
  });

  it('a verdict that sets up a challenge in the question keeps the challenge (Owen t18, batch 19)', async () => {
    seed({ phase: 'EXHIBIT', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change'], flags: SATISFIED });
    const r = await say('Beans add 4.2 and the rest adds 11.8, so 16.', T({
      say: 'Mm-hm.', question: 'Your aggregate closes the gap, but your 37.5% was applied to all non-bean COGS. Does that hold for dairy, packaging and food alike?',
    }));
    expect(r.interviewerText).toBe('Mm-hm. Your 37.5% was applied to all non-bean COGS. Does that hold for dairy, packaging and food alike?');
  });

  it('a verdict in the question is withheld whole when nothing else is in it', async () => {
    seed({ phase: 'EXHIBIT', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: SATISFIED });
    const r = await say('COGS 16, overhead 2, labor 0: that is 18.', T({ question: 'Your bean math holds up. Which input would you dig into first?' }));
    expect(r.interviewerText).toBe('Which input would you dig into first?');
  });
});
