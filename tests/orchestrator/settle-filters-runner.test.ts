// Settle filters through the real runner (batch-19 review step 2, 12 Oct):
// the question on a turn that delivered data doesn't treat it as still to
// come (Haiku 5.5, 21 of 24 runs), and grading in "say" or the question is
// withheld (Rule 1); a misquote of revealed data gets code's flat correction
// (Rule 6 option 4, v4.11).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';

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
    expect(flagsNow().recomputeAttempts).toEqual({ 'pricing:gain@5': 1 });
  });

  it('a wrong figure of a math step is probed as the candidate wrote it', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: COSTS, flags: SATISFIED });
    recAsked();
    const r = await say('My recommendation: fix procurement first. Sixteen points on $480 million is about $20 million of margin impact.', T({ move: 'risk' }));
    expect(r.interviewerText).toBe('Before we wrap up — walk me through how you got to $20 million.');
  });

  // Lorenzo, 13 Oct (Larkspur review, item 1): code never corrects a computed
  // figure on its own — past the probe the case goes on; the math checker's
  // agreed correction is the only one.
  it('wrong again after a probe: no code correction, the turn goes on', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: COSTS, flags: { ...SATISFIED, recomputeAttempts: { 'pricing:gain@5': 1 } } });
    recAsked();
    const r = await say(REC, T({ move: 'risk', say: 'Mm-hm.', question: "What's the biggest risk to that?" }));
    expect(r.interviewerText).toBe("Mm-hm. What's the biggest risk to that?");
  });

  // Lorenzo, 15 Oct: the correction names the quantity and the period. No base stated and the bean share not yet given (a share of the candidate's own): both years.
  it('a unit slip past its probe is corrected with the quantity and its period', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: COSTS, flags: { ...SATISFIED, recomputeAttempts: { 'unit:COGS@25': 1 } } });
    recAsked();
    const r = await say('My recommendation: hedge beans first. Beans are 25% of COGS, so 25 points of revenue sit in beans.', T({ move: 'risk' }));
    expect(r.interviewerText).toMatch(/^25% of COGS is about 10\.5 points of revenue on two years ago's 42-point COGS line, or about 14\.5 on today's 58 — not 25\. (Does that change your recommendation|Would that change your recommendation at all)\?$/);
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

  // Lorenzo, 13 Oct (Step 4: Jordan 099f33e9 t6–t8, Owen 9b08959d t6 — "COGS
  // split by input category" released the bean share only, then "I don't have
  // COGS split by input category" was false): the same ask releases the same
  // items every time, and an ask whose items are partly out is answered, never refused.
  const THREE = [/Coffee beans were 25% of COGS two years ago\./, /Raw coffee bean costs are up 40% over the past two years\./, /Other input costs — dairy, packaging, and food — are up 37\.5% over the past two years\./];
  it.each([
    ['the split of COGS by input category', ['bean_share_of_cogs']],
    ['COGS split by input category', ['bean_share_of_cogs', 'non_bean_input_change']],
    ['the composition of COGS', ['bean_share_of_cogs']],
    ["what's inside COGS", []],
    // 4b replay (Preston ec02dac7 t5, Anika acf6697f t9, Noor 5a111a2d t7, Sofia 62cfe6f4 t5): parts listed, not a split of one.
    ['COGS breakdown for coffee beans and other inputs', ['bean_share_of_cogs', 'non_bean_input_change']],
    ['the split of COGS between beans, dairy and packaging', ['bean_share_of_cogs', 'non_bean_input_change']],
    ['the composition of COGS and the price change of the other inputs', ['bean_share_of_cogs', 'non_bean_input_change']],
    ['the split of COGS between beans and other inputs', ['bean_share_of_cogs']],
    // Lorenzo, 14 Oct (batch 24): the model mapping all three no longer lets the scope rule drop the price changes.
    ['COGS split by input (beans versus other inputs)', ['bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change']],   // Raj ba2e03be t9
    ['the split of the COGS line', ['bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change']],                          // Sofia 84910bd6 t5
    ['the split of the COGS line', ['bean_share_of_cogs', 'bean_price_change']],                                                   // Jordan 5c68b453 t5
    ['the COGS line by component', []],
    ['what makes up COGS', ['bean_share_of_cogs']],
  ] as [string, string[]][])('"%s" releases the bean share, the bean price change and the other inputs\' change', async (what, itemIds) => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('Do we have a split of COGS by input category?', T({ say: 'Mm-hm.', requests: [ask(what, itemIds)], question: 'What does it tell you?' }));
    for (const line of THREE) expect(r.interviewerText).toMatch(line);
  });

  // Lorenzo, 15 Oct (batch-25 ruling 1): the expansion reads the candidate's own
  // asking sentence, not the model's label, and the group goes out whole — the
  // release cap counts it as one ask.
  describe("a COGS split is read from the candidate's asking sentence (batch 25)", () => {
    const MARCUS = "Good — this confirms it. COGS went 42 to 50 to 58, so 16 points of the 18-point margin drop sits in COGS. Labor is flat at 22, overhead moved 12 to 14, so only 2 points there. And menu prices haven't moved in two years, which is exactly the pass-through gap I flagged.\n\nSo the diagnosis is what I said: input costs rose, prices didn't follow. That's the whole thing.\n\nOne caveat I'd check — COGS as a percent could rise either because input prices went up or because they're selling a worse mix, more food and less high-margin espresso. Do we have a split of that 58 by category, coffee versus dairy versus food?\n\nEither way the fix doesn't change much. A roughly 16-point COGS gap means they need something like a 15-20% effective price increase to get back toward 24%, or a mix of pricing and supplier renegotiation. I'd still lead with pricing.";
    const JASMINE = "Clear answer: it's COGS. As a percent of revenue, COGS went 42 → 50 → 58, so 16 of the 18 points of margin loss sit there. Labor is flat at 22, overhead drifted 12 → 14, only 2 points. And with store count flat at 200, this isn't an expansion story — it's happening inside the existing base.\n\nWhat's driving a 16-point COGS jump: either input cost inflation — green coffee and dairy have both spiked — or they haven't raised menu prices to pass it through, or mix shifted toward lower-margin items, or waste and spoilage went up. Given revenue grew 15% with flat stores, I'd want to know whether that 15% came from price or traffic. If it's all traffic and price is flat, that's the whole story.\n\nTwo asks: do we have a menu-price history, and a split of COGS into coffee, dairy, and other inputs?\n\nAssuming no price increases and commodity inflation, here's my recommendation: raise menu prices.";
    const FIONA = "Okay, this is pretty clean. Labor is flat at 22% of revenue across all three years, overhead is up only 2 points, 12 to 14. COGS goes 42 to 50 to 58 — up 16 points, which accounts for essentially the entire 18-point margin drop.\n\nSo the question is entirely inside COGS. And that's still consistent with my waste hypothesis: spoilage sits in cost of goods sold, and if waste is rising it inflates COGS as a percent of revenue without any revenue coming back.\n\nBut it could equally be input cost inflation — coffee beans, dairy — or a shift toward lower-margin products, or a change in supplier terms.\n\nThe way to separate those: waste would be a volume-of-units-consumed problem, inflation would be a price-per-unit problem. Can I get a split of COGS by component, say beans, dairy, food, packaging, and ideally units purchased versus units sold?";
    const OWEN = "COGS is clearly the driver. It went 42 to 50 to 58 as a percent of revenue — a 16 point swing over two years, and that accounts for almost the entire 18 point margin decline. Labor is flat at 22, overhead only moved 2 points, which is noise by comparison.\n\nWhat I'd want next is what's inside that COGS line. For a coffee chain I'd expect green coffee beans, dairy, syrups, cups and packaging, and food if they sell pastries. I want to know whether this is one input spiking or broad-based inflation across all of them.\n\nThe other thing I need before I can interpret it: this is COGS as a percent of revenue, so it could move because input costs rose or because prices didn't. Do we have menu price history over the same two years — have they raised prices at all?\n\nAlso worth checking whether product mix shifted toward lower-margin items like food.";
    const MENU = /Menu prices have not changed in two years\./;
    it.each([
      ['Marcus f8ed869d t7', MARCUS, [ask('the breakdown of COGS by category', ['bean_share_of_cogs'])], false],
      ['Jasmine f4fcab5b t5', JASMINE, [ask('menu price history', ['menu_price_change']), ask('the COGS split between coffee and other inputs', ['bean_share_of_cogs', 'non_bean_input_change'])], true],
      ['Fiona 52743bea t5', FIONA, [ask("coffee beans' share of COGS", ['bean_share_of_cogs']), ask('price change of other inputs (dairy, packaging, food)', ['non_bean_input_change']), ask('units purchased versus units sold')], false],
      ['Owen d3db78c0 t5', OWEN, [ask('menu price changes over two years', ['menu_price_change']), ask('the composition of COGS', ['bean_share_of_cogs']), ask('input price changes for beans and other inputs', ['bean_price_change', 'non_bean_input_change'])], true],
    ] as [string, string, ReturnType<typeof ask>[], boolean][])('%s: all three COGS items go out, nothing deferred', async (_, text, requests, menu) => {
      seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
      const r = await say(text, T({ say: 'A COGS-first read.', requests, question: 'What does it tell you?' }));
      for (const line of THREE) expect(r.interviewerText).toMatch(line);
      if (menu) expect(r.interviewerText).toMatch(MENU);
      expect(r.interviewerText).not.toMatch(/I'll come back to/);
    });
    it("Owen's own sentence (\"What I'd want next is what's inside that COGS line\") widens per-item labels", async () => {
      seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
      const r = await say(OWEN, T({ say: 'A COGS-first read.', requests: [ask('menu price changes over two years', ['menu_price_change']), ask("coffee beans' share of COGS", ['bean_share_of_cogs']), ask('coffee bean price change', ['bean_price_change'])], question: 'What does it tell you?' }));
      for (const line of THREE) expect(r.interviewerText).toMatch(line);
      expect(r.interviewerText).toMatch(MENU);
    });
    it('a re-ask for "the rest of the COGS breakdown" gets what is still to come, not the share again (Sofia 3baae0b t11)', async () => {
      seed({ phase: 'EXHIBIT', revealed: [...COST, 'bean_share_of_cogs', 'bean_price_change'], flags: SATISFIED });
      const r = await say('Bean inflation is real but it\'s not the main story. Do we have the rest of the COGS breakdown — dairy, packaging, food, waste?', T({ say: 'Mm-hm.', requests: [ask('non-bean input costs (dairy, packaging, food)', ['non_bean_input_change'])], question: 'What does it tell you?' }));
      expect(r.interviewerText).toMatch(THREE[2]);
      expect(r.interviewerText).not.toMatch(/25% of COGS/);
    });
    it("per-item asks keep the model's order: the menu price between them still goes out (Raj 76e4ff6 t9, batch 19)", async () => {
      seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
      const r = await say('Now, COGS as a percent of revenue rising could mean input costs went up, or prices didn\'t keep pace, or mix shifted. Do we have the breakdown inside COGS — beans versus dairy versus packaging — and have menu prices changed at all in two years?', T({ say: 'Right.', requests: [
        ask('coffee bean price change over two years', ['bean_price_change']), ask('menu price changes over two years', ['menu_price_change']),
        ask("composition of COGS, coffee beans' share", ['bean_share_of_cogs']), ask('price change of dairy, packaging and food inputs', ['non_bean_input_change']),
      ], question: 'What do those figures tell you?' }));
      for (const line of THREE) expect(r.interviewerText).toMatch(line);
      expect(r.interviewerText).toMatch(MENU);
      expect(r.interviewerText).not.toMatch(/I'll come back to/);
    });
    it("Fiona's finer part of the same sentence is still refused", async () => {
      seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
      const r = await say(FIONA, T({ say: 'A COGS-first read.', requests: [ask("coffee beans' share of COGS", ['bean_share_of_cogs']), ask('units purchased versus units sold')], question: 'What does it tell you?' }));
      expect(r.interviewerText).toMatch(/I don't have units purchased versus units sold\./);
    });
    it('a group named only in a narrative sentence, not an ask, expands nothing', async () => {
      seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
      const r = await say("I think the split of COGS is the story. Could I get the coffee bean share?", T({ say: 'Mm-hm.', requests: [ask('the coffee bean share of COGS', ['bean_share_of_cogs'])], question: 'What does it tell you?' }));
      expect(r.interviewerText).toMatch(THREE[0]);
      expect(r.interviewerText).not.toMatch(/up 40%|up 37\.5%/);
    });
    it('a split asked with no request the model mapped into the group expands nothing', async () => {
      seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
      const r = await say('Do we have menu price history, and a split of COGS?', T({ say: 'Mm-hm.', requests: [ask('menu price history', ['menu_price_change'])], question: 'What does it tell you?' }));
      expect(r.interviewerText).toMatch(MENU);
      expect(r.interviewerText).not.toMatch(/25% of COGS|up 40%|up 37\.5%/);
    });
    it('the cap still holds items outside the group: four separate asks release three', async () => {
      seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
      const r = await say('Could I get menu prices, the store count, the average ticket and the coffee bean price change?', T({ say: 'Mm-hm.', requests: [
        ask('menu price history', ['menu_price_change']), ask('store count', ['stores_count']), ask('average ticket', ['avg_ticket']), ask('coffee bean price change', ['bean_price_change']),
      ], question: 'What does it tell you?' }));
      expect(r.interviewerText).toMatch(/I'll come back to/);
    });
  });

  it('the ask with its share already out: the rest goes out — no refusal (Jordan t7)', async () => {
    seed({ phase: 'EXHIBIT', revealed: [...COST, 'bean_share_of_cogs'], flags: SATISFIED });
    const r = await say("That's why I want the bean split.", T({ say: 'Mm-hm.', requests: [ask('COGS split by input category', ['bean_price_change', 'non_bean_input_change'])], question: 'What does it tell you?' }));
    expect(r.interviewerText).not.toMatch(/I don't have/);
    expect(r.interviewerText).toMatch(/Raw coffee bean costs are up 40%/);
    expect(r.interviewerText).toMatch(/Other input costs — dairy, packaging, and food — are up 37\.5%/);
  });

  // Lorenzo, 13 Oct (Step-4 rulings, 4b; Marcus 71a04add t12 — "Do we have
  // the split within that non-bean bucket?" heard "As I mentioned:" and the
  // bean and other-input figures again): "As I mentioned" only for a re-ask
  // of the same item; a narrower ask the case doesn't hold is refused.
  describe('"As I mentioned" only for a re-ask of the same item', () => {
    const ALL = [...COST, 'bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change'];
    it.each([
      ['the split within the non-bean input costs', ['exhibit-a']],
      ['the split within the non-bean input costs', ['non_bean_input_change']],
      ['the breakdown of the other inputs', ['non_bean_input_change']],
      ['the split within dairy, packaging and food', []],
    ] as [string, string[]][])('"%s" (mapped to %o): refused, nothing restated', async (what, itemIds) => {
      seed({ phase: 'EXHIBIT', revealed: ALL, flags: SATISFIED });
      const r = await say('Do we have the split within that non-bean bucket?', T({ say: 'Understood.', requests: [ask(what, itemIds)], question: 'What does it tell you?' }));
      expect(r.interviewerText).not.toMatch(/As I mentioned|up 40%|up 37\.5%/);
      expect(r.interviewerText).toContain(`I don't have ${what}.`);
    });
    it('a split of a whole line by its case name ("rent" for overhead), beside an exhibit: refused, the line not restated', async () => {
      seed({ phase: 'EXHIBIT', revealed: ALL, flags: SATISFIED });
      const r = await say('Do we have the split within rent?', T({ say: 'Understood.', requests: [ask('the split within rent', ['overhead_pct', 'exhibit-a'])], question: 'What does it tell you?' }));
      expect(r.interviewerText).not.toMatch(/As I mentioned/);
      expect(r.interviewerText).toContain("I don't have the split within rent.");
    });
    it('a re-ask of the item itself is restated', async () => {
      seed({ phase: 'EXHIBIT', revealed: ALL, flags: SATISFIED });
      const r = await say('Sorry, what was the other inputs figure again?', T({ say: 'Sure.', requests: [ask('the price change of the other inputs', ['non_bean_input_change'])], question: 'What does it tell you?' }));
      expect(r.interviewerText).toMatch(/As I mentioned: Other input costs — dairy, packaging, and food — are up 37\.5%/);
    });
    it('a re-ask of the group is restated, every item of it', async () => {
      seed({ phase: 'EXHIBIT', revealed: ALL, flags: SATISFIED });
      const r = await say('What were the input price changes again?', T({ say: 'Sure.', requests: [ask('the input price changes', [])], question: 'What does it tell you?' }));
      expect(r.interviewerText).toMatch(/As I mentioned: .*up 40%.*up 37\.5%/);
    });
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

// Lorenzo, 15 Oct (batch-25 ruling 6; Blake cd75e075 t15): a need stated as
// "worth checking the actual COGS percentage" is offered, not dropped.
describe('a stated need in a passing mention is offered (Blake cd75e075 t15)', () => {
  it('"Worth checking the actual COGS percentage" → the offer line', async () => {
    seed({ phase: 'ANALYSIS', revealed: ['labor_pct', 'overhead_pct', 'stores_count', 'avg_ticket', 'menu_price_change', 'bean_price_change', 'non_bean_input_change'], flags: SATISFIED });
    const r = await say("So I'm at roughly 11 from COGS plus 2 from overhead, 13 of 18, with about 5 unaccounted for. That residual probably means my COGS base assumption was wrong — I anchored on 30% of revenue from memory. If COGS was actually closer to 40%, the same 37.5–40% inflation gives you about 15 points instead of 11, and the whole decline closes out. Worth checking the actual COGS percentage rather than my benchmark.", T({
      say: "You're reaching for the actual COGS percentage.", requests: [{ what: 'COGS as a percent of revenue, both years', itemIds: ['cogs_pct'], explicit: false, respond: 'release' }],
      question: 'With those figures, does your COGS base assumption hold, and how do they change your account of the 18-point drop?',
    }));
    expect(r.interviewerText).toMatch(/I can share COGS as a percent of revenue if you'd like\./);
  });
});

describe('the fallback does not re-ask what was just answered (batch 21 D8, Anika t4)', () => {
  it("the model's question withheld after she named where she'd start → a fallback that isn't \"what would you look at first\"", async () => {
    seed({ phase: 'STRUCTURE', flags: { lastQuestion: 'Which of your four levers do you prioritize, and what makes you confident the problem sits there rather than in the others?' } });
    const r = await say("Cost per cup, and the reason is arithmetic on what you've already given me. Revenue is up 15%, so stores × cups × price has grown. Meanwhile margin went 24% to 6% — an 18-point swing. Do we have a cost breakdown as a percent of revenue for both years?", T({
      say: '', requests: [{ what: 'the cost breakdown as a percent of revenue', itemIds: ['cogs_pct', 'labor_pct', 'overhead_pct'], explicit: true, respond: 'release' }],
      question: 'With those figures in front of you, which cost line is driving the margin decline, and how do you size its contribution?',
    }));
    expect(r.interviewerText).toMatch(/once we've settled your structure\./);
    expect(r.interviewerText).not.toMatch(/first|start|in front of you/i);
    expect(r.interviewerText).toMatch(/\?$/);
  });
});

describe('a code-written fallback never marks the pressure test asked (Lorenzo, 13 Oct)', () => {
  it('the probe-like no-figures fallback ("Which area … first?") replacing a withheld question leaves the test not asked', async () => {
    let probeLike = 0;
    for (let i = 0; i < 12; i++) {
      seed({ phase: 'STRUCTURE' });
      modelQueue.length = 0;
      const m = T({ say: 'Mm-hm.', question: 'With those figures in front of you, which cost line is driving it?' });
      modelQueue.push(m, m);
      const r = await runTurn(`seed-${i}`, 'Revenue, costs, and then the store base.', {});
      const pt = (store.session.flagsJsonb as Record<string, { state: string }>).pressureTest;
      if (/\bwhich (?:part|area)\b[^?]*\bfirst\b/i.test(r.interviewerText)) probeLike++;
      expect(pt?.state ?? 'not_asked').toBe('not_asked');
    }
    expect(probeLike).toBeGreaterThan(0);   // the case under test occurred
  });
  it("a probe-like fallback doesn't stop code asking its own probe (gate held data twice, structure given)", async () => {
    let probeLike = 0;
    for (let i = 0; i < 12; i++) {
      seed({ phase: 'STRUCTURE', flags: { pressureTest: { state: 'not_asked', reasks: 0, codeAsked: false, gatedTurns: 1, structureGiven: true, structureAsked: false } } });
      modelQueue.length = 0;
      const m = T({ say: 'Mm-hm.', requests: [{ what: 'the cost breakdown', itemIds: ['cogs_pct', 'labor_pct', 'overhead_pct'], explicit: true, respond: 'release' }],
        question: 'With those figures in front of you, which cost line is driving it?' });
      modelQueue.push(m, m);
      const r = await runTurn(`code-probe-${i}`, 'Could I get the cost breakdown?', {});
      if (/which (?:part|area)[^?]*first/i.test(r.interviewerText)) probeLike++;
      expect((store.session.flagsJsonb as Record<string, { state: string; codeAsked: boolean }>).pressureTest).toMatchObject({ state: 'awaiting', codeAsked: true });
    }
    expect(probeLike).toBe(0);   // code's probe replaced the fallback every time
  });
  it("the model's probe kept in front of a code-appended question still counts", async () => {
    seed({ phase: 'STRUCTURE' });
    await say('Revenue, costs, and then the store base.', T({ say: 'Mm-hm.', question: "Tell me what might be missing from your structure. With those figures in front of you, where would you start?" }));
    expect((store.session.flagsJsonb as Record<string, { state: string }>).pressureTest.state).toBe('awaiting');
  });
  it("the model's own probe still marks it asked; so does code's own probe", async () => {
    seed({ phase: 'STRUCTURE' });
    await say('Revenue, costs, and then the store base.', T({ move: 'pressure_test', question: 'Which branch would you start with, and why?' }));
    expect((store.session.flagsJsonb as Record<string, { state: string }>).pressureTest.state).toBe('awaiting');
  });
});

describe("one refusal, code's (batch 21 D8, Raj t14)", () => {
  const COST = ['cogs_pct', 'labor_pct', 'overhead_pct'];
  const ASK = { what: 'price elasticity and competitor pricing', itemIds: [], explicit: true, respond: 'release' as const };
  it('a refusal in the model\'s "say" is withheld: code\'s data line refuses', async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('Do we have any read on price elasticity, or what competitors have done on price?', T({
      say: "Right. Elasticity and competitor pricing aren't something I have in this case.", requests: [ASK], question: 'What else could Brew & Bean do to close the gap?',
    }));
    expect(r.interviewerText).toBe("Right. I don't have price elasticity and competitor pricing. What else could Brew & Bean do to close the gap?");
  });
  it("a refusal statement in the question is withheld when code's line refuses this turn", async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('Do we have competitor pricing?', T({
      say: 'Mm-hm.', requests: [{ ...ASK, what: 'competitor pricing' }], question: "Competitor pricing isn't something I have. What else would you look at?",
    }));
    expect(r.interviewerText).toBe("Mm-hm. I don't have competitor pricing. What else would you look at?");
  });
  it('setting aside a claim the candidate invented is no refusal (batch 21 Omar t16)', async () => {
    seed({ phase: 'RECOMMENDATION', revealed: COST, flags: SATISFIED });
    const q = "You mentioned a franchisee telling corporate to go to hell, which I haven't said and which isn't in the case, so set that aside. What else would you look at?";
    const r = await say('Do we have margin split by ownership type?', T({ say: 'Mm-hm.', requests: [{ ...ASK, what: 'margin split by ownership type' }], question: q }));
    expect(r.interviewerText).toContain(q);
  });
  it("it stays when it is the only answer (no ask declared, code refuses nothing)", async () => {
    seed({ phase: 'EXHIBIT', revealed: COST, flags: SATISFIED });
    const r = await say('Do we have competitor pricing?', T({ say: 'Mm-hm.', question: "Competitor pricing isn't something I have. What else would you look at?" }));
    expect(r.interviewerText).toBe("Mm-hm. Competitor pricing isn't something I have. What else would you look at?");
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

  it('"With that in hand" after code held the data, nothing delivered, is withheld (batch 21 Marcus t6)', async () => {
    seed({ phase: 'STRUCTURE' });
    const r = await say("If I had to test one thing first, it'd be the menu-price history — do we have that?", T({
      say: 'Understood.', requests: [{ what: 'menu price changes', itemIds: ['menu_price_change'], explicit: true, respond: 'release' }],
      question: 'With that in hand, what does it tell you about your pricing hypothesis, and what would you want to look at next?',
    }));
    expect(r.interviewerText).toMatch(/I'll share menu price changes once we've settled your structure\./);
    expect(r.interviewerText).not.toMatch(/With that in hand/);
    expect(r.interviewerText).toMatch(/\?$/);
    expect(withheldFor('undelivered_claim')).toHaveLength(1);
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

// Lorenzo, 13 Oct (Larkspur rulings a, round 2): no "I don't have X" for what
// a ledger item or the prompt covers (Raj 55d12d38 t7, Maya b0b28d36 t8).
describe('a refusal of what the case holds becomes the line that holds it', () => {
  const ask = (what: string) => ({ what, itemIds: [] as string[], explicit: true, respond: 'release' as const });
  it('Raj t7: "whether the 15% growth is total or same-store revenue" gets the store count', async () => {
    seed({ phase: 'ANALYSIS', flags: SATISFIED });
    const r = await say('Is the 15% chain revenue or same-store revenue?', T({ say: 'Good question.', requests: [ask('whether the 15% growth is total or same-store revenue')], question: 'What does that tell you?' }));
    expect(r.interviewerText).toMatch(/200 stores today — and it was 200 stores two years ago/);
    expect(r.interviewerText).not.toMatch(/I don't have/);
  });
  it('…and once the store count is out, it is restated', async () => {
    seed({ phase: 'ANALYSIS', flags: SATISFIED, revealed: ['stores_count'] });
    const r = await say('Is that same-store?', T({ say: 'Mm-hm.', requests: [ask('same-store sales')], question: 'What does that tell you?' }));
    expect(r.interviewerText).toMatch(/As I mentioned: 200 stores today/);
  });
  it('Maya t8: "whether the 24% to 6% margin is net margin for the whole chain" restates the prompt fact', async () => {
    seed({ phase: 'CLARIFY', flags: SATISFIED });
    const r = await say('Is the 24% to 6% net margin for the whole chain?', T({ move: 'clarify', say: 'Sure.', requests: [ask('whether the 24% to 6% margin is net margin for the whole chain')], question: 'How would you approach it?' }));
    expect(r.interviewerText).toMatch(/As I mentioned: Net profit margin fell from 24% to 6% over the past two years\./);
    expect(r.interviewerText).not.toMatch(/I don't have/);
  });
  // Lorenzo, 15 Oct (batch-25 ruling 7): transaction volume → the average ticket.
  const TICKET = /The average transaction is \$6\.80, up from \$6\.20 two years ago/;
  it('Jordan 78c89dba t9: "transaction volume by store, same-store versus new" — the ticket and the store count', async () => {
    seed({ phase: 'ANALYSIS', flags: SATISFIED, revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'] });
    const r = await say('Do we have transaction volume by store, same-store versus new?', T({ say: 'Mm-hm.', requests: [ask('transaction volume by store, same-store versus new')], question: 'What does that tell you?' }));
    expect(r.interviewerText).toMatch(TICKET);
    expect(r.interviewerText).toMatch(/200 stores today/);
    expect(r.interviewerText).not.toMatch(/I don't have/);
  });
  it('Tyler 47563861 t13: "transaction volume per store" — the ticket', async () => {
    seed({ phase: 'ANALYSIS', flags: SATISFIED, revealed: ['cogs_pct', 'labor_pct', 'overhead_pct', 'stores_count'] });
    const r = await say('Do we know transaction volume per store over the period?', T({ say: 'Got it.', requests: [ask('transaction volume per store')], question: 'What would you pull first?' }));
    expect(r.interviewerText).toMatch(TICKET);
    expect(r.interviewerText).not.toMatch(/I don't have/);
  });
  it('Marisol 0f7551c2 t9: mapped to the ticket and the store count, the ticket is no longer scoped out', async () => {
    seed({ phase: 'ANALYSIS', flags: SATISFIED, revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'] });
    const r = await say('Do we have transaction volume per store?', T({ say: 'Mm-hm.', requests: [{ what: 'transaction volume per store', itemIds: ['avg_ticket', 'stores_count'], explicit: true, respond: 'release' }], question: 'What does that tell you?' }));
    expect(r.interviewerText).toMatch(TICKET);
    expect(r.interviewerText).toMatch(/200 stores today/);
  });
  const PER_STORE = /Average revenue per store/;
  it('Marcus 9cb2554f t15 (batch 27): "transaction volume or average ticket per store", mapped to the ticket and revenue per store — not revenue per store', async () => {
    seed({ phase: 'ANALYSIS', flags: SATISFIED, revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'] });
    const r = await say('Do we have transaction volume or average ticket per store? That would tell me whether there\'s headroom on attach rather than price.', T({ say: 'Got it.', requests: [{ what: 'average ticket and transaction data per store', itemIds: ['avg_ticket', 'revenue_per_store'], explicit: true, respond: 'release' }], question: 'What is your recommendation to the CEO?' }));
    expect(r.interviewerText).toMatch(TICKET);
    expect(r.interviewerText).not.toMatch(PER_STORE);
  });
  it('an ask with no per-store cut keeps the model\'s mapping ("whether revenue growth came from volume or new stores": the ticket and the store count)', async () => {
    seed({ phase: 'ANALYSIS', flags: SATISFIED, revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'] });
    const r = await say('Do we know whether revenue growth came from volume or new stores?', T({ say: 'Mm-hm.', requests: [{ what: 'whether revenue growth came from volume or new stores', itemIds: ['avg_ticket', 'stores_count'], explicit: true, respond: 'release' }], question: 'What does that tell you?' }));
    expect(r.interviewerText).toMatch(TICKET);
    expect(r.interviewerText).toMatch(/200 stores today/);
  });
  it('only a per-store ask: "same-store sales" mapped to total revenue gets no store count added', async () => {
    seed({ phase: 'ANALYSIS', flags: SATISFIED, revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'] });
    const r = await say('Do we have same-store sales?', T({ say: 'Mm-hm.', requests: [{ what: 'same-store sales', itemIds: ['revenue_total'], explicit: true, respond: 'release' }], question: 'What does that tell you?' }));
    expect(r.interviewerText).toMatch(/Total revenue is \$480M a year\./);
    expect(r.interviewerText).not.toMatch(/200 stores today/);
  });
  it('Fiona f4bd1da5 t9 (batch 27): "transaction volume per store", mapped to revenue per store and the store count — the ticket in place of revenue per store', async () => {
    seed({ phase: 'ANALYSIS', flags: SATISFIED, revealed: ['cogs_pct', 'labor_pct', 'overhead_pct'] });
    const r = await say('Do we have data on transaction volume per store?', T({ say: 'Right.', requests: [{ what: 'transaction volume per store', itemIds: ['revenue_per_store', 'stores_count'], explicit: true, respond: 'release' }], question: 'What else could they do?' }));
    expect(r.interviewerText).toMatch(TICKET);
    expect(r.interviewerText).not.toMatch(PER_STORE);
    expect(r.interviewerText).toMatch(/200 stores today/);   // only the per-store cut goes
  });
  it('what nothing covers is still refused', async () => {
    seed({ phase: 'ANALYSIS', flags: SATISFIED });
    const r = await say('Do you have competitor pricing?', T({ say: 'Mm-hm.', requests: [ask('competitor pricing')], question: 'What would you do without it?' }));
    expect(r.interviewerText).toMatch(/I don't have competitor pricing\./);
  });
});

