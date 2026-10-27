// Phase 1 Stream 3 task 1 — the worksheet (contract §2; lib/orchestrator/worksheet.ts). Lorenzo: "The worksheet, filled
// from the math checker's quantity tags, with code owning the updates: the latest value per quantity wins; withdrawal
// phrases ("not X", "instead of X", "earlier I said X", "throw that out") mark X withdrawn, not current."
// Sentences are the candidates' own, verbatim from batches 33–38.
import { describe, it, expect } from 'vitest';
import { update, latest, hasNewerValue, lineageMoved, isWithdrawn, lineageOf, findWithdrawals, statusOf, staleReason, claimQuantity, EMPTY_WORKSHEET } from '@/lib/orchestrator/worksheet';
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

describe('staleReason (3.2, every line that probes or corrects)', () => {
  const t13 = 'And I had Port Avery\'s variable cost wrong too — it\'s $11,000 per flight, not $9,000.';
  const ws = update(EMPTY_WORKSHEET, { turn: 13, text: t13, stepBindings: [] }, prof2);
  const span11 = 'revenue per flight FY2025 is 60 × ($160 + $20) = $10,800, less $9,000 = $1,800 positive';
  it('a claim built on a misread of the data, fixed in a later message (b38 Marisol 11:4: Lakeport\'s $9,000 for Port Avery\'s $11,000): stale', () => {
    expect(ws.withdrawn).toEqual([expect.objectContaining({ value: 9000, replacement: 11000 })]);
    expect(staleReason(ws, prof2, { n: 11, quantity: null, value: 1800, span: span11 }, [9000, 11000, 160, 20, 60]))
      .toBe('built on 9000, withdrawn at message 13 ("not $9,000")');
    // Lorenzo's post-wave ruling (a), 26 Oct: the carried leg no longer asks whether the figure is the DATA's, so the
    // case figures make no difference to it.
    expect(staleReason(ws, prof2, { n: 11, quantity: null, value: 1800, span: span11 }, []))
      .toBe('built on 9000, withdrawn at message 13 ("not $9,000")');
  });
  // Lorenzo's post-wave ruling (a), 26 Oct: "The t24 rule is reversed. If the candidate's latest message restates a
  // value in the same step lineage, or redoes the root, drop the queued probe or correction on the older claim."
  it('…and a figure of their own they redo too, now (b38 Tyler t21 "$10M, not $12M" drops the probe of his t19 "$13.8M" — ruling (a) reverses the t24 call)', () => {
    const w = update(EMPTY_WORKSHEET, { turn: 21, text: 'Across 5,000 flights that\'s $10M, not $12M.', stepBindings: [] }, prof2);
    expect(staleReason(w, prof2, { n: 19, quantity: null, value: 13.8, span: 'exiting them and redeploying the aircraft swings us by $12M plus $1.8M, about $13.8M' }, [1.8, 5000]))
      .toBe('built on 12, withdrawn at message 21 ("not $12M")');
  });
  it('…but a bare withdrawal with no replacement beside it still drops nothing', () => {
    const w = update(EMPTY_WORKSHEET, { turn: 21, text: 'Volume makes it worse, not better.', stepBindings: [] }, prof2);
    expect(staleReason(w, prof2, { n: 19, quantity: null, value: 13.8, span: 'swings us by $12M plus $1.8M, about $13.8M' })).toBeNull();
  });
  it('…nor a case figure withdrawn in another setting (b35q Marisol t29 "at $60 the Starter margin is $50, not $30": her t27 $30 at $40 stands)', () => {
    const w = update(EMPTY_WORKSHEET, { turn: 29, text: 'First, at $60 the Starter margin is $50, not $30.', stepBindings: [] }, pricing);
    expect(staleReason(w, pricing, { n: 27, quantity: null, value: 3, span: '1 / 0.40 = 2.5 years = 30 months, × $30 margin = $900 LTV against $300 CAC = 3.0x' }, [30, 40, 10, 60, 300])).toBeNull();
  });
  it('…in the same message: not (the sentence that withdraws it carries it)', () => {
    expect(staleReason(ws, prof2, { n: 13, quantity: null, value: 200, span: t13 })).toBeNull();
  });
  it('its own figure withdrawn (a misquote taken back: b33 Tyler t9 "58%, not 61%"): stale', () => {
    const w = update(EMPTY_WORKSHEET, { turn: 9, text: 'Got it, thanks — 58%, not 61%.', stepBindings: [] }, prof2);
    expect(staleReason(w, prof2, { n: 5, quantity: null, value: 61, span: 'COGS went to 61%' })).toBe('61 withdrawn at message 9 ("not 61%")');
  });
  // Lorenzo's post-wave ruling (a), 26 Oct, from batch 39 aldermoor p57 5bc506bc t8: claim 5:6 is the ratio ">2x"
  // with the span "That's more than double the $300 million bar". The $640 million he withdrew at message 7 ("the
  // revised peak figure is $320 million, not $640 million") is in neither the claim's figure nor its words — only in
  // the hint line code was about to speak.
  it('a figure only the line WOULD SAY carries, withdrawn since: stale', () => {
    const entry = getCaseById('entry-001');
    const w = update(EMPTY_WORKSHEET, { turn: 7, text: 'So the revised peak figure is $320 million, not $640 million — I had double-counted.', stepBindings: [] }, entry);
    const item = { n: 5, quantity: null, value: 2, span: "That's more than double the $300 million bar" };
    expect(staleReason(w, entry, item)).toBeNull();
    expect(staleReason(w, entry, { ...item, lines: 'You say $640 million is more than double the $300 million bar. How much cushion would remain if the funnel numbers were different?' }))
      .toBe('built on 640, withdrawn at message 7 ("not $640 million")');
  });

  it('a newer value of its quantity: stale; nothing since: null', () => {
    const w = update(update(EMPTY_WORKSHEET, { turn: 15, text: '', stepBindings: [{ stepId: 'network_improvement', value: 15.8, span: '$15.8M' }] }, prof2),
      { turn: 21, text: '', stepBindings: [{ stepId: 'network_improvement', value: 11.8, span: '$11.8M' }] }, prof2);
    expect(staleReason(w, prof2, { n: 15, quantity: 'step:network_improvement', value: 15.8, span: '$15.8M' })).toBe('step:network_improvement restated at 11.8 (message 21) since message 15');
    expect(staleReason(w, prof2, { n: 21, quantity: 'step:network_improvement', value: 11.8, span: '$11.8M' })).toBeNull();
  });
});

// Lorenzo's post-wave ruling (a), 26 Oct: "If the candidate's latest message restates a value in the same step
// lineage, or redoes the root, drop the queued probe or correction on the older claim." Off prof-001 the worksheet
// carries no value for the message being answered, so the probed claim's own quantity often shows nothing newer while
// its lineage has moved on wholesale (batch 39: brewbean p57 t14's "about 22 points" after the 4.2 / 11.8 redo,
// quillpath p7 t26 and p24 t24's LTV/CAC corrections after the LTV was redone).
describe('lineageMoved (ruling (a): the lineage restated or the root redone)', () => {
  const at = (turn: number, stepId: string, value: number) => ({ turn, text: '', stepBindings: [], checkerClaims: [{ quantity: `step:${stepId}`, value, span: String(value), rating: 'error' as const }] });

  it('a member of the lineage restated at a new figure drops the older claim', () => {
    const w = update(update(EMPTY_WORKSHEET, at(9, 'starter_ltv', 900), pricing), at(13, 'starter_ltv', 720), pricing);
    expect(lineageMoved(w, pricing, 'step:starter_ratio', 9)).toMatch(/starter_ltv.*restated at 720 \(message 13\) since message 9/);
    expect(staleReason(w, pricing, { n: 9, quantity: 'step:starter_ratio', value: 3, span: 'ratio $900/$300 = 3.0x' }))
      .toMatch(/restated at 720 \(message 13\)/);
  });

  it('the same figure said again is no news', () => {
    const w = update(update(EMPTY_WORKSHEET, at(9, 'starter_ltv', 900), pricing), at(13, 'starter_ltv', 900), pricing);
    expect(lineageMoved(w, pricing, 'step:starter_ratio', 9)).toBeNull();
  });

  it('a step outside the lineage changes nothing', () => {
    const w = update(update(EMPTY_WORKSHEET, at(9, 'starter_ltv', 900), pricing), at(13, 'pro_margin', 80), pricing);
    expect(lineageMoved(w, pricing, 'step:starter_ratio', 9)).toBeNull();
  });

  it('a claim with no step quantity has no lineage to read', () => {
    const w = update(EMPTY_WORKSHEET, at(13, 'starter_ltv', 720), pricing);
    expect(lineageMoved(w, pricing, null, 9)).toBeNull();
    expect(lineageMoved(w, pricing, 'pricing:gain@60', 9)).toBeNull();
  });

  // b35h Marisol 57 t12: breakeven_bags was redone at message 9, but her $10.2M of variable cost is restated at
  // message 11 and the correction is still the right line.
  it('the claim\'s own quantity still standing at its own figure keeps the line', () => {
    const w = update(update(EMPTY_WORKSHEET, at(9, 'starter_ltv', 720), pricing), at(13, 'starter_ratio', 3), pricing);
    expect(lineageMoved(w, pricing, 'step:starter_ratio', 9, 3)).toBeNull();
    expect(lineageMoved(w, pricing, 'step:starter_ratio', 9, 2.4)).toMatch(/restated at 3 \(message 13\)/);
  });

  it('nothing later than the claim is no news either', () => {
    const w = update(EMPTY_WORKSHEET, at(9, 'starter_ltv', 900), pricing);
    expect(lineageMoved(w, pricing, 'step:starter_ratio', 13)).toBeNull();
  });
});

describe('a figure a hundred times off the step\'s answer is another quantity\'s, not a newer value', () => {
  it('b32 Aldermoor Marisol t9: "2 million diagnosed" tagged as peak patients (answer 40,000) does not overtake her 200,000', () => {
    const aldermoor = getCaseById('entry-001');
    const ws = update(update(EMPTY_WORKSHEET, { turn: 7, text: '', stepBindings: [], checkerClaims: [{ quantity: 'step:peak_patients', value: 200000, span: 'gives 200,000 patients on Kelvexa at peak', rating: 'error' }] }, aldermoor),
      { turn: 9, text: '', stepBindings: [], checkerClaims: [{ quantity: 'step:peak_patients', value: 2, span: 'Diagnosed: 50% → 2 million', rating: 'error' }] }, aldermoor);
    expect(hasNewerValue(ws, 'step:peak_patients', 7, 200000, aldermoor)).toBe(false);
    const redo = update(ws, { turn: 11, text: '', stepBindings: [], checkerClaims: [{ quantity: 'step:peak_patients', value: 40000, span: '40,000 patients at peak', rating: 'correct' }] }, aldermoor);
    expect(hasNewerValue(redo, 'step:peak_patients', 7, 200000, aldermoor)).toBe(true);
  });
});

describe('a value already stated in the probed message is no newer value', () => {
  it('b32 Aldermoor Marisol t17: the $220M gap tagged as peak sales beside her $80M; her t19 "$80 million" again is not news', () => {
    const aldermoor = getCaseById('entry-001');
    const at17 = update(EMPTY_WORKSHEET, { turn: 17, text: '', stepBindings: [], checkerClaims: [
      { quantity: 'step:peak_net_sales', value: 80, span: 'Peak revenue: 40,000 × $2,000 = $80 million.', rating: 'error' },
      { quantity: 'step:peak_net_sales', value: 220, span: '$80 million against a $300 million bar, so we\'re short by $220 million', rating: 'error' }] }, aldermoor);
    const at19 = update(at17, { turn: 19, text: '', stepBindings: [], checkerClaims: [{ quantity: 'step:peak_net_sales', value: 80, span: 'with peak at $80 million there\'s no headroom at all', rating: 'error' }] }, aldermoor);
    expect(hasNewerValue(at19, 'step:peak_net_sales', 17, 220, aldermoor)).toBe(false);
    const at27 = update(at19, { turn: 27, text: '', stepBindings: [], checkerClaims: [{ quantity: 'step:peak_net_sales', value: 320, span: 'So 40,000 × $8,000 = $320 million.', rating: 'correct' }] }, aldermoor);
    expect(hasNewerValue(at27, 'step:peak_net_sales', 17, 220, aldermoor)).toBe(true);
  });
});

// ── the Stream 3 review's fix round (22 Oct) ────────────────────────────────

describe('I5: which "not X" and "instead of X" sentences withdraw a figure', () => {
  it('a contrast withdraws nothing — another subject owns the figure', () => {
    expect(findWithdrawals('Lakeport is not $11,000 a flight, Port Avery is.')).toEqual([]);
    expect(findWithdrawals('That\'s not $9,000 but the Lakeport line.')).toEqual([]);
  });
  it('…nor does a figure named as the data\'s own (b38 Larkspur Marisol t27)', () => {
    expect(findWithdrawals('Caught it — I used 75%, which is the contested routes\' load factor, not the 70% on this exhibit.').map(w => w.value)).toEqual([]);
    expect(findWithdrawals('You\'re right — the exhibit says $80 million, not $77 million.').map(w => w.value)).toEqual([77]);
  });
  it('"instead of X" counts on a prescription as well as an "I" redo, and only "if" over its own clause vetoes it', () => {
    expect(findWithdrawals('Should be $11,000 instead of $9,000.').map(w => w.value)).toEqual([9000]);
    expect(findWithdrawals('I should have used $11,000 instead of $9,000.').map(w => w.value)).toEqual([9000]);
    expect(findWithdrawals('Agreed that\'s the softest number in the chain — it\'s a forecast, and the whole thing fails if it\'s 18% instead of 20%.')).toEqual([]);
    expect(findWithdrawals('If taste disappoints we get 1 bag, but I used $11,000 instead of $9,000 for Port Avery.').map(w => w.value)).toEqual([9000]);
    // …"if" over the figure's own clause vetoes it, even in their own words.
    expect(findWithdrawals('If I had used 18% instead of 20%, we would miss the bar.')).toEqual([]);
  });
});

describe('I4: a withdrawn figure never becomes the current value (contract §2)', () => {
  const q = 'step:starter_ltv';
  it('a late checker claim of a withdrawn figure is not taken, and the fold stays idempotent', () => {
    const at11 = update(EMPTY_WORKSHEET, { turn: 11, text: '', stepBindings: [], checkerClaims: [{ quantity: q, value: 405, span: '$405 LTV', rating: 'error' }] }, pricing);
    expect(latest(at11, q)!.value).toBe(405);
    const at13 = update(at11, { turn: 13, text: 'Starter LTV is $30 × 20 = $600, not $405.', stepBindings: [], checkerClaims: [] }, pricing);
    expect(isWithdrawn(at13, 405, 'usd')).toBe(true);
    expect(latest(at13, q)).toBeUndefined();
    const late = update(at13, { turn: 11, text: '', stepBindings: [], checkerClaims: [{ quantity: q, value: 405, span: '$405 LTV', rating: 'error' }] }, pricing);
    expect(latest(late, q)).toBeUndefined();
    expect(update(late, { turn: 11, text: '', stepBindings: [], checkerClaims: [{ quantity: q, value: 405, span: '$405 LTV', rating: 'error' }] }, pricing)).toEqual(late);
  });
  it('an entry with a standing value falls back to it', () => {
    const ws = update(update(EMPTY_WORKSHEET, { turn: 9, text: '', stepBindings: [], checkerClaims: [{ quantity: q, value: 600, span: '$600', rating: 'correct' }] }, pricing),
      { turn: 11, text: '', stepBindings: [], checkerClaims: [{ quantity: q, value: 405, span: '$405', rating: 'error' }] }, pricing);
    const after = update(ws, { turn: 13, text: 'Starter LTV is $600, not $405.', stepBindings: [] }, pricing);
    expect(latest(after, q)).toEqual(expect.objectContaining({ value: 600, turn: 9 }));
  });
});

describe('I3: a withdrawal only drops a probe about the same quantity, in its unit', () => {
  const hollis = getCaseById('launch-001');
  it('"not a 3x" (a ratio) leaves a probe about $3.00 a household alone (b35h Marisol t27, drop #7)', () => {
    const ws = update(EMPTY_WORKSHEET, { turn: 27, text: 'Net $750,000, not a 3x return — it\'s about 1.5x on contribution.', stepBindings: [] }, hollis);
    expect(ws.withdrawn.map(w => [w.value, w.unit])).toEqual(expect.arrayContaining([[3, 'ratio']]));
    expect(staleReason(ws, hollis, { n: 23, quantity: 'step:sampling_contribution', value: 3, span: 'one bag\'s worth of price to acquire a three-bag buyer' }, [1.5, 3])).toBeNull();
  });
  it('a withdrawal in another unit covers nothing (its own figure, so the data rule doesn\'t apply)', () => {
    const ws = update(EMPTY_WORKSHEET, { turn: 27, text: 'My ratio was wrong — it is 1.5x, not 3x.', stepBindings: [] }, hollis);
    expect(ws.withdrawn.map(w => [w.value, w.unit])).toEqual([[3, 'ratio']]);
    expect(staleReason(ws, hollis, { n: 23, quantity: 'step:sampling_contribution', value: 3, span: '$3.00 a household' })).toBeNull();
    // …and the same withdrawal does cover a ratio claim.
    expect(staleReason(ws, hollis, { n: 23, quantity: null, value: 3, span: 'a 3x return' })).toMatch(/3 withdrawn at message 27/);
  });
  it('a case figure withdrawn under a condition of its own leaves its other uses alone (b35q Marisol t25, drop #8)', () => {
    const ws = update(EMPTY_WORKSHEET, { turn: 25, text: 'Also worth noting on your point about the price test: if cost to serve stays at $10, then at $60 the Starter margin is $50, not $30.', stepBindings: [] }, pricing);
    expect(ws.withdrawn[0]).toMatchObject({ value: 30, scenario: true });
    expect(staleReason(ws, pricing, { n: 23, quantity: null, value: 30, span: 'I\'ll apply the $30 Starter margin we were given, since that\'s the figure in the exhibit' }, [30, 50, 40, 60, 10])).toBeNull();
  });
  it('…and a figure of their own they withdraw still drops its probe (b33 Tyler t17)', () => {
    const prof1 = getCaseById('prof-001');
    const ws = update(EMPTY_WORKSHEET, { turn: 17, text: 'So it should be 15%, not 19%, over two years.', stepBindings: [] }, prof1);
    expect(staleReason(ws, prof1, { n: 15, quantity: null, value: 19, span: 'revenue grew about 19% on volume alone' }, [15, 42, 58])).toMatch(/19 withdrawn at message 17/);
  });
});

describe('the review\'s minors', () => {
  it('statusOf is unchecked when the step declares no unit code can read', () => {
    const noUnit = { mathSteps: [{ id: 's', answer: 10, tolerance: 1 }] };
    expect(statusOf(noUnit, 'step:s', 10)).toBe('unchecked');
    expect(statusOf({ mathSteps: [{ id: 's', answer: 10, tolerance: 1, unit: 'usd' }] }, 'step:s', 10)).toBe('right');
  });
  it('the checker\'s rating stands in where code has no calculation', () => {
    const ws = update(EMPTY_WORKSHEET, { turn: 5, text: '', stepBindings: [], checkerClaims: [{ quantity: 'pricing:gain@10', value: 5, span: '5 points', rating: 'error' }] }, prof2);
    expect(latest(ws, 'pricing:gain@10')).toEqual(expect.objectContaining({ status: 'wrong', source: 'checker' }));
  });
  it('at the same turn the checker takes the binder\'s place', () => {
    const ws = update(EMPTY_WORKSHEET, { turn: 7, text: '', stepBindings: [{ stepId: 'network_improvement', value: 15.8, span: 'binder' }],
      checkerClaims: [{ quantity: 'step:network_improvement', value: 15.9, span: 'checker', rating: 'error' }] }, prof2);
    expect(latest(ws, 'step:network_improvement')).toEqual(expect.objectContaining({ source: 'checker', value: 15.9 }));
  });
  it('the two "needed" pricing kinds are keyed apart', () => {
    expect(claimQuantity({ codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 24 } })).toBe('pricing:needed_for_margin@24');
    expect(claimQuantity({ codeQuantity: { kind: 'needed_for_gain', stepId: null, price: null, target: 24 } })).toBe('pricing:needed_for_gain@24');
  });
});
