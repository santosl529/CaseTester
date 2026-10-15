// Lorenzo, 15 Oct (batch-26 fix 2): a checker line counts as delivered only if
// the delivered text contains it. Batch 26 Jasmine 074b0534 t31: the probe on
// "about 5 points" was selected and logged "used", the model asked for the
// recommendation instead, and nothing raised it again. Settle now says the line
// itself when the model left it out, and undoes the booking when another of
// code's lines still takes the question — the flag stays pending.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { lineHeard } from '@/lib/orchestrator/math-checker-live';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { CheckerLinePlan } from '@/lib/orchestrator/plan-turn';
import { modelPlanFixture } from './fixtures/model-plan';

const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What drove it?', ...over });
const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
const outcome = (turn: ModelTurn): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });

// Jasmine 074b0534 t31: the probe and what the model said instead.
const JASMINE_PROBE = 'Walk me through how you got to about 5 points.';
const JASMINE_T31 = T({ move: 'recommendation', say: 'Right.', question: 'Pulling it together for the CEO in a few sentences: what is your final recommendation, in what order, and what would you want confirmed before acting?' });
// Jasmine t29: said as written.
const JASMINE_T29_LINE = "You said you'd need a 25-30% increase to recover all 16 points. How did you get that figure, and which costs did you hold fixed?";
// Marisol 2456aa9d t9: a paraphrase that drops "and add 14.7".
const MARISOL_LINE = 'You said other inputs are also 25% of COGS and add 14.7. How did you get that 25% share for them?';
const MARISOL_T9 = T({ say: 'Right.', question: 'You said other inputs are also 25% of COGS. How did you get that 25% share for them?' });
// Jordan 6bd9edf3 t11: the correction, logged "delivered", not said.
const JORDAN_CORRECTION = 'COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base.';
const JORDAN_T11 = T({ move: 'brainstorm', say: 'Mm-hm.', question: "You said pricing has to carry most of the load. Beyond the levers you've named on pricing, procurement and menu, what else could Brew & Bean do to rebuild its margin?" });

function planWith(line: Omit<CheckerLinePlan, 'undo'> & { undo?: CheckerLinePlan['undo'] }, pt: 'satisfied' | 'awaiting' = 'satisfied') {
  const plan = modelPlanFixture({ distress: null, candidateText: 'So price is partial — maybe 5 points — and the rest has to come from input renegotiation.' });
  plan.state.pressureTest = pt === 'satisfied'
    ? { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 2 }
    : { ...INITIAL_PRESSURE_TEST, state: 'awaiting', askedAt: 2, probe: 'Is that structure MECE?', intents: ['mece'], awaitingReplies: 0, followUps: [] };
  // Jasmine's exhibit went out at t3 and her COGS inputs at t5; the brainstorm was asked at t9: nothing owed.
  plan.state.requiredExhibit = undefined;
  plan.state.analysisOwed = false;
  plan.state.owedStage = undefined;
  plan.state.shownExhibitIds = new Set(['exhibit-a']);
  plan.state.checkerLine = { undo: { attempt: undefined, step: 'checker:about 5 points', mathChecker: { handled: [] } }, ...line };
  // What Plan booked for it.
  plan.ctx.flags.mathChecker = { handled: [line.id] };
  plan.ctx.flags.stepProbes = { 'checker:about 5 points': 1 };
  plan.state.recomputeAttempts[line.key] = 1;
  // As Plan gives them live: the flag's figures may be doubted, the line's figures are sourced.
  const figs = (line.line.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  plan.state.flaggedFigures = [...plan.state.flaggedFigures, ...figs];
  plan.state.derivedValueTexts.push(...figs.map(String));
  plan.ctx.events.push({ category: 'math_checker', subtype: 'flag', payload: { id: line.id, outcome: line.action, reason: 'attempt 1', key: line.key } });
  return plan;
}
const checkOf = (plan: ReturnType<typeof planWith>) => plan.ctx.checks.entries.find(c => c.check === 'checker_line');

describe('lineHeard', () => {
  it('holds the line whatever the case, quotes, dashes and spacing', () => {
    expect(lineHeard(`Understood. ${JASMINE_T29_LINE}`, JASMINE_T29_LINE)).toBe(true);
    expect(lineHeard("understood.  you said you’d need a 25–30% increase to recover all 16 points. how did you get that figure, and which costs did you hold fixed", JASMINE_T29_LINE)).toBe(true);
  });
  it('a recommendation ask in its place is not the line (Jasmine t31)', () => {
    expect(lineHeard(`${JASMINE_T31.say} ${JASMINE_T31.question}`, JASMINE_PROBE)).toBe(false);
  });
  it('a paraphrase is not the line (Marisol t9 dropped "and add 14.7")', () => {
    expect(lineHeard(`${MARISOL_T9.say} ${MARISOL_T9.question}`, MARISOL_LINE)).toBe(false);
  });
  it('decimals are kept: "8.5" is not "85"', () => {
    expect(lineHeard('A 10% price rise lifts margin about 85 points, not 5.', 'A 10% price rise lifts margin about 8.5 points, not 5.')).toBe(false);
  });
});

describe('the checker line on a model turn', () => {
  it('Jasmine t31: the model asked for the recommendation — code says the probe in its place', async () => {
    const plan = planWith({ id: '27:1', key: 'checker:about 5 points', action: 'probe', line: JASMINE_PROBE });
    const s = await settleTurn(plan, outcome(JASMINE_T31));
    expect(s.spokenText).toBe(`Right. ${JASMINE_PROBE}`);
    expect(s.spokenText).not.toMatch(/final recommendation/);
    expect(checkOf(plan)).toMatchObject({ decision: 'act', detail: { by: 'code', heard: true } });
    expect(plan.ctx.flags.mathChecker).toEqual({ handled: ['27:1'] });   // booked: it was heard
  });
  it('Jasmine t29: the model said it as written — nothing changes', async () => {
    const plan = planWith({ id: '27:0', key: 'needed_for_gain@25-30', action: 'probe', line: JASMINE_T29_LINE });
    const s = await settleTurn(plan, outcome(T({ say: 'Understood.', question: JASMINE_T29_LINE })));
    expect(s.spokenText).toBe(`Understood. ${JASMINE_T29_LINE}`);
    expect(checkOf(plan)).toMatchObject({ decision: 'pass', detail: { by: 'model', heard: true } });
  });
  it('Marisol t9: a paraphrase is replaced by the vetted line', async () => {
    const plan = planWith({ id: '7:2', key: 'checker:25%', action: 'probe', line: MARISOL_LINE });
    const s = await settleTurn(plan, outcome(MARISOL_T9));
    expect(s.spokenText).toBe(`Right. ${MARISOL_LINE}`);
  });
  it('Jordan t11: a correction the model left out goes before its question', async () => {
    const plan = planWith({ id: '7:3', key: 'checker:38-40%', action: 'correct', line: JORDAN_CORRECTION });
    const s = await settleTurn(plan, outcome(JORDAN_T11));
    expect(s.spokenText).toBe(`Mm-hm. ${JORDAN_CORRECTION} ${JORDAN_T11.question}`);
  });
  it('a correction the model put in "say" is heard there', async () => {
    const plan = planWith({ id: '7:3', key: 'checker:38-40%', action: 'correct', line: JORDAN_CORRECTION });
    const s = await settleTurn(plan, outcome(T({ say: `Mm-hm. ${JORDAN_CORRECTION}`, question: JORDAN_T11.question })));
    expect(s.spokenText).toBe(`Mm-hm. ${JORDAN_CORRECTION} ${JORDAN_T11.question}`);
    expect(checkOf(plan)).toMatchObject({ detail: { by: 'model' } });
  });
});

describe('another of code\'s lines takes the question: the flag stays pending', () => {
  it('a stage hold wins: the recommendation ask held for the owed exhibit, the line waits a turn', async () => {
    const plan = planWith({ id: '27:1', key: 'checker:about 5 points', action: 'probe', line: JASMINE_PROBE });
    plan.state.requiredExhibit = 'exhibit-a';
    plan.state.shownExhibitIds = new Set();
    const s = await settleTurn(plan, outcome(JASMINE_T31));
    expect(s.spokenText).toBe("Right. Here's an exhibit: Brew & Bean Cost Structure Over Time. What do you take from this exhibit?");
    expect(plan.ctx.flags.mathChecker).toEqual({ handled: [] });
    expect(checkOf(plan)).toMatchObject({ detail: { heard: false } });
  });
  it('the pressure-test re-ask wins; the booking is undone and the decision logged undelivered', async () => {
    const plan = planWith({ id: '27:1', key: 'checker:about 5 points', action: 'probe', line: JASMINE_PROBE }, 'awaiting');
    const s = await settleTurn(plan, outcome(JASMINE_T31));
    expect(s.spokenText).not.toContain(JASMINE_PROBE);
    expect(plan.ctx.flags.mathChecker).toEqual({ handled: [] });
    expect(plan.state.recomputeAttempts['checker:about 5 points']).toBeUndefined();
    expect((plan.ctx.flags.stepProbes as Record<string, number>)['checker:about 5 points']).toBe(0);
    expect(plan.ctx.events.find(e => e.category === 'math_checker' && e.subtype === 'flag')?.payload).toMatchObject({ id: '27:1', outcome: 'undelivered' });
    expect(checkOf(plan)).toMatchObject({ decision: 'act', detail: { heard: false } });
  });
});

// Lorenzo, 15 Oct: pricing corrections name today's margin. Said without that lead-in, the line is still heard — never said twice (replay: 5f1b5fa t19).
describe('a correction without its period lead-in is heard', () => {
  it('"A 12% price rise lifts margin about 10.1 points, not 6." holds "From today\'s 6% margin, a 12% price rise …"', () => {
    expect(lineHeard('A 12% price rise lifts margin about 10.1 points, not 6. Setting that aside…', "From today's 6% margin, a 12% price rise lifts margin about 10.1 points, not 6.")).toBe(true);
    expect(lineHeard('A 12% price rise lifts margin about 9 points, not 6.', "From today's 6% margin, a 12% price rise lifts margin about 10.1 points, not 6.")).toBe(false);
  });
});
