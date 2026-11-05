// A case with no pressure test (Case.skipPressureTest; Lorenzo, 4 Nov — the live demo's prof-001-demo), through the
// real Plan / Stream / Settle with the harness of pressure-test-runner.test.ts: the structure is still asked for once
// and still holds the gated data; once it is given the test closes as `skipped` on that turn, no probe is asked by
// code, and a probe the model asks is replaced. prof-001 itself is unchanged.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';
import { anyVariant } from '@/lib/orchestrator/phrasing';
import { buildPromptParts, type PromptContext } from '@/lib/agent/prompts/system';
import { buildCompactPromptParts } from '@/lib/agent/prompts/system-compact';
import { turnNoteFor } from '@/lib/orchestrator/turn-note';
import { stagesNotInCase } from '@/lib/scoring/stage-caps';

// ---- in-memory store ----
type Row = Record<string, unknown>;
const store = { session: {} as Row, turns: [] as Row[], revealed: [] as Row[], exhibits: [] as Row[], events: [] as Row[] };
function resetStore(phase: string, flags: Row = {}, caseId = 'prof-001-demo') {
  const r = readsFixture({ phase: phase as never, flags, caseId });
  store.session = { ...(r.session as Row) };
  store.turns = r.turnRows.map(t => ({ ...t }));
  store.revealed = []; store.exhibits = []; store.events = [];
}
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
const modelCalls: string[] = [];
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    createInterviewerModel: () => ({
      runTurn: async () => modelQueue[0],
      streamTurn: (ctx: { turnSystem?: string }) => {
        modelCalls.push(ctx.turnSystem ?? '');
        const t = modelQueue.shift();
        if (!t) throw new Error('model queue empty');
        return eventsFromTurn(Promise.resolve(t));
      },
    }),
  };
});
const judgeQueue: ({ answered: boolean } | null)[] = [];
const judgeInputs: string[][] = [];
let structureGiven: boolean | null = true;   // the structure check's scripted verdict
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({
  ...(await orig<object>()),
  judgeProbeAnswer: async (p: { replies: string[] }) => { judgeInputs.push(p.replies); return judgeQueue.length ? judgeQueue.shift()! : null; },
  judgeStructureGiven: async () => (structureGiven === null ? null : { given: structureGiven, reason: '' }),
}));

const { runTurn } = await import('@/lib/orchestrator/session-runner');

const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'Go on.', ...over });
const ask = (ids: string[], what = 'the data', respond: 'release' | 'defer' = 'release') => ({ what, itemIds: ids, explicit: true, respond });
const pt = () => store.session.flagsJsonb ? (store.session.flagsJsonb as Row).pressureTest as Row | undefined : undefined;
const revealed = () => store.revealed.map(r => r.ledgerItemId);
async function turn(candidate: string, ...model: ModelTurn[]) {
  modelQueue.push(...model);
  const r = await runTurn('s1', candidate, {});
  // The runner reads its own writes next turn: append the candidate + interviewer rows as Settle would.
  return r.interviewerText;
}

beforeEach(() => { modelQueue.length = 0; modelCalls.length = 0; judgeQueue.length = 0; judgeInputs.length = 0; structureGiven = true; });

const MECE = 'Is that MECE — what’s missing?';
const PROBE_WORDS = /\bMECE\b|missing|prioriti[sz]e|which branch/i;
const ptEvents = () => store.events.filter(e => e.category === 'intervention' && String(e.subtype).startsWith('pressure_test'));

describe('skipPressureTest (prof-001-demo)', () => {
  it('the structure given: closes as skipped on that turn, the data goes out, the model\'s MECE probe is replaced', async () => {
    resetStore('STRUCTURE');
    const heard = await turn('I would split profit into revenue and costs, and costs into COGS, labor and overhead. Could I get the cost breakdown?',
      T({ move: 'pressure_test', requests: [ask(['cogs_pct'], 'the cost breakdown')], question: MECE }));
    expect(pt()).toMatchObject({ state: 'skipped', structureGiven: true });
    expect(pt()?.askedAt).toBeUndefined();
    expect(revealed()).toContain('cogs_pct');
    expect(heard).not.toMatch(PROBE_WORDS);
    expect(ptEvents()).toEqual([]);   // no waiver, no "nothing is missing": nothing for the report to read as a probe
  });

  it('the structure given and a plain next question: kept as the model wrote it', async () => {
    resetStore('STRUCTURE');
    const heard = await turn('Revenue versus costs, then price times volume and the cost lines.', T({ question: 'Where would you like to start the analysis?' }));
    expect(pt()?.state).toBe('skipped');
    expect(heard).toMatch(/Where would you like to start the analysis\?/);
  });

  it('no structure yet: data held, the model\'s probe replaced by code\'s one structure ask; given next turn → skipped and released', async () => {
    resetStore('STRUCTURE');
    structureGiven = false;
    const heard1 = await turn('Can I get the cost breakdown first?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown', 'defer')], question: MECE }));
    expect(pt()).toMatchObject({ state: 'not_asked', structureAsked: true });
    expect(revealed()).not.toContain('cogs_pct');
    expect(heard1).toMatch(new RegExp(anyVariant('structure_ask').source, 'i'));
    expect(heard1).not.toMatch(PROBE_WORDS);
    structureGiven = true;
    await turn('Profit is revenue minus costs; I would look at each cost line. Could I get the cost breakdown?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'Which line moved?' }));
    expect(pt()?.state).toBe('skipped');
    expect(revealed()).toContain('cogs_pct');
  });

  it('once skipped, a later early-stage probe from the model is replaced', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'skipped', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    const heard = await turn('I think COGS is the place to look.', T({ move: 'pressure_test', question: 'Which branch do you prioritize, and why?' }));
    expect(pt()?.state).toBe('skipped');
    expect(heard).not.toMatch(PROBE_WORDS);
  });

  it('prof-001 (no flag) is unchanged: the same MECE probe is asked and held open', async () => {
    resetStore('STRUCTURE', {}, 'prof-001');
    await turn('I would split profit into revenue and costs. Could I get the cost breakdown?', T({ move: 'pressure_test', requests: [ask(['cogs_pct'], 'the cost breakdown')], question: MECE }));
    expect(pt()).toMatchObject({ state: 'awaiting', intents: ['mece'] });
    expect(revealed()).not.toContain('cogs_pct');
  });
});

describe('skipPressureTest: what the model is told, and what the report treats as part of the case', () => {
  const ctx = (over: Partial<PromptContext> = {}): PromptContext => ({ casePrompt: 'Client has declining profits.', currentPhase: 'STRUCTURE', revealedValues: {}, unrevealedItems: [], exhibits: [], advancedLastTurn: false, elapsedMs: 0, totalMs: 420_000, ...over });
  it('both prompts: the no-probe structure rule with the flag, the one pressure test without it', () => {
    for (const build of [(c: PromptContext) => buildPromptParts(c).stable, (c: PromptContext) => buildCompactPromptParts(c).stable]) {
      expect(build(ctx())).toMatch(/exactly one pressure test/);
      expect(build(ctx({ noPressureTest: true }))).not.toMatch(/exactly one pressure test|Is that MECE/);
      expect(build(ctx({ noPressureTest: true }))).toMatch(/This case has no pressure test/);
    }
  });

  it('the turn note once skipped, in the early stages', () => {
    expect(turnNoteFor('model', undefined, { pressureTest: 'skipped', phase: 'STRUCTURE' })).toMatch(/no pressure test/);
    expect(turnNoteFor('model', undefined, { pressureTest: 'skipped', phase: 'ANALYSIS' })).toBeUndefined();
  });

  it('the report: brainstorm and pressure test not part of prof-001-demo; prof-001 owes both', async () => {
    const { getCaseById } = await import('@/lib/cases/loader');
    expect(stagesNotInCase(getCaseById('prof-001-demo'))).toEqual(['brainstorm', 'pressure_test']);
    expect(stagesNotInCase(getCaseById('prof-001'))).toEqual([]);
  });
});
