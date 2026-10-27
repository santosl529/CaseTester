// The checker's equations and answer sheet (switch `checkerEquations`,
// Lorenzo's item E of 27 Oct). The model transcribes; **code decides**. These
// tests pin that boundary: no entry of the model's can make a claim correct,
// no entry it is unsure of can make one wrong, and no figure the candidate did
// not say can be judged at all.
import { describe, it, expect } from 'vitest';
import { getCaseById } from '@/lib/cases/loader';
import { vetCheckerClaims, type VetContext } from '@/lib/orchestrator/math-checker';
import { verifyEquation, supersededBy, type AnswerSheetEntry, type Equation } from '@/lib/orchestrator/checker-equations';
import { checkerClaim } from './helpers/checker-claim';

const op = (value: number, unit = '', scale: Equation['operands'][number]['scale'] = 'none') => ({ value, scale, unit });
const eq = (p: Partial<Equation>): Equation => ({
  quoted: '', operands: [], operator: '*', statedResult: op(0), confidence: 'high', ...p,
});

describe('code verifies the arithmetic, exactly', () => {
  // voice-live 2026-10-18 9813d6ce t14, as the checker would hear it.
  const MESSAGE = 'And currently, we\'re at fifty eight. So fifty eight divided by four, um, gives us around, um, sorry, uh, fourteen point five.';

  it('verifies a spoken chain the text reader needed a pre-pass to see', () => {
    const c = verifyEquation(eq({
      quoted: 'fifty eight divided by four, um, gives us around, um, sorry, uh, fourteen point five',
      operands: [op(58), op(4)], operator: '/', statedResult: op(14.5),
    }), MESSAGE);
    expect(c.verdict).toBe('correct');
    expect(c.computed).toBe(14.5);
  });

  it('flags a real error, and the model never says so', () => {
    const message = 'So sixteen divided by eighteen is, um, one point six percent.';
    const c = verifyEquation(eq({
      quoted: 'sixteen divided by eighteen is, um, one point six percent',
      operands: [op(16), op(18)], operator: '/', statedResult: op(1.6, '%'),
      confidence: 'high',
    }), message);
    expect(c.verdict).toBe('incorrect');
  });

  it('a low-confidence entry is unclear whatever the numbers say', () => {
    const message = 'So sixteen divided by eighteen is, um, one point six percent.';
    for (const confidence of ['low'] as const) {
      const c = verifyEquation(eq({
        quoted: 'sixteen divided by eighteen is, um, one point six percent',
        operands: [op(16), op(18)], operator: '/', statedResult: op(1.6, '%'), confidence,
      }), message);
      expect(c.verdict).toBe('unclear');
      expect(c.why).toMatch(/not sure/);
    }
  });

  it('reads the scale word, which is where the text reader loses three orders of magnitude', () => {
    const message = 'two hundred fifty million adults times one point six percent is four million.';
    const c = verifyEquation(eq({
      quoted: 'two hundred fifty million adults times one point six percent is four million',
      operands: [op(250, '', 'million'), op(1.6, '%')], operator: '*', statedResult: op(4, '', 'million'),
    }), message);
    expect(c.verdict).toBe('correct');
  });

  it('a figure the candidate did not say is never judged', () => {
    const message = 'So fifty eight divided by four.';
    const c = verifyEquation(eq({
      quoted: 'fifty eight divided by four', operands: [op(58), op(4)], operator: '/', statedResult: op(14.5),
    }), message);
    expect(c.verdict).toBe('unclear');
    expect(c.why).toMatch(/does not state 14.5/);
  });

  it('a paraphrase is never judged', () => {
    const message = 'So sixteen divided by eighteen is one point six percent.';
    const c = verifyEquation(eq({
      quoted: 'the candidate divides 16 by 18 and gets 1.6%',
      operands: [op(16), op(18)], operator: '/', statedResult: op(1.6, '%'),
    }), message);
    expect(c.verdict).toBe('unclear');
    expect(c.why).toMatch(/not the candidate's/);
  });

  it('a hedge in their own words widens the band, as it does in the text reader', () => {
    const message = 'three hundred seventy five divided by four is something like ninety three.';
    const c = verifyEquation(eq({
      quoted: 'three hundred seventy five divided by four is something like ninety three',
      operands: [op(375), op(4)], operator: '/', statedResult: op(93),
    }), message);
    expect(c.verdict).toBe('correct');   // 93.75, hedged
  });

  it('a malformed entry is unclear, never a flag', () => {
    const message = 'fifty eight over zero is nothing, and four.';
    expect(verifyEquation(eq({ quoted: 'four', operands: [op(4)], operator: '*', statedResult: op(4) }), message).verdict).toBe('unclear');
    expect(verifyEquation(eq({ quoted: 'fifty eight over zero', operands: [op(58), op(0)], operator: '/', statedResult: op(4) }), message).verdict).toBe('unclear');
  });
});

describe('the answer sheet drops a stale line', () => {
  const MESSAGE = 'Redoing it: Starter standalone LTV over CAC is about three point six times, not the two times I said before.';
  const sheet = (p: Partial<AnswerSheetEntry>): AnswerSheetEntry[] => [{
    label: 'Starter standalone LTV/CAC', value: 3.6, scale: 'none', unit: 'x', supersedes: '2 times',
    quoted: 'about three point six times', ...p,
  }];

  it('drops a correction on the figure the candidate has replaced', () => {
    expect(supersededBy('about 2 times', sheet({}), MESSAGE)?.value).toBe(3.6);
  });

  it('keeps the line when the candidate still says that figure', () => {
    expect(supersededBy('about 3.6 times', sheet({}), MESSAGE)).toBeNull();
  });

  it('keeps the line when the replacement is not a figure they said', () => {
    // The model's own number, not the candidate's: code cannot audit it, so it
    // never silences a flag.
    expect(supersededBy('about 2 times', sheet({ value: 4.2, quoted: 'about four point two times' }), MESSAGE)).toBeNull();
  });

  it('keeps the line when nothing is declared superseded', () => {
    expect(supersededBy('about 2 times', sheet({ supersedes: '' }), MESSAGE)).toBeNull();
  });

  it('keeps the line when their figure is not the one replaced', () => {
    expect(supersededBy('about 2.4 times', sheet({}), MESSAGE)).toBeNull();
  });
});

// The vetting end of it, on the real claim the b39 stale correction sits on
// (quillpath p07 `c82e7bd7` / p24 `99dd37d1`: "Starter standalone LTV/CAC is
// about 2 times", spoken after the candidate had already redone the figure).
describe('the vetting drops the line, not just the sheet', () => {
  const SAID = 'Starter standalone: 40% cancelled in 12 months, call it 4% a month, a ~25-month life. 25 × $30 = $750 on $300 CAC = 2.5x. Fails — that\'s the CFO\'s number. Redoing it with the upgrade credit: it is about 3.6x, not the 2.5x I said.';
  const claim = checkerClaim('$750; 2.5x', {
    span: '25 × $30 = $750 on $300 CAC = 2.5x', codeQuantity: { kind: 'step', stepId: 'starter_ratio', price: null, target: null },
    correctValue: 2, verdict: 'error', quantity: 'Starter standalone LTV/CAC',
  });
  const ctx = (answerSheet?: AnswerSheetEntry[]): VetContext => ({
    caseData: getCaseById('pricing-001'), revealedIds: ['plan_prices_costs', 'starter_cohort', 'plan_cac'],
    shownExhibitIds: [], candidateTexts: [SAID], answerSheet,
  });

  it('with no answer sheet the correction goes out, as it does today', () => {
    const [v] = vetCheckerClaims([claim], ctx());
    expect(v.flag).toBe(true);
    expect(v.correctionLine).toMatch(/is about 2 times/);
  });

  it('with the sheet showing 2.5x replaced, the flag — probe and correction — is dropped', () => {
    const [v] = vetCheckerClaims([claim], ctx([{
      label: 'Starter standalone LTV/CAC', value: 3.6, scale: 'none', unit: 'x',
      supersedes: '2.5x', quoted: 'it is about 3.6x',
    }]));
    expect(v.flag).toBe(false);
    expect(v.correctionLine).toBeNull();
    expect(v.probeLine).toBeNull();
    expect(v.vetNotes.join(' ')).toMatch(/no longer their latest/);
  });

  it('a sheet entry on another quantity leaves it alone', () => {
    const [v] = vetCheckerClaims([claim], ctx([{
      label: 'months on Starter', value: 25, scale: 'none', unit: 'months', supersedes: '12 months', quoted: 'a ~25-month life',
    }]));
    expect(v.flag).toBe(true);
  });
});
