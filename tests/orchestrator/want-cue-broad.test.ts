// Phase 1 4.6 (`wantCueBroad`; Lorenzo, 22 Oct: "The want cue: accept \"I'd want / I'd need / I'd confirm\" plus any
// noun phrase (their / its / a breakdown…). Keep the classifier's share at about 2% of turns or less.").
// Sentences verbatim from the batch 28–38 corpus.
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: () => new Promise(() => {}) }));
import { addressedAskSentences, explicitRequestCues } from '@/lib/orchestrator/request-signal';
import { codeWrittenAsks } from '@/lib/orchestrator/session-runner';
import { startMessageAsks } from '@/lib/orchestrator/turn-data';
import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { readsFixture } from './fixtures/turn-reads';

const broad = (t: string, phase = 'EXHIBIT') => addressedAskSentences(t, phase as never, { wantBroad: true });
const today = (t: string, phase = 'EXHIBIT') => addressedAskSentences(t, phase as never);

// b38 Larkspur Marisol t9 (hand grading: "no request signal fired"; `competitor_costs` never reached her).
const MARISOL_B38_T9 = "On the competitor: I'd want their cost per seat, their frequency on each route, and whether they're using larger aircraft — if their unit costs are genuinely below ours, matching fares is a losing fight.";
const ASKS = [
  MARISOL_B38_T9,
  // b38 Tyler t7, b38 Marisol t5, b35 Jasmine t9, b36 Larkspur Jasmine t7 (the confirm list), b37 Jasmine t5.
  "I'd want departures by route for both years, or equivalently block hours flown, to confirm the schedule didn't shrink.",
  'Next I\'d want average fare by route, and the extras revenue per passenger, to see whether the discounting is concentrated on one or two routes.',
  "The store build — I'd need store count, distribution rate, and bags per store per week.",
  "What I'd confirm: that the entrant is a low-cost carrier with a structurally lower cost base, how many seats a day it added on each route, and whether Larkspur's traffic held only because it matched.",
  "I'd also want how chip volumes have trended over the past three years, to size cannibalization.",
  // b33 Marisol t7: "its components".
  "To tell them apart I'd want COGS broken into its components as a percent of revenue across the three years.",
];

describe('4.6: the broad want cue', () => {
  it('switch on: "I\'d want / need / confirm" + a noun phrase is an asking sentence before the brainstorm', () => {
    for (const s of ASKS) expect(broad(s)).toEqual([s]);
  });
  it('switch off: today\'s cue misses them (byte-identical off)', () => {
    for (const s of ASKS) expect(today(s)).toEqual([]);
  });
  it('not a noun phrase: an infinitive, an object pronoun, a stretch of time, arithmetic', () => {
    for (const s of [
      'So at a high level I\'d want to look at the whole business — revenue side and cost side.',
      "So when you have US pricing and comparator prices, I'd mainly want them to confirm the magnitude of the premium rather than reopen the question.",
      "I'd want it split into green coffee beans, dairy, cups and packaging, and food items.",
      "I'd want four to six weeks before judging, because there's usually an initial shock that partially recovers.",
      'And to get all the way back to 24%, I\'d need revenue of 94 divided by 0.76, about 124 — a 24% price increase.',
      'To fully restore 24%, I\'d need 0.76 × 100(1+x) = 94, so 1+x = 1.237 — about a 24% increase.',
    ]) expect(broad(s)).toEqual([]);
  });
  it('late in the case a want is a next step, as before (a question still asks)', () => {
    expect(broad("I'd want their cost per seat before committing.", 'RECOMMENDATION')).toEqual([]);
    expect(broad("I'd want their cost per seat?", 'RECOMMENDATION')).toEqual(["I'd want their cost per seat?"]);
  });
  it("guard B's cue list (a model regeneration) is unchanged", () => {
    expect(explicitRequestCues(MARISOL_B38_T9)).toEqual([]);
  });
});

function plan(caseId: string, text: string, phase = 'EXHIBIT'): ModelPlan {
  const p = planTurn(readsFixture({ phase: phase as never, caseId, revealed: [] }), text, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  return p;
}

describe('4.6 through the switch', () => {
  const saved = process.env.ENGINE_SWITCHES;
  afterEach(() => { if (saved === undefined) delete process.env.ENGINE_SWITCHES; else process.env.ENGINE_SWITCHES = saved; });
  it('the message classifier starts on b38 Marisol t9 only with wantCueBroad on (prof-002)', async () => {
    delete process.env.ENGINE_SWITCHES;
    expect((await startMessageAsks(plan('prof-002', MARISOL_B38_T9))!).sentences).toEqual([]);
    process.env.ENGINE_SWITCHES = 'prof-002=wantCueBroad';
    const p = plan('prof-002', MARISOL_B38_T9);
    const started = startMessageAsks(p)!;
    expect(p.state.messageAsks).toBeDefined(); // the classifier call was started
    expect((await started).sentences).toEqual([MARISOL_B38_T9]);
  });
  it('another case\'s switch leaves prof-002 off; a code-written turn reads the same cue', () => {
    process.env.ENGINE_SWITCHES = 'prof-001=wantCueBroad';
    expect(codeWrittenAsks(plan('prof-002', MARISOL_B38_T9), []).sentences).toEqual([]);
    process.env.ENGINE_SWITCHES = '*=wantCueBroad';
    expect(codeWrittenAsks(plan('prof-002', MARISOL_B38_T9), []).sentences).toEqual([MARISOL_B38_T9]);
  });
});
