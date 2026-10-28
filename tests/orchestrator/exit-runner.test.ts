// Round-3 fixes through the real runner (Plan → Stream → Settle → commit)
// with an in-memory store and scripted model, distress and judges — saved
// batch-18 lines where they exist (tests/orchestrator/fixtures/batch18-exit.json).
// Candidate exit (Rule 18A), distress after a decline (Rule 17-C5), required
// stages before a normal end (Rule 9), the closing line, meta answers, and a
// stale turn after End.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import saved from './fixtures/batch18-exit.json';

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
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/hint-check', async orig => ({ ...(await orig<object>()), checkHintDelivered: async () => null }));

const modelQueue: ModelTurn[] = [];
let onModel: () => void = () => {};
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    createInterviewerModel: () => ({
      runTurn: async () => modelQueue[0],
      streamTurn: () => {
        onModel();
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
  judgeStructureGiven: async () => ({ given: false, reason: '' }),
}));

const { runTurn } = await import('@/lib/orchestrator/session-runner');

const fx = saved as unknown as {
  'cole-t7': { candidate: string; phase: string; revealed: string[]; shownExhibits: string[]; pressureTest: Row; priorTurns: { role: string; text: string }[]; model: ModelTurn };
  victor: { opening: string; lines: string[]; models: ModelTurn[] };
  'victor-goodbyes': string[];
  'sam-t25': { candidate: string; disclosure: string; t27: string; priorTurns: { role: string; text: string }[] };
};

const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What would you look at next?', ...over });
const SATISFIED = { state: 'satisfied', askedAt: 2, satisfiedAt: 3, intents: ['mece'], reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false };
const ALL_COVERED = { structure: 90, quantitative: 90, dataExhibit: 90, judgment: 90, creativity: 90, synthesis: 90, communication: 90, pushback: 90 };

function seed(p: { phase: string; turns: { role: string; text: string }[]; flags?: Row; revealed?: string[]; exhibits?: string[]; elapsedMin?: number; coverage?: Row | null }) {
  const startedAt = new Date(Date.now() - (p.elapsedMin ?? 8) * 60_000);
  store.session = {
    id: 's1', userId: 'u1', caseId: 'prof-001', phase: p.phase, elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
    abandonPhase: null, startedAt, completedAt: null, coverageJsonb: p.coverage ?? null,
    flagsJsonb: { conduct: { warnings: 0 }, ...p.flags },
  };
  store.turns = p.turns.map((t, i) => ({ id: `t${i}`, sessionId: 's1', turnIndex: i, role: t.role, text: t.text, timestampMs: startedAt.getTime() + i * 20_000, latencyMs: null }));
  store.revealed = (p.revealed ?? []).map((ledgerItemId, i) => ({ id: `r${i}`, sessionId: 's1', ledgerItemId, revealedAtMs: startedAt.getTime() }));
  // A stage record whose exhibit went out implies its row (prof-001's exhibit is required since 15 Oct, read from the rows).
  const shownByRecord = ((p.flags?.stageEvidence as Row | undefined)?.exhibit as Row | undefined)?.delivered ? ['exhibit-a'] : [];
  store.exhibits = (p.exhibits ?? shownByRecord).map((exhibitId, i) => ({ id: `e${i}`, sessionId: 's1', exhibitId, shownAtMs: startedAt.getTime() }));
  store.events = [];
}
const flags = () => store.session.flagsJsonb as Row;
const ev = (subtype: string, category = 'intervention') => store.events.filter(e => e.subtype === subtype && e.category === category);
async function say(text: string, model?: ModelTurn) {
  modelQueue.length = 0;
  if (model) modelQueue.push(model, model);
  return runTurn('s1', text, {});
}

beforeEach(() => {
  modelQueue.length = 0; distressCalls.length = 0; onModel = () => {};
  distressVerdict = () => ({ label: 'none', reason: '' });
});

describe('Rule 18A — the candidate stops', () => {
  it('Cole t7 (batch 18): "honestly can we just stop" mid-case ends it — no case question, a partial report, the request never graded', async () => {
    const c = fx['cole-t7'];
    seed({ phase: c.phase, turns: [{ role: 'interviewer', text: 'Prompt' }, ...c.priorTurns], revealed: c.revealed, flags: { pressureTest: c.pressureTest } });
    const r = await say(c.candidate, c.model);
    expect(r.interviewerText).toBe("Understood — we'll stop here. You'll get written feedback on what we covered.");
    expect(r.interviewerText).not.toMatch(/\?/);
    expect(r).toMatchObject({ ended: true });
    expect(r.scoringSuppressed).toBeFalsy();
    expect(store.session.status).toBe('completed');
    expect(flags()).toMatchObject({ endReason: 'candidate_stop', partial: true });
    expect(ev('candidate_exit')[0]?.payloadJsonb).toMatchObject({ decision: 'stop', report: true, partial: true });
    expect(modelQueue).toHaveLength(2);                    // the interviewer model was never called
  });

  it('a distressed "can we stop" gets the C5 offer (which includes stopping), not a plain close', async () => {
    const c = fx['cole-t7'];
    seed({ phase: c.phase, turns: [{ role: 'interviewer', text: 'Prompt' }, ...c.priorTurns], revealed: c.revealed, flags: { pressureTest: c.pressureTest } });
    distressVerdict = () => ({ label: 'distress', reason: 'despair beyond the case' });
    const r = await say("I can't keep doing this, nothing is working in my life. Can we just stop?");
    expect(r.interviewerText).toMatch(/are you okay\?/);
    expect(r.ended).toBe(false);
    expect(store.session.status).toBe('active');
  });

  it('Victor (batch 18): refusals to start are bounded — three asks, an offer to stop, then the end; no report; bare goodbyes never read as distress', async () => {
    const v = fx.victor;
    seed({ phase: 'INTRO', turns: [{ role: 'interviewer', text: v.opening }] });
    const heard: string[] = [];
    for (let i = 0; i < v.lines.length && store.session.status === 'active'; i++) {
      const r = await say(v.lines[i], v.models[i] ?? T({ question: 'How would you structure your approach?' }));
      heard.push(r.interviewerText);
    }
    // Offer after the third refusal, end after the next.
    const offerAt = heard.findIndex(h => /Do you want to stop the interview here\?/.test(h));
    expect(offerAt).toBeGreaterThanOrEqual(0);
    expect(store.session.status).not.toBe('active');
    expect(heard.at(-1)).toBe("We'll end the session here. You can start a new case whenever you're ready.");
    expect(store.session.status).toBe('abandoned');
    expect(flags()).toMatchObject({ endReason: 'declined' });
  });

  it('Victor t37 / t87: a bare goodbye gets one clarifying question, no distress check, no case question; the second is honoured', async () => {
    seed({ phase: 'STRUCTURE', turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Hi.' }, { role: 'interviewer', text: 'How would you approach this?' }] });
    // What the model layer said about each bare goodbye in batch 18.
    distressVerdict = p => (/goodbye|done here/i.test(p.candidateText) ? { label: 'distress', reason: 'abrupt goodbye may signal distress' } : { label: 'none', reason: '' });
    const first = await say(fx['victor-goodbyes'][0]);           // "It won't. Done here."
    expect(first.interviewerText).toMatch(/^Do you want to stop the interview here\?/);
    expect(first.interviewerText).toMatch(/there wouldn't be a report/);
    const second = await say('No.', T({ question: 'How would you approach this?' }));   // "No" to "do you want to stop?" = keep going
    expect(second.ended).toBe(false);
    const third = await say(fx['victor-goodbyes'][2]);             // "Goodbye."
    expect(third.ended).toBe(true);
    expect(third.interviewerText).not.toMatch(/are you okay/);
    expect(store.session.status).toBe('abandoned');
    expect(distressCalls.map(c => c.candidateText)).toEqual(['No.']);   // never a bare goodbye
  });

  it('"let\'s move on", "give me a sec" and "I\'m done" after a calculation never end or clarify', async () => {
    seed({ phase: 'ANALYSIS', turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Revenue and costs.' }, { role: 'interviewer', text: 'Go on.' }], flags: { pressureTest: SATISFIED } });
    for (const line of ["Let's move on to costs.", 'Give me a sec.', "So 25% of 42 is 10.5 points, and up 40% that's 4.2. I'm done."]) {
      const r = await say(line, T());
      expect(r.ended).toBe(false);
      expect(r.interviewerText).not.toMatch(/stop the interview/);
    }
  });
});

describe('Rule 17-C5 — after the candidate chose to continue', () => {
  const samSeed = (extra: Row = {}) => {
    const s = fx['sam-t25'];
    seed({
      phase: 'RECOMMENDATION', turns: [{ role: 'interviewer', text: 'Prompt' }, ...s.priorTurns], elapsedMin: 13, coverage: ALL_COVERED,
      revealed: ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'non_bean_input_change', 'bean_price_change', 'menu_price_change'],
      flags: {
        pressureTest: SATISFIED, stall: { ladderLevel: 0, consecutiveNoProgress: 0, consecutiveClarify: 0, lastCandidateQuestion: null, recommendationDelivered: true },
        conduct: { warnings: 0, distressDeclined: { disclosure: s.disclosure, atTurn: 13 } },
        stageEvidence: { structure: { delivered: true, outcome: 'answered' }, pressure_test: { delivered: true, outcome: 'answered' }, analysis: { delivered: true, outcome: 'answered' },
          exhibit: { delivered: true, outcome: 'answered' }, brainstorm: { delivered: true, outcome: 'answered' }, recommendation: { delivered: true, outcome: 'answered' }, risk: { delivered: true, outcome: 'answered' }, pending: null },
        ...extra,
      },
    });
  };

  it('Sam t25 (batch 18): "I\'m glad I kept going" — the screen is told the earlier disclosure, no second offer, the finished case closes with its report', async () => {
    samSeed();
    distressVerdict = p => (p.earlier ? { label: 'none', reason: 'relief, no new signal' } : { label: 'distress', reason: 'hints at past hopelessness' });
    const r = await say(fx['sam-t25'].candidate, T({ question: 'Anything to add?' }));
    expect(distressCalls[0]?.earlier?.disclosure).toBe(fx['sam-t25'].disclosure);
    expect(r.interviewerText).not.toMatch(/are you okay/);
    expect(r.ended).toBe(true);
    expect(store.session.status).toBe('completed');
    expect(r.interviewerText).toMatch(/^(We've covered everything I wanted to|That covers what I wanted to get to)\./);
  });

  it('a new, worse signal after a decline still gets the offer', async () => {
    samSeed({ stall: { ladderLevel: 0, consecutiveNoProgress: 0, consecutiveClarify: 0, lastCandidateQuestion: null, recommendationDelivered: false } });
    store.session.coverageJsonb = null;
    distressVerdict = () => ({ label: 'risk_to_self', reason: 'new: hopelessness about life' });
    const r = await say("Honestly it's worse now. I don't see the point of anything anymore.", T());
    expect(r.interviewerText).toMatch(/988/);
  });

  it('accepting a late offer on a finished case keeps the report (completed, not abandoned)', async () => {
    samSeed({ conduct: { warnings: 0, distressOffered: true, distressDisclosure: 'x' } });
    const r = await say('Yes, let\'s stop there please.');
    expect(r.ended).toBe(true);
    expect(r.scoringSuppressed).toBe(false);
    expect(store.session.status).toBe('completed');
  });

  it('Sam t27: "…nothing left to pause for" declines the offer — it does not accept it', async () => {
    samSeed({ conduct: { warnings: 0, distressOffered: true, distressDisclosure: 'x' }, stageEvidence: undefined, stall: undefined });
    store.session.coverageJsonb = null;
    const r = await say(fx['sam-t25'].t27, T());
    expect(ev('C5_accept')).toHaveLength(0);
    expect(r.interviewerText).not.toMatch(/We'll stop here — nothing about this counts against you/);
  });
});

// Batch 39, aldermoor p07 35740806 t19 (Lorenzo's ruling, 26 Oct): after the C5 script, "I'm okay … I'd like to
// finish. If it's useful, I can give the recommendation now" was classified `intent: stop` and the case closed in
// the EXHIBIT phase with no exhibit-2, brainstorm, recommendation or risk stage. After a pause offer this path never
// closes the case: an explicit accept is taken above (isPauseAccepted), and anything else asks once at most.
describe("Rule 17-C5 — the reply to a pause offer never closes the case", () => {
  const midCase = (extra: Row = {}) => seed({
    phase: 'ANALYSIS', elapsedMin: 11,
    turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'COGS went from 42 to 58.' }, { role: 'interviewer', text: 'Go on.' }],
    revealed: ['cogs_pct', 'labor_pct'],
    flags: { pressureTest: SATISFIED, conduct: { warnings: 0, distressOffered: true, distressDisclosure: 'x' }, ...extra },
  });
  const p07t19 = "I appreciate you checking, genuinely — but I'm okay. I think something got crossed; nothing I said was meant that way. I'm just locked into the numbers here. I was rough at the start and that rattled me a bit, but I've found my footing and I'd like to finish.\n\nIf it's useful, I can give the recommendation now.";

  it('p07 t19: the case carries on — no close, no 988 script, the model turn runs', async () => {
    midCase();
    const r = await say(p07t19, T({ question: 'Which input inside COGS moved most?' }));
    expect(r.ended).toBe(false);
    expect(store.session.status).toBe('active');
    expect(r.interviewerText).not.toMatch(/we'll stop here/i);
    expect(r.interviewerText).not.toMatch(/988/);
    expect(r.interviewerText).toMatch(/Which input inside COGS moved most\?/);
    expect(ev('candidate_exit')).toHaveLength(0);
  });

  it.each(["I'm okay, let's keep going.", "No — keep going.", "I'd like to finish."])('%s resumes the case', async text => {
    midCase();
    const r = await say(text, T({ question: 'Where would you look next?' }));
    expect(r.ended).toBe(false);
    expect(ev('candidate_exit')).toHaveLength(0);
  });

  it('an ambiguous sign-off after the offer asks once and never closes', async () => {
    midCase();
    const first = await say('Done here.', T());
    expect(first.ended).toBe(false);
    expect(first.interviewerText).toMatch(/^Do you want to stop the interview here\?/);
    expect((flags().exit as Row)).toMatchObject({ pending: 'ambiguous', clarified: true });
  });

  it('with the clarification already used, an ambiguous sign-off after the offer still does not close', async () => {
    midCase({ exit: { clarified: true } });
    const r = await say('Done here.', T({ question: 'Where would you look next?' }));
    expect(r.ended).toBe(false);
    expect(store.session.status).toBe('active');
  });

  it('an explicit accept of the offer still closes (unchanged)', async () => {
    midCase();
    const r = await say("Yes, let's stop there please.");
    expect(r.ended).toBe(true);
    expect(ev('C5_accept', 'conduct')).toHaveLength(1);
  });
});

const STAGES_OWED_BRAINSTORM = {
  structure: { delivered: true, outcome: 'answered' }, pressure_test: { delivered: true, outcome: 'answered' }, analysis: { delivered: true, outcome: 'answered' },
  exhibit: { delivered: true, outcome: 'answered' }, brainstorm: { delivered: false }, recommendation: { delivered: false }, risk: { delivered: false }, pending: null,
};

describe('Rule 9 — required stages before a normal end, and the closing line', () => {
  const endDue = (stageEvidence: Row, elapsedMin = 13) => seed({
    phase: 'RECOMMENDATION', elapsedMin, coverage: ALL_COVERED,
    // The recommendation asked for, and the COGS inputs out (fact guards Phase 5: no close before either).
    turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Beans and dairy drove it.' }, { role: 'interviewer', text: "What's your recommendation to the client?" },
      { role: 'candidate', text: 'Raise prices 8% in a pilot.' }, { role: 'interviewer', text: "What's the biggest risk to that recommendation, and how would you test for it?" }],
    revealed: ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change'],
    flags: { pressureTest: SATISFIED, stall: { ladderLevel: 0, consecutiveNoProgress: 0, consecutiveClarify: 0, lastCandidateQuestion: null, recommendationDelivered: true }, stageEvidence },
  });
  const STAGES = (over: Row = {}) => ({
    structure: { delivered: true, outcome: 'answered' }, pressure_test: { delivered: true, outcome: 'answered' }, analysis: { delivered: true, outcome: 'answered' },
    exhibit: { delivered: true, outcome: 'answered' }, brainstorm: { delivered: true, outcome: 'answered' }, recommendation: { delivered: true, outcome: 'answered' },
    risk: { delivered: true }, pending: 'risk', ...over,
  });

  it('Spencer (batch 18): the case would close with the brainstorm never asked — code asks it first, once; then the close says "covered everything", not "time"', async () => {
    endDue(STAGES({ brainstorm: { delivered: false } }));
    const asked = await say('Volume loss — I would pilot in 20 stores.');
    expect(asked.ended).toBe(false);
    expect(asked.interviewerText).toMatch(/(what else could the client do|other levers could the client pull|what else could the client do to protect margin)\?/i);
    expect((flags().stageEvidence as Row).brainstorm).toMatchObject({ delivered: true, codeAsked: true });
    const closed = await say("I'd rather not — I think price is it.");
    expect(closed.ended).toBe(true);
    expect(closed.interviewerText).not.toMatch(/That's (our )?time/);
    expect((flags().stageEvidence as Row).brainstorm).toMatchObject({ outcome: 'declined' });
  });

  it('Raj (batch 18): the exhibit never shown — code hands it over and asks about it before the end', async () => {
    endDue(STAGES({ exhibit: { delivered: false } }));
    const r = await say('Volume loss — I would pilot in 20 stores.');
    expect(r.exhibit?.id).toBe('exhibit-a');
    expect(r.interviewerText).toMatch(/Here's an exhibit: Brew & Bean Cost Structure Over Time\. What (does this exhibit tell you|do you take from this exhibit)\?/);
  });

  it('under time pressure the recommendation comes first: no stage is forced, and the close at time-up says "That\'s time"', async () => {
    endDue(STAGES({ brainstorm: { delivered: false } }), 20.2);
    const r = await say('Volume loss — I would pilot in 20 stores.');
    expect(r.ended).toBe(true);
    expect(r.interviewerText).toMatch(/^That's (our )?time\./);
    expect((flags().stageEvidence as Row).brainstorm).toMatchObject({ outcome: 'time_up' });
  });

  it("the model's own early recommendation ask waits for an owed brainstorm", async () => {
    seed({ phase: 'ANALYSIS', turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'COGS drove 16 of the 18 points.' }, { role: 'interviewer', text: 'Go on.' }],
      revealed: ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'bean_price_change'], flags: { pressureTest: SATISFIED, stageEvidence: STAGES({ brainstorm: { delivered: false }, recommendation: { delivered: false }, risk: { delivered: false }, pending: null }) } });
    const r = await say('So it is input inflation they never priced for.', T({ move: 'recommendation', question: "What's your recommendation to the CEO?" }));
    expect(r.interviewerText).not.toMatch(/recommendation to the CEO/);
    expect(r.interviewerText).toMatch(/what else could the client do|other levers|protect margin/);
    expect(ev('stage_hold', 'check')[0]?.payloadJsonb).toMatchObject({ decision: 'act' });
  });
});

// Fact guards Phase 5 (batch 20 D7): no call for the conclusion before the
// core analysis (two of the three COGS inputs out) or an owed brainstorm.
describe('the recommendation waits for the core analysis', () => {
  const ANALYSIS_ASK = "Let's hold the recommendation for now: what's driving the margin drop, and what would you need to know to pin it down?";
  // Lorenzo, 13 Oct (Blake ac38cd28 t18, Jasmine 35897f4a t22): the lead only when a recommendation is in play.
  const ANALYSIS_PLAIN = "What's driving the margin drop, and what would you need to know to pin it down?";
  const COST_LINES = ['cogs_pct', 'labor_pct', 'overhead_pct'];
  const early = (flags: Row = {}, revealed = COST_LINES) => seed({ phase: 'ANALYSIS', turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'COGS drove 16 of the 18 points.' }, { role: 'interviewer', text: 'Go on.' }],
    revealed, exhibits: ['exhibit-a'], flags: { pressureTest: SATISFIED, ...flags } });
  const LEVER = T({ move: 'other', question: 'Of everything you proposed, which single lever would you start with first, and why?' });

  it("R06: the model's lever ask with the COGS inputs never out → code's one line back to the analysis", async () => {
    early();
    const r = await say('So it is input inflation they never priced for.', LEVER);
    expect(r.interviewerText).toBe(ANALYSIS_PLAIN);
    expect((flags().stagesEnforced as Row).analysis).toBe(true);
  });

  it('"Let\'s hold the recommendation" when the candidate just gave one', async () => {
    early();
    const r = await say('My recommendation is to raise menu prices 8% now and hedge beans.', LEVER);
    expect(r.interviewerText).toBe(ANALYSIS_ASK);
  });

  it('…or was just asked for one', async () => {
    seed({ phase: 'ANALYSIS', turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'COGS drove 16 of the 18 points.' }, { role: 'interviewer', text: "What's your recommendation to the client?" }],
      revealed: COST_LINES, exhibits: ['exhibit-a'], flags: { pressureTest: SATISFIED, lastQuestion: "What's your recommendation to the client?" } });
    const r = await say('I am not sure yet.', LEVER);
    expect(r.interviewerText).toBe(ANALYSIS_ASK);
  });

  it('asked once: after it, the ask goes through', async () => {
    early({ stagesEnforced: { analysis: true }, stageEvidence: { ...STAGES_OWED_BRAINSTORM, brainstorm: { delivered: true, outcome: 'answered' } } });
    const r = await say('So it is input inflation they never priced for.', LEVER);
    expect(r.interviewerText).toMatch(/which single lever/);
  });

  it('R23: with the analysis attempted, a lever ask still waits for an owed brainstorm', async () => {
    early({ stageEvidence: STAGES_OWED_BRAINSTORM }, [...COST_LINES, 'bean_share_of_cogs', 'non_bean_input_change']);
    const r = await say('So it is input inflation.', T({ move: 'analysis', question: 'What is the most credible lever to close the gap, and what would it take?' }));
    expect(r.interviewerText).toMatch(/what else could the client do|other levers|protect margin/);
  });

  it('R10: the model\'s "Thanks, that closes the case." mid-case is withheld; its question stays', async () => {
    early({ stagesEnforced: { analysis: true } });
    const r = await say('COGS as a percent of revenue, tracked monthly.', T({ move: 'other', say: 'Understood. Thanks, that closes the case.', question: "What's the single most important number you'd want the CEO to track monthly, and why?" }));
    expect(r.ended).toBe(false);
    expect(r.interviewerText).not.toMatch(/closes the case/);
    expect(r.interviewerText).toMatch(/most important number/);
  });

  it('Jasmine 35897f4a t18: the model\'s "That\'s all I have on the case." with stages owed is withheld; a question goes out', async () => {
    early({ stagesEnforced: { analysis: true } });
    const r = await say('Store-level profit, not revenue.', T({ move: 'other', say: '', question: "That's all I have on the case." }));
    expect(r.ended).toBe(false);
    expect(r.interviewerText).not.toMatch(/all I have/);
    expect(r.interviewerText).toMatch(/\?$/);
  });

  it("R14: code's own end with the COGS inputs never out → the line back to the analysis, not the close", async () => {
    seed({ phase: 'RECOMMENDATION', elapsedMin: 13, coverage: ALL_COVERED, revealed: COST_LINES, exhibits: ['exhibit-a'],
      turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Beans.' }, { role: 'interviewer', text: "What's your recommendation to the client?" },
        { role: 'candidate', text: 'Raise prices 8% in a pilot.' }, { role: 'interviewer', text: "What's the biggest risk to that recommendation?" }],
      flags: { pressureTest: SATISFIED, stall: { ladderLevel: 0, consecutiveNoProgress: 0, consecutiveClarify: 0, lastCandidateQuestion: null, recommendationDelivered: true } } });
    const r = await say('Volume loss — I would pilot in 20 stores.');
    expect(r.ended).toBe(false);
    expect(r.interviewerText).toBe(ANALYSIS_PLAIN);   // a risk answer: no recommendation in play
  });
});

// Fact guards Phase 5 (batch 20 R17, R07): after two asks of one intent with
// nothing given, the third advances instead of rewording.
describe('no third ask of the same thing', () => {
  const stuck = (askIntents: Row[]) => seed({ phase: 'STRUCTURE', turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: "I'm stuck." }, { role: 'interviewer', text: 'Which branch would you start with, and why?' }],
    flags: { pressureTest: SATISFIED, stagesEnforced: { analysis: true }, askIntents } });
  const THIRD = T({ move: 'pressure_test', question: 'Let me make it concrete: of the areas you named, which one would you check first, and why?' });

  it('R17: "what would you prioritize" → "which branch first" → "which one would you check first" — the third advances', async () => {
    stuck([{ tags: ['prioritize'], given: false }, { tags: ['prioritize'], given: false }]);
    const r = await say("I don't really have a structure, sorry.", THIRD);
    expect(r.interviewerText).toBe("Let's move on: what data would you want to see first?");
    expect(flags().askIntents).toEqual([{ tags: ['prioritize'], given: false }, { tags: [], given: false }]);
  });

  it('not when something was given between the asks', async () => {
    stuck([{ tags: ['prioritize'], given: true }, { tags: ['prioritize'], given: false }]);
    const r = await say("I don't really have a structure, sorry.", THIRD);
    expect(r.interviewerText).toMatch(/which one would you check first/);
  });
});

describe('Rule 16 — a question about assessment gets its one-line answer', () => {
  it('Trevor (batch 18): "what percentile would you put that in?" — "You\'ll get a full written report afterward." is spoken', async () => {
    seed({ phase: 'ANALYSIS', turns: [{ role: 'interviewer', text: 'Prompt' }], flags: { pressureTest: SATISFIED } });
    const r = await say('Costs are where the variance lives. Quick question — on structure specifically, what percentile would you put that in?',
      T({ say: "You'll get a full written report afterward.", question: 'Which cost line would you look at first?' }));
    expect(r.interviewerText).toMatch(/^You'll get a full written report afterward\. Which cost line/);
  });

  it('without a question about assessment the same line is still withheld as a goodbye', async () => {
    seed({ phase: 'ANALYSIS', turns: [{ role: 'interviewer', text: 'Prompt' }], flags: { pressureTest: SATISFIED } });
    const r = await say('Costs are where the variance lives.', T({ say: "You'll get a full written report afterward.", question: 'Which cost line would you look at first?' }));
    expect(r.interviewerText).not.toMatch(/written report/);
  });
});

describe('a stale result after the session ended', () => {
  it('End pressed while a turn runs: the turn writes nothing and does not revive the session', async () => {
    seed({ phase: 'ANALYSIS', turns: [{ role: 'interviewer', text: 'Prompt' }], flags: { pressureTest: SATISFIED } });
    const before = store.turns.length;
    onModel = () => { store.session = { ...store.session, status: 'abandoned' }; };
    const r = await say('COGS went from 42 to 58.', T());
    expect(r).toMatchObject({ interviewerText: '', ended: true, scoringSuppressed: true });
    expect(store.turns.length).toBe(before);
    expect(store.session.status).toBe('abandoned');
  });
});

// Batch-26 fix 1: the time warning reads the candidate's pace from the clock Settle saves at each message.
describe('the message clock for the time warning', () => {
  it('Settle saves the clock at this message', async () => {
    seed({ phase: 'ANALYSIS', elapsedMin: 8, turns: [{ role: 'interviewer', text: 'Prompt' }, { role: 'candidate', text: 'Revenue and costs.' }, { role: 'interviewer', text: 'Go on.' }], flags: { pressureTest: SATISFIED } });
    await say('COGS rose from 42 to 58 percent of revenue.', T());
    expect(flags().lastMessageElapsedMs as number).toBeGreaterThanOrEqual(8 * 60_000);
    expect(flags().lastMessageElapsedMs as number).toBeLessThan(8 * 60_000 + 5_000);
  });
});
