// The math checker through the real runner (Plan → Stream → Settle → commit):
// the turn never waits for it, its verdict is written when it lands and read
// by the next turn, and an error has no effect. In-memory database, scripted
// interviewer model, a controlled checker. No API calls.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { INITIAL_STAGES } from '@/lib/orchestrator/stage-evidence';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { CheckerClaim, CheckerResult } from '@/lib/orchestrator/math-checker';
import { PHRASE_POOLS } from '@/lib/orchestrator/phrasing';

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
const { lineKey } = await import('@/lib/orchestrator/math-checker-live');

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

  // Batch-26 fix 2 (Jasmine 074b0534 t31): the model asked something else — code says the line, so it is booked as heard.
  it('the model leaves the line out: code says it, and the booking stands', async () => {
    await runTurn('s1', CLAIM);
    calls[0].resolve({ claims: [flaggedClaim], model: 'claude-sonnet-5-5', latencyMs: 6000, stopReason: 'end_turn' });
    await flush(); await flush();
    const r = await runTurn('s1', 'Next I would look at the competitive response.');
    expect(r.interviewerText).toContain('You said the whole 18 points sits in COGS. Which cost lines did you look at to get there?');
    expect(r.interviewerText).not.toContain('What would you look at next?');
    expect((store.session.flagsJsonb as Row).mathChecker).toEqual({ handled: ['3:0'] });
    expect(store.events).toContainEqual(expect.objectContaining({ category: 'check', subtype: 'checker_line', payloadJsonb: expect.objectContaining({ detail: expect.objectContaining({ by: 'code', heard: true }) }) }));
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
      flagsJsonb: { ...(store.session.flagsJsonb as Row), moves: { 4: 'brainstorm', 6: 'recommendation', 8: 'risk' }, stall: { recommendationDelivered: true }, stagesEnforced: { analysis: true, exhibit: true, brainstorm: true }, stageEvidence: { ...INITIAL_STAGES, brainstorm: { delivered: true, deliveredAt: 4, outcome: 'answered' as const }, recommendation: { delivered: true, deliveredAt: 6, asks: 1, outcome: 'answered' as const }, risk: { delivered: true, deliveredAt: 8 }, pending: 'risk' as const } },
    };
    const more = [
      { role: 'candidate', text: 'Ideas.' }, { role: 'interviewer', text: 'What else could they do?' },
      { role: 'candidate', text: 'More ideas.' }, { role: 'interviewer', text: 'What do you recommend?' },
      { role: 'candidate', text: `My recommendation is to raise menu prices. ${CLAIM}` }, { role: 'interviewer', text: 'What is the biggest risk?' },
    ];
    store.turns.push(...more.map((t, i) => ({ id: `x${i}`, sessionId: 's1', turnIndex: 3 + i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null })));
    store.exhibits = [{ id: 'e0', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: startedAt.getTime() }];   // required since 15 Oct
    const { vetCheckerClaims } = await import('@/lib/orchestrator/math-checker');
    const { getCaseById } = await import('@/lib/cases/loader');
    const claims = vetCheckerClaims([flaggedClaim], { caseData: getCaseById('prof-001'), revealedIds: COSTS, shownExhibitIds: [], candidateTexts: [more[4].text] });
    store.events.push({ sessionId: 's1', category: 'math_checker', subtype: 'verdict', turnIndex: 7, phase: 'RECOMMENDATION', payloadJsonb: { candidateTurnIndex: 7, latencyMs: 9000, model: 'claude-sonnet-5-5', claims, codeFlags: [], stamps: [] } });
    const r = await runTurn('s1', 'The biggest risk is volume loss; I would pilot it first.');
    expect(r.ended).toBe(false);
    expect(r.interviewerText).toContain('Before we wrap up — you said the whole 18 points sits in COGS. Which cost lines did you look at to get there?');
    // A final answer's hold (Lorenzo, 16 Oct): its own memory, the once-a-case counter untouched.
    expect((store.session.flagsJsonb as Row).recMathProbed).toBe(false);
    expect((store.session.flagsJsonb as Row).closeHold).toEqual({ probed: [{ key: 'checker:the whole 18 points', at: 9 }], probeTurns: [9] });
    // The redo, still wrong: it holds nothing and is not waited on — the case closes, the report has it.
    const r11 = await runTurn('s1', 'I looked at COGS. It is all 18 points in COGS.');
    expect(r11.ended).toBe(true);
  });
});

// Lorenzo, 16 Oct: the checker's line on a final answer, heard on a model turn, is that figure's one extra probe.
describe('a final answer\'s flag raised on a model turn', () => {
  beforeEach(seed);
  it('counts as its probe: at the close it is not probed again', async () => {
    const startedAt = new Date(Date.now() - 15 * 60_000);
    store.session = {
      ...store.session, phase: 'RECOMMENDATION', startedAt,
      flagsJsonb: { ...(store.session.flagsJsonb as Row), moves: { 4: 'brainstorm', 6: 'recommendation' }, stall: { recommendationDelivered: true }, stagesEnforced: { analysis: true, exhibit: true, brainstorm: true }, stageEvidence: { ...INITIAL_STAGES, brainstorm: { delivered: true, deliveredAt: 4, outcome: 'answered' as const }, recommendation: { delivered: true, deliveredAt: 6, asks: 1, outcome: 'answered' as const } } },
    };
    const more = [
      { role: 'candidate', text: 'Ideas.' }, { role: 'interviewer', text: 'What else could they do?' },
      { role: 'candidate', text: 'More ideas.' }, { role: 'interviewer', text: 'What do you recommend?' },
    ];
    store.turns.push(...more.map((t, i) => ({ id: `x${i}`, sessionId: 's1', turnIndex: 3 + i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null })));
    store.exhibits = [{ id: 'e0', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: startedAt.getTime() }];
    await runTurn('s1', `My recommendation is to raise menu prices. ${CLAIM}`);
    calls[0].resolve({ claims: [flaggedClaim], model: 'claude-sonnet-5-5', latencyMs: 6000, stopReason: 'end_turn' });
    await flush(); await flush();
    const r9 = await runTurn('s1', 'I would sequence pricing first, then procurement.');
    expect(r9.interviewerText).toContain('You said the whole 18 points sits in COGS.');
    expect((store.session.flagsJsonb as Row).closeHold).toEqual({ probed: [{ key: 'checker:the whole 18 points', at: 9 }] });
  });
});

// Lorenzo, 19 Oct (round-2 ruling 4): a root inherits the highest rating riding on it — its line, heard on a model
// turn, is the final answers' one extra probe when a claim built on it is in them, keyed by the root.
describe('a root whose rider is a final answer, raised on a model turn', () => {
  beforeEach(seed);
  it('counts as the root\'s probe in the final answers', async () => {
    const startedAt = new Date(Date.now() - 15 * 60_000);
    store.session = {
      ...store.session, phase: 'RECOMMENDATION', startedAt,
      flagsJsonb: { ...(store.session.flagsJsonb as Row), moves: { 4: 'brainstorm', 6: 'recommendation' }, stall: { recommendationDelivered: true }, stagesEnforced: { analysis: true, exhibit: true, brainstorm: true }, stageEvidence: { ...INITIAL_STAGES, brainstorm: { delivered: true, deliveredAt: 4, outcome: 'answered' as const }, recommendation: { delivered: true, deliveredAt: 6, asks: 1, outcome: 'answered' as const } } },
    };
    const PRICE = 'A 10% price increase recovers about 5 points of margin.';
    const REPLY = 'My recommendation is to raise menu prices, so margin goes 6 + 5 = 11%.';
    const more = [
      { role: 'candidate', text: 'Ideas.' }, { role: 'interviewer', text: 'What else could they do?' },
      { role: 'candidate', text: PRICE }, { role: 'interviewer', text: 'What do you recommend?' },
      { role: 'candidate', text: REPLY }, { role: 'interviewer', text: 'How would you sequence it?' },
    ];
    store.turns.push(...more.map((t, i) => ({ id: `x${i}`, sessionId: 's1', turnIndex: 3 + i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null })));
    store.exhibits = [{ id: 'e0', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: startedAt.getTime() }];
    const vetted = { flag: true, correctionLine: null, correctionFigure: null, pointerLine: null, vetNotes: [] };
    const root = { span: 'A 10% price increase recovers about 5 points of margin', quantity: 'margin gain', candidateValue: 'about 5 points', assumptions: '', verdict: 'error', correctValue: 8.5, correctLow: null, correctHigh: null,
      unit: 'points', derivation: '', errorType: 'conceptual', changesConclusion: false, confidence: 'high', probe: '', pointer: '', codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null }, actualShare: null,
      ...vetted, probeLine: 'You said a 10% price rise recovers about 5 points. Which cost lines did you include?' };
    const rider = { ...root, span: 'so margin goes 6 + 5 = 11%', quantity: 'new margin', candidateValue: '11%', correctValue: 14.5, changesConclusion: true,
      codeQuantity: { kind: 'new_margin', stepId: null, price: 10, target: null }, probeLine: 'Walk me through how you got to 11%.' };
    for (const [n, claims] of [[5, [root]], [7, [rider]]] as const) {
      store.events.push({ sessionId: 's1', category: 'math_checker', subtype: 'verdict', turnIndex: n, phase: 'RECOMMENDATION', payloadJsonb: { candidateTurnIndex: n, latencyMs: 6000, model: 'claude-sonnet-5-5', claims, codeFlags: [], stamps: [] } });
    }
    const r9 = await runTurn('s1', 'I would sequence pricing first, then procurement.');
    expect(r9.interviewerText).toContain('Which cost lines did you include?');
    expect((store.session.flagsJsonb as Row).closeHold).toEqual({ probed: [{ key: 'pricing:gain@5', at: 9 }] });
  });
});

// Lorenzo, 16 Oct (batches 23–28: 19 of 60 closed before the final answers were checked).
describe('a final answer not yet checked: the stage\'s follow-up, not the close', () => {
  beforeEach(seed);
  function atTheClose() {
    const startedAt = new Date(Date.now() - 17 * 60_000);
    store.session = {
      ...store.session, phase: 'RECOMMENDATION', startedAt,
      flagsJsonb: { ...(store.session.flagsJsonb as Row), lastQuestion: 'What is the biggest risk to that?', moves: { 4: 'brainstorm', 6: 'recommendation', 8: 'risk' }, stall: { recommendationDelivered: true }, stagesEnforced: { analysis: true, exhibit: true, brainstorm: true }, stageEvidence: { ...INITIAL_STAGES, brainstorm: { delivered: true, deliveredAt: 4, outcome: 'answered' as const }, recommendation: { delivered: true, deliveredAt: 6, asks: 1, outcome: 'answered' as const }, risk: { delivered: true, deliveredAt: 8 }, pending: 'risk' as const } },
    };
    const more = [
      { role: 'candidate', text: 'Ideas.' }, { role: 'interviewer', text: 'What else could they do?' },
      { role: 'candidate', text: 'More ideas.' }, { role: 'interviewer', text: 'What do you recommend?' },
      { role: 'candidate', text: 'My recommendation is to raise menu prices about 10%.' }, { role: 'interviewer', text: 'What is the biggest risk to that?' },
    ];
    store.turns.push(...more.map((t, i) => ({ id: `x${i}`, sessionId: 's1', turnIndex: 3 + i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null })));
    store.exhibits = [{ id: 'e0', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: startedAt.getTime() }];
    store.events.push({ sessionId: 's1', category: 'math_checker', subtype: 'verdict', turnIndex: 7, phase: 'RECOMMENDATION', payloadJsonb: { candidateTurnIndex: 7, latencyMs: 4000, model: 'claude-sonnet-5-5', claims: [], codeFlags: [], stamps: [] } });
  }
  const RISK = `Volume loss. ${CLAIM}`;
  it('the risk answer\'s verdict is out: code asks how they would guard against it; its verdict lands with a flag — probed once; the redo closes', async () => {
    atTheClose();
    const r9 = await runTurn('s1', RISK);
    expect(r9.ended).toBe(false);
    expect(PHRASE_POOLS.after_risk).toContain(r9.interviewerText);
    expect((store.session.flagsJsonb as Row).closeHold).toEqual({ waits: [9] });
    calls.at(-1)!.resolve({ claims: [flaggedClaim], model: 'claude-sonnet-5-5', latencyMs: 8000, stopReason: 'end_turn' });
    await flush(); await flush();
    const r11 = await runTurn('s1', 'I would pilot it in 20 stores and watch traffic weekly.');
    expect(r11.ended).toBe(false);
    expect(r11.interviewerText).toContain('Before we wrap up — you said the whole 18 points sits in COGS.');
    // The redo of code's probe holds nothing and is not waited on: the close.
    const r13 = await runTurn('s1', 'Still the whole 18 points, I think.');
    expect(r13.ended).toBe(true);
  });
  it('the verdict lands clean: the follow-up\'s answer closes the case', async () => {
    atTheClose();
    await runTurn('s1', RISK);
    calls.at(-1)!.resolve({ claims: [], model: 'claude-sonnet-5-5', latencyMs: 8000, stopReason: 'end_turn' });
    await flush(); await flush();
    const r11 = await runTurn('s1', 'I would pilot it in 20 stores and watch traffic weekly.');
    expect(r11.ended).toBe(true);
  });
  it('still out after the follow-up: the case closes (the follow-up is once an interview)', async () => {
    atTheClose();
    await runTurn('s1', RISK);
    const r11 = await runTurn('s1', 'I would pilot it in 20 stores and watch traffic weekly.');
    expect(r11.ended).toBe(true);
  });
  it('time up: no hold — the close', async () => {
    atTheClose();
    store.session = { ...store.session, startedAt: new Date(Date.now() - 20.5 * 60_000), flagsJsonb: { ...(store.session.flagsJsonb as Row), graceAskFired: true } };
    const r = await runTurn('s1', RISK);
    expect(r.ended).toBe(true);
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

// Lorenzo, 13 Oct (Step-4 rulings; Jordan 099f33e9 t25 — "about 40 points of
// pressure" again in his recommendation, corrected at t7): an error already
// corrected, or closed after two probes, gets one more flag when it comes back
// in the final recommendation — matched in code by the closed flag's figures
// in the unit they were said in; the checker's own verdict lands after the close.
describe('a closed error said again in the final recommendation: one flag', () => {
  beforeEach(seed);
  const KEY = 'cogs_dollar_impact';
  const CORRECTION = 'COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base.';
  const flagRow = (turnIndex: number, payload: Row) => ({ sessionId: 's1', category: 'math_checker', subtype: 'flag', turnIndex, phase: 'ANALYSIS', payloadJsonb: { candidateTurnIndex: turnIndex - 2, span: 'about 40 points of margin erosion', changesConclusion: true, key: KEY, ...payload } });
  const corrected = [flagRow(5, { id: '3:0', outcome: 'correct', reason: 'attempt 2', candidateValue: 'about 40 points', line: CORRECTION })];
  const leftForReport = [
    flagRow(5, { id: '3:0', outcome: 'probe', reason: 'attempt 1', candidateValue: 'about 40 points', line: 'Walk me through how you got to about 40 points.' }),
    flagRow(7, { id: '5:0', outcome: 'unresolved', reason: 'attempt 3: no correction code can write, no pointer — left for the report', candidateValue: '~40 points' }),
  ];
  const atRecommendation = (o: { events: Row[]; flags?: Row; minutes?: number; asked?: string }) => {
    const startedAt = new Date(Date.now() - (o.minutes ?? 17) * 60_000);
    store.session = {
      ...store.session, phase: 'RECOMMENDATION', startedAt,
      flagsJsonb: {
        ...(store.session.flagsJsonb as Row), moves: { 4: 'brainstorm', 8: 'risk' }, stagesEnforced: { analysis: true, exhibit: true, brainstorm: true },
        mathChecker: { handled: ['3:0', '5:0'], keys: { [KEY]: { figures: [40], since: 3 } }, closed: [KEY] }, ...o.flags,
      },
    };
    const more = [
      { role: 'candidate', text: 'From 42 to 58 is 38% growth, call it about 40 points of margin erosion from COGS.' }, { role: 'interviewer', text: 'Walk me through that.' },
      { role: 'candidate', text: 'Ideas.' }, { role: 'interviewer', text: 'What else could they do?' },
      { role: 'candidate', text: 'The biggest risk is volume.' }, { role: 'interviewer', text: o.asked ?? 'What would you recommend to the CEO?' },
    ];
    store.turns.push(...more.map((t, i) => ({ id: `x${i}`, sessionId: 's1', turnIndex: 3 + i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null })));
    store.events.push(...o.events);
  };
  const REC = "My recommendation: fix COGS first. It's carrying about 40 points of pressure on the business, so procurement and pricing together.";
  // The gate (16 Oct): code's line on the reply waits for the reply's verdict — the checker flags `flagged` in it — and goes out on the next turn.
  const replyThenNext = async (reply: string, flagged: string | null, correctValue = 16) => {
    await runTurn('s1', reply);
    calls.find(c => c.message === reply)?.resolve({ claims: flagged ? [{ ...flaggedClaim, span: flagged, candidateValue: flagged, correctValue, actualShare: null }] : [], model: 'm', latencyMs: 1, stopReason: 'end_turn' });
    await flush();
    return runTurn('s1', 'The biggest risk is losing customers to the chains.');
  };

  it('corrected before: code says its correction again and asks once whether the recommendation changes', async () => {
    atRecommendation({ events: corrected });
    const r = await replyThenNext(REC, 'about 40 points');
    expect(r.ended).toBe(false);
    expect(r.interviewerText).toMatch(/^COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base\. (Does that change your recommendation|Would that change your recommendation at all)\?$/);
    expect((store.session.flagsJsonb as Row).recMathProbed).toBe(true);
    // Its second saying (Lorenzo, 19 Oct, round-3 ruling 2): the key is restated — no restatement of it later.
    expect(((store.session.flagsJsonb as Row).mathChecker as Row).restated).toEqual([KEY]);
  });

  // Lorenzo, 19 Oct (round-3 ruling 2): "the 13 Oct recommendation re-correction counts as the restatement, so a
  // correction is said at most twice in total" (b29 Jordan ea27d1f6: t8, t10, then t20 — the line a third time).
  describe('a correction is said at most twice in total', () => {
    const ROOT = 'cogs_dollar_impact@38';
    const memory = (extra: Row = {}) => ({ mathChecker: { handled: ['3:0', '5:0'], keys: { [KEY]: { figures: [40], since: 3 }, [ROOT]: { figures: [38], since: 1 } }, closed: [KEY, ROOT],
      corrected: { [ROOT]: { line: CORRECTION, figure: '16' }, [KEY]: { line: CORRECTION } }, ...extra } });
    it('the re-correction heard: its key and every key whose line it said word for word are restated', async () => {
      atRecommendation({ events: corrected, flags: memory({ said: { [lineKey(CORRECTION)]: 1 } }) });
      const r = await replyThenNext(REC, 'about 40 points');
      expect(r.interviewerText).toMatch(/^COGS rose 16 points/);
      expect(((store.session.flagsJsonb as Row).mathChecker as Row).restated).toEqual(expect.arrayContaining([KEY, ROOT]));
      // …and its line counted (the controller's ruling on concern 1): said once before, now twice.
      expect(((store.session.flagsJsonb as Row).mathChecker as Row).said).toEqual({ [lineKey(CORRECTION)]: 2 });
    });
    it('its line said twice already (per line, whatever the keys): no re-correction', async () => {
      atRecommendation({ events: corrected, flags: memory({ said: { [lineKey(CORRECTION)]: 2 } }) });
      const r = await replyThenNext(REC, 'about 40 points');
      expect(r.interviewerText).not.toMatch(/COGS rose 16 points|Before we wrap up/);
    });
    it('its key restated already: no re-correction', async () => {
      atRecommendation({ events: corrected, flags: memory({ restated: [KEY] }) });
      const r = await replyThenNext(REC, 'about 40 points');
      expect(r.interviewerText).not.toMatch(/COGS rose 16 points|Before we wrap up/);
      expect((store.session.flagsJsonb as Row).recMathProbed).toBeFalsy();
    });
    it('another key restated with the same line (the b29 root): no re-correction — that line was said twice', async () => {
      atRecommendation({ events: corrected, flags: memory({ restated: [ROOT] }) });
      const r = await replyThenNext(REC, 'about 40 points');
      expect(r.interviewerText).not.toMatch(/COGS rose 16 points|Before we wrap up/);
    });
  });

  it('left for the report: one neutral probe on the figure, before the case moves on', async () => {
    atRecommendation({ events: leftForReport });
    const r = await replyThenNext(REC, 'about 40 points');
    expect(r.interviewerText).toBe('Before we wrap up — walk me through how you got to 40 points.');
    expect((store.session.flagsJsonb as Row).recMathProbed).toBe(true);
    // A probe says no correction: nothing restated.
    expect(((store.session.flagsJsonb as Row).mathChecker as Row).restated).toBeUndefined();
  });

  it("the reply's own verdict doesn't flag it: no line (the gate, 16 Oct)", async () => {
    atRecommendation({ events: corrected });
    const r = await replyThenNext(REC, null);
    expect(r.interviewerText).not.toMatch(/COGS rose 16 points|Before we wrap up/);
  });

  it('another figure in the same unit is not the error ("16 points")', async () => {
    atRecommendation({ events: corrected });
    const r = await replyThenNext('My recommendation: fix COGS first. It cost us 16 points of margin, so procurement and pricing together.', '16 points');
    expect(r.interviewerText).not.toMatch(/COGS rose 16 points|Before we wrap up/);
  });

  it("the correction is the closed flag's own, not another flag's", async () => {
    const other = flagRow(9, { id: '7:0', outcome: 'correct', reason: 'attempt 2', candidateValue: 'about 5 points', line: 'A 10% price rise lifts margin about 8.5 points, not 5.', key: 'pricing:gain' });
    atRecommendation({ events: [other, ...corrected] });
    const r = await replyThenNext(REC, 'about 40 points');
    expect(r.interviewerText).toMatch(/^COGS rose 16 points/);
  });

  it("code's figure in the correction is licensed again (8.5 is no revealed figure)", async () => {
    const gain = [flagRow(5, { id: '3:0', outcome: 'correct', reason: 'attempt 2', candidateValue: 'about 5 points', line: 'A 10% price rise lifts margin about 8.5 points, not 5.', key: 'pricing:gain' })];
    atRecommendation({ events: gain, flags: { mathChecker: { handled: ['3:0'], keys: { 'pricing:gain': { figures: [5], since: 3 } }, closed: ['pricing:gain'] } } });
    const r = await replyThenNext('My recommendation: raise menu prices. That gets us about 5 points back, and procurement does the rest.', 'about 5 points', 8.5);
    expect(r.interviewerText).toMatch(/^A 10% price rise lifts margin about 8\.5 points, not 5\. (Does that change your recommendation|Would that change your recommendation at all)\?$/);
  });

  it('the figure in another unit is not the error ("inputs ran 40%")', async () => {
    atRecommendation({ events: corrected });
    const r = await replyThenNext('My recommendation: fix COGS first. Inputs ran 40%, so procurement and pricing together.', '40%');
    expect(r.interviewerText).not.toMatch(/COGS rose 16 points|Before we wrap up/);
  });

  it('once a case: after one recommendation flag, the next goes on normally', async () => {
    atRecommendation({ events: corrected, flags: { recMathProbed: true } });
    const r = await replyThenNext(REC, 'about 40 points');
    expect(r.interviewerText).not.toMatch(/COGS rose 16 points|Before we wrap up/);
  });

  it('only in the reply to a recommendation ask', async () => {
    atRecommendation({ events: corrected, asked: 'What else would you look at?' });
    const r = await replyThenNext(REC, 'about 40 points');
    expect(r.interviewerText).not.toMatch(/COGS rose 16 points|Before we wrap up/);
  });

  it('not when time is up (Jordan t25: the close came at time-up) — the rule is unchanged', async () => {
    atRecommendation({ events: corrected, minutes: 21, flags: { graceAskFired: true } });
    const r = await runTurn('s1', REC);
    expect(r.ended).toBe(true);
    expect(r.interviewerText).not.toMatch(/COGS rose 16 points|Before we wrap up/);
  });
});
