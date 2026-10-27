// The safe direction of the checker's "equations heard" (switch `equationClears`;
// Lorenzo's ruling of 27 Oct, round 4).
//
//   "A correct equation may clear a false flag or block a doubt probe, but only if code
//    confirms every operand and the result appear in the candidate's own words (number
//    words or digits)."
//
// So the model's structured equation is a POINTER, never an authority: code re-reads the
// candidate's own text for every operand and the stated result, and only then may the
// equation clear. It may never raise a flag, never write a correction, and never mark
// anything correct code cannot itself confirm — a false `correct` shields a real error,
// which is the harm the scale-word ruling was about.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCaseById } from '@/lib/cases/loader';
import { vetCheckerClaims, type VetContext } from '@/lib/orchestrator/math-checker';
import { verifyEquation, clearedByEquation, type Equation, type EquationCheck } from '@/lib/orchestrator/checker-equations';
import { checkerClaim } from './helpers/checker-claim';
import { gateCodeFindings } from '@/lib/orchestrator/math-checker-live';

const op = (value: number, unit = '', scale: Equation['operands'][number]['scale'] = 'none') => ({ value, scale, unit });
const eq = (p: Partial<Equation>): Equation => ({
  quoted: '', operands: [], operator: '*', statedResult: op(0), confidence: 'high', ...p,
});
const checked = (p: Partial<Equation>, message: string): EquationCheck[] => [verifyEquation(eq(p), message)];

afterEach(() => { vi.unstubAllEnvs(); });

describe('code re-reads the candidate\'s own words before an equation may clear anything', () => {
  // The written shape the typed corpus is full of: the chain and its result in one breath.
  const MESSAGE = 'Starter standalone: 25 months at $30 a month is $750 of margin on $300 of CAC, so 2.5x.';

  it('the equation\'s own result clears a doubt on that figure', () => {
    const equations = checked({ quoted: '25 months at $30 a month is $750 of margin', operands: [op(25, 'months'), op(30, '$')], operator: '*', statedResult: op(750, '$') }, MESSAGE);
    expect(equations[0].verdict).toBe('correct');
    expect(equations[0].confirmed).toBe(true);
    const clear = clearedByEquation({ value: 750, expected: 900, span: '25 months at $30 a month is $750 of margin' }, equations, MESSAGE);
    expect(clear?.how).toBe('result');
  });

  it('does not clear when an operand is not in the candidate\'s words — the figure is the model\'s', () => {
    // 24 months is nowhere in the message: `verifyEquation` already refuses to judge it, and
    // an unjudged equation clears nothing.
    const equations = checked({ quoted: '25 months at $30 a month is $750 of margin', operands: [op(24, 'months'), op(30, '$')], operator: '*', statedResult: op(750, '$') }, MESSAGE);
    expect(equations[0].verdict).toBe('unclear');
    expect(equations[0].confirmed).toBe(false);
    expect(clearedByEquation({ value: 750, expected: 900, span: '25 months at $30 a month is $750 of margin' }, equations, MESSAGE)).toBeNull();
  });

  it('does not clear on a paraphrase: the quoted span must be his own', () => {
    const equations = checked({ quoted: 'he multiplies 25 months by $30 and gets $750', operands: [op(25, 'months'), op(30, '$')], operator: '*', statedResult: op(750, '$') }, MESSAGE);
    expect(equations[0].confirmed).toBe(false);
    expect(clearedByEquation({ value: 750, expected: 900, span: 'is $750 of margin' }, equations, MESSAGE)).toBeNull();
  });

  it('a number word counts as his own words, as the brief requires', () => {
    const spoken = 'So twenty five months at thirty dollars a month is seven hundred fifty of margin.';
    const equations = checked({ quoted: 'twenty five months at thirty dollars a month is seven hundred fifty of margin', operands: [op(25, 'months'), op(30, '$')], operator: '*', statedResult: op(750, '$') }, spoken);
    expect(equations[0].confirmed).toBe(true);
    expect(clearedByEquation({ value: 750, expected: 900, span: 'is seven hundred fifty of margin' }, equations, spoken)?.how).toBe('result');
  });
});

describe('the doubted figure as an operand of a calculation that lands on code\'s own right figure', () => {
  const MESSAGE = 'Beans are 25 percent of a 42 percent COGS line, so 25 percent of 42 is 10.5 points of revenue.';

  it('clears a flag whose figure is his input and whose expected figure is his own result', () => {
    const equations = checked({ quoted: '25 percent of 42 is 10.5 points of revenue', operands: [op(25, '%'), op(42, '%')], operator: '*', statedResult: op(10.5, 'points') }, MESSAGE);
    expect(equations[0].verdict).toBe('correct');
    const clear = clearedByEquation({ value: 25, expected: 10.5, span: '25 percent of a 42 percent COGS line, so 25 percent of 42 is 10.5 points' }, equations, MESSAGE);
    expect(clear?.how).toBe('operand');
  });

  it('does not clear when code\'s right figure is not what his calculation lands on', () => {
    const equations = checked({ quoted: '25 percent of 42 is 10.5 points of revenue', operands: [op(25, '%'), op(42, '%')], operator: '*', statedResult: op(10.5, 'points') }, MESSAGE);
    expect(clearedByEquation({ value: 25, expected: 14.5, span: '25 percent of 42 is 10.5 points of revenue' }, equations, MESSAGE)).toBeNull();
  });

  it('does not clear a doubt in another breath of the same message', () => {
    const message = `${MESSAGE} Separately, COGS increased by 30 percent overall.`;
    const equations = checked({ quoted: '25 percent of 42 is 10.5 points of revenue', operands: [op(25, '%'), op(42, '%')], operator: '*', statedResult: op(10.5, 'points') }, message);
    expect(clearedByEquation({ value: 30, expected: 10.5, span: 'COGS increased by 30 percent overall' }, equations, message)).toBeNull();
  });
});

describe('what an equation may never do', () => {
  it('an `incorrect` equation clears nothing — and raises nothing (the real error of 0bfe5f38 t20)', () => {
    const m = 'The 18-point margin decline is fully explained — 4.2 points from beans up 40%, 11.8 points from dairy and packaging.';
    const equations = checked({ quoted: '4.2 points from beans up 40%, 11.8 points from dairy', operands: [op(4.2, 'points'), op(11.8, 'points')], operator: '+', statedResult: op(18, 'points') }, m);
    expect(equations[0].verdict).toBe('incorrect');
    expect(clearedByEquation({ value: 18, expected: 16, span: 'The 18-point margin decline is fully explained' }, equations, m)).toBeNull();
    // and nothing in the clear path can turn a verdict into a flag: it only ever returns a clear or null
    expect(clearedByEquation({ value: 16, expected: 18, span: '4.2 points from beans up 40%, 11.8 points from dairy' }, equations, m)).toBeNull();
  });

  it('an `unclear` equation clears nothing (16/18 read as a relative change)', () => {
    const m = 'We would need 158.8 versus 115 today — that\'s a 38% price increase.';
    const equations = checked({ quoted: "versus 115 today — that's a 38% price increase", operands: [op(158.8), op(115)], operator: '-', statedResult: op(38, '%') }, m);
    expect(equations[0].verdict).toBe('unclear');
    expect(clearedByEquation({ value: 38, expected: 43.8, span: "that's a 38% price increase" }, equations, m)).toBeNull();
  });

  it('a verdict code RESCUED off `incorrect` may not clear: the operand it used is not in his words', () => {
    // "115 × 10% = 126.5" is right as 115 × 1.10 — but 1.10 is code's reading, not his word, so
    // the rescue stands as evidence of no error and never as evidence of correctness.
    const m = 'Revenue is 115 today. A 10% price increase takes revenue to 126.5 against costs of 108.';
    const equations = checked({ quoted: 'A 10% price increase takes revenue to 126.5', operands: [op(115), op(10, '%')], operator: '*', statedResult: op(126.5) }, m);
    expect(equations[0].verdict).toBe('correct');
    expect(equations[0].rescued).toBe(true);
    expect(clearedByEquation({ value: 126.5, expected: 120, span: 'A 10% price increase takes revenue to 126.5' }, equations, m)).toBeNull();
  });

  it('a low-confidence entry clears nothing, whatever the numbers say', () => {
    const m = 'So fifty eight divided by four, um, gives us around, um, sorry, uh, fourteen point five.';
    const equations = checked({ quoted: 'fifty eight divided by four, um, gives us around, um, sorry, uh, fourteen point five', operands: [op(58), op(4)], operator: '/', statedResult: op(14.5), confidence: 'low' }, m);
    expect(clearedByEquation({ value: 14.5, expected: 14.7, span: 'fifty eight divided by four' }, equations, m)).toBeNull();
  });
});

// The vetting end: a doubt probe blocked before any line is written.
describe('the vetting blocks the doubt probe (`equationClears`)', () => {
  const SAID = 'Starter standalone: 25 months at $30 a month is $750 of margin on $300 of CAC, so 2.5x.';
  const claim = checkerClaim('$750', {
    span: '25 months at $30 a month is $750 of margin', verdict: 'error', correctValue: 900,
    quantity: 'Starter standalone margin', probe: 'How did you get to $750?',
    codeQuantity: { kind: 'none', stepId: null, price: null, target: null },
  });
  const equations = (): EquationCheck[] => checked({
    quoted: '25 months at $30 a month is $750 of margin', operands: [op(25, 'months'), op(30, '$')], operator: '*', statedResult: op(750, '$'),
  }, SAID);
  const ctx = (eqs?: EquationCheck[]): VetContext => ({
    caseData: getCaseById('pricing-001'), revealedIds: ['plan_prices_costs', 'starter_cohort', 'plan_cac'],
    shownExhibitIds: [], candidateTexts: [SAID], equations: eqs,
  });

  it('with the switch off the probe goes out, as it does today', () => {
    vi.stubEnv('ENGINE_SWITCHES', '');
    const [v] = vetCheckerClaims([claim], ctx(equations()));
    expect(v.flag).toBe(true);
    expect(v.probeLine).not.toBeNull();
  });

  it('with the switch on, his own confirmed arithmetic blocks it', () => {
    vi.stubEnv('ENGINE_SWITCHES', 'pricing-001=equationClears');
    const [v] = vetCheckerClaims([claim], ctx(equations()));
    expect(v.flag).toBe(false);
    expect(v.probeLine).toBeNull();
    expect(v.correctionLine).toBeNull();
    expect(v.vetNotes.join(' ')).toMatch(/their own arithmetic, verified in their own words/);
  });

  it('with no equations nothing changes, switch or no switch', () => {
    vi.stubEnv('ENGINE_SWITCHES', 'pricing-001=equationClears');
    expect(vetCheckerClaims([claim], ctx())[0].flag).toBe(true);
    expect(vetCheckerClaims([claim], ctx([]))[0].flag).toBe(true);
  });

  it('a claim on another figure of the same message is untouched', () => {
    vi.stubEnv('ENGINE_SWITCHES', 'pricing-001=equationClears');
    const other = checkerClaim('2.5x', { span: 'on $300 of CAC, so 2.5x', verdict: 'error', correctValue: 5, quantity: 'Starter LTV/CAC' });
    expect(vetCheckerClaims([other], ctx(equations()))[0].flag).toBe(true);
  });
});

// The gate's side: a code line is released a turn or more after the message, so the
// equations ride on the verdict row and the gate reads them when the line would be said.
describe('the gate drops a code line his own verified arithmetic accounts for', () => {
  const MESSAGE = 'Beans are 25% of COGS and COGS is 42% of revenue, so 25% of 42 is 10.5 points of revenue.';
  const flagRef = {
    key: 'unit:COGS@25', value: 25, span: MESSAGE,
    finding: { kind: 'flag' as const, flag: {
      kind: 'unit' as const, stepId: 'unit:COGS', description: 'beans in points of revenue',
      expected: 10.5, candidateValue: 25, errorClass: 'minor' as const, span: MESSAGE,
    } },
  };
  const equations = (statedResult = op(10.5, 'points')): EquationCheck[] => checked({
    quoted: '25% of 42 is 10.5 points of revenue', operands: [op(25, '%'), op(42, '%')], operator: '*', statedResult,
  }, MESSAGE);
  const gate = (switches: string, eqs?: EquationCheck[]) => {
    vi.stubEnv('ENGINE_SWITCHES', switches);
    const verdict = {
      candidateTurnIndex: 3, latencyMs: 9000, model: 'm', stamps: [], codeFlags: [flagRef],
      claims: [{ ...checkerClaim('25 points of revenue', { span: MESSAGE, correctValue: 10.5, errorType: 'unit' as const }), flag: true, probeLine: null, correctionLine: null, correctionFigure: null, pointerLine: null, vetNotes: [] }],
      ...(eqs ? { equations: eqs } : {}),
    };
    return gateCodeFindings({
      rows: [{ category: 'math_checker', subtype: 'verdict', turnIndex: 3, payloadJsonb: verdict } as never], handled: [],
      turnRows: [{ role: 'candidate', turnIndex: 3, text: MESSAGE }] as never,
      candidateText: 'Next I would look at the food mix.', candidateTurnIndex: 5,
      caseData: getCaseById('prof-001') as never, revealedIds: ['cogs_pct', 'bean_share_of_cogs'],
    }).decisions[0];
  };

  it('released today, and released with the switch on when there is no equation', () => {
    expect(gate('').outcome).toBe('released');
    expect(gate('prof-001=equationClears').outcome).toBe('released');
    expect(gate('prof-001=equationClears', []).outcome).toBe('released');
  });

  it('cleared with the switch on: his 25 is an operand of a calculation that lands on code\'s own 10.5', () => {
    const d = gate('prof-001=equationClears', equations());
    expect(d.outcome).toBe('equation_cleared');
    expect(d.reason).toMatch(/their own arithmetic, verified in their own words: 25% \* 42% = 10.5points/);
  });

  it('and still released with the switch off, equations or no equations', () => {
    expect(gate('', equations()).outcome).toBe('released');
  });

  it('not cleared when his calculation lands somewhere else (the figure code expects is not his result)', () => {
    // "25% of 42 is 14.5" — he states 14.5, which is not code's 10.5: nothing is cleared,
    // and the equation is `incorrect` on his own figures anyway.
    const m = 'Beans are 25% of COGS and COGS is 42% of revenue, so 25% of 42 is 14.5 points of revenue.';
    const eqs = checked({ quoted: '25% of 42 is 14.5 points of revenue', operands: [op(25, '%'), op(42, '%')], operator: '*', statedResult: op(14.5, 'points') }, m);
    expect(eqs[0].verdict).toBe('incorrect');
    expect(gate('prof-001=equationClears', eqs).outcome).toBe('released');
  });
});
