// Lorenzo, 20 Oct (round 5 Task 47, E7, serious; b35q Quillpath Marisol 087451cb: "the same probe 3+ times: t6, t12,
// t18"). She swapped the cohort rows — Pro's 21.5% (cancelled by month 12) read as Starter's annual churn, Starter's 40%
// as Pro's — and was probed on it, or on figures built on it, at t6 (the model), t8 "4.65", t10 "2.5", t12 "21.5%",
// t14 "2.0x for Pro", t18 "40%", t20 "$2,400" and t24 "30 months" before the first correction at t26. A misread input
// collects every probe on it or on a claim built on it, by code or by the model; at two, the next line on it is its
// correction through own-quantity framing — the row fix — or the report: never a third probe. Lorenzo: "For Quillpath
// Marisol the true line is the row fix ("Starter's 12-month cancellation is 40%; 21.5% is Pro's"), never "about 5%,
// not 21.5%" against her annual reading. If code can't write a true line, it goes to the report."
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { planCheckerFlags, INPUT_PROBE_CAP, STEP_PROBE_CAP, type CheckerPlanInput, type CheckerRow, type VerdictPayload } from '@/lib/orchestrator/math-checker-live';
import { dataFigure, rowFix, onItsOwnRow } from '@/lib/orchestrator/own-quantity';
import { challengeVerdict } from '@/lib/orchestrator/probe-guard';
import { candidateFiguresOf } from '@/lib/orchestrator/math-talk';
import { getCaseById } from '@/lib/cases/loader';
import type { VettedClaim } from '@/lib/orchestrator/math-checker';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { modelPlanFixture } from './fixtures/model-plan';
import EVIDENCE from './fixtures/e7-input-probes.json';

const pricing = getCaseById('pricing-001');
type Fixture = {
  candidateTurnIndex: number; candidateText: string; revealedIds: string[]; turnRows: CheckerPlanInput['turnRows']; rows: CheckerRow[];
  mathChecker: { handled: string[]; keys: Record<string, { figures: number[]; since: number }> }; attempts: Record<string, number>;
  stepProbes: Record<string, number>; inputProbes: Record<string, number[]>;
};
const F = EVIDENCE['b35q-marisol-087451cb-t11'] as unknown as Fixture;
const claimOf = (id: string): VettedClaim => {
  const [n, i] = id.split(':').map(Number);
  const v = F.rows.find(r => r.subtype === 'verdict' && (r.payloadJsonb as VerdictPayload).candidateTurnIndex === n)!.payloadJsonb as VerdictPayload;
  return v.claims[i];
};
const ctxOf = (revealedIds = F.revealedIds, caseData = pricing) => ({ caseData: caseData as never, revealedIds, shownExhibitIds: [] as string[], candidateTexts: [] as string[] });
const planAt = (over: Partial<CheckerPlanInput> = {}) => planCheckerFlags({
  rows: F.rows, handled: F.mathChecker.handled, turnRows: F.turnRows, candidateText: F.candidateText, candidateTurnIndex: F.candidateTurnIndex,
  currentFlags: [], attempts: F.attempts, keys: F.mathChecker.keys, stepProbes: F.stepProbes, inputProbes: F.inputProbes,
  underTimePressure: false, candidateFigures: candidateFiguresOf([...F.turnRows.filter(t => t.role === 'candidate').map(t => t.text), F.candidateText], [pricing.prompt]),
  caseData: pricing as never, revealedIds: F.revealedIds, ...over,
});
// The row fix: which row each figure belongs to, in the data's own figures (exhibit-2's cells; both released at t4).
const ROW_FIX = 'The cancelled figure at month 12 is 21.5% for Pro and 40% for Starter.';
// Her annual reading corrected as a monthly rate — false on her own reading (Review Focus 6).
const NOT_X = /about 5%, not 21\.5%/;
// A probe on one of her two inputs, in any of code's versions or the model's.
const probesInput = (line: string) => /21\.5|\b40%/.test(line) && !/ for Pro and /.test(line);
// The pricing case without the cohort exhibit: no cell to place her figures in, so no true line.
const noExhibits = { ...pricing, exhibits: pricing.exhibits.filter(e => e.id !== 'exhibit-2') };

describe('the row fix (own-quantity.ts): her own quantity is a row of the data', () => {
  it('her t7 "21.5%" is a figure of the data, said in its unit; "2.0x" (a ratio) is not', () => {
    expect(claimOf('7:0')).toMatchObject({ candidateValue: '21.5%', span: '21.5% is the twelve-month cancellation figure from the Starter cohort' });
    expect(dataFigure(claimOf('7:0'), ctxOf())).toBe(21.5);
    expect(dataFigure(claimOf('9:2'), ctxOf())).toBeNull();
  });
  it('Review Focus 6, in her words (t7 "21.5% is the twelve-month cancellation figure from the Starter cohort … I used it as the annual churn for Starter"): the row fix', () => {
    const fix = rowFix(21.5, claimOf('7:0'), ctxOf());
    expect(fix?.line).toBe(ROW_FIX);
    expect(fix?.line).not.toMatch(NOT_X);
  });
  it('the other half of the swap ("40% is the corresponding twelve-month cancellation number on the Pro side") gives the same line', () => {
    expect(claimOf('7:1').span).toBe('40% is the corresponding twelve-month cancellation number on the Pro side');
    expect(rowFix(40, claimOf('7:1'), ctxOf())?.line).toBe(ROW_FIX);
  });
  it('the Starter price "$40" is no "40%"; with no cohort cells there is no line', () => {
    expect(rowFix(40, claimOf('7:1'), ctxOf(F.revealedIds, noExhibits as never))).toBeNull();
    // …also read on a claim built on it that never writes "40%" ("Pro at 1 / 0.40 = 2.5 years gives … $2,400"): the input's unit.
    expect(rowFix(40, claimOf('7:3'), ctxOf(F.revealedIds, noExhibits as never), '%')).toBeNull();
  });
  it('FR-4: the cohort figures not out yet — no line', () => {
    expect(rowFix(21.5, claimOf('7:0'), ctxOf(['plan_prices_costs', 'plan_cac']))).toBeNull();
    // …even with the exhibit's cells in reach: a line says only figures the released lines or the prompt hold.
    expect(rowFix(21.5, claimOf('7:0'), { ...ctxOf(['plan_prices_costs', 'plan_cac']), shownExhibitIds: ['exhibit-2'] })).toBeNull();
  });
  it('her later "Starter: 1 / 0.40 = 2.5 years" (t27, after "I had the two cohort rows swapped") uses 40 on its own row: no misread', () => {
    const t27 = { ...claimOf('7:3'), span: '1 / 0.40 = 2.5 years = 30 months, × $30 margin = $900 LTV against $300 CAC = 3.0x', quantity: 'Starter standalone LTV/CAC', candidateValue: '3.0x', codeQuantity: { kind: 'step' as const, stepId: 'starter_ratio', price: null, target: null } };
    expect(onItsOwnRow(40, t27, ctxOf())).toBe(true);
    expect(onItsOwnRow(40, claimOf('7:1'), ctxOf())).toBe(false);
  });
});

describe('Quillpath Marisol 087451cb at t11: the third probe on her input is its correction', () => {
  it('the caps are two', () => { expect(INPUT_PROBE_CAP).toBe(2); expect(STEP_PROBE_CAP).toBe(2); });
  it('21.5 probed at t6 (the model: "you used 21.5% for Starter and 40% for Pro") and t8 (code: "4.65", built on it): t12 says the row fix, not "How did you arrive at 21.5%?"', () => {
    const p = planAt();
    expect(p.selected).toMatchObject({ id: '7:0', action: 'correct', key: 'input:21.5', line: ROW_FIX });
    expect(p.selected?.inputs).toEqual(['input:21.5', 'input:40']);
    expect(p.decisions.find(d => d.id === '7:0')).toMatchObject({ outcome: 'correct', line: ROW_FIX });
    expect(p.decisions.filter(d => d.line && probesInput(d.line))).toEqual([]);
  });
  it('40 (probed at t6 and t10, "2.5") is corrected by the same line: its claims ride on it, none is probed a third time (t18 "Show me how you got to 40%" never comes)', () => {
    const p = planAt();
    expect(p.selected?.riders?.map(r => r.id).sort()).toEqual(['7:1', '7:3', '9:0', '9:1']);
    for (const id of ['7:1', '7:3', '9:0', '9:1']) expect(p.decisions.find(d => d.id === id)).toMatchObject({ outcome: 'derived' });
    expect(p.waiting.map(w => w.id)).not.toContain('7:1');
  });
  it("the model's own probe counts: with t6 a plain question, 21.5 has had one probe (t8) — the probe goes out, booked to the input", () => {
    const turnRows = F.turnRows.map(t => (t.turnIndex === 6 ? { ...t, text: 'Mm-hm. What does that tell you about the two plans?' } : t));
    const p = planAt({ turnRows });
    expect(p.selected).toMatchObject({ id: '7:0', action: 'probe', input: 'input:21.5' });
  });
  it("code's own line counts when it names no figure: t8 said bare, booked in flags.inputProbes", () => {
    const turnRows = F.turnRows.map(t => (t.turnIndex === 8 ? { ...t, text: 'Right. Walk me through that calculation.' } : t));
    expect(planAt({ turnRows }).selected).toMatchObject({ action: 'correct', key: 'input:21.5', line: ROW_FIX });
    expect(planAt({ turnRows, inputProbes: {} }).selected).toMatchObject({ action: 'probe' });
  });
  it('with no true line possible, the flag goes to the report — and no third probe on 21.5% or 40% is said', () => {
    const p = planAt({ caseData: noExhibits as never });
    expect(p.selected === null || !probesInput(p.selected.line)).toBe(true);
    expect(p.decisions.find(d => d.id === '7:0')).toMatchObject({ outcome: 'unresolved', reason: expect.stringMatching(/two probes on its input \(input:21\.5\) already.*left for the report/) });
    expect(p.closedNow).toEqual(expect.arrayContaining(['checker:21.5%', 'input:21.5', 'input:40']));
    for (const id of ['7:1', '7:3', '9:0', '9:1']) expect(p.decisions.find(d => d.id === id)).toMatchObject({ outcome: 'unresolved' });
  });
});

describe('Review Focus 6: her own claim corrected at its second attempt is the row fix, never "about 5%, not 21.5%"', () => {
  // t5 "For Starter, the churn figure I'll use is 21.5% — that's the clean cancellation rate we have. … 1 / 0.215 ≈ 4.65 months"
  // (5:1, starter_churn): the vetted correction is "Starter monthly cancellation rate is about 5%, not 21.5%." — false on her
  // reading (t7: "I used it as the annual churn for Starter"; Starter's 12-month cancelled share is 40%).
  const t7 = (over: Partial<CheckerPlanInput> = {}) => planCheckerFlags({
    rows: F.rows.filter(r => r.subtype === 'verdict' && (r.payloadJsonb as VerdictPayload).candidateTurnIndex <= 5), handled: ['5:2', '5:3'],
    turnRows: F.turnRows.filter(t => t.turnIndex < 7 && t.turnIndex !== 6), candidateText: F.turnRows.find(t => t.turnIndex === 7)?.text ?? '', candidateTurnIndex: 7,
    currentFlags: [], attempts: { 'starter_churn@21.5': 1 }, keys: { 'starter_churn@21.5': { figures: [4.65], since: 5 } },
    underTimePressure: false, candidateFigures: [4.65], caseData: pricing as never, revealedIds: F.revealedIds, ...over,
  });
  it('the claim as vetted carries the false line', () => {
    expect(claimOf('5:1')).toMatchObject({ candidateValue: '21.5% churn, 4.65 months', correctionLine: 'Starter monthly cancellation rate is about 5%, not 21.5%.' });
  });
  it('the correction said is the row fix', () => {
    const p = t7();
    expect(p.selected).toMatchObject({ id: '5:1', action: 'correct', line: ROW_FIX });
    expect(p.selected?.line).not.toMatch(NOT_X);
  });
  it('with no true line possible: the report, not "about 5%, not 21.5%"', () => {
    const p = t7({ caseData: noExhibits as never });
    expect(p.selected?.line ?? '').not.toMatch(NOT_X);
    expect(p.decisions.find(d => d.id === '5:1')).toMatchObject({ outcome: 'unresolved' });
  });
});

describe('after the row fix: a claim on the input said before it was covered; one said after hears it once more, then the report', () => {
  const corrected = { 'input:21.5': { line: ROW_FIX, at: 11 }, 'input:40': { line: ROW_FIX, at: 11 } };
  const after = (over: Partial<CheckerPlanInput> = {}) => planAt({
    candidateTurnIndex: 13, handled: [...F.mathChecker.handled, '7:0', '7:1', '7:2', '7:3'], closed: ['input:21.5', 'input:40'], corrected, said: { [ROW_FIX.toLowerCase().replace(/\.$/, '')]: 1 },
    turnRows: [...F.turnRows, { turnIndex: 11, role: 'candidate', text: F.candidateText }, { turnIndex: 12, role: 'interviewer', text: `Got it. ${ROW_FIX} Where does that leave your analysis?` }],
    candidateText: 'Got it.', ...over,
  });
  it('9:0 and 9:1 (t9, before the fix was heard at t12): covered by it, for the report', () => {
    const p = after();
    for (const id of ['9:0', '9:1']) expect(p.decisions.find(d => d.id === id)).toMatchObject({ outcome: 'unresolved', reason: expect.stringMatching(/said before its correction, which covered it/) });
    expect(p.selected === null || !probesInput(p.selected.line)).toBe(true);
  });
  it('the same claims said after the fix: its line once more (ruling 1), never a probe', () => {
    const p = after({ corrected: { 'input:21.5': { line: ROW_FIX, at: 8 }, 'input:40': { line: ROW_FIX, at: 8 } } });
    expect(p.selected).toMatchObject({ action: 'restate', line: ROW_FIX });
  });
});

describe("a claim on no misread input: today's behavior", () => {
  // Her 2.0x (9:2, Pro LTV/CAC — a ratio, no figure of the data) after a probe: Rule 14's correction, as before (its
  // own-quantity framing: no quantity stated with it, wrong on every reading — code's figure without "not X").
  it('9:2 "2.0x" after a probe: its own correction at attempt 2', () => {
    const p = planAt({ handled: [...F.mathChecker.handled, '7:0', '7:1', '7:2', '7:3', '9:0', '9:1'], attempts: { ...F.attempts, 'pro_ratio@2': 1 }, candidateTurnIndex: 13 });
    expect(p.selected).toMatchObject({ id: '9:2', action: 'correct', key: 'pro_ratio@2', line: 'Pro LTV/CAC is about 3.3 times.' });
    expect(p.selected?.input).toBeUndefined();
  });
});

describe("the model's own probe on a closed input is withheld (probe-guard.ts); a quote of the data is not", () => {
  const ctx = { verified: [], alreadyProbed: new Set<string>(), flaggedThisTurn: false, candidateFigures: [4.65, 2.5], closedInputs: [21.5, 40] };
  it.each([
    'Show me how you got to 40%.',                                             // her t18 (code's probe, recorded as the model's say)
    "Where does 40% come from, and which plan's figure is it?",                // her t12, the model's own question
    'How did you arrive at 21.5%?',
  ])('"%s" → closed_to_report', s => {
    expect(challengeVerdict(s, ctx)).toMatchObject({ test: 'closed_to_report' });
  });
  it.each([ROW_FIX, "Given Starter's 40% cancelled by month 12, what monthly rate does that imply?"])('"%s" → spoken', s => {
    expect(challengeVerdict(s, ctx)).toBeNull();
  });
  it('without a closed input the same probe stands', () => {
    expect(challengeVerdict('Show me how you got to 40%.', { ...ctx, closedInputs: [] })).toBeNull();
  });
});

describe('the input count is booked by the turn the line is said on, and undone when it is not heard (Settle)', () => {
  const T = (over: Partial<ModelTurn> = {}): ModelTurn => ({ move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'What drove it?', ...over });
  const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
  const outcome = (turn: ModelTurn): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });
  const LINE = 'You said “4.65” — what were the steps in that calculation?';
  const planWith = (pt: 'satisfied' | 'awaiting') => {
    const plan = modelPlanFixture({ distress: null, candidateText: 'Same method for Pro.' });
    plan.state.pressureTest = pt === 'satisfied'
      ? { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 2 }
      : { ...INITIAL_PRESSURE_TEST, state: 'awaiting', askedAt: 2, probe: 'Is that structure MECE?', intents: ['mece'], awaitingReplies: 0, followUps: [] };
    plan.state.requiredExhibit = undefined;
    plan.state.analysisOwed = false;
    plan.state.owedStage = undefined;
    plan.state.checkerLine = { id: '5:1', key: 'starter_churn@21.5', action: 'probe', line: LINE, undo: { attempt: undefined, step: 'starter_churn', input: { key: 'input:21.5', turn: 8 }, mathChecker: { handled: [] } } };
    plan.ctx.flags.mathChecker = { handled: ['5:1'] };
    plan.ctx.flags.stepProbes = { starter_churn: 1 };
    plan.ctx.flags.inputProbes = { 'input:21.5': [8] };
    plan.state.recomputeAttempts['starter_churn@21.5'] = 1;
    plan.state.flaggedFigures = [...plan.state.flaggedFigures, 4.65];
    return plan;
  };
  it('heard: the turn stays counted', async () => {
    const plan = planWith('satisfied');
    const s = await settleTurn(plan, outcome(T({ say: 'Right.', question: LINE })));
    expect(s.spokenText).toContain(LINE);
    expect(plan.ctx.flags.inputProbes).toEqual({ 'input:21.5': [8] });
  });
  it('another of code\'s lines takes the question: the booking is undone', async () => {
    const plan = planWith('awaiting');
    const s = await settleTurn(plan, outcome(T({ say: 'Right.', question: 'What drove it?' })));
    expect(s.spokenText).not.toContain(LINE);
    expect(plan.ctx.flags.inputProbes).toEqual({ 'input:21.5': [] });
    expect((plan.ctx.flags.stepProbes as Record<string, number>).starter_churn).toBe(0);
  });
});
