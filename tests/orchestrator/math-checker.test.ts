import { describe, it, expect } from 'vitest';
import {
  statesQuantitativeClaim, buildCheckerSystem, buildCheckerUser, vetCheckerClaims, isActionable, relativeAsPoints, codeCorrection,
  CheckerOutputSchema, type CheckerClaim, type VetContext,
} from '@/lib/orchestrator/math-checker';
import { MATH_CHECKER_CONFIGS } from '@/lib/models';
import { getCaseById } from '@/lib/cases/loader';
import { buildFactBase } from '@/lib/orchestrator/fact-check';

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

  // Lorenzo, 13 Oct (0bfe5f38 t21: "…and where does overhead sit?"): a probe
  // asks about the candidate's own claim — it names no component or figure
  // they haven't raised, and carries no arithmetic.
  describe('a probe never leads', () => {
    const said = 'The 18-point margin decline is fully explained by input cost inflation — 4.2 points from beans up 40%, 11.8 points from dairy, packaging and food up 37.5%.';
    const full = claim({
      span: said, candidateValue: 'fully (4.2 + 11.8 = 16 points of the 18)', actualShare: 0.89,
      probe: 'You said the 18-point decline is fully explained by input cost inflation. How do the 4.2 and 11.8 points add up against the 18, and where does overhead sit?',
    });
    const trimmed = 'You said the 18-point decline is fully explained by input cost inflation. How do the 4.2 and 11.8 points add up against the 18?';
    it('a probe naming a cost line they never raised loses that clause — and is no hint either', () => {
      const [v] = vetCheckerClaims([full], ctx({ candidateTexts: [said] }));
      expect(v.probeLine).toBe(trimmed);
      expect(v.hintLine).toBeNull();
      expect(v.vetNotes.join(' ')).toMatch(/names overhead/);
    });
    it('the fallback never splices their arithmetic', () => {
      const [v] = vetCheckerClaims([claim({ ...full, probe: 'Where does overhead sit against the 18?' })], ctx({ candidateTexts: [said] }));
      expect(v.probeLine).toBe('Walk me through that calculation.');
    });
    it('the same probe without the component they never raised is kept', () => {
      const [v] = vetCheckerClaims([claim({ ...full, probe: trimmed })], ctx({ candidateTexts: [said] }));
      expect(v.probeLine).toBe(trimmed);
      expect(v.hintLine).toBeNull();
    });

    // Lorenzo, 13 Oct (Step-4 rulings): two steps. The first probe names only
    // what is in the claim, plus the target; only a second probe may name a
    // component the candidate raised earlier, as a hint.
    describe('two steps: the claim first, a hint second', () => {
      const earlier = ['Overhead moved from 12% to 14%, so 2 points.', said];
      it('0bfe5f38 t19: the first probe loses "…where does overhead sit?"; the full draft is the hint', () => {
        const [v] = vetCheckerClaims([full], ctx({ candidateTexts: earlier }));
        expect(v.probeLine).toBe(trimmed);
        expect(v.hintLine).toBe(full.probe);
      });
      it('a component they raised earlier, in its own question: neutral first probe, the draft as the hint', () => {
        const probe = 'You said the 18-point decline is fully explained by input costs. Where does overhead come in?';
        const [v] = vetCheckerClaims([claim({ ...full, probe })], ctx({ candidateTexts: earlier }));
        expect(v.probeLine).toBe('Walk me through that calculation.');
        expect(v.hintLine).toBe(probe);
      });
      it('a leading last question is dropped when a question is left before it', () => {
        const probe = 'How do the 4.2 and 11.8 points add up against the 18? Where does overhead sit?';
        const [v] = vetCheckerClaims([claim({ ...full, probe })], ctx({ candidateTexts: earlier }));
        expect(v.probeLine).toBe('How do the 4.2 and 11.8 points add up against the 18?');
        expect(v.hintLine).toBe(probe);
      });
      it('a trimmed draft that still leads is not the first probe', () => {
        const probe = 'How does overhead fit the 18, and where does labor sit?';
        const [v] = vetCheckerClaims([claim({ ...full, probe })], ctx({ candidateTexts: earlier }));
        expect(v.probeLine).toBe('Walk me through that calculation.');
      });
      it('a figure they said earlier but not in the claim: a hint, not the first probe', () => {
        const probe = 'How do the 4.2 and 11.8 points sit against the 18, and what about the 2 points?';
        const [v] = vetCheckerClaims([claim({ ...full, probe })], ctx({ candidateTexts: earlier }));
        expect(v.probeLine).toBe('How do the 4.2 and 11.8 points sit against the 18?');
        expect(v.hintLine).toBe(probe);
      });
      it('the claim is the sentence it was said in, not only the span the check quoted (996ae97f t9)', () => {
        const text = 'A 10% price increase on flat volume: revenue goes to 110, COGS stays at 58 in absolute terms, so COGS falls to about 53% of revenue — that\'s five points of margin back immediately. Overhead is a separate story.';
        const probe = 'On the 10% price increase, you said five points of margin come back. Which cost lines did you include in that figure?';
        const v = vetCheckerClaims([claim({ span: "that's five points of margin back immediately", candidateValue: 'five points', correctValue: 8.5, probe })], ctx({ candidateTexts: [text] }))[0];
        expect(v.probeLine).toBe(probe);
        const o = vetCheckerClaims([claim({ span: "that's five points of margin back immediately", candidateValue: 'five points', correctValue: 8.5, probe: 'You said five points of margin. Where does overhead sit?' })], ctx({ candidateTexts: [text] }))[0];
        expect(o.probeLine).not.toMatch(/overhead/);
        expect(o.hintLine).toMatch(/overhead/);
      });
      it('…and the sentence before it, which "That …" refers back to (fc290dc0 t15)', () => {
        const text = 'Raise prices 10% on flat volume. That recovers about 5 points of margin, taking us from 6% to roughly 11%.';
        const probe = 'You said the 10% price rise takes margin from 6% to roughly 11%. Which cost lines did you include when you worked that out?';
        const [v] = vetCheckerClaims([claim({ span: 'That recovers about 5 points of margin, taking us from 6% to roughly 11%.', candidateValue: 'roughly 11%', correctValue: 14.5, probe })], ctx({ candidateTexts: [text] }));
        expect(v.probeLine).toBe(probe);
      });
      it('the target may be named in the first probe: "Does that account for the full 18 points?"', () => {
        const text = 'Input cost inflation explains the whole margin decline: 4.2 points from beans and 11.8 from other inputs.';
        const probe = 'Does that account for the full 18 points?';
        const [v] = vetCheckerClaims([claim({ ...full, span: text, probe })], ctx({ candidateTexts: [text] }));
        expect(v.probeLine).toBe(probe);
        expect(v.hintLine).toBeNull();
      });
      it('a hint still never carries arithmetic, an unrevealed figure or a component they never raised', () => {
        for (const probe of ['You said 4.2 + 11.8 covers the 18. Where does overhead sit?', 'Where does overhead sit on $480M of revenue?', 'And where does labor sit?']) {
          const [v] = vetCheckerClaims([claim({ ...full, probe })], ctx({ candidateTexts: earlier }));
          expect(v.hintLine).toBeNull();
        }
      });
    });
    it('a revealed figure they never said is not named', () => {
      const [v] = vetCheckerClaims([claim({ ...fiona, probe: 'With COGS at 58% of revenue, how does 10–12% restore the 24% margin?' })], ctx({ candidateTexts: ['COGS is the issue.', 'To get back to 24% margin I need roughly 10–12% on menu prices.'] }));
      expect(v.probeLine).toBe('Walk me through how you got to 10–12%.');
    });
    it('a probe with arithmetic in it is replaced', () => {
      const [v] = vetCheckerClaims([claim({ ...full, probe: 'You said 4.2 + 11.8 covers the 18. How?' })], ctx({ candidateTexts: [said] }));
      expect(v.probeLine).toBe('Walk me through that calculation.');
    });
    it('a word quantity with no figure of theirs falls back to a plain ask', () => {
      const text = 'Pricing gets us most of the gap back.';
      const [v] = vetCheckerClaims([claim({ span: text, candidateValue: 'most of the gap', actualShare: 0.3, probe: 'With overhead up 2 points, how much does pricing recover?' })], ctx({ candidateTexts: [text] }));
      expect(v.probeLine).toBe('Walk me through how you got there.');
    });
  });

  // Lorenzo, 13 Oct (Jordan 099f33e9: "call it about 40 points of margin
  // erosion coming out of COGS alone" — 16/42 = 38%, said as points): code
  // corrects a relative change stated as points, whatever quantity the
  // checker named (here a dollar step whose inputs weren't out).
  describe('a relative change stated as points', () => {
    const said = 'From 42 to 58, that is a jump of 16 on a base of 42, so roughly 38% growth — call it about 40 points of margin erosion coming out of COGS alone.';
    const jordan = claim({
      span: 'call it about 40 points of margin erosion coming out of COGS alone', candidateValue: 'about 40 points', correctValue: 16,
      probe: 'You said about 40 points. How did you get there?', codeQuantity: { kind: 'step', stepId: 'cogs_dollar_impact', price: null, target: null },
    });
    const ctxJ = (texts = [said], revealedIds = ['cogs_pct', 'labor_pct', 'overhead_pct']) => ctx({ candidateTexts: texts, revealedIds });
    it('code writes the line: the change in points, the levels, and what their figure is', () => {
      const [v] = vetCheckerClaims([jordan], ctxJ());
      expect(v.correctionLine).toBe('COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base.');
      expect(v.correctionFigure).toBe('16');
    });
    it('not when their figure is the change in points, or names no line, or the line is not out', () => {
      expect(vetCheckerClaims([claim({ ...jordan, span: 'COGS took 16 points of margin', candidateValue: '16 points' })], ctxJ(['COGS took 16 points of margin']))[0].correctionLine).toBeNull();
      expect(vetCheckerClaims([claim({ ...jordan, span: 'call it about 40 points of margin erosion', candidateValue: 'about 40 points' })], ctxJ(['call it about 40 points of margin erosion']))[0].correctionLine).toBeNull();
      expect(vetCheckerClaims([jordan], ctxJ([said], ['labor_pct']))[0].correctionLine).toBeNull();
    });
    // Lorenzo, 15 Oct (batch-25 ruling 3; Jordan 78c89dba t5): COGS named in
    // the sentence before is the line — the correction line exactly as before.
    it('the line named elsewhere in the same message (Jordan 78c89dba t5)', () => {
      const t5 = "COGS, clearly. Labor is flat at 22% of revenue across all three years, and overhead only drifts from 12 to 14 — two points, basically noise. COGS is the whole story.\n\nLet me size it. COGS goes 42 to 50 to 58 percent of revenue. That's a 16-point move off a 42-point base, so it's grown about 38% relative to where it started — call it roughly 38 points of margin pressure. Against a total decline of 18 points, COGS more than fully accounts for it; the other lines are actually offsetting some of it. So this is a single-driver case.";
      const c = claim({ span: 'call it roughly 38 points of margin pressure', candidateValue: '38 points', correctValue: 16, probe: 'You said roughly 38 points of margin pressure from COGS. How did you get from the 38% growth to points of margin?', codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
      const [v] = vetCheckerClaims([c], ctxJ([t5]));
      expect(v.correctionLine).toBe('COGS rose 16 points, from 42% to 58% of revenue; 38% is its growth on its own base.');
      // Not from another message: the line must be named in this one.
      expect(vetCheckerClaims([c], ctxJ([t5, 'Call it roughly 38 points of margin pressure.']))[0].correctionLine).toBeNull();
    });
    it("the prompt's own figures are no relative change (Jordan 78c89dba t7: the 18-point decline isn't overhead's 17%)", () => {
      const t7 = "And then I'm reading that as 38 points of margin pressure, because every point COGS takes is a point profit doesn't get. The line grew 38%, so that's about 38 points coming out of profit — which is why I said it more than covers the 18-point decline on its own, with labor and overhead soaking up the rest.";
      const c = claim({ span: 'it more than covers the 18-point decline on its own, with labor and overhead soaking up the rest', candidateValue: 'COGS exceeds 18 points; labor/overhead offset', correctValue: 16, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
      expect(vetCheckerClaims([c], ctxJ([t7]))[0].correctionLine).toBeNull();
    });
    it('a line the span names comes first: "overhead … 38 points" is not COGS\'s 38%, though the message names COGS', () => {
      const text = 'COGS went from 42 to 58. Overhead is carrying 38 points of the pressure.';
      const c = claim({ span: 'Overhead is carrying 38 points of the pressure', candidateValue: '38 points', correctValue: 2, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
      expect(vetCheckerClaims([c], ctxJ([text]))[0].correctionLine).toBeNull();
    });
    it("a line's own change in points is no relative change (0bfe5f38 t19: \"16 points of the 18\" isn't overhead's 17%)", () => {
      const t19 = 'The 18-point margin decline is fully explained by input cost inflation — 4.2 points from beans up 40%, 11.8 points from other inputs up 37.5%, which is the full 16 points of COGS, and overhead adds the other 2.';
      const c = claim({ span: 'The 18-point margin decline is fully explained by input cost inflation — 4.2 points from beans up 40%, 11.8 points from other inputs', candidateValue: 'fully (4.2 + 11.8 = 16 points of the 18)', correctValue: null, codeQuantity: { kind: 'none', stepId: null, price: null, target: null } });
      expect(vetCheckerClaims([c], ctxJ([t19]))[0].correctionLine).toBeNull();
      expect(relativeAsPoints(c, ctxJ([t19]), buildFactBase(prof))).toBeNull();
    });
    it('not when their figure is said as a percent, not points', () => {
      const pct = claim({ ...jordan, span: 'COGS grew about 40% on its base', candidateValue: 'about 40%' });
      expect(vetCheckerClaims([pct], ctxJ(['COGS grew about 40% on its base']))[0].correctionLine).toBeNull();
    });
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
// naming the quantity and its input ("From today's 6% margin, a 10% price rise lifts margin about 8.5
// points, not 5.") — only when the checker's figure agrees with code's (3% or
// 0.5), the input code computes from is in the claim's span, and every input
// is revealed; through provenance and truth like any other line.
describe('code writes the correction', () => {
  const ctx = (texts: string[], over: Partial<VetContext> = {}): VetContext => ({ caseData: prof, revealedIds: COSTS, shownExhibitIds: [], candidateTexts: texts, ...over });
  const gain = (price: number) => ({ kind: 'gain' as const, stepId: null, price, target: null });

  // Lorenzo, 15 Oct (batch-25 ruling 5; Raj 36b40584 t21): a break-even at the
  // variable share the candidate states is right — no flag; never a correction from it.
  it("a break-even at the candidate's own variable share (Raj t21: ~65% → 23.9%) is not flagged", () => {
    const text = "If variable costs are say 58% COGS plus some variable labor, call it ~65%, then an 11% price rise lifts contribution per unit from 35 to 46 cents per dollar of old revenue. I could lose roughly 24% of units before I'm worse off.";
    const [v] = vetCheckerClaims([claim({ span: "I could lose roughly 24% of units before I'm worse off", candidateValue: 'roughly 24%', correctValue: 20.8, codeQuantity: { kind: 'breakeven', stepId: null, price: 11, target: null } })], ctx([text]));
    expect(v.flag).toBe(false);
    const [w] = vetCheckerClaims([claim({ span: "I could lose roughly 50% of units before I'm worse off", candidateValue: 'roughly 50%', correctValue: 23.9, codeQuantity: { kind: 'breakeven', stepId: null, price: 11, target: null } })], ctx([text.replace('roughly 24%', 'roughly 50%')]));
    expect(w.flag).toBe(true);
    expect(w.correctionLine ?? '').not.toMatch(/23\.9/);
    expect(codeCorrection(claim({ candidateValue: 'roughly 50%', codeQuantity: { kind: 'breakeven', stepId: null, price: 11, target: null } }), { value: 23.9, index: 2 }, ctx([text]))).toBeNull();
  });
  it('a gain: "From today\'s 6% margin, a 10% price rise lifts margin about 8.5 points, not 5."', () => {
    const [v] = vetCheckerClaims([claim({
      span: 'a 10% price increase recovers about 5 points', candidateValue: 'about 5 points', correctValue: 8.5, codeQuantity: gain(10),
    })], ctx(['A 10% price increase recovers about 5 points.']));
    expect(v.correctionLine).toBe('From today\'s 6% margin, a 10% price rise lifts margin about 8.5 points, not 5.');
  });

  it('a new margin, a needed price for a margin and for a gain, a break-even', () => {
    const one = (over: Partial<CheckerClaim>, text: string) => vetCheckerClaims([claim({ span: text, ...over })], ctx([text]))[0].correctionLine;
    expect(one({ candidateValue: 'about 11%', correctValue: 14.5, codeQuantity: { ...gain(10), kind: 'new_margin' } }, 'A 10% price rise takes us from 6% to about 11%.'))
      .toBe('From today\'s 6% margin, a 10% price rise takes margin to about 14.5%, not 11%.');
    expect(one({ candidateValue: '10–12%', correctValue: 23.7, codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 24 } }, 'To get back to 24% margin I need roughly 10–12% on menu prices.'))
      .toBe('From today\'s 6% margin, getting back to a 24% margin takes about a 23.7% price rise, not 10–12%.');
    expect(one({ candidateValue: '16%', correctValue: 20.5, codeQuantity: { kind: 'needed_for_gain', stepId: null, price: null, target: 16 } }, 'Restoring the full 16 points would need roughly a 16% lift.'))
      .toBe('From today\'s 6% margin, recovering 16 points of margin takes about a 20.5% price rise, not 16%.');
    expect(one({ candidateValue: '10%', correctValue: 19.2, codeQuantity: { ...gain(10), kind: 'breakeven' } }, 'A 10% rise breaks even if we lose 10% of volume.'))
      .toBe('From today\'s 6% margin, with COGS varying with volume, a 10% price rise breaks even at about a 19.2% volume loss, not 10%.');
  });

  it("break-even: of code's answers, the one the checker's figure agrees with, and its cost lines named", () => {
    const text = 'A 10% rise breaks even if we lose 45% of volume.';
    const [v] = vetCheckerClaims([claim({ span: text, candidateValue: '45%', correctValue: 33.3, codeQuantity: { ...gain(10), kind: 'breakeven' } })], ctx([text]));
    expect(v.correctionLine).toBe('From today\'s 6% margin, with COGS and labor varying with volume, a 10% price rise breaks even at about a 33.3% volume loss, not 45%.');
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
      .toBe('From today\'s 6% margin, a 10% price rise lifts margin about 8.5 points, not 5.');
    expect(vetCheckerClaims([claim({ span: text, candidateValue: '5 points gain, 11% margin', correctValue: 14.5, codeQuantity: { ...gain(10), kind: 'new_margin' } })], ctx([text]))[0].correctionLine)
      .toBe('From today\'s 6% margin, a 10% price rise takes margin to about 14.5%, not 11%.');
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
      .toBe('From today\'s 6% margin, a 20% price rise lifts margin about 15.7 points, not 10.');
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
    expect(v.correctionLine).toBe('From today\'s 6% margin, a 10% price rise lifts margin about 8.5 points, not 5.3.');
    const [t] = vetCheckerClaims([claim({ span: 'roughly 10–12% on menu prices to restore margin', candidateValue: '10–12%', correctValue: 23.7, codeQuantity: { kind: 'needed_for_margin', stepId: null, price: null, target: 24 } })],
      ctx(['To get back to 24% margin: roughly 10–12% on menu prices to restore margin.']));
    expect(t.correctionLine).toBe('From today\'s 6% margin, getting back to a 24% margin takes about a 23.7% price rise, not 10–12%.');
    // A target gain is in points.
    const [g] = vetCheckerClaims([claim({ span: 'would need roughly a 16% lift', candidateValue: '16%', correctValue: 20.5, codeQuantity: { kind: 'needed_for_gain', stepId: null, price: null, target: 16 } })],
      ctx(['Restoring the full 16 points would need roughly a 16% lift.']));
    expect(g.correctionLine).toBe('From today\'s 6% margin, recovering 16 points of margin takes about a 20.5% price rise, not 16%.');
    const [g25] = vetCheckerClaims([claim({ span: 'would need roughly a 25% lift', candidateValue: '25%', correctValue: 20.5, codeQuantity: { kind: 'needed_for_gain', stepId: null, price: null, target: 16 } })],
      ctx(['Getting the full 16 points back would need roughly a 25% lift.']));
    expect(g25.correctionLine).toBe('From today\'s 6% margin, recovering 16 points of margin takes about a 20.5% price rise, not 25%.');
  });

  it('two prices in one sentence: binds to the one the checker named; two of the same figure — the span decides', () => {
    const text = 'A 10% rise recovers about 5 points and a 20% rise would be closer to ten points.';
    const [ten] = vetCheckerClaims([claim({ span: 'recovers about 5 points', candidateValue: 'about 5 points', correctValue: 8.5, codeQuantity: gain(10) })], ctx([text]));
    expect(ten.correctionLine).toBe('From today\'s 6% margin, a 10% price rise lifts margin about 8.5 points, not 5.');
    const [twenty] = vetCheckerClaims([claim({ span: 'would be closer to ten points', candidateValue: 'ten points', correctValue: 15.7, codeQuantity: gain(20) })], ctx([text]));
    expect(twenty.correctionLine).toBe('From today\'s 6% margin, a 20% price rise lifts margin about 15.7 points, not 10.');
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
    // Every case step lists inputs now (op_profit_swing got them, 13 Oct) — test on a copy with them emptied.
    const p2 = structuredClone(getCaseById('prof-002'));
    p2.mathSteps.find(m => m.id === 'op_profit_swing')!.inputs = [];
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
  // Lorenzo, 18 Oct (batch 31 Owen t16): a pointer passes the probes' leads check against the claim's span.
  it('kept when code computes nothing and it names a revealed figure the claim allows (the prompt\'s)', () => {
    const [v] = vetCheckerClaims([claim({ ...whole, pointer: 'How does that fit with margin falling from 24% to 6%?' })], ctx());
    expect(v.correctionLine).toBeNull();
    expect(v.pointerLine).toBe('How does that fit with margin falling from 24% to 6%?');
  });
  it('withheld when it names a line or figure the claim doesn\'t (it leads)', () => {
    const [v] = vetCheckerClaims([whole], ctx());
    expect(v.pointerLine).toBeNull();
    expect(v.vetNotes.join(' ')).toMatch(/pointer withheld \(leads: names overhead/);
  });
  it('batch 31 Owen t16: an assumption stated as an exhibit fact is withheld', () => {
    const owen = claim({
      span: 'a volume drop of about 10 percent as the break point', candidateValue: 'about 10%', correctValue: 60,
      pointer: 'How does that threshold fit with the cost structure in Exhibit A, where COGS is 58% of revenue and labor and overhead are largely fixed?',
    });
    const [v] = vetCheckerClaims([owen], ctx({ candidateTexts: ['To get COGS back to the mid-40s takes 25 to 30 percent, and a volume drop of about 10 percent as the break point.'] }));
    expect(v.pointerLine).toBeNull();
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

// Larkspur (13 Oct, replay; Jasmine b14baac7 t35): the checker called "$2.8M
// at half the planned contribution" an error while its own derivation ended
// "Candidate's figure is correct." A verdict that contradicts itself is no flag.
describe('a self-contradicting verdict', () => {
  it('is dropped', () => {
    const c = claim({ span: 'or ~$2.8M even at half the planned contribution', candidateValue: '$2.8M', correctValue: -2.2, derivation: "The four healthy routes give $17.8M, plus $5M, less $20M = $2.8M. Recheck: 17.8+5-20 = 2.8. Candidate's figure is correct." });
    const [v] = vetCheckerClaims([c], { caseData: getCaseById('prof-002'), revealedIds: [], shownExhibitIds: [], candidateTexts: ['or ~$2.8M even at half the planned contribution'] });
    expect(v.flag).toBe(false);
    expect(v.vetNotes.join(' ')).toMatch(/own derivation/);
  });
});
