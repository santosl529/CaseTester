// Repeat requests for data already released (v3 recheck, 10 Oct, prefix
// replays of Destiny): the candidate asked again for the cost lines she had
// been given; code decided nothing (already revealed) and the model said
// "Here they are again." with no figures after it. An existing defect, not
// v3: fixed before the voice pilot, where a missed spoken figure is re-asked.
// Explicit re-asks get the canonical value restated (the ledger unchanged);
// passing mentions repeat nothing; a redelivery claim in "say" is withheld —
// code's restate line is the one delivered with the data.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';
import replays from './fixtures/repeat-requests.json';

// ---- in-memory store (as in pressure-test-runner.test.ts) ----
type Row = Record<string, unknown>;
const store = { session: {} as Row, turns: [] as Row[], revealed: [] as Row[], exhibits: [] as Row[], events: [] as Row[] };
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
      update: () => ({ set: (v: Row) => ({ where: async () => { store.session = { ...store.session, ...v }; } }) }),
    },
  };
});
vi.mock('@/lib/analytics', async orig => ({ ...(await orig<object>()), logEvent: async () => {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

// ---- scripted model and judge ----
const modelQueue: ModelTurn[] = [];
const modelNotes: string[] = [];
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    createInterviewerModel: () => ({
      runTurn: async () => modelQueue[0],
      streamTurn: (ctx: { turnSystem?: string }) => {
        modelNotes.push(ctx.turnSystem ?? '');
        const t = modelQueue.shift();
        if (!t) throw new Error('model queue empty');
        return eventsFromTurn(Promise.resolve(t));
      },
    }),
  };
});
const judgeQueue: ({ answered: boolean } | null)[] = [];
const judgeProbes: string[] = [];
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({
  ...(await orig<object>()),
  judgeProbeAnswer: async (p: { probe: string }) => { judgeProbes.push(p.probe); return judgeQueue.length ? judgeQueue.shift()! : null; },
  judgeStructureGiven: async () => ({ given: true, reason: '' }),
}));

const { runTurn } = await import('@/lib/orchestrator/session-runner');

type Step = { turnIndex: number; candidate: string; model: unknown };
const COST = ['cogs_pct', 'labor_pct', 'overhead_pct'];

// ANALYSIS, pressure test satisfied, the three cost lines already released.
function seed() {
  const r = readsFixture({
    phase: 'ANALYSIS', revealed: COST,
    flags: { pressureTest: { state: 'satisfied', askedAt: 2, satisfiedAt: 3, intents: ['prioritize'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } },
  });
  store.session = { ...(r.session as Row) };
  store.turns = r.turnRows.map(t => ({ ...t }));
  store.revealed = (r.revealedRows as unknown as Row[]).map(x => ({ ...x }));
  store.exhibits = []; store.events = [];
}
async function step(s: Step) {
  modelQueue.length = 0;
  modelQueue.push(s.model as ModelTurn, s.model as ModelTurn);
  judgeQueue.length = 0;
  return (await runTurn('s1', s.candidate, {})).interviewerText;
}
const at = (run: { turns: Step[] }, i: number) => run.turns.find(t => t.turnIndex === i)!;
const r1 = replays['destiny-r1'] as { turns: Step[] };
const r2 = replays['destiny-r2'] as { turns: Step[] };

beforeEach(() => { modelQueue.length = 0; modelNotes.length = 0; judgeQueue.length = 0; judgeProbes.length = 0; });

describe('explicit repeat requests restate the data', () => {
  it('Destiny r1 t21 ("Here they are again."): the three values are restated, the claim is not spoken', async () => {
    seed();
    const heard = await step(at(r1, 21));
    expect(heard).toMatch(/As I mentioned: COGS is 58% of revenue today, up from 42% two years ago\./);
    expect(heard).toMatch(/Labor is 22% of revenue/);
    expect(heard).toMatch(/Overhead is 14% of revenue/);
    expect(heard).not.toMatch(/Here they are again/);
  });

  it("Destiny r1 t19 (\"They're in my last message, so I'll restate them.\"): restated by code, the model's claim withheld", async () => {
    seed();
    const heard = await step(at(r1, 19));
    expect(heard).toMatch(/As I mentioned: COGS is 58%/);
    expect(heard).not.toMatch(/restate them|in my last message/);
  });

  it('Destiny r2 t17 ("let me repeat them"): restated by code', async () => {
    seed();
    const heard = await step(at(r2, 17));
    expect(heard).toMatch(/As I mentioned: COGS is 58%/);
    expect(heard).not.toMatch(/let me repeat them/);
  });

  it('a restatement leaves the reveal ledger unchanged (no new revealed rows)', async () => {
    seed();
    const before = store.revealed.length;
    await step(at(r1, 21));
    expect(store.revealed).toHaveLength(before);
  });
});

describe('no repetition without an explicit ask', () => {
  it('a passing mention of released data repeats nothing', async () => {
    seed();
    const s = at(r1, 21);
    const heard = await step({ ...s, model: { ...(s.model as object), say: '', requests: [{ what: 'the cost breakdown', itemIds: COST, explicit: false, respond: 'release' }] } });
    expect(heard).not.toMatch(/As I mentioned|COGS is 58%/);
  });

  it('a redelivery claim with no data declared is never spoken', async () => {
    seed();
    const s = at(r1, 21);
    const heard = await step({ ...s, model: { ...(s.model as object), requests: [] } });
    expect(heard).not.toMatch(/Here they are again/);
    expect(heard).not.toMatch(/COGS is 58%/);
  });
});

describe('the pressure-test gate never holds data already given', () => {
  // A held-category item can be out before the probe is answered (the time
  // warning and recommendation ask release open requests): a re-ask restates it.
  it('while the probe is open, a re-ask of a released item is restated, not deferred', async () => {
    seed();
    store.session = { ...store.session, flagsJsonb: { ...(store.session.flagsJsonb as Row), pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Which branch first, and why?', intents: ['prioritize'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false, awaitingReplies: 0 } } };
    judgeQueue.push({ answered: false });
    const heard = await step(at(r1, 21));
    expect(heard).toMatch(/As I mentioned: COGS is 58%/);
    expect(heard).not.toMatch(/once we've settled your structure/);
  });
});
