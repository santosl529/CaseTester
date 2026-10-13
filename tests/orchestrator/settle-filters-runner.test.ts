// Settle filters through the real runner (batch-19 review step 2, 12 Oct):
// the question on a turn that delivered data doesn't treat it as still to
// come (Haiku 5.5, 21 of 24 runs), and grading in "say" or the question is
// withheld (Rule 1); a misquote of revealed data gets code's flat correction
// (Rule 6 option 4, v4.11).
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

const flagsNow = () => store.session.flagsJsonb as Row;
const events = (subtype: string) => store.events.filter(e => e.category === 'intervention' && e.subtype === subtype);

describe('a misquote of revealed data is corrected by code, once (Rule 6 option 4)', () => {
  const COST = ['cogs_pct', 'labor_pct', 'overhead_pct'];
  it('Tyler t5 (batch 19): "COGS goes from 42% to 61%" → one flat sentence in the data line, after say', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('The whole story is COGS — it goes from 42% to 61% of revenue over two years.', T({ say: 'Mm-hm.', question: 'What sits inside COGS?' }));
    expect(r.interviewerText).toBe('Mm-hm. To correct one figure: COGS is 58% of revenue today, up from 42% two years ago. What sits inside COGS?');
    expect(prompts.at(-1)).toMatch(/MISQUOTE: the candidate stated COGS as % of revenue as "to 61%"/);
    expect(flagsNow().misquoteCorrected).toEqual(['cogs_pct']);
    expect(events('misquote_corrected')).toHaveLength(1);
  });

  it('a repeat after one correction is corrected again (batch 20 R05: "from 42 to 60" after the t6 correction)', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: { ...SATISFIED, misquoteCorrected: ['cogs_pct'] } });
    const r = await say('COGS went from 42% to 61% of revenue, and that explains the decline.', T({ say: 'Mm-hm.', question: 'What sits inside COGS?' }));
    expect(r.interviewerText).toBe('Mm-hm. To correct one figure: COGS is 58% of revenue today, up from 42% two years ago. What sits inside COGS?');
    expect(flagsNow().misquoteCorrected).toEqual(['cogs_pct', 'cogs_pct']);
  });

  it('after two corrections of an item a repeat is logged for scoring, not corrected a third time', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: { ...SATISFIED, misquoteCorrected: ['cogs_pct', 'cogs_pct'] } });
    const r = await say('COGS went from 42% to 61% of revenue, and that explains the decline.', T({ say: 'Mm-hm.', question: 'What sits inside COGS?' }));
    expect(r.interviewerText).toBe('Mm-hm. What sits inside COGS?');
    expect(events('misquote_repeated')).toMatchObject([{ payloadJsonb: { item: 'cogs_pct', cited: 'to 61%' } }]);
    expect(flagsNow().misquoteCorrected).toEqual(['cogs_pct', 'cogs_pct']);
  });

  it('the forms the grammar missed live are corrected (batch 20: pronoun chain, change in points, prompt fact)', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const a = await say("COGS is the driver. It goes from 42% two years ago to 61% currently — that's a 19-point increase.", T({ say: 'Right.', question: 'What sits inside COGS?' }));
    expect(a.interviewerText).toMatch(/^Right\. To correct one figure: COGS is 58% of revenue today, up from 42% two years ago\. What sits inside COGS\?$/);
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const b = await say("So the question becomes why COGS rose 19 points.", T({ say: 'Right.', question: 'What sits inside COGS?' }));
    expect(b.interviewerText).toMatch(/To correct one figure: COGS is 58%/);
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const c = await say("Risks: they've grown revenue 19% with flat prices.", T({ say: 'Right.', question: 'What else?' }));
    expect(c.interviewerText).toBe('Right. To correct one figure: revenue grew 15% over the past two years. What else?');
  });

  it('two items misquoted in one message are corrected in one line', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('COGS went from 42% to 61%. Revenue grew about 19% on volume.', T({ say: 'Right.', question: 'What else?' }));
    expect(r.interviewerText).toBe('Right. To correct two figures: COGS is 58% of revenue today, up from 42% two years ago. And revenue grew 15% over the past two years. What else?');
    expect(flagsNow().misquoteCorrected).toEqual(['cogs_pct', 'revenue_growth']);
  });

  it('a figure for data not yet revealed is the candidate\'s own claim — no correction', async () => {
    seed({ phase: 'ANALYSIS', revealed: ['stores_count'], flags: SATISFIED });
    const r = await say('I bet COGS went from 42% to 61% of revenue.', T({ say: 'Mm-hm.', question: 'What would you want to see?' }));
    expect(r.interviewerText).toBe('Mm-hm. What would you want to see?');
    expect(flagsNow().misquoteCorrected).toEqual([]);
  });
});

describe('code-written lines (step 4, batch 19)', () => {
  it('a replacement question fits the phase: mid-analysis, not "Where would you like to start the analysis?"', async () => {
    seed({ phase: 'ANALYSIS', flags: SATISFIED });
    const r = await say('I think it is mostly costs.', T({ say: 'Mm-hm.', question: 'Which of these cost lines moved the most?' }));
    expect(r.interviewerText).toMatch(/^Mm-hm\. (What would you look at next, and why\?|Where does that leave your analysis\?|What's your next step from here\?)$/);
  });

  it('an exhibit that shows the held data gets no deferral line beside it (Camila t6)', async () => {
    seed({ phase: 'ANALYSIS', flags: SATISFIED });
    const r = await say('Do prices change, and can I see the cost lines?', T({
      say: 'Right.', question: 'What do you take from it?',
      requests: [
        { what: 'menu price changes', itemIds: ['menu_price_change'], explicit: true, respond: 'release' },
        { what: 'cost breakdown', itemIds: ['cogs_pct', 'labor_pct', 'overhead_pct'], explicit: true, respond: 'defer' },
      ],
      exhibit: 'exhibit-a',
    }));
    expect(r.interviewerText).toMatch(/Here's an exhibit: Brew & Bean Cost Structure Over Time\./);
    expect(r.interviewerText).not.toMatch(/come back to/);
  });
});

describe('the truth guard: nothing false about the case is spoken (fact checks, 12 Oct)', () => {
  const COST = ['cogs_pct', 'labor_pct', 'overhead_pct'];
  const withheldFor = (reason: string) => ((check('vetoes')?.detail as { withheld?: { reason: string; sentence: string }[] } | undefined)?.withheld ?? []).filter(w => w.reason === reason);

  it('a false figure presupposed in the question is withheld and a phase-fit question replaces it (batch 20 R30 t6)', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('So the question becomes why COGS rose 19 points. What drives that?', T({
      say: 'Got it.', question: 'With those figures in hand, how much of the 19-point COGS increase does the bean cost change account for?',
    }));
    expect(r.interviewerText).not.toMatch(/19-point/);
    expect(r.interviewerText).toMatch(/\?$/);
    expect(withheldFor('false_fact')).toHaveLength(1);
  });

  it('a standing misquote repeated as fact is withheld (batch 20 R42 t14: "16 of the 19 points")', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('COGS went from 42% to 61% of revenue, 19 points, and inputs explain about 16 of that.', T({
      say: 'Right.', question: "You've got about 16 of the 19 points explained by input prices. What would you check next?",
    }));
    expect(r.interviewerText).not.toMatch(/19 points/);
    expect(withheldFor('false_fact').length).toBeGreaterThan(0);
  });

  it('a direction the data contradicts is withheld (batch 20 R21 t18: "a falling ticket")', async () => {
    seed({ phase: 'EXHIBIT', revealed: [...COST, 'avg_ticket'], flags: SATISFIED });
    const r = await say('Ticket went from $6.20 to $6.80.', T({
      say: 'Mm-hm.', question: 'What would a falling ticket with flat menu prices tell you about mix?',
    }));
    expect(r.interviewerText).not.toMatch(/falling ticket/);
    expect(withheldFor('false_fact')).toHaveLength(1);
  });

  it('a "say" sentence with a false driver claim is withheld, the question stays (batch 19 Jasmine t18)', async () => {
    seed({ phase: 'ANALYSIS', revealed: COST, flags: SATISFIED });
    const r = await say('Beans doubled, I think.', T({ say: 'The 16-point COGS gap is mostly beans.', question: 'What would you check next?' }));
    expect(r.interviewerText).toBe('What would you check next?');
    expect(withheldFor('false_fact')).toHaveLength(1);
  });

  it('true statements about the case pass', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('COGS went from 42% to 58%.', T({ say: 'Right.', question: 'How much of the 16-point COGS increase do beans explain?' }));
    expect(r.interviewerText).toBe('Right. How much of the 16-point COGS increase do beans explain?');
    expect(withheldFor('false_fact')).toEqual([]);
  });
});

describe('the truth guard remembers misquotes still standing', () => {
  it('a figure misquoted on an earlier turn and never corrected stays unsayable (R42 t14)', async () => {
    seed({ phase: 'EXHIBIT', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: { ...SATISFIED, factEchoes: [{ value: 19, change: true, items: ['cogs_pct'], cited: 'to 61%' }] } });
    const r = await say('Inputs explain about 16 points, with 19 points of COGS change overall.', T({
      say: 'Right.', question: "You've got about 16 of the 19 points explained by input prices. What would you check next?",
    }));
    expect(r.interviewerText).not.toMatch(/19 points/);
    expect((store.session.flagsJsonb as Row).factEchoes).toEqual([{ value: 19, change: true, items: ['cogs_pct'], cited: 'to 61%' }]);
  });
});

describe('the truth guard leaves a question to answer', () => {
  it('a false fact withheld after a statement still ends the turn on a question (R21 t12)', async () => {
    seed({ phase: 'EXHIBIT', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: SATISFIED });
    const r = await say('COGS rose 19 points, I think. Do we have per-unit costs?', T({
      say: 'Understood.', question: "Per-unit costs aren't something I have directly. Which one is large enough to drive a 19-point COGS climb on its own?",
    }));
    expect(r.interviewerText).toMatch(/^Understood\. To correct one figure: COGS is 58%.*\. Per-unit costs aren't something I have directly\. .+\?$/);
    expect(r.interviewerText).not.toMatch(/19-point/);
  });
});

describe('the misquote correction is spoken on a code-written close (batch 20 R21 t26, R47 t22)', () => {
  it('a misquote in the final answer gets its correction before the goodbye', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: { ...SATISFIED, graceAskFired: true } });
    store.session = { ...store.session, startedAt: new Date(Date.now() - 25 * 60_000) };
    const r = await say('My recommendation: COGS went from 42% to 61% of revenue, so raise prices.', T());
    expect(r.ended).toBe(true);
    expect(r.interviewerText).toMatch(/^To correct one figure: COGS is 58% of revenue today, up from 42% two years ago\. .+report/);
    expect(flagsNow().misquoteCorrected).toEqual(['cogs_pct']);
  });
});

describe('a recommendation resting on a misquote gets one chance to revise (batch 20 R05, R42)', () => {
  const recAsked = () => { store.turns[store.turns.length - 1] = { ...store.turns[store.turns.length - 1], text: "Pull it together — what's your recommendation to the CEO?" }; };
  const REC = "My recommendation: raise prices. They've grown revenue 19% with flat prices, so demand is healthy.";

  it('the correction, then "does your recommendation change?" — not the close', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: SATISFIED });
    recAsked();
    const r = await say(REC, T({ move: 'risk', question: "What's the biggest risk to that?" }));
    expect(r.ended).toBe(false);
    expect(r.interviewerText).toMatch(/^To correct one figure: revenue grew 15% over the past two years\. (With that corrected, does your recommendation change|Given the corrected figure, would you change your recommendation)\?$/);
    expect(flagsNow().recRevisionAsked).toBe(true);
  });

  it('asked once: a second misquoted answer is corrected but the case goes on normally', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: { ...SATISFIED, recRevisionAsked: true } });
    recAsked();
    const r = await say(REC, T({ move: 'risk', say: 'Mm-hm.', question: "What's the biggest risk to that?" }));
    expect(r.interviewerText).toBe("Mm-hm. To correct one figure: revenue grew 15% over the past two years. What's the biggest risk to that?");
  });

  it('when time is up the correction still precedes the close', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: { ...SATISFIED, graceAskFired: true } });
    store.session = { ...store.session, startedAt: new Date(Date.now() - 25 * 60_000) };
    recAsked();
    const r = await say(REC, T());
    expect(r.ended).toBe(true);
    expect(r.interviewerText).toMatch(/^To correct one figure: revenue grew 15% over the past two years\. .+report/);
  });
});

describe('a math error in the recommendation gets one probe before the case moves on (fact guards Phase 4)', () => {
  const recAsked = () => { store.turns[store.turns.length - 1] = { ...store.turns[store.turns.length - 1], text: "Pull it together — what's your recommendation to the CEO?" }; };
  const COSTS = ['cogs_pct', 'labor_pct', 'overhead_pct', 'revenue_total'];
  const REC = 'My recommendation: raise menu prices. A 10% price increase recovers about 5 points of margin if volume holds.';

  it('a wrong pricing claim: one code-written probe, without the right figure — not the close', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: COSTS, flags: SATISFIED });
    recAsked();
    const r = await say(REC, T({ move: 'risk', question: "What's the biggest risk to that?" }));
    expect(r.ended).toBe(false);
    expect(r.interviewerText).toBe('Before we wrap up — you said a 10% price rise recovers 5 points of margin. Walk me through how you sized that.');
    expect(flagsNow().recMathProbed).toBe(true);
    expect(flagsNow().recomputeAttempts).toEqual({ 'pricing:gain': 1 });
  });

  it('a wrong figure of a math step is probed as the candidate wrote it', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: COSTS, flags: SATISFIED });
    recAsked();
    const r = await say('My recommendation: fix procurement first. Sixteen points on $480 million is about $20 million of margin impact.', T({ move: 'risk' }));
    expect(r.interviewerText).toBe('Before we wrap up — walk me through how you got to $20 million.');
  });

  it('wrong again after a probe: the figure is supplied and the recommendation reopened once', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: COSTS, flags: { ...SATISFIED, recomputeAttempts: { 'pricing:gain': 1 } } });
    recAsked();
    const r = await say(REC, T({ move: 'risk' }));
    expect(r.interviewerText).toMatch(/^It's closer to 8\.5 points of margin, not 5\. (Does that change your recommendation|Would that change your recommendation at all)\?$/);
  });

  it('a unit slip past its probe is corrected without a figure that depends on the year', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: COSTS, flags: { ...SATISFIED, recomputeAttempts: { 'unit:COGS': 1 } } });
    recAsked();
    const r = await say('My recommendation: hedge beans first. Beans are 25% of COGS, so 25 points of revenue sit in beans.', T({ move: 'risk' }));
    expect(r.interviewerText).toMatch(/^That's 25% of COGS, not 25 points of revenue\. (Does that change your recommendation|Would that change your recommendation at all)\?$/);
  });

  it('asked once: the next flagged answer goes on normally', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: COSTS, flags: { ...SATISFIED, recMathProbed: true } });
    recAsked();
    const r = await say(REC, T({ move: 'risk', say: 'Mm-hm.', question: "What's the biggest risk to that?" }));
    expect(r.interviewerText).not.toMatch(/Before we wrap up/);
  });

  it('a right claim, or time up, gets no probe', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: COSTS, flags: SATISFIED });
    recAsked();
    const ok = await say('My recommendation: raise menu prices. A 10% price increase recovers about 8.5 points of margin.', T({ move: 'risk', say: 'Mm-hm.', question: "What's the biggest risk to that?" }));
    expect(ok.interviewerText).toBe("Mm-hm. What's the biggest risk to that?");
    seed({ phase: 'RECOMMENDATION', revealed: COSTS, flags: { ...SATISFIED, graceAskFired: true } });
    store.session = { ...store.session, startedAt: new Date(Date.now() - 25 * 60_000) };
    recAsked();
    const late = await say(REC, T());
    expect(late.ended).toBe(true);
    expect(late.interviewerText).not.toMatch(/Before we wrap up/);
  });
});

describe('the correction cap never applies to the recommendation (batch 20 R30, R47 replays)', () => {
  it('an item corrected twice already is corrected again in the reply to a recommendation ask', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: { ...SATISFIED, misquoteCorrected: ['cogs_pct', 'cogs_pct'], recRevisionAsked: true } });
    store.turns[store.turns.length - 1] = { ...store.turns[store.turns.length - 1], text: "What's your recommendation to the client?" };
    const r = await say('My recommendation: COGS went from 42% to 61% of revenue, so raise prices.', T({ move: 'risk', say: 'Mm-hm.', question: "What's the biggest risk?" }));
    expect(r.interviewerText).toBe("Mm-hm. To correct one figure: COGS is 58% of revenue today, up from 42% two years ago. What's the biggest risk?");
  });
});

describe('nothing repeats a figure on the turn code corrects it', () => {
  it('a probe of the wrong figure is withheld after the correction (batch 20 R21 t6 replay)', async () => {
    seed({ phase: 'EXHIBIT', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: SATISFIED });
    const r = await say("COGS is the driver. It goes from 42% two years ago to 61% currently — that's a 19-point increase.", T({
      say: 'Right.', question: 'Walk me through how you got from 42% and 61% to a 19-point COGS increase.',
    }));
    expect(r.interviewerText).toMatch(/^Right\. To correct one figure: COGS is 58% of revenue today, up from 42% two years ago\. .+\?$/);
    expect(r.interviewerText).not.toMatch(/61%|19-point/);
  });
});

describe('no misquote is left standing at the goodbye', () => {
  it('the close corrects an item already corrected twice (batch 20 R42 c21 replay)', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: { ...SATISFIED, graceAskFired: true, misquoteCorrected: ['revenue_growth', 'revenue_growth'] } });
    store.session = { ...store.session, startedAt: new Date(Date.now() - 25 * 60_000) };
    const r = await say('Revenue is up 19% with margin collapsing.', T());
    expect(r.ended).toBe(true);
    expect(r.interviewerText).toMatch(/^To correct one figure: revenue grew 15% over the past two years\. /);
  });
  it('on the correcting turn a bare probe of the wrong figure goes too ("Walk me through where the 19% comes from")', async () => {
    seed({ phase: 'EXHIBIT', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: SATISFIED });
    const r = await say('Revenue grew about 19% over the period, so volume is healthy.', T({ say: 'Mm-hm.', question: 'Walk me through where the 19% comes from.' }));
    expect(r.interviewerText).toMatch(/^Mm-hm\. To correct one figure: revenue grew 15% over the past two years\. .+\?$/);
    expect(r.interviewerText).not.toMatch(/19%/);
  });
});

describe('no refusal names data the case holds (fact checks F3)', () => {
  const COST = ['cogs_pct', 'labor_pct', 'overhead_pct'];
  const ask = (what: string, itemIds: string[] = []) => ({ what, itemIds, explicit: true, respond: 'release' as const });

  it('"what\'s inside COGS" is answered with what the case holds, not refused (batch 20 R10 t8)', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say("Do we have data on what's inside COGS — bean cost per pound and dairy?", T({
      say: 'Got it.', requests: [ask("what's inside COGS, bean cost per pound and dairy")], question: 'What would you expect to find?',
    }));
    expect(r.interviewerText).not.toMatch(/I don't have what's inside COGS/);
    expect(r.interviewerText).toMatch(/Coffee beans were 25% of COGS two years ago/);
    // Answered as a group ask now ("what's inside COGS" names the COGS inputs).
    expect(check('request_group') ?? check('refusal_remapped')).toMatchObject({ decision: 'act' });
  });

  it('"COGS breakdown by input — beans, dairy, cups and food" maps to the bean share (R23 t8)', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('Do we have that COGS breakdown?', T({ say: 'Mm-hm.', requests: [ask('COGS breakdown by input — beans, dairy, cups and food — and unit cost per pound')], question: 'What does it tell you?' }));
    expect(r.interviewerText).toMatch(/Coffee beans were 25% of COGS two years ago/);
    expect(r.interviewerText).not.toMatch(/I don't have COGS breakdown/);
  });

  it('"the number of stores over the 2 years" is the store count (batch 18 Maya t7)', async () => {
    seed({ phase: 'CLARIFY', flags: SATISFIED });
    const r = await say('Has the number of stores changed over the two years?', T({ say: 'Sure.', requests: [ask('the number of stores over the 2 years')], question: 'How would you structure it?' }));
    expect(r.interviewerText).toMatch(/200 stores today/);
    expect(r.interviewerText).not.toMatch(/I don't have/);
  });

  it('a finer cut than the case holds is still refused ("bean share of COGS today")', async () => {
    seed({ phase: 'EXHIBIT', revealed: [...COST, 'bean_share_of_cogs'], flags: SATISFIED });
    const r = await say('Do we know the bean share of COGS today?', T({ say: 'Mm-hm.', requests: [ask('bean share of COGS today')], question: 'What would you estimate?' }));
    expect(r.interviewerText).toMatch(/I don't have bean share of COGS today\./);
  });

  it('before the pressure test is satisfied, a remapped ask is held with its reason, not refused', async () => {
    seed({ phase: 'STRUCTURE', flags: { pressureTest: { state: 'awaiting', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false, askedAt: 0 } } });
    const r = await say("Could I see what's inside COGS?", T({ say: 'Mm-hm.', requests: [ask("what's inside COGS")], question: 'Is that structure MECE?' }));
    expect(r.interviewerText).not.toMatch(/I don't have|what's inside COGS/);
    expect(r.interviewerText).toMatch(/once we've settled your structure/);
  });

  it('a false refusal in the model\'s own question is withheld', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('Okay.', T({ say: 'Mm-hm.', question: "I don't have the menu price history. What would you look at next?" }));
    expect(r.interviewerText).toBe('Mm-hm. What would you look at next?');
  });
});

describe('no refusal names data the case holds — a declared deferral too', () => {
  it('"coffee bean, dairy, packaging, and waste shares of COGS, today and two years ago" declared defer (batch 20 R28 t38)', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'], flags: SATISFIED });
    const r = await say('Their point shares of COGS today versus two years ago.', T({
      say: 'Got it.', requests: [{ what: 'coffee bean, dairy, packaging, and waste shares of COGS, today and two years ago', itemIds: [], explicit: true, respond: 'defer' }],
      question: 'How would you rank the levers?',
    }));
    expect(r.interviewerText).not.toMatch(/I don't have coffee bean/);
    expect(r.interviewerText).toMatch(/Coffee beans were 25% of COGS two years ago/);
  });
});

describe('the question agrees with what code delivered (fact checks F4)', () => {
  const COST = ['cogs_pct', 'labor_pct', 'overhead_pct'];
  const withheldFor = (reason: string) => ((check('vetoes')?.detail as { withheld?: { reason: string }[] } | undefined)?.withheld ?? []).filter(w => w.reason === reason);

  it('"with the other-input price change in hand" when only the bean figure went out is withheld (batch 20 R04 t14)', async () => {
    seed({ phase: 'EXHIBIT', revealed: [...COST, 'bean_share_of_cogs'], flags: SATISFIED });
    const r = await say('What did bean prices do?', T({
      say: 'Mm-hm.', requests: [{ what: 'bean price change', itemIds: ['bean_price_change'], explicit: true, respond: 'release' }],
      question: 'With the other input price change in hand, how much of the remaining gap does it explain?',
    }));
    expect(r.interviewerText).toMatch(/Raw coffee bean costs are up 40%/);
    expect(r.interviewerText).not.toMatch(/other input price change in hand/);
    expect(r.interviewerText).toMatch(/\?$/);
    expect(withheldFor('undelivered_claim')).toHaveLength(1);
  });

  it('"With those figures" on a turn that delivered none is withheld (R14 t22)', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: COST, flags: SATISFIED });
    const r = await say('Beans are the lever.', T({ say: 'Mm-hm.', question: 'With those figures, does bean sourcing still look like the right lead lever?' }));
    expect(r.interviewerText).not.toMatch(/With those figures/);
    expect(withheldFor('undelivered_claim').length).toBeGreaterThan(0);
  });

  it('a true claim stays: the figure went out this turn', async () => {
    seed({ phase: 'EXHIBIT', revealed: [...COST, 'bean_share_of_cogs'], flags: SATISFIED });
    const r = await say('What did bean prices do?', T({
      say: 'Mm-hm.', requests: [{ what: 'bean price change', itemIds: ['bean_price_change'], explicit: true, respond: 'release' }],
      question: 'With the bean price change in hand, how much of the COGS increase do beans explain?',
    }));
    expect(r.interviewerText).toMatch(/With the bean price change in hand, how much of the COGS increase do beans explain\?$/);
  });
});

describe('an ask naming a group gets every item of it (Phase 3: "COGS by input" → share, bean price, other inputs)', () => {
  const COST = ['cogs_pct', 'labor_pct', 'overhead_pct'];
  it('"a breakdown of COGS by input" mapped by the model to the bean share alone releases all three', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('Do we have a breakdown of COGS by input?', T({
      say: 'Mm-hm.', requests: [{ what: 'COGS breakdown by input', itemIds: ['bean_share_of_cogs'], explicit: true, respond: 'release' }], question: 'Which input do you expect moved most?',
    }));
    expect(r.interviewerText).toMatch(/Coffee beans were 25% of COGS two years ago/);
    expect(r.interviewerText).toMatch(/Raw coffee bean costs are up 40%/);
    expect(r.interviewerText).toMatch(/Other input costs — dairy, packaging, and food — are up 37\.5%/);
  });
  it('"what\'s inside COGS" before the pressure test holds all three with the reason', async () => {
    seed({ phase: 'STRUCTURE', flags: { pressureTest: { state: 'awaiting', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: true, structureAsked: false, askedAt: 0 } } });
    const r = await say("What's inside COGS?", T({ say: 'Mm-hm.', requests: [{ what: "what's inside COGS", itemIds: ['bean_share_of_cogs'], explicit: true, respond: 'release' }], question: 'Is that structure MECE?' }));
    expect(r.interviewerText).toMatch(/once we've settled your structure/);
    expect(r.interviewerText).not.toMatch(/25% of COGS|up 40%|37\.5%/);
  });
  it('an ask for one item stays one item', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('What happened to bean prices?', T({ say: 'Mm-hm.', requests: [{ what: 'bean price change', itemIds: ['bean_price_change'], explicit: true, respond: 'release' }], question: 'What does that tell you?' }));
    expect(r.interviewerText).not.toMatch(/25% of COGS|37\.5%/);
  });
});
