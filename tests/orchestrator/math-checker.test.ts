import { describe, it, expect } from 'vitest';
import {
  statesQuantitativeClaim, buildCheckerSystem, buildCheckerUser, vetCheckerClaims, isActionable,
  CheckerOutputSchema, type CheckerClaim, type VetContext,
} from '@/lib/orchestrator/math-checker';
import { MATH_CHECKER_CONFIGS } from '@/lib/models';
import { getCaseById } from '@/lib/cases/loader';

const prof = getCaseById('prof-001');
const COSTS = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'menu_price_change', 'bean_price_change', 'non_bean_input_change'];

const claim = (over: Partial<CheckerClaim>): CheckerClaim => ({
  span: '', quantity: '', candidateValue: '', assumptions: '', verdict: 'error', correctValue: null, correctLow: null, correctHigh: null,
  unit: 'percent', derivation: '', errorType: 'conceptual', changesConclusion: true, confidence: 'high', probe: '', pointer: '',
  codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, actualShare: null,
  ...over,
});

describe('the gate', () => {
  it.each([
    ['a figure', 'COGS went from 42 to 58.'],
    ['a word quantity', 'A modest price rise gets most of the gap back.'],
    ['a multiple in words', 'The burden is roughly three to four times the gap.'],
    ['restore', 'Pricing alone should restore the margin.'],
  ])('passes %s', (_what, text) => expect(statesQuantitativeClaim(text)).toBe(true));

  it.each([
    'Do we have any data on competitor pricing?',
    "I'd structure this as revenue and costs.",
  ])('skips a message with no quantity: %s', text => expect(statesQuantitativeClaim(text)).toBe(false));
});

describe('the input — the full case, server-side', () => {
  const system = buildCheckerSystem(prof);
  it('carries every ledger value, exhibit, math step answer and the pricing model — generic over the case', () => {
    for (const d of prof.dataLedger) expect(system).toContain(d.value);
    expect(system).toContain('exhibit-a');
    for (const s of prof.mathSteps) expect(system).toContain(`${s.id}`);
    expect(system).toContain('43.3');
    expect(system).toMatch(/PRICING MODEL: cost lines cogs_pct, labor_pct, overhead_pct/);
    expect(system).toContain('SHARE BASES');
  });

  it('builds for every case on file (four new cases have no labels yet)', () => {
    for (const id of ['prof-002', 'entry-001', 'pricing-001', 'launch-001']) {
      const c = getCaseById(id);
      const s = buildCheckerSystem(c);
      expect(s).toContain(c.prompt);
      for (const d of c.dataLedger) expect(s).toContain(d.value);
    }
  });

  it('the message part names what is revealed, the transcript and the message', () => {
    const u = buildCheckerUser(prof, { revealedIds: ['cogs_pct'], shownExhibitIds: [], transcript: [{ role: 'interviewer', text: 'Go on.' }], message: 'COGS is up 16 points.' });
    expect(u).toMatch(/REVEALED TO THE CANDIDATE SO FAR: cogs_pct/);
    expect(u).toContain('INTERVIEWER: Go on.');
    expect(u).toContain('COGS is up 16 points.');
  });

  it('two arms, adaptive thinking at effort medium (the request sets thinking; the configs carry model and effort)', () => {
    expect(MATH_CHECKER_CONFIGS['sonnet55-medium']).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' });
    expect(MATH_CHECKER_CONFIGS['opus55-medium']).toEqual({ model: 'claude-opus-5-5', effort: 'medium' });
  });

  it('the output schema takes one entry per claim with the fields the flag needs', () => {
    const ok = CheckerOutputSchema.safeParse({ claims: [claim({ span: 'x' })] });
    expect(ok.success).toBe(true);
  });
});

describe('FR-4: what a flag may put in the interviewer\'s mouth', () => {
  const ctx = (over: Partial<VetContext> = {}): VetContext => ({
    caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: ['To get back to 24% margin I need roughly 10–12% on menu prices.'], ...over,
  });
  const fiona = claim({
    span: 'roughly 10–12% on menu prices to restore margin', candidateValue: '10–12%', correctValue: 23.7,
    probe: 'You said 10–12% restores the 24% margin. Walk me through how you sized that.',
    codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 24 },
  });

  it('keeps a probe that uses only what the candidate has', () => {
    const [v] = vetCheckerClaims([fiona], ctx());
    expect(v.flag).toBe(true);
    expect(v.probeLine).toBe(fiona.probe);
  });

  it('a probe carrying an unrevealed figure is replaced by a neutral one in the candidate\'s words', () => {
    const [v] = vetCheckerClaims([claim({ ...fiona, probe: 'On $480M of revenue, how does 10–12% get you there?' })], ctx());
    expect(v.probeLine).toBe('Walk me through how you got to 10–12%.');
  });

  it('a probe stating a false case fact is replaced', () => {
    // Every figure in it is revealed (provenance passes); the pairing is false.
    const [v] = vetCheckerClaims([claim({ ...fiona, probe: 'Given overhead at 22% of revenue, how did you get 10–12%?' })], ctx());
    expect(v.probeLine).toBe('Walk me through how you got to 10–12%.');
  });

  it('correct, unverifiable and low-confidence claims raise no flag and carry no lines', () => {
    const vs = vetCheckerClaims([claim({ verdict: 'correct', probe: 'x' }), claim({ verdict: 'unverifiable' }), claim({ confidence: 'low' })], ctx());
    expect(vs.map(v => v.flag)).toEqual([false, false, false]);
    expect(vs.every(v => v.probeLine === null && v.correctionLine === null && v.pointerLine === null)).toBe(true);
    expect(isActionable(claim({ confidence: 'medium' }))).toBe(true);
  });
});

// Lorenzo, 13 Oct (rulings after the rerun, and after part 1): code writes
// the correction from its own computation of the quantity the checker names,
// naming the quantity and its input ("A 10% price rise lifts margin about 8.5
// points, not 5.") — only when the checker's figure agrees with code's (3% or
// 0.5), the input code computes from is in the claim's span, and every input
// is revealed; through provenance and truth like any other line.
describe('code writes the correction', () => {
  const ctx = (texts: string[], over: Partial<VetContext> = {}): VetContext => ({ caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: texts, ...over });
  const gain = (price: number) => ({ kind: 'gain' as const, stepId: null, price, target: null });

  it('a gain: "A 10% price rise lifts margin about 8.5 points, not 5."', () => {
    const [v] = vetCheckerClaims([claim({
      span: 'a 10% price increase recovers about 5 points', candidateValue: 'about 5 points', correctValue: 8.5, codeQuantity: gain(10),
    })], ctx(['A 10% price increase recovers about 5 points.']));
    expect(v.correctionLine).toBe('A 10% price rise lifts margin about 8.5 points, not 5.');
  });

  it('a new margin, a needed price for a margin and for a gain, a break-even', () => {
    const one = (over: Partial<CheckerClaim>, text: string) => vetCheckerClaims([claim({ span: text, ...over })], ctx([text]))[0].correctionLine;
    expect(one({ candidateValue: 'about 11%', correctValue: 14.5, codeQuantity: { ...gain(10), kind: 'new_margin' } }, 'A 10% price rise takes us from 6% to about 11%.'))
      .toBe('A 10% price rise takes margin to about 14.5%, not 11%.');
    expect(one({ candidateValue: '10–12%', correctValue: 23.7, codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 24 } }, 'To get back to 24% margin I need roughly 10–12% on menu prices.'))
      .toBe('Getting back to a 24% margin takes about a 23.7% price rise, not 10–12%.');
    expect(one({ candidateValue: '16%', correctValue: 20.5, codeQuantity: { kind: 'needed_for_gain', stepId: null, price: null, target: 16 } }, 'Restoring the full 16 points would need roughly a 16% lift.'))
      .toBe('Recovering 16 points of margin takes about a 20.5% price rise, not 16%.');
    expect(one({ candidateValue: '10%', correctValue: 19.2, codeQuantity: { ...gain(10), kind: 'breakeven' } }, 'A 10% rise breaks even if we lose 10% of volume.'))
      .toBe('With COGS varying with volume, a 10% price rise breaks even at about a 19.2% volume loss, not 10%.');
  });

  it("break-even: of code's answers, the one the checker's figure agrees with, and its cost lines named", () => {
    const text = 'A 10% rise breaks even if we lose 45% of volume.';
    const [v] = vetCheckerClaims([claim({ span: text, candidateValue: '45%', correctValue: 33.3, codeQuantity: { ...gain(10), kind: 'breakeven' } })], ctx([text]));
    expect(v.correctionLine).toBe('With COGS and labor varying with volume, a 10% price rise breaks even at about a 33.3% volume loss, not 45%.');
  });

  it('a math step: the quantity named, in their units', () => {
    const text = '40% of 25%, which is 10 percentage points of revenue';
    const [v] = vetCheckerClaims([claim({ span: text, candidateValue: '10 percentage points', correctValue: 4.2, codeQuantity: { kind: 'step', stepId: 'bean_points_added', price: null, target: null } })], ctx([text]));
    expect(v.correctionLine).toBe("Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 percentage points, not 10.");
  });

  it("a step's quantity without its parenthetical (prof-002: \"… in FY2025 (a loss)\")", () => {
    const p2 = getCaseById('prof-002');
    const step = p2.mathSteps.find(st => st.id === 'lakeport_contribution_fy2025')!;
    const text = 'So the contribution is about $800 per flight now.';
    const [v] = vetCheckerClaims([claim({ span: text, candidateValue: '$800', correctValue: step.answer, codeQuantity: { kind: 'step', stepId: step.id, price: null, target: null } })],
      { caseData: p2, revealedIds: step.inputs!, shownExhibitIds: [], candidateTexts: [text] });
    expect(v.correctionLine).toBe(`Hub–Lakeport contribution per flight in FY2025 is about $${step.answer}, not $800.`);
  });

  it("code's line passes provenance: a step whose quantity names a figure the candidate doesn't have is probe only (entry-001 \"if diagnosis rose to 60%\")", () => {
    const e1 = getCaseById('entry-001');
    const step = e1.mathSteps.find(st => st.id === 'diagnosis_upside')!;
    const text = 'Peak sales would be about $400M.';
    const [v] = vetCheckerClaims([claim({ span: text, candidateValue: '$400M', correctValue: step.answer, codeQuantity: { kind: 'step', stepId: step.id, price: null, target: null } })],
      { caseData: e1, revealedIds: step.inputs!, shownExhibitIds: [], candidateTexts: [text] });
    expect(v.correctionLine).toBeNull();
    expect(v.vetNotes.join(' ')).toMatch(/correction withheld \(provenance\/truth\)/);
  });

  it('a value with several figures: the one in the quantity\'s unit (replay: Sofia b20 t16, "per 10% of price")', () => {
    const text = 'call it five points of margin back on a 10% price rise, going from 6% to roughly 11%';
    expect(vetCheckerClaims([claim({ span: text, candidateValue: '5 points gain, 11% margin', correctValue: 8.5, codeQuantity: gain(10) })], ctx([text]))[0].correctionLine)
      .toBe('A 10% price rise lifts margin about 8.5 points, not 5.');
    expect(vetCheckerClaims([claim({ span: text, candidateValue: '5 points gain, 11% margin', correctValue: 14.5, codeQuantity: { ...gain(10), kind: 'new_margin' } })], ctx([text]))[0].correctionLine)
      .toBe('A 10% price rise takes margin to about 14.5%, not 11%.');
  });

  it('the checker disagreeing with code: probe only, logged (1c9184cf t18, run 1: checker 38.1, code 20.5)', () => {
    const text = 'Restoring the full 16 points would need roughly a 16% lift.';
    const [v] = vetCheckerClaims([claim({
      span: text, candidateValue: '16%', correctValue: 38.1, probe: 'You said a 16% lift restores the full 16 points. Walk me through how you sized that.',
      codeQuantity: { kind: 'needed_for_gain', stepId: null, price: null, target: 16 },
    })], ctx([text]));
    expect(v.flag).toBe(true);
    expect(v.correctionLine).toBeNull();
    expect(v.probeLine).toMatch(/Walk me through/);
    expect(v.vetNotes.join(' ')).toMatch(/probe only: code computes 20\.5, the checker said 38\.1/);
  });

  it('agreement is 3% or 0.5: "20% → ten points" (checker 16.3, code 15.7) is probe only; 15.9 agrees', () => {
    const text = 'A 20% price rise is worth ten points.';
    expect(vetCheckerClaims([claim({ span: text, candidateValue: 'ten points', correctValue: 16.3, codeQuantity: gain(20) })], ctx([text]))[0].correctionLine).toBeNull();
    expect(vetCheckerClaims([claim({ span: text, candidateValue: 'ten points', correctValue: 15.9, codeQuantity: gain(20) })], ctx([text]))[0].correctionLine)
      .toBe('A 20% price rise lifts margin about 15.7 points, not 10.');
  });

  it('a misnamed quantity is caught by the disagreement ("a 30% bean increase" named as the bean-share step)', () => {
    const text = 'That is a 30% bean increase.';
    const [v] = vetCheckerClaims([claim({ span: text, candidateValue: 'a 30% bean increase', correctValue: 40, codeQuantity: { kind: 'step', stepId: 'bean_share_of_revenue', price: null, target: null } })], ctx([text]));
    expect(v.correctionLine).toBeNull();
  });

  it("binding: the price or target code computes from must be in the claim's span — or its sentence (below)", () => {
    const [price] = vetCheckerClaims([claim({ span: 'that recovers about 5 points', candidateValue: '5 points', correctValue: 8.5, codeQuantity: gain(10) })],
      ctx(['A 10% price increase. That recovers about 5 points.']));
    expect(price.correctionLine).toBeNull();
    expect(price.vetNotes.join(' ')).toMatch(/doesn't state the 10 code computes from/);
    // Eliza b13 t12: the target is in an earlier sentence.
    const [target] = vetCheckerClaims([claim({ span: 'roughly 10–12% on menu prices to restore margin', candidateValue: '10–12%', correctValue: 23.7, codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 24 } })],
      ctx(['To get back to 24% margin I need more. Roughly 10–12% on menu prices to restore margin.']));
    expect(target.correctionLine).toBeNull();
  });

  // Lorenzo, 13 Oct: bind to the claim's sentence when exactly one figure in
  // the input's unit there is the input the checker named; else the span.
  it('the sentence binds when exactly one figure there is the input (5 replay losses: the price before a dash, the clause after it)', () => {
    const text = 'A 10% price increase takes revenue to 110, COGS falls to 52.7% of revenue — that\'s 5.3 points of margin back from one move.';
    const [v] = vetCheckerClaims([claim({ span: "that's 5.3 points of margin back from one move", candidateValue: '5.3 points', correctValue: 8.5, codeQuantity: gain(10) })], ctx([text]));
    expect(v.correctionLine).toBe('A 10% price rise lifts margin about 8.5 points, not 5.3.');
    const [t] = vetCheckerClaims([claim({ span: 'roughly 10–12% on menu prices to restore margin', candidateValue: '10–12%', correctValue: 23.7, codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 24 } })],
      ctx(['To get back to 24% margin: roughly 10–12% on menu prices to restore margin.']));
    expect(t.correctionLine).toBe('Getting back to a 24% margin takes about a 23.7% price rise, not 10–12%.');
    // A target gain is in points.
    const [g] = vetCheckerClaims([claim({ span: 'would need roughly a 16% lift', candidateValue: '16%', correctValue: 20.5, codeQuantity: { kind: 'needed_for_gain', stepId: null, price: null, target: 16 } })],
      ctx(['Restoring the full 16 points would need roughly a 16% lift.']));
    expect(g.correctionLine).toBe('Recovering 16 points of margin takes about a 20.5% price rise, not 16%.');
    const [g25] = vetCheckerClaims([claim({ span: 'would need roughly a 25% lift', candidateValue: '25%', correctValue: 20.5, codeQuantity: { kind: 'needed_for_gain', stepId: null, price: null, target: 16 } })],
      ctx(['Getting the full 16 points back would need roughly a 25% lift.']));
    expect(g25.correctionLine).toBe('Recovering 16 points of margin takes about a 20.5% price rise, not 25%.');
  });

  it('two prices in one sentence: binds to the one the checker named; two of the same figure — the span decides', () => {
    const text = 'A 10% rise recovers about 5 points and a 20% rise would be closer to ten points.';
    const [ten] = vetCheckerClaims([claim({ span: 'recovers about 5 points', candidateValue: 'about 5 points', correctValue: 8.5, codeQuantity: gain(10) })], ctx([text]));
    expect(ten.correctionLine).toBe('A 10% price rise lifts margin about 8.5 points, not 5.');
    const [twenty] = vetCheckerClaims([claim({ span: 'would be closer to ten points', candidateValue: 'ten points', correctValue: 15.7, codeQuantity: gain(20) })], ctx([text]));
    expect(twenty.correctionLine).toBe('A 20% price rise lifts margin about 15.7 points, not 10.');
    // A price the sentence doesn't hold: unbound.
    const [twelve] = vetCheckerClaims([claim({ span: 'recovers about 5 points', candidateValue: 'about 5 points', correctValue: 9.9, codeQuantity: gain(12) })], ctx([text]));
    expect(twelve.correctionLine).toBeNull();
    // 10% twice — the price and a volume loss: which one the claim rests on is unclear, and the span doesn't say.
    const twice = 'A 10% rise with 10% fewer transactions still recovers about 5 points.';
    const [amb] = vetCheckerClaims([claim({ span: 'still recovers about 5 points', candidateValue: 'about 5 points', correctValue: 8.5, codeQuantity: gain(10) })], ctx([twice]));
    expect(amb.correctionLine).toBeNull();
    expect(amb.vetNotes.join(' ')).toMatch(/the claim's sentence states 10 twice/);
  });

  it("a math step whose inputs aren't all revealed: probe only", () => {
    const [v] = vetCheckerClaims([claim({
      span: '10 percentage points', candidateValue: '10 percentage points', correctValue: 4.2, probe: 'How did you get 10 points?',
      codeQuantity: { kind: 'step', stepId: 'bean_points_added', price: null, target: null },
    })], ctx(['If beans rose 40%, that is 40% of 25%, which is 10 percentage points'], { revealedIds: ['cogs_pct', 'bean_share_of_cogs'] }));
    expect(v.flag).toBe(true);
    expect(v.correctionLine).toBeNull();
    expect(v.probeLine).toBe('How did you get 10 points?');
  });

  it('a step with no declared inputs computes nothing (its inputs can\'t be shown revealed)', () => {
    const p2 = getCaseById('prof-002');
    const [v] = vetCheckerClaims([claim({ span: 'a $30M swing', candidateValue: '$30M', correctValue: 24, codeQuantity: { kind: 'step', stepId: 'op_profit_swing', price: null, target: null } })],
      { caseData: p2, revealedIds: p2.dataLedger.map(d => d.id), shownExhibitIds: [], candidateTexts: ['a $30M swing'] });
    expect(v.correctionLine).toBeNull();
  });

  it('pricing answers need every cost line revealed: probe only before', () => {
    const text = 'a 10% rise recovers 5 points';
    const [v] = vetCheckerClaims([claim({ span: text, candidateValue: '5 points', correctValue: 8.5, codeQuantity: gain(10) })], ctx([text], { revealedIds: ['cogs_pct', 'labor_pct'] }));
    expect(v.correctionLine).toBeNull();
  });

  it('their figure must be one they said', () => {
    const [v] = vetCheckerClaims([claim({ span: 'a 10% rise recovers 5 points', candidateValue: '7 points', correctValue: 8.5, codeQuantity: gain(10) })], ctx(['a 10% rise recovers 5 points']));
    expect(v.correctionLine).toBeNull();
  });
});

describe('deterministic first: code\'s computation decides the flag', () => {
  const ctx = (texts: string[]): VetContext => ({ caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: texts });
  const gain10 = { kind: 'gain' as const, stepId: null, price: 10, target: null };
  it("their figure within code's tolerance is no flag, whatever the checker's value", () => {
    const [v] = vetCheckerClaims([claim({ span: 'a 10% rise recovers about 8 points', candidateValue: 'about 8 points', correctValue: 5.3, codeQuantity: gain10 })], ctx(['a 10% rise recovers about 8 points']));
    expect(v.flag).toBe(false);
    expect(v.vetNotes.join(' ')).toMatch(/code computes 8\.5/);
  });
  it("outside code's tolerance it stays a flag even when the checker's own value is near theirs — probe only", () => {
    const [v] = vetCheckerClaims([claim({ span: 'a 10% rise recovers 5 points', candidateValue: '5 points', correctValue: 5.3, codeQuantity: gain10 })], ctx(['a 10% rise recovers 5 points']));
    expect(v.flag).toBe(true);
    expect(v.correctionLine).toBeNull();
  });
});

// Lorenzo, 13 Oct: when code can't compute the quantity, Rule 14's second
// attempt is a pointer probe — it names revealed data the claim conflicts with.
// The checker drafts it; provenance and truth apply.
describe('the pointer probe', () => {
  const ctx = (over: Partial<VetContext> = {}): VetContext => ({ caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: ['The whole 18-point decline sits in COGS.'], ...over });
  const whole = claim({
    span: 'the whole 18-point decline sits in COGS', candidateValue: '18 points', correctValue: 16, actualShare: 0.89,
    probe: 'You said the whole 18 points sits in COGS. Walk me through that.',
    pointer: 'How does that fit with overhead going from 12% to 14% of revenue?',
  });
  it('kept when code computes nothing and it names a revealed figure', () => {
    const [v] = vetCheckerClaims([whole], ctx());
    expect(v.correctionLine).toBeNull();
    expect(v.pointerLine).toBe(whole.pointer);
  });
  it('dropped when it carries an unrevealed figure', () => {
    const [v] = vetCheckerClaims([claim({ ...whole, pointer: 'How does that fit with $480M of revenue?' })], ctx());
    expect(v.pointerLine).toBeNull();
  });
  it('dropped when it states a false case fact', () => {
    const [v] = vetCheckerClaims([claim({ ...whole, pointer: 'Given overhead at 22% of revenue, how does that fit?' })], ctx());
    expect(v.pointerLine).toBeNull();
  });
  it("dropped when it names no revealed figure — only the candidate's own", () => {
    const [v] = vetCheckerClaims([claim({ ...whole, pointer: 'Are you sure about the 18 points?' })], ctx());
    expect(v.pointerLine).toBeNull();
  });
  it('dropped when it is not a question', () => {
    const [v] = vetCheckerClaims([claim({ ...whole, pointer: 'Overhead went from 12% to 14% of revenue.' })], ctx());
    expect(v.pointerLine).toBeNull();
  });
  it('none when code writes the correction', () => {
    const [v] = vetCheckerClaims([claim({ span: 'a 10% rise recovers 5 points', candidateValue: '5 points', correctValue: 8.5, pointer: 'How does that fit with labor at 22% of revenue?', codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null } })],
      ctx({ candidateTexts: ['a 10% rise recovers 5 points'] }));
    expect(v.correctionLine).not.toBeNull();
    expect(v.pointerLine).toBeNull();
  });
});

describe('code-side tolerance filter', () => {
  const ctx = (texts: string[]): VetContext => ({ caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: texts });
  it('batch 20 eb9f0abb t18: "$48M … roughly 9 points" against 8.5 is within tolerance — no flag', () => {
    const [v] = vetCheckerClaims([claim({ span: 'is ~$48M of near-pure margin, roughly 9 points', candidateValue: 'roughly 9 points', correctValue: 8.5, codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null } })], ctx(['roughly 9 points']));
    expect(v.flag).toBe(false);
  });
  it('a range holding the correct value is no flag; one that misses stays', () => {
    expect(vetCheckerClaims([claim({ candidateValue: '7–10 points', correctValue: 8.5 })], ctx(['7–10 points']))[0].flag).toBe(false);
    expect(vetCheckerClaims([claim({ candidateValue: '10–12%', correctValue: 23.7 })], ctx(['10–12%']))[0].flag).toBe(true);
  });
  it('a real error stays: 5 points against 8.5', () => {
    expect(vetCheckerClaims([claim({ candidateValue: 'about 5 points', correctValue: 8.5 })], ctx(['about 5 points']))[0].flag).toBe(true);
  });
  it('an error with no figure to check is no flag', () => {
    expect(vetCheckerClaims([claim({ candidateValue: 'a lot', correctValue: null })], ctx(['a lot']))[0].flag).toBe(false);
  });
  it('word quantities get a margin: "over half" at 47% passes; "the whole 18 points" at 89% and "most of the gap" at 30% stay', () => {
    expect(vetCheckerClaims([claim({ span: "That's over half the gap from one lever.", candidateValue: 'over half', actualShare: 0.47 })], ctx(['over half']))[0].flag).toBe(false);
    expect(vetCheckerClaims([claim({ span: 'the whole 18-point margin decline sits in COGS', candidateValue: '18 points', correctValue: 16, actualShare: 0.89 })], ctx(['18 points']))[0].flag).toBe(true);
    expect(vetCheckerClaims([claim({ span: 'a 5-7% increase recovers most of the gap', candidateValue: 'most of the gap', actualShare: 0.3 })], ctx(['most of the gap']))[0].flag).toBe(true);
  });
});

describe("code's pricing math in the checker's input", () => {
  it('for the price changes and targets the message names, once every cost line is out', () => {
    const msg = 'A 10% price increase takes margin from 6% to about 11%, and getting back to 24% margin needs a bigger move; restoring the full 16 points needs more.';
    const u = buildCheckerUser(prof, { revealedIds: COSTS, shownExhibitIds: [], transcript: [], message: msg });
    expect(u).toMatch(/CODE'S PRICING MATH/);
    expect(u).toMatch(/a 10% price rise: margin gain 8\.5 points → new margin 14\.5%; break-even volume loss 19\.2% .* or 33\.3%/);
    expect(u).toMatch(/price rise needed for a 24% margin: 23\.7%/);
    expect(u).toMatch(/price rise needed to recover 16 points \(a 22% margin\): 20\.5%/);
  });
  it('not before the cost lines are revealed', () => {
    const u = buildCheckerUser(prof, { revealedIds: ['cogs_pct'], shownExhibitIds: [], transcript: [], message: 'A 10% price increase recovers 8 points.' });
    expect(u).not.toMatch(/CODE'S PRICING MATH/);
  });
});
