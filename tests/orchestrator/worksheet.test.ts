// Phase 1 Stream 3 task 1 — the worksheet (contract §2; lib/orchestrator/worksheet.ts). Lorenzo: "The worksheet, filled
// from the math checker's quantity tags, with code owning the updates: the latest value per quantity wins; withdrawal
// phrases ("not X", "instead of X", "earlier I said X", "throw that out") mark X withdrawn, not current."
// Sentences are the candidates' own, verbatim from batches 33–38.
import { describe, it, expect } from 'vitest';
import { update, latest, hasNewerValue, isWithdrawn, lineageOf, findWithdrawals, statusOf, EMPTY_WORKSHEET } from '@/lib/orchestrator/worksheet';
import { getCaseById } from '@/lib/cases/loader';

const prof2 = getCaseById('prof-002');
const pricing = getCaseById('pricing-001');

describe('withdrawal phrases', () => {
  it('"not X": b38 Larkspur Marisol t13 and t19, b33 Raj t9', () => {
    expect(findWithdrawals('And I had Port Avery\'s variable cost wrong too — it\'s $11,000 per flight, not $9,000. Redoing it: FY2025 revenue per flight is 60 × ($160 + $20) = $10,800, less $11,000 = negative $200 per flight.'))
      .toEqual([expect.objectContaining({ value: 9000, unit: 'usd' })]);
    expect(findWithdrawals('Less $9,200 variable cost = $2,000 contribution per flight, not $2,800.\n\nAcross 5,000 flights: $10.0M, not $14.0M.').map(w => w.value)).toEqual([2800, 14]);
    expect(findWithdrawals('Not 400,000 — I slipped a decimal.').map(w => w.value)).toEqual([400000]);
  });
  it('"earlier I said X", "I said X earlier": b33 Tyler t19, b34 Larkspur Raj t19', () => {
    expect(findWithdrawals('It\'s the second time I\'ve drifted off a figure you gave me; earlier I said COGS was 55% when the exhibit said 58%.'))
      .toEqual([expect.objectContaining({ value: 55, unit: 'percent' })]);
    expect(findWithdrawals('Correction first: I said $105 a seat earlier — that was wrong.')).toEqual([expect.objectContaining({ value: 105, unit: 'usd' })]);
  });
  it('"throw that out", "scratch that": the last figure before it in the sentence', () => {
    expect(findWithdrawals('So LTV is $30 × 13.5 months = $405 — scratch that, the rate is 5% a month.').map(w => w.value)).toEqual([405]);
    expect(findWithdrawals('Call it $15.8M of improvement; actually, throw that out.').map(w => w.value)).toEqual([15.8]);
    expect(findWithdrawals('Scratch that.')).toEqual([]);
  });
  it('"instead of X" only as their own redo — never a sensitivity or a comparison (b32 Marcus t11, b35q Marcus t13, b36 Jasmine t5)', () => {
    expect(findWithdrawals('I should have used $11,000 instead of $9,000 for Port Avery.').map(w => w.value)).toEqual([9000]);
    expect(findWithdrawals('Agreed that\'s the softest number in the chain — it\'s a forecast, not an observation, and the whole thing fails if it\'s 18% instead of 20%.')).toEqual([]);
    expect(findWithdrawals('20% of the cohort upgrades to Pro, and a Pro customer is worth $4,000 of margin — acquired for $300 instead of $1,200.')).toEqual([]);
    expect(findWithdrawals('Sensitivity: if peak share lands at 18% instead of 20%, we\'re at $288 million and we miss.')).toEqual([]);
  });
  it('not "if not X", "not 100% sure", or a "not" with no figure after it', () => {
    expect(findWithdrawals('Maybe 10%, if not 15%, of the gap.')).toEqual([]);
    expect(findWithdrawals('I\'m not 100% sure on the load factor.')).toEqual([]);
    expect(findWithdrawals('That\'s not the whole story; the margin is 30%.')).toEqual([]);
  });
});

describe('the latest value per quantity wins; code owns the updates', () => {
  // b38 Marisol: t15 "So the swing is worth $15.8M of contribution", t21 "the swing is $10.0M - (-$1.8M) = $11.8M".
  const q = 'step:network_improvement';
  const at15 = update(EMPTY_WORKSHEET, { turn: 15, text: 'So the swing is worth $15.8M of contribution.', stepBindings: [{ stepId: 'network_improvement', value: 15.8, span: 'So the swing is worth $15.8M of contribution' }], revealedIds: prof2.dataLedger.map(d => d.id) }, prof2);
  it('a binding enters with its status against code\'s own figure: 15.8 against 11.8 ± 0.3 is wrong; unit and scale from the step', () => {
    expect(latest(at15, q)).toEqual(expect.objectContaining({ value: 15.8, turn: 15, status: 'wrong', unit: 'usd', scale: 'million', source: 'step_binding', history: [] }));
    expect(at15.throughTurn).toBe(15);
  });
  const at21 = update(at15, { turn: 21, text: 'With the corrected $10.0M, the swing is $10.0M - (-$1.8M) = $11.8M.', stepBindings: [{ stepId: 'network_improvement', value: 11.8, span: 'the swing is $10.0M - (-$1.8M) = $11.8M' }], revealedIds: prof2.dataLedger.map(d => d.id) }, prof2);
  it('a later message replaces it; the earlier value is history', () => {
    expect(latest(at21, q)).toEqual(expect.objectContaining({ value: 11.8, turn: 21, status: 'right' }));
    expect(latest(at21, q)!.history.map(v => v.value)).toEqual([15.8]);
  });
  it('a checker claim landing late updates its own turn, never a later value; folded twice it changes nothing', () => {
    const late = update(at21, { turn: 15, text: '', stepBindings: [], checkerClaims: [{ quantity: q, value: 15.8, span: '$15.8M', rating: 'error' }] }, prof2);
    expect(latest(late, q)!.value).toBe(11.8);
    expect(latest(late, q)!.history.map(v => [v.turn, v.source])).toEqual([[15, 'step_binding'], [15, 'checker']]);
    expect(update(late, { turn: 15, text: '', stepBindings: [], checkerClaims: [{ quantity: q, value: 15.8, span: '$15.8M', rating: 'error' }] }, prof2)).toEqual(late);
    expect(late.throughTurn).toBe(21);
  });
  it('a value the message withdraws is not taken as current', () => {
    const ws = update(EMPTY_WORKSHEET, { turn: 19, text: 'Less $9,200 variable cost = $2,000 contribution per flight, not $2,800.', stepBindings: [{ stepId: 'new_route_contribution_per_flight', value: 2800, span: 'not $2,800' }] }, prof2);
    expect(latest(ws, 'step:new_route_contribution_per_flight')).toBeUndefined();
    expect(isWithdrawn(ws, 2800, 'usd')).toBe(true);
    expect(isWithdrawn(ws, 2000, 'usd')).toBe(false);
  });
  it('a withdrawn figure is kept with the quantity that held it, and its turn', () => {
    const ws0 = update(EMPTY_WORKSHEET, { turn: 15, text: '', stepBindings: [{ stepId: 'new_route_contribution_per_flight', value: 2800, span: '$2,800 contribution per flight' }] }, prof2);
    const ws = update(ws0, { turn: 19, text: 'Less $9,200 variable cost = $2,000 contribution per flight, not $2,800.', stepBindings: [{ stepId: 'new_route_contribution_per_flight', value: 2000, span: '$2,000 contribution per flight' }] }, prof2);
    expect(ws.withdrawn).toEqual([expect.objectContaining({ value: 2800, unit: 'usd', quantity: 'step:new_route_contribution_per_flight', turn: 19, phrase: 'not $2,800' })]);
    expect(latest(ws, 'step:new_route_contribution_per_flight')!.value).toBe(2000);
  });
  it('status: unchecked when the step\'s inputs aren\'t out, or for a quantity code doesn\'t compute here', () => {
    expect(statusOf(prof2, 'step:network_improvement', 11.8, [])).toBe('unchecked');
    expect(statusOf(prof2, 'pricing:gain@10', 5, [])).toBe('unchecked');
    expect(statusOf(pricing, 'step:starter_ltv', 405)).toBe('wrong');
    expect(statusOf(pricing, 'step:starter_ltv', 640)).toBe('right');
  });
});

describe('hasNewerValue (3.2\'s test)', () => {
  const q = 'step:network_improvement';
  const ws15 = update(EMPTY_WORKSHEET, { turn: 15, text: '', stepBindings: [{ stepId: 'network_improvement', value: 15.8, span: '$15.8M' }] }, prof2);
  it('b38 Marisol t21: the right $11.8M beside her explanation of the old $15.8M — the t24 correction of 15.8 is stale', () => {
    const ws = update(update(ws15, { turn: 21, text: '', stepBindings: [{ stepId: 'network_improvement', value: 11.8, span: '$11.8M' }] }, prof2),
      { turn: 21, text: '', stepBindings: [], checkerClaims: [{ quantity: q, value: 15.8, span: '$14.0M minus -$1.8M = $15.8M', rating: 'correct' }] }, prof2);
    expect(hasNewerValue(ws, q, 15, 15.8, prof2)).toBe(true);
  });
  it('the same wrong value restated since is no newer value; nor is nothing said since', () => {
    expect(hasNewerValue(ws15, q, 15, 15.8, prof2)).toBe(false);
    const again = update(ws15, { turn: 17, text: '', stepBindings: [{ stepId: 'network_improvement', value: 15.8, span: '$15.8M' }] }, prof2);
    expect(hasNewerValue(again, q, 15, 15.8, prof2)).toBe(false);
  });
  it('back to the probed figure after another: not stale', () => {
    const ws = update(update(ws15, { turn: 17, text: '', stepBindings: [{ stepId: 'network_improvement', value: 11.8, span: '$11.8M' }] }, prof2),
      { turn: 19, text: '', stepBindings: [{ stepId: 'network_improvement', value: 15.8, span: '$15.8M' }] }, prof2);
    expect(hasNewerValue(ws, q, 15, 15.8, prof2)).toBe(false);
  });
  it('another wrong value since, within the step\'s tolerance of the probed one, is the same error (b37q Marcus: $420 after $405, ± $60)', () => {
    const ws = update(update(EMPTY_WORKSHEET, { turn: 11, text: '', stepBindings: [{ stepId: 'starter_ltv', value: 405, span: '$405' }] }, pricing),
      { turn: 17, text: '', stepBindings: [{ stepId: 'starter_ltv', value: 420, span: '$420' }] }, pricing);
    expect(hasNewerValue(ws, 'step:starter_ltv', 11, 405, pricing)).toBe(false);
    const far = update(ws, { turn: 19, text: '', stepBindings: [{ stepId: 'starter_ltv', value: 900, span: '$900' }] }, pricing);
    expect(hasNewerValue(far, 'step:starter_ltv', 11, 405, pricing)).toBe(true);
  });
  it('the probed figure withdrawn since: stale (b38 Marisol t19, "not $2,800")', () => {
    const ws0 = update(EMPTY_WORKSHEET, { turn: 15, text: '', stepBindings: [{ stepId: 'new_route_contribution_per_flight', value: 2800, span: '$2,800' }] }, prof2);
    const ws = update(ws0, { turn: 19, text: 'Less $9,200 variable cost = $2,000 contribution per flight, not $2,800.', stepBindings: [] }, prof2);
    expect(hasNewerValue(ws, 'step:new_route_contribution_per_flight', 15, 2800, prof2)).toBe(true);
    expect(hasNewerValue(ws, 'step:new_route_contribution_per_flight', 21, 2800, prof2)).toBe(false);
  });
  it('without a value: the one the worksheet holds for that turn; none → false', () => {
    const ws = update(ws15, { turn: 21, text: '', stepBindings: [{ stepId: 'network_improvement', value: 11.8, span: '$11.8M' }] }, prof2);
    expect(hasNewerValue(ws, q, 15, undefined, prof2)).toBe(true);
    expect(hasNewerValue(ws, q, 13, undefined, prof2)).toBe(false);
    expect(hasNewerValue(ws, 'step:op_profit_swing', 15, undefined, prof2)).toBe(false);
  });
});

describe('lineageOf (3.3)', () => {
  it('pricing-001: the twelve steps built on starter_ltv are its lineage; a step with no dependsOn is its own root', () => {
    const l = lineageOf(pricing, 'starter_net_value');
    expect(l.root).toBe('starter_ltv');
    expect(l.members).toEqual(expect.arrayContaining(['starter_ltv', 'starter_ratio', 'starter_net_value', 'upgrade_breakeven_at_60']));
    expect(l.members).toHaveLength(13);
    expect(lineageOf(pricing, 'starter_ltv')).toEqual(l);
    expect(lineageOf(pricing, 'pro_margin')).toEqual({ root: 'pro_margin', members: ['pro_margin'] });
  });
  it('through a chain of dependsOn, to the top (the overlay\'s steps; fixture)', () => {
    const c = { mathSteps: [{ id: 'a' }, { id: 'b', dependsOn: ['a'] }, { id: 'c', dependsOn: ['b'] }, { id: 'd' }] };
    expect(lineageOf(c, 'c')).toEqual({ root: 'a', members: ['a', 'b', 'c'] });
    expect(lineageOf(c, 'd')).toEqual({ root: 'd', members: ['d'] });
  });
});
