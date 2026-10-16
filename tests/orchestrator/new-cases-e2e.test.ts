// Each new case from prompt to close through the real runner (13 Oct): the
// database, the interviewer model and the background classifiers mocked —
// the model's turns are scripted, so every decision below is code's. Per
// case: the pressure test, the guide's exhibit order (an exhibit asked for
// early is held), the required exhibits (a recommendation ask while one is
// owed is held and code hands it over), the case's own brainstorm (none for
// Quillpath), the recommendation, its risk question and the close. No paid calls.
// The math checker is mocked on (after the merge with math-checker, 13 Oct):
// it checks the recommendation's figure and either finds it right (nothing
// changes) or flags it as conclusion-changing (the close holds once for it).
import { describe, it, expect, vi } from 'vitest';
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
      update: () => ({ set: (v: Row) => ({ where: async () => { if (store.session.status === 'active') store.session = { ...store.session, ...v }; } }) }),
    },
  };
});
vi.mock('@/lib/analytics', async orig => ({ ...(await orig<object>()), logEvent: async () => {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => ({ label: 'none', reason: '' }) }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/hint-check', async orig => ({ ...(await orig<object>()), checkHintDelivered: async () => null }));
// The checker, mocked on: every gated message gets this verdict at once.
const checked: string[] = [];
let verdict: CheckerClaim['verdict'] = 'correct';
const REC_FIGURE = 'about 40% above it';
const checkerClaim = (): CheckerClaim => ({
  span: `it clears the bar with room to spare — ${REC_FIGURE}`, quantity: 'how far the option clears the bar', candidateValue: '40%', assumptions: '',
  verdict, correctValue: verdict === 'error' ? 10 : 40, correctLow: null, correctHigh: null, unit: '%', derivation: 'from the exhibits shown',
  errorType: verdict === 'error' ? 'conceptual' : null, changesConclusion: verdict === 'error', confidence: 'high',
  probe: 'You said it clears the bar by about 40%. Which figures did you use to get there?', pointer: '',
  codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, actualShare: null,
});
vi.mock('@/lib/orchestrator/math-checker', async orig => ({
  ...(await orig<object>()),
  checkMathClaims: async (a: { input: { message: string } }): Promise<CheckerResult> => {
    checked.push(a.input.message);
    return { claims: a.input.message.includes(REC_FIGURE) ? [checkerClaim()] : [], model: 'claude-sonnet-5-5', latencyMs: 5000, stopReason: 'end_turn' };
  },
}));
const modelQueue: ModelTurn[] = [];
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    createInterviewerModel: () => ({
      runTurn: async () => modelQueue[0],
      streamTurn: () => {
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
  judgeStructureGiven: async () => ({ given: true, reason: '' }),
}));

const { runTurn } = await import('@/lib/orchestrator/session-runner');
const { getCaseById } = await import('@/lib/cases/loader');

const M = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: 'Mm-hm.', question: 'What would you look at next?', ...over });
const ask = (what: string, itemIds: string[]) => ({ what, itemIds, explicit: true, respond: 'release' as const });
const PROBE = M({ move: 'pressure_test', question: "Is that MECE — what's missing?" });
const REC = M({ move: 'recommendation', question: "Pull it together — what's your recommendation to the CEO?" });
const RISK = M({ move: 'risk', question: "What's the biggest risk to that recommendation, and how would you test for it?" });

function start(caseId: string) {
  const startedAt = new Date(Date.now());
  store.session = {
    id: 's1', userId: 'u1', caseId, phase: 'INTRO', elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
    abandonPhase: null, startedAt, completedAt: null, coverageJsonb: null, flagsJsonb: { conduct: { warnings: 0 } },
  };
  store.turns = [{ id: 't0', sessionId: 's1', turnIndex: 0, role: 'interviewer', text: getCaseById(caseId).prompt, timestampMs: startedAt.getTime(), latencyMs: null }];
  store.revealed = []; store.exhibits = []; store.events = []; judgeVerdict = null; checked.length = 0;
}
// One exchange at minute `min` of the case: the candidate's message, the model's scripted turn (if the turn calls it).
async function at(min: number, candidate: string, model?: ModelTurn) {
  store.session = { ...store.session, startedAt: new Date(Date.now() - min * 60_000) };
  modelQueue.length = 0;
  if (model) modelQueue.push(model, model);
  const r = await runTurn('s1', candidate, {});
  await new Promise(res => setTimeout(res, 0));   // the checker's verdict lands before the next message
  return r;
}
const shown = () => store.exhibits.map(e => e.exhibitId);
const revealed = () => store.revealed.map(r => r.ledgerItemId as string);
const flags = () => store.session.flagsJsonb as Row;
const stage = (k: string) => (flags().stageEvidence as Record<string, { delivered: boolean; codeAsked?: boolean }>)[k];

type Script = {
  caseId: string;
  // [exhibit, the candidate's ask for it] in the guide's order
  order: [string, string][];
  // an exhibit asked for before its turn
  early: { exhibit: string; ask: string; after: number };   // asked once `after` exhibits are out
  brainstorm: string | null;
  // the exhibit the case's brainstorm comes before (its `after` names the brainstorm)
  brainstormBefore?: string;
};

const SCRIPTS: Script[] = [
  { caseId: 'prof-002', brainstorm: "What else could Larkspur do to make sure it's profitable in the first year?",
    order: [['exhibit-1', 'results by route'], ['exhibit-2', 'the per-flight economics on Hub–Lakeport'], ['exhibit-3', 'the planning estimates for the new routes']],
    early: { exhibit: 'exhibit-3', ask: 'the planning estimates for the new routes', after: 1 } },
  { caseId: 'entry-001', brainstorm: 'If Aldermoor builds its own team, how could it reduce the risk of a slow start?',
    order: [['exhibit-1', 'the patient funnel and pricing'], ['exhibit-2', 'the specialist survey'], ['exhibit-3', 'the entry options']],
    early: { exhibit: 'exhibit-3', ask: 'the entry options', after: 0 } },
  { caseId: 'pricing-001', brainstorm: null,
    order: [['exhibit-1', 'the economics of each plan'], ['exhibit-2', 'the cohort retention'], ['exhibit-3', 'new customers by plan'], ['exhibit-4', 'the price test results']],
    early: { exhibit: 'exhibit-4', ask: 'the price test results', after: 2 } },
  { caseId: 'launch-001', brainstorm: 'What could Hollis Bay do to get shoppers to try its chickpea snacks — and to keep buying them?', brainstormBefore: 'exhibit-3',
    order: [['exhibit-1', 'the bag economics and launch costs'], ['exhibit-2', 'the shopper survey'], ['exhibit-3', 'the sampling proposal']],
    early: { exhibit: 'exhibit-3', ask: 'the sampling proposal', after: 1 } },
];

describe.each(SCRIPTS.flatMap(s => (['correct', 'error'] as const).map(v => ({ ...s, checker: v }))))('$caseId from prompt to close (checker: $checker)', s => {
  it('runs as its guide intends', async () => {
    verdict = s.checker;
    const c = getCaseById(s.caseId);
    const core = c.analysisCore!;
    start(s.caseId);
    let min = 1;

    // Structure, and the one pressure test before any data.
    await at(min++, 'I would split this into the economics of the decision, the market, and the risks, and work through each in order.', PROBE);
    expect((flags().pressureTest as Row).state).toBe('awaiting');
    judgeVerdict = { answered: true, reason: 'names a missing branch' };

    const title = (id: string) => c.exhibits.find(e => e.id === id)!.title;
    const earlyAsk = async () => {
      const early = await at(min++, `Could I see ${s.early.ask}?`, M({ requests: [ask(s.early.ask, [s.early.exhibit])], exhibit: s.early.exhibit }));
      expect(shown(), `${s.early.exhibit} before its turn`).not.toContain(s.early.exhibit);
      expect(early.interviewerText).toMatch(new RegExp(`I'll come back to ${s.early.ask} shortly\\.`));
    };
    if (s.early.after === 0) await earlyAsk();

    // The analysis gate: a recommendation ask before the core analysis is held —
    // every exhibit here is required, so code hands over the first one.
    expect(core.items.filter(x => revealed().includes(x)).length).toBeLessThan(core.minItems ?? core.items.length);
    const held = await at(min++, 'I think I already see the answer.', REC);
    expect(shown()).toEqual([s.order[0][0]]);
    expect(held.interviewerText).toContain(`Here's an exhibit: ${title(s.order[0][0])}.`);
    expect(held.interviewerText).not.toMatch(/recommendation/i);

    // The rest in the guide's order: the candidate asks for each but the last;
    // the early one is held until its turn; the last is owed, so a
    // recommendation ask is held for it and code hands it over.
    for (const [i, [id, what]] of s.order.entries()) {
      if (i === 0) continue;
      if (i === s.early.after) await earlyAsk();
      const last = i === s.order.length - 1;
      if (s.brainstormBefore === id) {
        // The exhibit waits for the brainstorm: a recommendation ask is held for the brainstorm first.
        const b = await at(min++, 'I have enough to recommend now.', REC);
        expect(b.interviewerText).toBe(`Mm-hm. ${s.brainstorm}`);
        expect(shown()).not.toContain(id);
        expect(stage('brainstorm')).toMatchObject({ delivered: true });
      }
      const r = last
        ? await at(min++, s.brainstormBefore === id ? 'Sampling in stores, a trial-size bag, recipe ideas on the pack.' : 'I have enough to recommend now.', REC)
        : await at(min++, `Could I see ${what}?`, M({ move: 'exhibit', requests: [ask(what, [id])], question: 'What does it tell you?' }));
      expect(shown().at(-1)).toBe(id);
      expect(r.interviewerText).toContain(`Here's an exhibit: ${title(id)}.`);
      if (last) expect(r.interviewerText).not.toMatch(/recommendation/i);
      expect(r.exhibit?.notes ?? null).toBe(c.exhibits.find(e => e.id === id)!.notes ?? null);
    }
    expect(shown()).toEqual(s.order.map(([id]) => id));
    expect(core.items.filter(x => revealed().includes(x)).length).toBeGreaterThanOrEqual(core.minItems ?? core.items.length);

    // The recommendation ask: held once for the case's own brainstorm, if it has one.
    const asked = await at(min++, 'The numbers point one way; I can see the answer now.', REC);
    if (s.brainstorm && !s.brainstormBefore) {
      expect(asked.interviewerText).toBe(`Mm-hm. ${s.brainstorm}`);
      expect(stage('brainstorm')).toMatchObject({ delivered: true });
      const again = await at(min++, 'First, a phased approach; second, partner for reach; third, protect the core.', REC);
      expect(again.interviewerText).toMatch(/what's your recommendation to the CEO\?$/);
    } else {
      expect(asked.interviewerText).toMatch(/what's your recommendation to the CEO\?$/);
      expect(stage('brainstorm').delivered).toBe(s.brainstorm !== null);
    }
    expect(asked.interviewerText).not.toMatch(/what else could the client do|other levers could the client|protect margin/i);

    // The recommendation, its risk, the close.
    await at(min++, `I recommend going ahead with the option the numbers support, phased, because it clears the bar with room to spare — ${REC_FIGURE}.`, RISK);
    expect((flags().stall as Row).recommendationDelivered).toBe(true);
    expect(checked).toEqual([expect.stringContaining(REC_FIGURE)]);   // the only message with a figure
    expect(store.events).toContainEqual(expect.objectContaining({ category: 'math_checker', subtype: 'verdict' }));
    let close = await at(min++, 'The biggest risk is that the forecast is optimistic; I would test it with a pilot and a clear stop rule.');
    if (s.checker === 'error') {
      // A conclusion-changing flag still open holds the close once: code says the checker's probe.
      expect(close.ended).toBe(false);
      expect(close.interviewerText).toContain('Before we wrap up — you said it clears the bar by about 40%. Which figures did you use to get there?');
      close = await at(min++, 'I took it from the exhibits; on reflection it is closer to 10%, which still clears the bar.');
      // The redo's own figure is not yet checked (close-hold.ts, 16 Oct): the stage's follow-up once, then the close.
      expect(close.ended).toBe(false);
      close = await at(min++, 'A pilot first, with a clear stop rule.');
    }
    expect(close.ended).toBe(true);
    expect(store.session.status).toBe('completed');
    expect(min).toBeLessThan(16);   // a normal end, not time-up
  });
});
