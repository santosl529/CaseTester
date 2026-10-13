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

// Lorenzo, 13 Oct (rulings after the rerun): code writes the correction
// whenever it computes the quantity the checker names — the checker's own
// arithmetic is never spoken. Only when every input to code's computation is
// revealed; through the truth guard like any other line.
describe('code writes the correction', () => {
  const ctx = (texts: string[], over: Partial<VetContext> = {}): VetContext => ({ caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: texts, ...over });

  it('batch 20 1c9184cf t18: the checker said "closer to 38%"; code says 20.5% for 16 points', () => {
    const text = 'Restoring the full 16 points would need roughly a 16% lift.';
    const [v] = vetCheckerClaims([claim({
      span: 'restoring the full 16 points would need roughly a 16% lift', candidateValue: '16%', correctValue: 38.1,
      probe: 'You said a 16% lift restores the full 16 points. Walk me through how you sized that.',
      codeQuantity: { kind: 'needed_for_gain', stepId: null, price: null, target: 16 },
    })], ctx([text]));
    expect(v.flag).toBe(true);
    expect(v.correctionLine).toBe("It's closer to 20.5%, not 16%.");
    expect(v.vetNotes.join(' ')).toMatch(/checker said 38\.1/);
  });

  it('a gain in points: "It\'s closer to 8.5 points, not 5 points." — hedges dropped from their figure', () => {
    const [v] = vetCheckerClaims([claim({
      span: 'a 10% price increase recovers about 5 points', candidateValue: 'about 5 points', correctValue: 5.3,
      codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null },
    })], ctx(['A 10% price increase recovers about 5 points.']));
    expect(v.correctionLine).toBe("It's closer to 8.5 points, not 5 points.");
  });

  it('a value with several figures: the one in the quantity\'s unit, as they said it (replay: Sofia b20 t16, 58cb… "per 10% of price")', () => {
    const gain = { kind: 'gain' as const, stepId: null, price: 10, target: null };
    const [sofia] = vetCheckerClaims([claim({ candidateValue: '5 points gain, 11% margin', correctValue: 8.5, codeQuantity: gain })], ctx(['call it five points of margin back, going from 6% to roughly 11%']));
    expect(sofia.correctionLine).toBe("It's closer to 8.5 points, not 5 points.");
    const [per] = vetCheckerClaims([claim({ candidateValue: '5 points of margin per 10% of price', correctValue: 8.5, codeQuantity: gain })], ctx(['Each 10 points of price is roughly 5 points of margin.']));
    expect(per.correctionLine).toBe("It's closer to 8.5 points, not 5 points.");
    const [margin] = vetCheckerClaims([claim({ candidateValue: '5 points gain, 11% margin', correctValue: 14.5, codeQuantity: { ...gain, kind: 'new_margin' } })], ctx(['call it five points of margin back, going from 6% to roughly 11%']));
    expect(margin.correctionLine).toBe("It's closer to 14.5%, not 11%.");
  });

  it("of code's accepted answers, the one nearest theirs (break-even: 19.2% with COGS variable, 33.3% with labor too)", () => {
    const be = { kind: 'breakeven' as const, stepId: null, price: 10, target: null };
    const [low] = vetCheckerClaims([claim({ candidateValue: '10%', correctValue: 19.2, codeQuantity: be })], ctx(['a 10% rise breaks even if we lose 10% of volume']));
    expect(low.correctionLine).toBe("It's closer to 19.2%, not 10%.");
    const [high] = vetCheckerClaims([claim({ candidateValue: '45%', correctValue: 33.3, codeQuantity: be })], ctx(['a 10% rise breaks even if we lose 45% of volume']));
    expect(high.correctionLine).toBe("It's closer to 33.3%, not 45%.");
  });

  it('their figure without a unit gets the quantity\'s unit', () => {
    const [v] = vetCheckerClaims([claim({ candidateValue: '5', correctValue: 8.5, codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null } })], ctx(['a 10% rise gives back 5']));
    expect(v.correctionLine).toBe("It's closer to 8.5 points, not 5.");
  });

  it('a range: "It\'s closer to 23.7%, not 10–12%."', () => {
    const [v] = vetCheckerClaims([claim({ candidateValue: '10–12%', correctValue: 23.7, codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 24 } })], ctx(['roughly 10–12% on menu prices to restore margin']));
    expect(v.correctionLine).toBe("It's closer to 23.7%, not 10–12%.");
  });

  it('a math step, in their units', () => {
    const [v] = vetCheckerClaims([claim({
      span: '40% of 25%, which is 10 percentage points of revenue', candidateValue: '10 percentage points', correctValue: 4.2,
      codeQuantity: { kind: 'step', stepId: 'bean_points_added', price: null, target: null },
    })], ctx(['40% of 25%, which is 10 percentage points of revenue']));
    expect(v.correctionLine).toBe("It's closer to 4.2 percentage points, not 10 percentage points.");
  });

  it("code's figure, not the checker's: \"20% → ten points\" (checker 16.3, code 15.7)", () => {
    const [v] = vetCheckerClaims([claim({ candidateValue: 'ten points', correctValue: 16.3, codeQuantity: { kind: 'gain', stepId: null, price: 20, target: null } })], ctx(['a 20% price rise is worth ten points']));
    expect(v.correctionLine).toBe("It's closer to 15.7 points, not 10 points.");
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
    const [v] = vetCheckerClaims([claim({ candidateValue: '$30M', correctValue: 24, codeQuantity: { kind: 'step', stepId: 'op_profit_swing', price: null, target: null } })],
      { caseData: p2, revealedIds: p2.dataLedger.map(d => d.id), shownExhibitIds: [], candidateTexts: ['a $30M swing'] });
    expect(v.correctionLine).toBeNull();
  });

  it('pricing answers need every cost line revealed: probe only before', () => {
    const [v] = vetCheckerClaims([claim({ candidateValue: '5 points', correctValue: 8.5, codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null } })],
      ctx(['a 10% rise recovers 5 points'], { revealedIds: ['cogs_pct', 'labor_pct'] }));
    expect(v.correctionLine).toBeNull();
  });

  it('the line is the figure and its unit, never the words around it ("a 30% bean increase" → "30%")', () => {
    const [v] = vetCheckerClaims([claim({ candidateValue: 'a 30% bean increase', correctValue: 40, codeQuantity: { kind: 'step', stepId: 'bean_share_of_revenue', price: null, target: null } })],
      ctx(['That is a 30% bean increase.']));
    expect(v.correctionLine).toBe("It's closer to 10.5%, not 30%.");
  });

  it("their figure must be one they said (provenance on the candidate's side of the line)", () => {
    const [v] = vetCheckerClaims([claim({ candidateValue: '7 points', correctValue: 8.5, codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null } })], ctx(['a 10% rise recovers 5 points']));
    expect(v.correctionLine).toBeNull();
  });
});

describe('deterministic first: code\'s computation decides the flag', () => {
  const ctx = (texts: string[]): VetContext => ({ caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: texts });
  it("their figure within code's tolerance is no flag, whatever the checker's value", () => {
    const [v] = vetCheckerClaims([claim({ candidateValue: 'about 8 points', correctValue: 5.3, codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null } })], ctx(['a 10% rise recovers about 8 points']));
    expect(v.flag).toBe(false);
    expect(v.vetNotes.join(' ')).toMatch(/code computes 8\.5/);
  });
  it("outside code's tolerance it stays a flag even when the checker's own value is near theirs", () => {
    const [v] = vetCheckerClaims([claim({ candidateValue: '5 points', correctValue: 5.3, codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null } })], ctx(['a 10% rise recovers 5 points']));
    expect(v.flag).toBe(true);
    expect(v.correctionLine).toBe("It's closer to 8.5 points, not 5 points.");
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
    const [v] = vetCheckerClaims([claim({ candidateValue: '5 points', correctValue: 8.5, pointer: 'How does that fit with labor at 22% of revenue?', codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null } })],
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
