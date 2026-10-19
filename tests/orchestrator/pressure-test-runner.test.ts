// Pressure-test state, gate, fulfilment and fallbacks across several turns
// through the real Plan / Stream / Settle (spec 2026-10-07-pressure-test-and-
// request-guards). An in-memory store stands in for the database; the model
// returns scripted turns (through the real streamInterviewerTurn, so guard B's
// regeneration is real); the judge returns scripted verdicts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';
import { anyVariant, poolPattern } from '@/lib/orchestrator/phrasing';

// ---- in-memory store ----
type Row = Record<string, unknown>;
const store = { session: {} as Row, turns: [] as Row[], revealed: [] as Row[], exhibits: [] as Row[], events: [] as Row[] };
function resetStore(phase: string, flags: Row = {}) {
  const r = readsFixture({ phase: phase as never, flags });
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
const { PT_REPLY_LIMIT } = await import('@/lib/orchestrator/pressure-test');

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
    // v3: the reason, out loud — the cost breakdown named by its lines (a group ask, 12 Oct).
    expect(heard).toMatch(/I'll share COGS, labor, and overhead including rent as a percent of revenue once we've settled your structure\./);
  });

  // Lorenzo, 13 Oct (Tyler af62e2e2 t4): a substantive reply the judge didn't count is still a reply.
  it('a substantive reply the judge did not count: the re-ask goes out without "I\'d like your answer"', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that MECE?', intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    judgeQueue.push({ answered: false });
    const heard = await turn('Roughly, yes: revenue and cost are exclusive and together make up profit, and external factors flow through both, so I would fold them in. Within costs, COGS versus operating versus overhead is clean.',
      T({ move: 'pressure_test', requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'Is that MECE — what’s missing?' }));
    expect(heard).toMatch(/One more on your structure before I share that data: what might be missing from it\?/);
    expect(heard).not.toMatch(/I'd like your answer/);
  });

  // Lorenzo, 19 Oct (0f1b28ea t8–t14): "nothing is missing" answers the
  // what's-missing ask — counted, never re-asked or narrowed ("name one thing
  // your structure doesn't cover" presumes a gap); code asks which branch
  // first, once; the report judges completeness against the case key.
  it('"nothing is missing" answers the what\'s-missing probe: satisfied, data released, code asks which branch first', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that structure MECE, and what might be missing from it?', intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    judgeQueue.push({ answered: false });   // the judge called it a bare claim
    const heard = await turn('Yes. It is MECE, and nothing is missing.', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'Coming back to it: what might be missing?' }));
    expect(pt()?.state).toBe('satisfied');
    expect(heard).toMatch(new RegExp(anyVariant('ask_branch').source, 'i'));   // code's line, opening its sentence
    expect(heard).not.toMatch(/missing|doesn't cover|leaves out/i);
    expect(revealed()).toContain('cogs_pct');
    expect(store.events.some(e => e.category === 'intervention' && e.subtype === 'pressure_test_nothing_missing')).toBe(true);
  });

  it('…keeps the model\'s own where-to-start question when it already asks one', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that MECE?', intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    judgeQueue.push({ answered: false });
    const heard = await turn('It covers everything.', T({ question: 'Which of those areas would you look at first, and why?' }));
    expect(pt()?.state).toBe('satisfied');
    expect(heard).toMatch(/Which of those areas would you look at first, and why\?/);
  });

  it('…only when the judge did not count the reply: an answer it counted goes on as before', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that MECE?', intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    judgeQueue.push({ answered: true });
    const heard = await turn('Yes, it is MECE and nothing is missing.', T({ question: 'What does the cost side tell you so far?' }));
    expect(pt()?.state).toBe('satisfied');
    expect(heard).toMatch(/What does the cost side tell you so far\?/);
    expect(store.events.some(e => e.subtype === 'pressure_test_nothing_missing')).toBe(false);
  });

  it('…and no branch ask when the reply already says where they would start', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that MECE?', intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    judgeQueue.push({ answered: false });
    const heard = await turn("Nothing is missing. I'd start with COGS.", T({ question: 'What would you want to see on COGS?' }));
    expect(pt()?.state).toBe('satisfied');
    expect(heard).toMatch(/What would you want to see on COGS\?/);
    expect(heard).not.toMatch(/which branch/i);
  });

  it('…not when the reply adds something: the judge decides as before', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that MECE?', intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    judgeQueue.push({ answered: false });
    const heard = await turn("Nothing's missing, but maybe I'd add competitors.", T({ question: 'Go on.' }));
    expect(pt()?.state).toBe('awaiting');
    expect(heard).toMatch(/what might be missing from it\?/);
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

  // v3 (batch 18, 10 Oct): v2 held the data with no bound and promised it
  // once, then silently (Destiny, Maya: 20 turns). Now: one re-ask, one
  // narrowed probe, then a spoken, logged waiver that releases what is held;
  // every held ask is answered with its reason. Never satisfied by escape.
  it('across several failing turns: re-ask, narrowed probe, then a waiver; each held ask answered with its reason', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that MECE?', intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    const heard: string[] = [];
    // Varied asks: a verbatim repeat is a stall-ladder trigger, not this test.
    for (const line of ['Could I get the cost breakdown?', 'Can I see how costs split out?', 'Do we have the cost lines?', 'What do the costs look like?']) {
      judgeQueue.push({ answered: false });
      heard.push(await turn(line, T({ move: 'pressure_test', requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'Is that MECE — what’s missing?' })));
    }
    expect(heard[0]).toMatch(/Before I share that data, I'd like your answer on the structure/);   // a data ask is no answer
    expect(heard[1]).toMatch(/Let me make it concrete/);
    expect(heard[2]).toMatch(/Let's leave the structure there\./);
    // The waiver releases what was held: the three cost lines, as their exhibit (a group ask, 12 Oct).
    expect(heard[2]).toMatch(/COGS|Here's an exhibit: Brew & Bean Cost Structure/);
    for (const h of heard.slice(0, 2)) expect(h).toMatch(anyVariant('gate_defer', 'COGS, labor, and overhead including rent as a percent of revenue'));
    expect(heard.filter(h => /MECE/.test(h))).toHaveLength(0);
    expect(pt()).toMatchObject({ state: 'waived', awaitingReplies: 3 });
    expect(pt()?.satisfiedAt).toBeUndefined();
    expect(revealed()).toContain('cogs_pct');
  });

  // The honest bound: every reply while the probe is open counts; the waiver
  // comes on the third reply. v4.10 (KF-1): one ladder at a time — while the
  // probe is open the stall ladder fires no rung (batch 18 v3: Priyanka's rung-1
  // restate repeated the re-ask; Destiny t20 got a rung-3 rescue on the same
  // turn as the gate's deferral and the narrowed probe), so no restate delays it.
  it('the stall ladder waits while the probe is open; the waiver lands on the third reply', async () => {
    resetStore('STRUCTURE', { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that MECE?', intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } });
    const heard: string[] = [];
    for (let i = 0; i < 5 && pt()?.state !== 'waived'; i++) {
      judgeQueue.push({ answered: false });
      heard.push(await turn('Could I get the cost breakdown?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'Go on.' })));
    }
    expect(heard.filter(h => /Take your time\. The question on the table/.test(h))).toHaveLength(0);
    expect(store.events.some(e => e.category === 'check' && e.subtype === 'stall_deferred')).toBe(true);
    expect(pt()?.state).toBe('waived');
    expect(pt()?.awaitingReplies).toBe(heard.length);
    expect(heard.length).toBe(PT_REPLY_LIMIT);
  });

  it('with no structure ever given, the hold still ends: three held turns after the structure ask, then a waiver', async () => {
    resetStore('STRUCTURE');
    structureGiven = false;
    const heard: string[] = [];
    const lines = ['Could I get the cost breakdown?', 'Can I see how costs split out?', 'Do we have the cost lines?', 'What do the costs look like?', 'Any cost data at all?', 'And the costs?'];
    for (const line of lines) heard.push(await turn(line, T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'What else would you want?' })));
    expect(heard.filter(h => /Before we (get into|go further into) the data, .*structure/.test(h))).toHaveLength(1);
    expect(heard.filter(h => /Let's move on to the analysis\./.test(h))).toHaveLength(1);
    expect(heard.findIndex(h => /Let's move on to the analysis\./.test(h))).toBe(4);
    expect(pt()?.state).toBe('waived');
    expect(revealed()).toContain('cogs_pct');
    const waivedEvents = store.events.filter(e => e.subtype === 'pressure_test_waived');
    expect(waivedEvents).toHaveLength(1);
    expect(waivedEvents[0].payloadJsonb).toMatchObject({ from: 'not_asked', probeDelivered: false, structureAsked: true });
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
    // Code asks once; a stall rung-1 restate of that ask ("The question on the table: Before we…") is not a second ask.
    expect(heard.filter(h => !/question on the table/.test(h) && /Before we (get into|go further into) the data, .*structure/.test(h))).toHaveLength(1);
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

  it('a structure check that fails (no verdict) is not "no structure": code asks nothing that turn and spends no fallback', async () => {
    resetStore('STRUCTURE');
    structureGiven = null;
    const heard: string[] = [];
    for (let i = 0; i < 3; i++) heard.push(await turn('Could I get the cost breakdown?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'What else would you want?' })));
    // Code asks nothing: no structure ask or probe (the held ask's reason line names the structure, v3).
    expect(heard.some(h => /Before we (get into|go further into) the data|might be missing|which branch|break this/.test(h))).toBe(false);
    expect(heard.every(h => /what else would you want\?/i.test(h))).toBe(true);
    expect(pt()).toMatchObject({ state: 'not_asked', codeAsked: false, structureAsked: false, structureGiven: false });
    expect(revealed()).not.toContain('cogs_pct');
    // A later real verdict still gets its one fallback.
    structureGiven = false;
    const next = await turn('Could I get the cost breakdown?', T({ requests: [ask(['cogs_pct'], 'the cost breakdown')], question: 'What else would you want?' }));
    expect(next).toMatch(poolPattern('structure_ask'));
    expect(pt()).toMatchObject({ structureAsked: true });
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
