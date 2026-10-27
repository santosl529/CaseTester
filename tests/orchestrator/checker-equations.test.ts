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

// The two readings the reader allows and this check did not, pinned on the real entries
// of the 27 Oct extractor run (scripts/equation-extractor-latency.ts, 16 messages): 5 of
// its equations were rated `incorrect` in code, and 3 of the 5 were FALSE — every one of
// the three a percent the model transcribed as a factor the candidate never meant. The
// other two are real errors and must stay `incorrect`.
describe('verifyEquation, the safe-direction rescues (27 Oct)', () => {
  const op = (value: number, unit = '', scale: 'none' | 'thousand' | 'million' | 'billion' = 'none') => ({ value, scale, unit });
  const eq = (quoted: string, operands: ReturnType<typeof op>[], operator: '+' | '-' | '*' | '/', statedResult: ReturnType<typeof op>) =>
    ({ quoted, operands, operator, statedResult, confidence: 'high' as const });

  it('a percent operand read as a growth factor is correct, not an error (58cb8061 t24, b284faee t10)', () => {
    const m1 = 'Revenue is 115 today. A 10% price increase takes revenue to 126.5 against costs of 108.';
    expect(verifyEquation(eq('A 10% price increase takes revenue to 126.5', [op(115), op(10, '%')], '*', op(126.5)), m1).verdict).toBe('correct');
    const m2 = 'Revenue is $480M, so a 10% price increase takes revenue to $528M, and COGS does not move.';
    expect(verifyEquation(eq('a 10% price increase takes revenue to $528M', [op(480, '$', 'million'), op(10, '%')], '*', op(528, '$', 'million')), m2).verdict).toBe('correct');
  });

  it('a relative change transcribed as a difference is unclear — never a flag (58cb8061 t24)', () => {
    const m = 'We would need 158.8 versus 115 today — that\'s a 38% price increase.';
    const r = verifyEquation(eq("versus 115 today — that's a 38% price increase", [op(158.8), op(115)], '-', op(38, '%')), m);
    expect(r.verdict).toBe('unclear');
    expect(r.why).toMatch(/relative change/);
  });

  it('leaves a real error alone (0bfe5f38 t20: 4.2 + 11.8 is 16, not 18; c1b79f9e t29: 16/18 is 0.89)', () => {
    const m1 = 'The 18-point margin decline is fully explained — 4.2 points from beans up 40%, 11.8 points from dairy and packaging.';
    expect(verifyEquation(eq('4.2 points from beans up 40%, 11.8 points from dairy', [op(4.2, 'points'), op(11.8, 'points')], '+', op(18, 'points')), m1).verdict).toBe('incorrect');
    const m2 = '16 over 18... it\'s a bit under 18/18, and 18/18 would be 2. So 16/18 is like 1.6%.';
    expect(verifyEquation(eq('So 16/18 is like 1.6%', [op(16), op(18)], '/', op(1.6, '%')), m2).verdict).toBe('incorrect');
  });
});

// The figure match is not number-blind (27 Oct, the extractor run): the candidate's
// "1.4x" ratio is not the "$1.4m net" a sheet entry replaces, and a line dropped on that
// coincidence is a real error no one ever hears about.
describe('supersededBy, the kinds of a figure', () => {
  const msg = 'Pro sign-ups fall to 350 a month, so total value is $2.08m, up from $1.4m net.';
  const entry = (over: Partial<AnswerSheetEntry> = {}): AnswerSheetEntry => ({
    label: 'Value per month (net)', value: 2.08, scale: 'million', unit: '$', supersedes: '$1.4m net', quoted: 'total value is $2.08m', ...over,
  });
  it('does not drop a ratio against the money it shares digits with', () => {
    expect(supersededBy('1.4x', [entry()], msg)).toBeNull();
  });
  it('does not drop a figure whose scale disagrees', () => {
    expect(supersededBy('$1.4k', [entry()], msg)).toBeNull();
  });
  it('still drops the same kind at the same scale', () => {
    expect(supersededBy('$1.4m', [entry()], msg)).not.toBeNull();
    expect(supersededBy('1.4x', [entry({ label: 'LTV/CAC', supersedes: '1.4x', unit: 'x', scale: 'none', value: 2.08, quoted: 'it is 2.08x now' })], msg)).not.toBeNull();
  });
  it('a bare figure still matches — the words say nothing either way', () => {
    expect(supersededBy('1.4', [entry()], msg)).not.toBeNull();
  });
});
