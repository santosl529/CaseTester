// Round-3 math fixes through the real runner (Plan → Stream → Settle →
// commit), on saved batch-18 v3 turns: the candidate's message, the state
// before it, and the interviewer model's actual parsed output, replayed by a
// scripted model (tests/orchestrator/fixtures/batch18-math-challenges.json).
// No API calls.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import saved from './fixtures/batch18-math-challenges.json';

// These tests pin the ledger's own data lines: prof-001's pre-written versions
// are off here (DATA_LINE_VARIANTS=0; on by default since 18 Oct).
process.env.DATA_LINE_VARIANTS = '0';

type Row = Record<string, unknown>;
const store = { session: {} as Row, turns: [] as Row[], revealed: [] as Row[], exhibits: [] as Row[], events: [] as Row[] };
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: async () => { throw new Error('no math checker calls in tests'); } }));
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
      update: () => ({ set: (v: Row) => ({ where: async () => { store.session = { ...store.session, ...v }; } }) }),
    },
  };
});
vi.mock('@/lib/analytics', async orig => ({ ...(await orig<object>()), logEvent: async () => {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
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
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({
  ...(await orig<object>()),
  judgeProbeAnswer: async () => null,
  judgeStructureGiven: async () => ({ given: true, reason: '' }),
}));

const { runTurn } = await import('@/lib/orchestrator/session-runner');
const { codeFlagsOf, vettedFlag, verdictRow } = await import('./helpers/checker-claim');

type Fixture = {
  candidate: string; phase: string; revealed: string[]; shownExhibits: string[]; pressureTest: Row | null;
  priorTurns: { role: string; text: string }[]; model: ModelTurn; savedLine: string;
};
const fx = saved as unknown as Record<string, Fixture>;

function seed(f: Fixture, flags: Row = {}) {
  const startedAt = new Date(Date.now() - 8 * 60_000);
  const turns = [{ role: 'interviewer', text: 'Your client is Brew & Bean. How would you approach this?' }, ...f.priorTurns];
  store.session = {
    id: 's1', userId: 'u1', caseId: 'prof-001', phase: f.phase, elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
    abandonPhase: null, startedAt, completedAt: null, coverageJsonb: null,
    flagsJsonb: { conduct: { warnings: 0 }, pressureTest: f.pressureTest ?? { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false }, ...flags },
  };
  store.turns = turns.map((t, i) => ({ id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null }));
  store.revealed = f.revealed.map((ledgerItemId, i) => ({ id: `r${i}`, sessionId: 's1', ledgerItemId, revealedAtMs: startedAt.getTime() }));
  store.exhibits = f.shownExhibits.map((exhibitId, i) => ({ id: `e${i}`, sessionId: 's1', exhibitId, shownAtMs: startedAt.getTime() }));
  store.events = [];
}

async function replay(key: string, flags: Row = {}) {
  const f = fx[key];
  seed(f, flags);
  modelQueue.length = 0;
  modelQueue.push(f.model, f.model);
  const result = await runTurn('s1', f.candidate, {});
  const checks = store.events.filter(e => e.category === 'check');
  const check = (name: string) => checks.find(c => c.subtype === name)?.payloadJsonb as { decision: string; detail?: Row } | undefined;
  return { text: result.interviewerText, check, events: store.events, prompt: prompts.at(-1) ?? '' };
}

beforeEach(() => { modelQueue.length = 0; prompts.length = 0; });

describe('doubt on correct math without a flag is not spoken (batch 18)', () => {
  it('Jasmine t16: "…but revenue also grew… Is that the right base?" — withheld, replaced by a neutral question', async () => {
    const r = await replay('jasmine-t15');
    expect(r.text).not.toMatch(/right base|revenue also grew|fit into that calculation/);
    expect(r.text).toMatch(/\?$/);
    expect(r.check('math_challenge')?.decision).toBe('act');
    expect(r.events.some(e => e.subtype === 'unsupported_challenge_blocked')).toBe(true);
  });

  it('Owen t8: no unit flag on his correct 58/42 = 1.38, and "Points of what… reconcile the 38%" is withheld with its setup', async () => {
    const r = await replay('owen-t7');
    expect(r.prompt).not.toMatch(/UNIT/);
    expect(r.check('unit_check')?.decision).toBe('pass');
    expect(r.text).toMatch(/Menu prices have not changed in two years\./);
    expect(r.text).not.toMatch(/Points of what|reconcile the 38%|You said COGS rose 38%/);
    expect(r.text).toMatch(/\?$/);
  });

  it('Camila t8: "Does that change your 53.8 and 14.7 figures" on verified arithmetic — withheld; no request for working she already showed', async () => {
    const r = await replay('camila-t7');
    expect(r.text).not.toMatch(/53\.8|indexed everything/);
    expect(r.text).not.toMatch(/How did you get to/);
    expect(r.events.some(e => e.subtype === 'challenge_on_verified_blocked')).toBe(true);
  });
});

describe('a real error still gets its probe', () => {
  // The gate (16 Oct): held on its own turn, said on the next once the checker flags it too.
  it('Sofia t12: 25% × 40% = 10 "percentage points of revenue" — held; released by the checker\'s flag, the unit flag names the claim and "Points of what?" is spoken', async () => {
    const f = fx['sofia-t11'];
    const own = await replay('sofia-t11');
    expect(own.prompt).not.toMatch(/UNIT:/);
    const flag = own.events.find(e => e.subtype === 'recompute_flag')?.payloadJsonb as Row;
    expect(flag).toMatchObject({ kind: 'unit', candidateValue: 10, expected: 4.2, claim: { units: 'points of revenue', timeframe: 'prior' } });
    const n = store.turns.find(t => t.role === 'candidate' && t.text === f.candidate)!.turnIndex as number;
    store.events.push(verdictRow(n, [vettedFlag('10 points of revenue', 4.2, { errorType: 'unit' })], codeFlagsOf(f.candidate, f.revealed, 'prof-001', f.shownExhibits)));
    modelQueue.length = 0;
    modelQueue.push(f.model, f.model);
    const r = await runTurn('s1', 'I would look at the other inputs next.', {});
    expect(prompts.at(-1)).toMatch(/UNIT: the candidate said 10 points of revenue/);
    expect(prompts.at(-1)).toMatch(/COGS at 42% of revenue \(two years ago\)/);
    expect(r.interviewerText).toMatch(/Points of what\?/);
  });

  it('Maya t25 (KF-2): her 16 / 18 = 1.6% was flagged earlier — the check is spoken whole, not cut to "one thing to check: …"', async () => {
    const r = await replay('maya-t24', { flaggedFigures: [1.6] });
    expect(r.text).toMatch(/you said 16 divided by 18 is 1\.6%\. Redo that division, and tell me what share of the margin decline COGS explains\./);
  });

  it('Maya t25 without the earlier flag: the turn still ends on a question (no dangling setup)', async () => {
    const r = await replay('maya-t24');
    expect(r.text).toMatch(/\?$|\.$/);
    expect(r.text).not.toMatch(/one thing to check: you said 16 divided by 18 is 1\.6%\.$/);
  });
});
