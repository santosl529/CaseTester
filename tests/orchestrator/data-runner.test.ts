// Data-request fixes through the real runner (Rule 11, v4.10): a qualified
// re-ask at the close (Tyler, batch 18), unmapped asks held by the gate and
// handed back once it closes (KF-4), and the exhibit shown for its data.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import saved from './fixtures/batch18-exit.json';

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
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async (p: { candidateText: string }) => (p.candidateText in deferChecks ? deferChecks[p.candidateText] : classified.shift() ?? []) }));
// The item-less deferral check (engine-asks R1) is asked with the ask's own words.
const deferChecks: Record<string, unknown> = {};
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

const fx = saved as unknown as { 'tyler-t19': { candidate: string; revealed: string[] } };
const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What would you look at next?', ...over });
const ALL_COVERED = { structure: 90, quantitative: 90, dataExhibit: 90, judgment: 90, creativity: 90, synthesis: 90, communication: 90, pushback: 90 };
const STAGES = {
  structure: { delivered: true, outcome: 'answered' }, pressure_test: { delivered: true, outcome: 'answered' }, analysis: { delivered: true, outcome: 'answered' },
  exhibit: { delivered: true, outcome: 'answered' }, brainstorm: { delivered: true, outcome: 'answered' }, recommendation: { delivered: true, outcome: 'answered' },
  risk: { delivered: true }, pending: 'risk',
};

function seed(p: { phase: string; turns?: { role: string; text: string }[]; flags?: Row; revealed?: string[]; exhibits?: string[]; elapsedMin?: number; coverage?: Row | null }) {
  const startedAt = new Date(Date.now() - (p.elapsedMin ?? 8) * 60_000);
  const turns = p.turns ?? [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Revenue and costs.' }, { role: 'interviewer', text: 'Go on.' }];
  store.session = {
    id: 's1', userId: 'u1', caseId: 'prof-001', phase: p.phase, elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
    abandonPhase: null, startedAt, completedAt: null, coverageJsonb: p.coverage ?? null, flagsJsonb: { conduct: { warnings: 0 }, ...p.flags },
  };
  store.turns = turns.map((t, i) => ({ id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null }));
  store.revealed = (p.revealed ?? []).map((ledgerItemId, i) => ({ id: `r${i}`, sessionId: 's1', ledgerItemId, revealedAtMs: startedAt.getTime() }));
  store.exhibits = (p.exhibits ?? []).map((exhibitId, i) => ({ id: `e${i}`, sessionId: 's1', exhibitId, shownAtMs: startedAt.getTime() })); store.events = [];
}
const flags = () => store.session.flagsJsonb as Row;
async function say(text: string, model?: ModelTurn) {
  modelQueue.length = 0;
  if (model) modelQueue.push(model, model);
  return runTurn('s1', text, {});
}

beforeEach(() => { modelQueue.length = 0; prompts.length = 0; classified.length = 0; judgeVerdict = null; distressVerdict = () => ({ label: 'none', reason: '' }); });

describe('a qualified re-ask is not answered with the unqualified figures', () => {
  it('Tyler t19 (batch 18): "the variable-versus-fixed split within COGS and labor" at the close → declined by name, not "As I mentioned: COGS is 58%…"', async () => {
    seed({ phase: 'RECOMMENDATION', elapsedMin: 14, coverage: ALL_COVERED, revealed: fx['tyler-t19'].revealed, exhibits: ['exhibit-a'],
      turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Inputs drove it.' }, { role: 'interviewer', text: "What's your recommendation to the client?" },
        { role: 'candidate', text: 'Raise prices 10%.' }, { role: 'interviewer', text: "What's the biggest risk to that recommendation, and how would you test for it?" }],
      flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false }, stageEvidence: STAGES,
        stall: { ladderLevel: 0, consecutiveNoProgress: 0, consecutiveClarify: 0, lastCandidateQuestion: null, recommendationDelivered: true } } });
    // What the classifier mapped it to in batch 18.
    classified.push([{ what: 'Variable-versus-fixed cost split within COGS and labor', ledgerItemIds: ['cogs_pct', 'labor_pct'], explicit: true, response: 'release' }]);
    const r = await say(fx['tyler-t19'].candidate);
    expect(r.ended).toBe(true);
    expect(r.interviewerText).toMatch(/I don't have variable-versus-fixed cost split within COGS and labor\./);
    expect(r.interviewerText).not.toMatch(/As I mentioned|COGS is 58%/);
    expect(r.interviewerText).not.toMatch(/That's (our )?time/);      // the case ended because it was done, not at time-up
  });

  it('an unqualified re-ask of released data is restated, without a new reveal', async () => {
    seed({ phase: 'ANALYSIS', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } } });
    const before = store.revealed.length;
    const r = await say('Sorry, can you give me the COGS figure again?', T({ requests: [{ what: 'the COGS figure', itemIds: ['cogs_pct'], explicit: true, respond: 'release' }] }));
    expect(r.interviewerText).toMatch(/As I mentioned: COGS is 58% of revenue today, up from 42% two years ago\./);
    expect(store.revealed.length).toBe(before);
  });
});

describe('KF-4: an ask the case may not hold, made while the structure is open', () => {
  it('is named in the deferral when the check has no verdict, and is put back to the interviewer once when the gate closes', async () => {
    deferChecks['marketing spend and store square footage'] = null;
    seed({ phase: 'STRUCTURE', flags: { pressureTest: { state: 'awaiting', askedAt: 2, probe: 'Is that MECE?', intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false, awaitingReplies: 0, followUps: [] } } });
    judgeVerdict = { answered: false, reason: '' };
    const held = await say('Could I get marketing spend and store square footage?', T({ requests: [{ what: 'marketing spend and store square footage', itemIds: [], explicit: true, respond: 'defer' }] }));
    // 19 Oct (engine-asks R1): the generic "settle your structure" line answered nothing; the deferral names the ask, promising no item.
    expect(held.interviewerText).toMatch(/marketing spend and store square footage/);
    expect(held.interviewerText).not.toMatch(/Let's settle your structure before we get into the data|I don't have/);
    // The probe is answered: the gate closes, the unmapped ask is queued for the next turn.
    judgeVerdict = { answered: true, reason: 'names a missing branch' };
    await say("It's missing a competitor branch; I'd add it under revenue.", T());
    expect(flags().unmappedToResolve).toEqual(['marketing spend and store square footage']);
    await say('So costs first.', T());
    expect(prompts.at(-1)).toMatch(/ASKED EARLIER, NOT ANSWERED YET[\s\S]*"marketing spend and store square footage"/);
    expect(flags().unmappedToResolve).toEqual([]);                    // presented once
  });
});

describe('the exhibit is shown for the data it covers', () => {
  it('an ask for the cost breakdown after the structure is settled gets the exhibit, not the values read aloud', async () => {
    seed({ phase: 'ANALYSIS', flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false } } });
    const r = await say('Can I see the cost breakdown for both years?', T({ requests: [{ what: 'the cost breakdown', itemIds: ['cogs_pct', 'labor_pct', 'overhead_pct'], explicit: true, respond: 'release' }], question: 'What does it tell you?' }));
    expect(r.exhibit?.id).toBe('exhibit-a');
    expect(r.interviewerText).toMatch(/^Here's an exhibit: Brew & Bean Cost Structure Over Time\. What does it tell you\?$/);
    expect(store.revealed.map(x => x.ledgerItemId).sort()).toEqual(['cogs_pct', 'labor_pct', 'overhead_pct']);
    expect((flags().stageEvidence as Row).exhibit).toMatchObject({ delivered: true });
  });
});

// Fact guards Phase 5: code's line back to the core analysis.
describe('the analysis turn', () => {
  it("140fb90d replay: code's analysis turn whose own data line completes the analysis asks about the figures instead", async () => {
    seed({ phase: 'RECOMMENDATION', elapsedMin: 13, coverage: ALL_COVERED, revealed: ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs'], exhibits: ['exhibit-a'],
      turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Beans.' }, { role: 'interviewer', text: "What's your recommendation to the client?" },
        { role: 'candidate', text: 'Raise prices 8% in a pilot.' }, { role: 'interviewer', text: "What's the biggest risk to that recommendation?" }],
      flags: { pressureTest: { state: 'satisfied', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false }, stall: { ladderLevel: 0, consecutiveNoProgress: 0, consecutiveClarify: 0, lastCandidateQuestion: null, recommendationDelivered: true } } });
    classified.push([{ what: 'other input price change', ledgerItemIds: ['non_bean_input_change'], explicit: true, response: 'release' }]);
    const r = await say('Volume loss. Can I get the price change for the other inputs?');
    expect(r.interviewerText).toMatch(/up 37\.5%/);
    expect(r.interviewerText).not.toMatch(/hold the recommendation/);
    expect(r.interviewerText).toMatch(/\?$/);
    expect(((store.session.flagsJsonb as Row).stagesEnforced as Row).analysis).toBe(true);
  });

});
