// The math checker through the real runner (Plan → Stream → Settle → commit):
// the turn never waits for it, its verdict is written when it lands and read
// by the next turn, and an error has no effect. In-memory database, scripted
// interviewer model, a controlled checker. No API calls.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { CheckerClaim, CheckerResult } from '@/lib/orchestrator/math-checker';

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
      update: () => ({ set: (v: Row) => ({ where: async () => { store.session = { ...store.session, ...v }; } }) }),
    },
  };
});
vi.mock('@/lib/analytics', async orig => ({ ...(await orig<object>()), logEvent: async () => {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/hint-check', async orig => ({ ...(await orig<object>()), checkHintDelivered: async () => null }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => ({ given: true, reason: '' }) }));

// The checker: each call waits for the test to settle it.
const calls: { message: string; signal?: AbortSignal; resolve: (r: CheckerResult) => void; reject: (e: Error) => void }[] = [];
vi.mock('@/lib/orchestrator/math-checker', async orig => ({
  ...(await orig<object>()),
  checkMathClaims: (a: { input: { message: string }; signal?: AbortSignal }) => new Promise<CheckerResult>((resolve, reject) => { calls.push({ message: a.input.message, signal: a.signal, resolve, reject }); }),
}));

const prompts: string[] = [];
const NEUTRAL: ModelTurn = { move: 'other', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What would you look at next?' };
const NEUTRAL_OVERRIDE: { turn: ModelTurn | null } = { turn: null };
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    createInterviewerModel: () => ({
      runTurn: async () => NEUTRAL_OVERRIDE.turn ?? NEUTRAL,
      streamTurn: (ctx: { turnSystem?: string }) => { prompts.push(ctx.turnSystem ?? ''); return eventsFromTurn(Promise.resolve(NEUTRAL_OVERRIDE.turn ?? NEUTRAL)); },
    }),
  };
});

const { runTurn } = await import('@/lib/orchestrator/session-runner');

const COSTS = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'menu_price_change', 'bean_price_change', 'non_bean_input_change'];
// A claim no deterministic check reads (a code flag on it would dedupe the checker's).
const CLAIM = 'So the whole 18-point margin decline sits in COGS.';
const flaggedClaim: CheckerClaim = {
  span: 'the whole 18-point margin decline sits in COGS', quantity: 'share of the margin decline in COGS', candidateValue: 'the whole 18 points', assumptions: '',
  verdict: 'error', correctValue: 16, correctLow: null, correctHigh: null, unit: 'points', derivation: 'COGS +16; overhead +2', errorType: 'conceptual',
  changesConclusion: true, confidence: 'high', probe: 'You said the whole 18 points sits in COGS. Which cost lines did you look at to get there?', pointer: '',
  codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, actualShare: 0.89,
};

function seed() {
  const startedAt = new Date(Date.now() - 6 * 60_000);
  store.session = {
    id: 's1', userId: 'u1', caseId: 'prof-001', phase: 'ANALYSIS', elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
    abandonPhase: null, startedAt, completedAt: null, coverageJsonb: null,
    flagsJsonb: { conduct: { warnings: 0 }, pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } },
  };
  store.turns = [
    { role: 'interviewer', text: 'Your client is Brew & Bean. How would you approach this?' },
    { role: 'candidate', text: 'I would split profit into revenue and costs.' },
    { role: 'interviewer', text: 'Go on.' },
  ].map((t, i) => ({ id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null }));
  store.revealed = COSTS.map((ledgerItemId, i) => ({ id: `r${i}`, sessionId: 's1', ledgerItemId, revealedAtMs: startedAt.getTime() }));
  store.exhibits = []; store.events = [];
  calls.length = 0; prompts.length = 0;
}
const flush = () => new Promise(r => setTimeout(r, 0));
const checkerRows = () => store.events.filter(e => e.category === 'math_checker' && (e.subtype === 'verdict' || e.subtype === 'error'));

describe('the turn never waits for the checker', () => {
  beforeEach(seed);
  it('returns while the check is still pending — without defer (left running) and with defer (handed over, not run)', async () => {
    const t0 = Date.now();
    const r = await runTurn('s1', CLAIM);
    expect(r.interviewerText).toBeTruthy();
    expect(calls).toHaveLength(1);              // started …
    expect(checkerRows()).toHaveLength(0);      // … not landed, and the turn is done
    expect(Date.now() - t0).toBeLessThan(5_000);
    const deferred: (() => Promise<void>)[] = [];
    await runTurn('s1', 'So a 15% rise gives back about 8 points.', { defer: t => { deferred.push(t); } });
    expect(calls).toHaveLength(2);
    expect(deferred.length).toBeGreaterThan(0); // the row write is deferred work, awaited by nobody in the turn
  });
});

describe('the verdict lands and the next turn reads it', () => {
  beforeEach(seed);
  it('written as a math_checker verdict row at the message index; the next model turn gets the flag', async () => {
    await runTurn('s1', CLAIM);
    calls[0].resolve({ claims: [flaggedClaim], model: 'claude-sonnet-5-5', latencyMs: 6000, stopReason: 'end_turn' });
    await flush(); await flush();
    expect(checkerRows()).toEqual([expect.objectContaining({ subtype: 'verdict', turnIndex: 3 })]);
    await runTurn('s1', 'Next I would look at the competitive response.');
    expect(prompts.at(-1)).toMatch(/MATH CHECK FLAG[\s\S]*Which cost lines did you look at to get there\?/);
    expect((store.session.flagsJsonb as Row).mathChecker).toEqual({ handled: ['3:0'] });
    expect(((store.session.flagsJsonb as Row).recomputeAttempts as Row)['checker:the whole 18 points']).toBe(1);
    expect(store.events).toContainEqual(expect.objectContaining({ category: 'math_checker', subtype: 'flag', turnIndex: 5 }));
  });

  it('a verdict still out at the next turn lands on a later one', async () => {
    await runTurn('s1', CLAIM);
    await runTurn('s1', 'Next I would look at the competitive response.');
    expect(prompts.at(-1)).not.toMatch(/MATH CHECK FLAG/);
    calls[0].resolve({ claims: [flaggedClaim], model: 'claude-sonnet-5-5', latencyMs: 14000, stopReason: 'end_turn' });
    await flush(); await flush();
    await runTurn('s1', 'And then the store footprint.');
    expect(prompts.at(-1)).toMatch(/MATH CHECK FLAG/);
  });

  it('an error is an error row and changes nothing — and is logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await runTurn('s1', CLAIM);
    calls[0].reject(new Error('overloaded'));
    await flush(); await flush();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/\[math-checker\] error on message 3/));
    warn.mockRestore();
    expect(checkerRows()).toEqual([expect.objectContaining({ subtype: 'error', payloadJsonb: expect.objectContaining({ error: 'overloaded' }) })]);
    await runTurn('s1', 'Next I would look at the competitive response.');
    expect(prompts.at(-1)).not.toMatch(/MATH CHECK FLAG/);
  });
});

describe('in place of the close, code says the checker\'s line', () => {
  beforeEach(seed);
  it('"Before we wrap up — " and the vetted probe; the close comes after it', async () => {
    const startedAt = new Date(Date.now() - 17 * 60_000);
    store.session = {
      ...store.session, phase: 'RECOMMENDATION', startedAt,
      flagsJsonb: { ...(store.session.flagsJsonb as Row), moves: { 4: 'brainstorm', 6: 'recommendation', 8: 'risk' }, stall: { recommendationDelivered: true }, stagesEnforced: { analysis: true, exhibit: true, brainstorm: true } },
    };
    const more = [
      { role: 'candidate', text: 'Ideas.' }, { role: 'interviewer', text: 'What else could they do?' },
      { role: 'candidate', text: 'More ideas.' }, { role: 'interviewer', text: 'What do you recommend?' },
      { role: 'candidate', text: `My recommendation is to raise menu prices. ${CLAIM}` }, { role: 'interviewer', text: 'What is the biggest risk?' },
    ];
    store.turns.push(...more.map((t, i) => ({ id: `x${i}`, sessionId: 's1', turnIndex: 3 + i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null })));
    const { vetCheckerClaims } = await import('@/lib/orchestrator/math-checker');
    const { getCaseById } = await import('@/lib/cases/loader');
    const claims = vetCheckerClaims([flaggedClaim], { caseData: getCaseById('prof-001'), revealedIds: COSTS, shownExhibitIds: [], candidateTexts: [more[4].text] });
    store.events.push({ sessionId: 's1', category: 'math_checker', subtype: 'verdict', turnIndex: 7, phase: 'RECOMMENDATION', payloadJsonb: { candidateTurnIndex: 7, latencyMs: 9000, model: 'claude-sonnet-5-5', claims, codeFlags: [], stamps: [] } });
    const r = await runTurn('s1', 'The biggest risk is volume loss; I would pilot it first.');
    expect(r.ended).toBe(false);
    expect(r.interviewerText).toContain('Before we wrap up — you said the whole 18 points sits in COGS. Which cost lines did you look at to get there?');
    expect((store.session.flagsJsonb as Row).recMathProbed).toBe(true);
  });
});

describe('a turn nobody heard leaves nothing behind', () => {
  beforeEach(seed);
  it('the check is aborted and no row is written', async () => {
    await expect(runTurn('s1', CLAIM, { onSegment: async () => {}, heard: async () => ({ segments: [], interrupted: true }) })).rejects.toThrow(/cancelled/);
    expect(calls).toHaveLength(1);
    expect(calls[0].signal?.aborted).toBe(true);
    calls[0].reject(new Error('aborted'));
    await flush(); await flush();
    expect(checkerRows()).toHaveLength(0);
  });
});

describe('a closed flag (Lorenzo, 13 Oct; Jordan 099f33e9): the model\'s own probe of it is withheld', () => {
  beforeEach(seed);
  it('"Why … 40 points rather than 16?" does not go out; a plain next question does', async () => {
    store.session = { ...store.session, flagsJsonb: { ...(store.session.flagsJsonb as Row), mathChecker: { handled: [], keys: { 'checker:about 40 points': { figures: [40], since: 1 } }, closed: ['checker:about 40 points'] } } };
    NEUTRAL_OVERRIDE.turn = { ...NEUTRAL, question: 'Why would the exposure be 40 points rather than 16?' };
    const r = await runTurn('s1', 'I still think the real exposure is about 40 points.');
    NEUTRAL_OVERRIDE.turn = null;
    expect(r.interviewerText).not.toMatch(/40/);
    expect(r.interviewerText).toMatch(/\?$/);
  });
});

describe('the correction is said once: its flag closes', () => {
  beforeEach(seed);
  it('after code corrects it, the flag is closed for later turns', async () => {
    const corrected = { ...flaggedClaim, span: 'about 40 points of margin erosion from COGS', candidateValue: 'about 40 points', actualShare: null, codeQuantity: { kind: 'none' as const, stepId: null, price: null, target: null } };
    store.turns.push({ id: 'x3', sessionId: 's1', turnIndex: 3, role: 'candidate', text: 'From 42 to 58 is 38% growth, call it about 40 points of margin erosion from COGS.', timestampMs: Date.now(), latencyMs: null },
      { id: 'x4', sessionId: 's1', turnIndex: 4, role: 'interviewer', text: 'You said about 40 points. How did you get there?', timestampMs: Date.now(), latencyMs: null });
    const { vetCheckerClaims } = await import('@/lib/orchestrator/math-checker');
    const { getCaseById } = await import('@/lib/cases/loader');
    const claims = vetCheckerClaims([corrected], { caseData: getCaseById('prof-001'), revealedIds: COSTS, shownExhibitIds: [], candidateTexts: [store.turns[3].text as string] });
    expect(claims[0].correctionLine).toBe('COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base.');
    store.events.push({ sessionId: 's1', category: 'math_checker', subtype: 'verdict', turnIndex: 3, phase: 'ANALYSIS', payloadJsonb: { candidateTurnIndex: 3, latencyMs: 6000, model: 'claude-sonnet-5-5', claims, codeFlags: [], stamps: [] } });
    await runTurn('s1', 'It is the gross pressure on the business.');
    expect(prompts.at(-1)).toContain('COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base.');
    expect((store.session.flagsJsonb as Row).mathChecker).toMatchObject({ closed: [expect.any(String)] });
  });
});
