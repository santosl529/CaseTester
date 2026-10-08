// Pressure-test state, gate, fulfilment and fallbacks across several turns
// through the real Plan / Stream / Settle (spec 2026-10-07-pressure-test-and-
// request-guards). An in-memory store stands in for the database; the model
// returns scripted turns (through the real streamInterviewerTurn, so guard B's
// regeneration is real); the judge returns scripted verdicts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';

// ---- in-memory store ----
type Row = Record<string, unknown>;
const store = { session: {} as Row, turns: [] as Row[], revealed: [] as Row[], exhibits: [] as Row[], events: [] as Row[] };
function resetStore(phase: string, flags: Row = {}) {
  const r = readsFixture({ phase: phase as never, flags });
  store.session = { ...(r.session as Row) };
  store.turns = r.turnRows.map(t => ({ ...t }));
  store.revealed = []; store.exhibits = []; store.events = [];
}
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

describe('pressure-test state', () => {
  it('is asked when the delivered question is a probe, whatever the move label says', async () => {
    resetStore('STRUCTURE');
    await turn('I would split profit into revenue and costs.', T({ move: 'analysis', question: 'Is that MECE — what’s missing?' }));
    expect(pt()).toMatchObject({ state: 'awaiting', intents: ['mece'] });
  });

  it('is not asked by a pressure_test label on a question that is not a probe', async () => {
    resetStore('STRUCTURE');
    await turn('I would split profit into revenue and costs.', T({ move: 'pressure_test', question: 'How would you structure the analysis?' }));
    expect(pt()?.state ?? 'not_asked').toBe('not_asked');
  });

  it('stays awaiting on an acknowledgment-only or data-only reply; gated data stays held', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that MECE?', intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    judgeQueue.push({ answered: false });
    const heard = await turn('Probably something is missing, yeah. Could I get the cost breakdown?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'Which part of the structure would you add to?' }));
    expect(pt()?.state).toBe('awaiting');
    expect(revealed()).not.toContain('cogs_pct');
    expect(heard).toMatch(/come back to the cost breakdown/);
  });

  it('is satisfied by a partial answer to a compound probe, and the held data is then released', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that MECE, and which branch first?', intents: ['mece', 'prioritize'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    judgeQueue.push({ answered: true });
    await turn('It misses below-the-line costs like interest. Can I see the cost breakdown?', T({ requests: [ask(['cogs_pct', 'labor_pct', 'overhead_pct'], 'the cost breakdown')], question: 'What do those tell you?' }));
    expect(pt()?.state).toBe('satisfied');
    expect(revealed()).toEqual(expect.arrayContaining(['cogs_pct', 'labor_pct', 'overhead_pct']));
  });

  it('recovers after a judge timeout: the next judgement reads every reply since the question', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that MECE?', intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    judgeQueue.push(null); // timeout
    await turn('It misses interest and taxes. Can I see the cost breakdown?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'Go on.' }));
    expect(pt()?.state).toBe('awaiting');
    expect(revealed()).not.toContain('cogs_pct');
    judgeQueue.push({ answered: true });
    await turn('So, the cost breakdown?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'What does it tell you?' }));
    expect(judgeInputs.at(-1)).toHaveLength(2); // both replies since the question
    expect(pt()?.state).toBe('satisfied');
    expect(revealed()).toContain('cogs_pct');
  });
});

describe('the gate keeps existing exceptions', () => {
  it('releases scoping facts before the pressure test, holds analysis data', async () => {
    resetStore('CLARIFY');
    await turn('Is the 15% from new stores? And can I get the cost breakdown?', T({ requests: [ask(['stores_count'], 'the store count'), ask(['cogs_pct'], 'the cost breakdown')], question: 'How would you structure it?' }));
    expect(revealed()).toContain('stores_count');
    expect(revealed()).not.toContain('cogs_pct');
  });

  it('holds a mixed-access exhibit whole while still releasing a requested scoping fact', async () => {
    resetStore('STRUCTURE');
    // prof-001's exhibit covers COGS / labor / overhead; the request mixes it with a scoping fact.
    await turn('Can I see the cost exhibit and total revenue?', T({ requests: [ask(['exhibit-a', 'revenue_total'], 'the cost exhibit and revenue')], exhibit: 'exhibit-a', question: 'Before that, what is your structure?' }));
    expect(revealed()).toContain('revenue_total');
    expect(store.exhibits).toHaveLength(0);
  });
});

describe('fulfilment after the pressure test', () => {
  it('releases pending requests up to the cap and keeps the rest pending for the next turn', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], satisfiedAt: 1, reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    // Five items deferred earlier.
    for (const id of ['cogs_pct', 'labor_pct', 'overhead_pct', 'avg_ticket', 'menu_price_change']) {
      store.events.push({ category: 'data_request', subtype: 'defer', turnIndex: 1, payloadJsonb: { what: id, explicit: true, ledgerItemIds: [id], revealedByNow: false, interviewerTurnIndex: 2 } });
    }
    await turn('Okay, so where are we?', T({ question: 'Where would you start?' }));
    expect(revealed()).toHaveLength(3);
    await turn('And the rest?', T({ question: 'What next?' }));
    expect(revealed()).toHaveLength(5);
  });
});

describe('bounded fallbacks', () => {
  it('replaces a duplicate probe after the test is satisfied, without mentioning figures when none went out', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], satisfiedAt: 1, reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    const heard = await turn('I covered that.', T({ move: 'pressure_test', question: 'Is that MECE — what’s missing?' }));
    expect(heard).not.toMatch(/MECE|missing/i);
    expect(heard).not.toMatch(/figure|number/i);
  });

  it('across several failing turns: one re-ask, then plain questions; never satisfied by escape; no repeated promise', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that MECE?', intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    const heard: string[] = [];
    for (let i = 0; i < 4; i++) {
      judgeQueue.push({ answered: false });
      heard.push(await turn('Could I get the cost breakdown?', T({ move: 'pressure_test', requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'Is that MECE — what’s missing?' })));
    }
    expect(heard.filter(h => /Before I share that data/.test(h))).toHaveLength(1);
    expect(heard.filter(h => /MECE/.test(h))).toHaveLength(0);
    for (let i = 1; i < heard.length; i++) expect(heard[i]).not.toBe(heard[i - 1]);
    expect(heard.filter(h => /come back to the cost breakdown/.test(h)).length).toBeLessThanOrEqual(1);
    expect(pt()?.state).toBe('awaiting');
    expect(revealed()).not.toContain('cogs_pct');
  });

  it('asks the pressure test itself, once, when the model never does and requested data keeps being held', async () => {
    resetStore('STRUCTURE');
    const heard: string[] = [];
    for (let i = 0; i < 3; i++) {
      heard.push(await turn('Could I get the cost breakdown?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'What else would you want?' })));
    }
    expect(heard.filter(h => /Before we get into the data/.test(h))).toHaveLength(1);
    expect(pt()).toMatchObject({ state: 'awaiting', codeAsked: true });
  });

  it('with no structure on the table, asks for the structure once instead of the probe, and holds the data', async () => {
    resetStore('STRUCTURE');
    structureGiven = false;
    const heard: string[] = [];
    for (let i = 0; i < 4; i++) {
      heard.push(await turn('Could I get the cost breakdown?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'What else would you want?' })));
    }
    expect(heard.filter(h => /Before we (get into|go further into) the data, .*structure/.test(h))).toHaveLength(1);
    expect(heard.some(h => /might be missing|which branch|break this structure/.test(h))).toBe(false);
    expect(pt()).toMatchObject({ state: 'not_asked', codeAsked: false, structureAsked: true });
    expect(revealed()).not.toContain('cogs_pct');
  });

  it('asks the probe itself, once, as soon as a structure has been given', async () => {
    resetStore('STRUCTURE');
    structureGiven = false;
    for (let i = 0; i < 2; i++) await turn('Could I get the cost breakdown?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'What else would you want?' }));
    structureGiven = true;
    const heard: string[] = [];
    for (let i = 0; i < 3; i++) heard.push(await turn('I would split profit into revenue and costs. Could I get the cost breakdown?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'What else would you want?' })));
    expect(heard.filter(h => /Before we get into the data/.test(h))).toHaveLength(1);
    expect(pt()).toMatchObject({ state: 'awaiting', codeAsked: true, structureGiven: true });
  });

  it('a structure check that fails (no verdict) counts as no structure', async () => {
    resetStore('STRUCTURE');
    structureGiven = null;
    for (let i = 0; i < 3; i++) await turn('Could I get the cost breakdown?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'What else would you want?' }));
    expect(pt()).toMatchObject({ state: 'not_asked', codeAsked: false });
  });

  it('a detector false positive missed twice adds no release and no promise', async () => {
    resetStore('ANALYSIS', { pressureTest: { state: 'satisfied', askedAt: 2, intents: ['mece'], satisfiedAt: 1, reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    const heard = await turn("To distinguish the rest, I'd want a bridge: hold volume constant and reprice each input.", T({ question: 'Walk me through it.' }), T({ question: 'Walk me through it.' }));
    expect(modelCalls).toHaveLength(2);               // guard B regenerated once
    expect(revealed()).toEqual([]);
    expect(heard).not.toMatch(/come back to|I don't have/);
    expect(store.events.some(e => e.category === 'request_signal')).toBe(true);
  });
});
