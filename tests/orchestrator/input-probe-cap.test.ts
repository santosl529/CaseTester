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
const T23_5 = (EVIDENCE['b35q-marisol-087451cb-23:5'] as unknown as { claim: VettedClaim }).claim;
const V11 = (EVIDENCE['b35q-marisol-087451cb-v11'] as unknown as { row: CheckerRow }).row;
// A claim placed in her t3 message (structure, before any data: no input stated there), held so it doesn't expire —
// a claim on no chain.
const inMessage3 = (c: VettedClaim) => F.rows.map(r => (r.subtype === 'verdict' && (r.payloadJsonb as VerdictPayload).candidateTurnIndex === 3
  ? { ...r, payloadJsonb: { ...(r.payloadJsonb as VerdictPayload), claims: [c] } } : r));
const ALL_HANDLED = [...F.mathChecker.handled, '7:0', '7:1', '7:2', '7:3', '9:0', '9:1', '9:2'];
// One claim alone in her t11 slot, the message reduced to `text` (states no input): planned on t13.
const aloneAt11 = (c: VettedClaim, text: string, over: Partial<CheckerPlanInput> = {}) => planAt({
  rows: [...F.rows, { ...V11, payloadJsonb: { ...(V11.payloadJsonb as VerdictPayload), claims: [c] } }], handled: ALL_HANDLED, candidateTurnIndex: 13,
  turnRows: [...F.turnRows, { turnIndex: 11, role: 'candidate', text }, { turnIndex: 12, role: 'interviewer', text: 'Got it. Where does that leave your analysis?' }],
  candidateText: 'Got it.', ...over,
});
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
const ROW_FIX = 'At month 12, 21.5% of Pro customers and 40% of Starter customers had cancelled.';
// Her annual reading corrected as a monthly rate — false on her own reading (Review Focus 6).
const NOT_X = /about 5%, not 21\.5%/;
// A probe on one of her two inputs, in any of code's versions or the model's.
const probesInput = (line: string) => /21\.5|\b40%/.test(line) && !/ of Pro customers and /.test(line);
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
  it('a row label that is no verb phrase falls back to the plain form ("Left within a year" row)', () => {
    const odd = { ...pricing, exhibits: pricing.exhibits.map(e => e.id !== 'exhibit-2' ? e : { ...e, data: e.data.map(r => (r as Record<string, string>).Status === 'Cancelled' ? { ...r, Status: 'Left within a year' } : r) }) };
    expect(rowFix(21.5, claimOf('7:0'), ctxOf(F.revealedIds, odd as never))?.line).toBe('The left within a year figure at month 12 is 21.5% for Pro and 40% for Starter.');
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
    expect(p.selected).toMatchObject({ id: '7:0', action: 'correct', key: 'input:21.5%', line: ROW_FIX });
    expect(p.selected?.inputs).toEqual(['input:21.5%', 'input:40%']);
    expect(p.decisions.find(d => d.id === '7:0')).toMatchObject({ outcome: 'correct', line: ROW_FIX });
    expect(p.decisions.filter(d => d.line && probesInput(d.line))).toEqual([]);
  });
  it('40 (probed at t6 and t10, "2.5") is corrected by the same line: its claims ride on it, none is probed a third time (t18 "Show me how you got to 40%" never comes)', () => {
    const p = planAt();
    // 9:2 "Pro at 2.0x is the one in trouble." rides too: its 2.0x is 7:3's "ratio 2.0" (on 1 / 0.40), not the case's "2.0%" (review I3).
    expect(p.selected?.riders?.map(r => r.id).sort()).toEqual(['7:1', '7:3', '9:0', '9:1', '9:2']);
    for (const id of ['7:1', '7:3', '9:0', '9:1', '9:2']) expect(p.decisions.find(d => d.id === id)).toMatchObject({ outcome: 'derived' });
    expect(p.waiting.map(w => w.id)).not.toContain('7:1');
  });
  it("the model's own probe counts: with t6 a plain question, 21.5 has had one probe (t8) — the probe goes out, booked to the input", () => {
    const turnRows = F.turnRows.map(t => (t.turnIndex === 6 ? { ...t, text: 'Mm-hm. What does that tell you about the two plans?' } : t));
    const p = planAt({ turnRows });
    expect(p.selected).toMatchObject({ id: '7:0', action: 'probe', input: 'input:21.5%' });
  });
  it('a probe on another figure in another unit is not counted: t6 about "21.5 months" leaves 21.5% with one probe (review I2)', () => {
    const turnRows = F.turnRows.map(t => (t.turnIndex === 6 ? { ...t, text: 'Mm-hm. How did you get to 21.5 months?' } : t));
    expect(planAt({ turnRows }).selected).toMatchObject({ id: '7:0', action: 'probe', input: 'input:21.5%' });
  });
  it("code's own line counts when it names no figure: t8 said bare, booked in flags.inputProbes", () => {
    const turnRows = F.turnRows.map(t => (t.turnIndex === 8 ? { ...t, text: 'Right. Walk me through that calculation.' } : t));
    expect(planAt({ turnRows }).selected).toMatchObject({ action: 'correct', key: 'input:21.5%', line: ROW_FIX });
    expect(planAt({ turnRows, inputProbes: {} }).selected).toMatchObject({ action: 'probe' });
  });
  it('with no true line possible, the flag goes to the report — and no third probe on 21.5% or 40% is said', () => {
    const p = planAt({ caseData: noExhibits as never });
    expect(p.selected === null || !probesInput(p.selected.line)).toBe(true);
    expect(p.decisions.find(d => d.id === '7:0')).toMatchObject({ outcome: 'unresolved', reason: expect.stringMatching(/two probes on its input \(input:21\.5%\) already.*left for the report/) });
    expect(p.closedNow).toEqual(expect.arrayContaining(['checker:21.5%', 'input:21.5%', 'input:40%']));
    for (const id of ['7:1', '9:0', '9:1']) expect(p.decisions.find(d => d.id === id)).toMatchObject({ outcome: 'unresolved' });
    // R7 reversed (Lorenzo, 20 Oct, round-5b job 1): a claim built on an input left for the report with no line said gets
    // its own vetted correction once — "Pro at 1 / 0.40 = 2.5 years gives 2.5 × 12 × $80 = $2,400" is Pro's LTV, code's quantity.
    expect(p.selected).toMatchObject({ id: '7:3', action: 'correct', line: 'Pro lifetime value is about $4,000, not $2,400.' });
    expect(p.decisions.find(d => d.id === '7:3')).toMatchObject({ outcome: 'correct', root: 'input:40%', reason: expect.stringMatching(/^built on a closed input \(input:40%\) — its own correction, once/) });
    // "Pro at 2.0x is the one in trouble." has one of its own too: it waits for a later turn, on its input.
    expect(p.waiting).toEqual([expect.objectContaining({ id: '9:2', root: 'input:40%' })]);
  });
});

// Final review M2: a claim on an input closed this turn went to its own correction directly, past the queue's once
// path. It now goes through that path: under time pressure a minor one is shed with the root on its record (the report
// then says what became of the root, Task 55), and one with no true line goes to the report as "built on a closed input".
describe('final review M2: a claim on an input closed this turn takes the once path', () => {
  const minorBut = (ids: string[]) => F.rows.map(r => (r.subtype !== 'verdict' ? r : { ...r, payloadJsonb: { ...(r.payloadJsonb as VerdictPayload),
    claims: (r.payloadJsonb as VerdictPayload).claims.map((c, i) => ({ ...c, changesConclusion: ids.includes(`${(r.payloadJsonb as VerdictPayload).candidateTurnIndex}:${i}`) })) } }));
  it('under time pressure, the roots (7:0, 7:1) conclusion-changing and left for the report: 7:3 "$2,400" (minor) is shed with its root, never said', () => {
    const p = planAt({ caseData: noExhibits as never, underTimePressure: true, rows: minorBut(['7:0', '7:1']) });
    expect(p.decisions.find(d => d.id === '7:1')).toMatchObject({ outcome: 'unresolved', reason: expect.stringMatching(/left for the report/) });
    expect(p.selected).toBeNull();
    expect(p.decisions.find(d => d.id === '7:3')).toMatchObject({ outcome: 'shed', root: 'input:40%' });
    // No true line of its own (Starter churn 21.5): the report, built on the closed input.
    expect(p.decisions.find(d => d.id === '9:0')).toMatchObject({ outcome: 'unresolved', root: 'input:21.5%', reason: 'built on a closed input (input:21.5%)' });
  });
  it('without time pressure: unchanged — 7:3 is corrected once (the case above)', () => {
    const p = planAt({ caseData: noExhibits as never, rows: minorBut(['7:0', '7:1']) });
    expect(p.selected).toMatchObject({ id: '7:3', action: 'correct', line: 'Pro lifetime value is about $4,000, not $2,400.' });
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
  const corrected = { 'input:21.5%': { line: ROW_FIX, at: 11 }, 'input:40%': { line: ROW_FIX, at: 11 } };
  const after = (over: Partial<CheckerPlanInput> = {}) => planAt({
    candidateTurnIndex: 13, handled: [...F.mathChecker.handled, '7:0', '7:1', '7:2', '7:3'], closed: ['input:21.5%', 'input:40%'], corrected, said: { [ROW_FIX.toLowerCase().replace(/\.$/, '')]: 1 },
    turnRows: [...F.turnRows, { turnIndex: 11, role: 'candidate', text: F.candidateText }, { turnIndex: 12, role: 'interviewer', text: `Got it. ${ROW_FIX} Where does that leave your analysis?` }],
    candidateText: 'Got it.', ...over,
  });
  it('9:0, 9:1 and 9:2 "2.0x" (t9, before the fix was heard at t12): covered by it, for the report — no t14 "What steps got you to 2.0x?"', () => {
    const p = after();
    for (const id of ['9:0', '9:1', '9:2']) expect(p.decisions.find(d => d.id === id)).toMatchObject({ outcome: 'unresolved', reason: expect.stringMatching(/said before its correction, which covered it/) });
    expect(p.selected === null || !probesInput(p.selected.line)).toBe(true);
  });
  it('the same claims said after the fix: its line once more (ruling 1), never a probe', () => {
    const p = after({ corrected: { 'input:21.5%': { line: ROW_FIX, at: 8 }, 'input:40%': { line: ROW_FIX, at: 8 } } });
    expect(p.selected).toMatchObject({ action: 'restate', line: ROW_FIX });
  });
});

describe("a claim on no misread input: today's behavior", () => {
  // Her t23 "Pro's margin is only 2.7x Starter's" (23:5, a margin ratio — no figure of the data, nothing of 21.5 or 40),
  // in a message that states no input: after one probe, Rule 14's second attempt as before (no correction code can
  // write, no pointer — the report), with no input booked or capped.
  it('"2.7x" after a probe: attempt 2, as today', () => {
    const p = planAt({ rows: inMessage3(T23_5), handled: ALL_HANDLED, held: '3:0', attempts: { ...F.attempts, 'checker:2.7x': 1 }, candidateTurnIndex: 13 });
    expect(p.selected).toBeNull();
    expect(p.decisions.find(d => d.id === '3:0')).toMatchObject({ outcome: 'unresolved', key: 'checker:2.7x', reason: 'attempt 2: no correction code can write, no pointer — left for the report' });
  });
  it('…and with no probe yet: its probe, not booked to any input', () => {
    const p = planAt({ rows: inMessage3(T23_5), handled: ALL_HANDLED, held: '3:0', candidateTurnIndex: 13 });
    expect(p.selected).toMatchObject({ id: '3:0', action: 'probe' });
    expect(p.selected?.input).toBeUndefined();
  });
});

describe('fix round 2: a claim in the message that states the misread is on its chain (controller ruling; re-review I3)', () => {
  // Her t11, verbatim: "Same formula. Pro's twelve-month cancellation figure is 40%, so 1 / 0.40 = 2.5. … So Pro sits
  // below the board's three-times bar while Starter sits above it." 11:4 "above 3x" ("Starter sits above it") carries
  // only the board's 3x — a case figure in its unit — but is said in the message that reads 40% as Pro's (11:0).
  const corrected = (at: number) => ({ 'input:21.5%': { line: ROW_FIX, at }, 'input:40%': { line: ROW_FIX, at } });
  const t13 = (at: number) => planAt({
    rows: [...F.rows, V11], candidateTurnIndex: 13, handled: [...ALL_HANDLED, '11:0', '11:1', '11:2', '11:3'], closed: ['input:21.5%', 'input:40%'], corrected: corrected(at),
    said: { [ROW_FIX.toLowerCase().replace(/\.$/, '')]: 1 },
    turnRows: [...F.turnRows, { turnIndex: 11, role: 'candidate', text: F.candidateText }, { turnIndex: 12, role: 'interviewer', text: `Got it. ${ROW_FIX} Where does that leave your analysis?` }],
    candidateText: 'Got it.',
  });
  it('her t11 is the message in the fixture', () => {
    expect(F.candidateText).toMatch(/Pro's twelve-month cancellation figure is 40%, so 1 \/ 0\.40 = 2\.5\./);
    expect((V11.payloadJsonb as VerdictPayload).claims[4]).toMatchObject({ candidateValue: 'above 3x', span: 'Starter sits above it' });
  });
  it('said at t11, before the fix was heard at t12: covered by it — no t14 "Earlier you said “Starter sits above it” — what got you there?"', () => {
    const p = t13(11);
    expect(p.decisions.find(d => d.id === '11:4')).toMatchObject({ outcome: 'unresolved', root: 'input:40%', reason: expect.stringMatching(/said before its correction, which covered it/) });
    expect(p.selected?.id).not.toBe('11:4');
  });
  it('said after the fix: the fix once more (round-2 ruling 1), not a probe', () => {
    const p = t13(8);
    expect(p.selected).toMatchObject({ action: 'restate', line: ROW_FIX, key: 'input:40%' });
    expect(p.decisions.find(d => d.id === '11:4')?.outcome).not.toBe('probe');
  });
  it('the same claim in a message that states no input: unchanged — its own probe', () => {
    const p = aloneAt11((V11.payloadJsonb as VerdictPayload).claims[4], "So Pro sits below the board's three-times bar while Starter sits above it.");
    expect(p.selected).toMatchObject({ id: '11:0', action: 'probe' });
    expect(p.selected?.input).toBeUndefined();
  });
});

// Final review (20 Oct), Task 47 deferred minor → FR-4: a cell is out only when its exhibit is out (shown, or every
// item it covers released) or its own item's released line states it — never because another released line happens
// to say the same figure. A variant of pricing-001 whose market-growth line says "40%" (Starter's month-12 cell).
const coincident = { ...pricing, dataLedger: pricing.dataLedger.map(d => (d.id === 'market_growth' ? { ...d, value: 'Demand for small-business software is growing about 40% a year.' } : d)) };
const PRO_ONLY = ['pro_cohort', 'plan_prices_costs', 'plan_cac', 'ltv_definition', 'market_growth'];
describe('the row fix states no cell of an unrevealed item (final review, FR-4)', () => {
  it('exhibit-2 with only Pro\'s cohort out, "40%" said by another line: no line naming Starter\'s 40%', () => {
    expect(rowFix(21.5, claimOf('7:0'), ctxOf(PRO_ONLY, coincident as never))).toBeNull();
    const p = planAt({ caseData: coincident as never, revealedIds: PRO_ONLY });
    expect(p.decisions.map(d => d.line ?? '')).not.toContainEqual(expect.stringMatching(/40% for Starter/));
  });
  it('each cell\'s own item out (the notes line still held): the row fix', () => {
    expect(rowFix(21.5, claimOf('7:0'), ctxOf(['pro_cohort', 'starter_cohort', 'plan_prices_costs', 'plan_cac', 'ltv_definition']))?.line).toBe(ROW_FIX);
  });
  it('exhibit-2 shown: its cells are out; the planner knows the shown exhibits (vetCtx no longer passes [])', () => {
    expect(rowFix(21.5, claimOf('7:0'), { ...ctxOf(PRO_ONLY, coincident as never), shownExhibitIds: ['exhibit-2'] })?.line).toBe(ROW_FIX);
    expect(planAt({ caseData: coincident as never, revealedIds: PRO_ONLY, shownExhibitIds: ['exhibit-2'] }).selected).toMatchObject({ action: 'correct', line: ROW_FIX });
    expect(planAt({ caseData: coincident as never, revealedIds: PRO_ONLY }).selected?.line).not.toBe(ROW_FIX);
  });
});

describe('review fix round 1', () => {
  // C1 (FR-4): Pro's cohort out, Starter's not — the Starter price "$40 a month" is no "40%".
  it('C1: Starter\'s 40% not out (only the "$40" price is) — no row fix naming it', () => {
    expect(rowFix(21.5, claimOf('7:0'), ctxOf(['pro_cohort', 'plan_prices_costs', 'plan_cac', 'ltv_definition']))).toBeNull();
    // …and in the planner: the claim goes to the report, never "…and 40% for Starter".
    const p = planAt({ revealedIds: ['pro_cohort', 'plan_prices_costs', 'plan_cac', 'ltv_definition'] });
    expect(p.decisions.map(d => d.line ?? '')).not.toContainEqual(expect.stringMatching(/40% for Starter/));
  });
  // I1: a computed Starter LTV that equals Pro's CAC is no misread of the CAC row; its own correction stands.
  const LTV = { ...claimOf('7:2'), span: "So Starter's LTV is 40 months × $30 = $1,200", candidateValue: '$1,200', quantity: 'Starter standalone LTV at $40',
    codeQuantity: { kind: 'step' as const, stepId: 'starter_ltv', price: null, target: null }, correctionLine: 'Starter standalone lifetime value at $40 is about $600, not $1,200.', correctionFigure: '600' };
  it('I1: "40 months × $30 = $1,200" (a result) is no figure of the data', () => {
    expect(dataFigure(LTV, ctxOf())).toBeNull();
    // …even when it names the data's own words for $1,200: computed, not read.
    const cac = { ...LTV, span: "Starter's cost to acquire a customer = $360,000 / 300 = $1,200", quantity: 'Starter cost to acquire a customer', codeQuantity: { kind: 'none' as const, stepId: null, price: null, target: null } };
    expect(dataFigure(cac, ctxOf())).toBeNull();
    expect(dataFigure({ ...cac, span: "Starter's cost to acquire a customer is $1,200" }, ctxOf())).toBe(1200);
    // Re-review minor (b): "~" or "≈" right before the figure is "about" — read, not computed; after an expression, a result.
    expect(dataFigure({ ...cac, span: "Starter's cost to acquire a customer, CAC ~$1,200" }, ctxOf())).toBe(1200);
    expect(dataFigure({ ...cac, span: "Starter's cost to acquire a customer ≈ $1,200" }, ctxOf())).toBe(1200);
    expect(dataFigure({ ...cac, span: "Starter's cost to acquire a customer: $360,000 / 300 ≈ $1,200" }, ctxOf())).toBeNull();
  });
  it('fix round 2: b32 Aldermoor Marisol 6a721cdf t19 "with peak at $80 million there\'s no headroom" is not Option A\'s "$80 million" selling costs (bound phrase, not a ±6-word window that shares "peak")', () => {
    const entry = getCaseById('entry-001');
    const peak = { ...claimOf('7:3'), candidateValue: '$80M peak, $220M short', span: "with peak at $80 million there's no headroom at all, we're $220 million under",
      quantity: 'peak revenue and shortfall vs $300M bar', codeQuantity: { kind: 'step' as const, stepId: 'peak_net_sales', price: null, target: null } };
    expect(dataFigure(peak, ctxOf(entry.dataLedger.map(d => d.id), entry))).toBeNull();
  });
  it('I1: "Starter\'s LTV is $1,200" (read, but the data\'s $1,200 is a cost to acquire) is none either', () => {
    expect(dataFigure({ ...LTV, span: "Starter's LTV is $1,200" }, ctxOf())).toBeNull();
  });
  it('I1: in the planner its true correction is said, not the CAC row fix', () => {
    const p = aloneAt11({ ...LTV, span: "Starter's LTV is $1,200" }, "Starter's LTV is $1,200.", { attempts: { ...F.attempts, 'starter_ltv@1200': 1 } });
    expect(p.selected).toMatchObject({ id: '11:0', action: 'correct', line: LTV.correctionLine });
    expect(p.selected?.line).not.toMatch(/cost to acquire/);
  });
  // I2: probes on another 40 stay spoken once input:40% is closed.
  const ctx = { verified: [], alreadyProbed: new Set<string>(), flaggedThisTurn: false, candidateFigures: [40], closedInputs: [{ figure: 21.5, unit: '%' }, { figure: 40, unit: '%' }] };
  it.each([
    'How did you get to 40 months of lifetime?',
    'Walk me through how you got a 40% margin on Starter.',
    'You said $40 — is that price or margin?',
  ])('I2: "%s" is not a probe on the closed 40%%', sentence => {
    const v = challengeVerdict(sentence, ctx);
    expect(v && 'test' in v ? v.test : null).not.toBe('closed_to_report');
  });
});

describe("the model's own probe on a closed input is withheld (probe-guard.ts); a quote of the data is not", () => {
  const ctx = { verified: [], alreadyProbed: new Set<string>(), flaggedThisTurn: false, candidateFigures: [4.65, 2.5], closedInputs: [{ figure: 21.5, unit: '%' }, { figure: 40, unit: '%' }] };
  it.each([
    'Show me how you got to 40%.',                                             // her t18 (code's probe, recorded as the model's say)
    "Where does 40% come from, and which plan's figure is it?",                // her t12, the model's own question
    'Look back at the cohort data: which of those two progressions, 2.0, 5.9, 11.4, 21.5 and 5, 13, 24, 40, belongs to which plan, and what does that do to your Pro and Starter comparison?', // her t20, the model's own (bare figures)
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
    plan.state.checkerLine = { id: '5:1', key: 'starter_churn@21.5', action: 'probe', line: LINE, undo: { attempt: undefined, step: 'starter_churn', input: { key: 'input:21.5%', turn: 8 }, mathChecker: { handled: [] } } };
    plan.ctx.flags.mathChecker = { handled: ['5:1'] };
    plan.ctx.flags.stepProbes = { starter_churn: 1 };
    plan.ctx.flags.inputProbes = { 'input:21.5%': [8] };
    plan.state.recomputeAttempts['starter_churn@21.5'] = 1;
    plan.state.flaggedFigures = [...plan.state.flaggedFigures, 4.65];
    return plan;
  };
  it('heard: the turn stays counted', async () => {
    const plan = planWith('satisfied');
    const s = await settleTurn(plan, outcome(T({ say: 'Right.', question: LINE })));
    expect(s.spokenText).toContain(LINE);
    expect(plan.ctx.flags.inputProbes).toEqual({ 'input:21.5%': [8] });
  });
  it('another of code\'s lines takes the question: the booking is undone', async () => {
    const plan = planWith('awaiting');
    const s = await settleTurn(plan, outcome(T({ say: 'Right.', question: 'What drove it?' })));
    expect(s.spokenText).not.toContain(LINE);
    expect(plan.ctx.flags.inputProbes).toEqual({ 'input:21.5%': [] });
    expect((plan.ctx.flags.stepProbes as Record<string, number>).starter_churn).toBe(0);
  });
});
