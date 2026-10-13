// Stated arithmetic is verified in code: correct, incorrect, or unclear —
// never "no flag, so correct". Every example is a real candidate line.
import { describe, it, expect } from 'vitest';
import { checkStatedArithmetic } from '@/lib/orchestrator/arithmetic-check';

const verdicts = (t: string) => checkStatedArithmetic(t).map(c => [c.expression, c.stated, c.verdict, c.selfCorrected]);

describe('verified incorrect', () => {
  it('batch 18 v3, Maya t20/t28: 16 divided by 18 is not 1.6%', () => {
    expect(verdicts("So COGS is like 16 out of 18, which is... 16 divided by 18, that's about 1.6%.")).toEqual([['16 / 18', 1.6, 'incorrect', false]]);
    expect(verdicts('So 16/18 is like 1.6%. I keep landing in the same place, sorry.')).toEqual([['16 / 18', 1.6, 'incorrect', false]]);
  });

  it('an apology is not a correction; a corrected slip is', () => {
    expect(checkStatedArithmetic('16 divided by 18, that\'s about 1.6%. Sorry, let me think. Yeah, around 1.6%.')[0]).toMatchObject({ verdict: 'incorrect', selfCorrected: false });
    // Harrison, Rachel (batch 18): "= 94 — sorry, that's 76"
    expect(checkStatedArithmetic('2 years ago: 42 plus 22 plus 12 equals 94 — sorry, that\'s 76, which leaves a 24% margin.')[0]).toMatchObject({ verdict: 'incorrect', selfCorrected: true });
    // Claire (batch 12): redone in the same message
    expect(checkStatedArithmetic('Two years ago: 42 + 22 + 12 = 94%... wait, that leaves 6%, not 24%. Let me redo — 42 + 22 + 12 = 76, so margin 24%.')[0])
      .toMatchObject({ verdict: 'incorrect', selfCorrected: true });
  });
});

describe('verified correct — rounding, percent shorthand, growth, scale', () => {
  it.each([
    ['0.25 × 40 = 10, plus 0.75 × 37.5 = 28.1 — about 38% total input cost inflation.', [['0.25 × 40', 10, 'correct'], ['0.75 × 37.5', 28.1, 'correct']]], // Owen
    ['Other inputs up 37.5% gives 31.5 × 1.375 = 43.3 points.', [['31.5 × 1.375', 43.3, 'correct']]],                                                   // label, then the operation
    ['0.25×1.40 + 0.75×1.375 = 0.35 + 1.031 = 1.38, so blended input costs are up about 38%.', [['0.35 + 1.031', 1.38, 'correct']]],                  // Raj chain
    ['If revenue indexes to 115, COGS went from 42 to 58×1.15 = 66.7, so COGS dollars are up 66.7/42 ≈ 59%.', [['58 × 1.15', 66.7, 'correct'], ['66.7 / 42', 59, 'correct']]],
    ["So that's 0.25 × 42 = 10.5% of revenue going to green coffee.", [['0.25 × 42', 10.5, 'correct']]],
    ['16 of the 18 points is 89%. And 16/18 = 89%.', [['16 / 18', 89, 'correct']]],
    ['Holding volume, I need revenue of 451 ÷ 0.76 = $594M — a 23.7% price increase.', [['451 / 0.76', 594e6, 'correct']]],
    ['Margin: 100 − 58 − 22 − 14 = 6.', [['100 - 58 - 22 - 14', 6, 'correct']]],
    // The whole written as 1 beside figures in points (default candidate ee081845 t17, 12 Oct: flagged, the claim right).
    ['A more realistic staged view: a 10% increase gives 1 − 94/1.10 = 1 − 85.5 = 14.5% margin, so roughly 8.5 points recovered.', [['1 - 85.5', 14.5, 'correct']]],
    ['So the new margin is 1 − 94/1.10 ≈ 14.5%.', [['1 - 94 / 1.10', 14.5, 'correct']]],
  ])('%s', (text, expected) => {
    expect(checkStatedArithmetic(text).map(c => [c.expression, c.stated, c.verdict])).toEqual(expected);
  });
});

describe('the whole as 1 is read as 100 only where it is its own term beside figures in points', () => {
  it('still wrong when no reading gives the result: 1 − 85.5 = 20', () => {
    expect(verdicts('So 1 − 85.5 = 20% margin.')).toEqual([['1 - 85.5', 20, 'incorrect', false]]);
  });
  it('a 1 that multiplies is not the whole: 1 × 85.5 = 14.5 is wrong', () => {
    expect(verdicts('So 1 × 85.5 = 14.5.')).toEqual([['1 × 85.5', 14.5, 'incorrect', false]]);
  });
  it('beside shares written as fractions, 1 is already the whole: 1 − 0.855 = 14.5%; and 1 − 0.5 = 99.5 is wrong', () => {
    expect(verdicts('Margin is 1 − 0.855 = 14.5%.')).toEqual([['1 - 0.855', 14.5, 'correct', false]]);
    expect(verdicts('So 1 − 0.5 = 99.5.')).toEqual([['1 - 0.5', 99.5, 'incorrect', false]]);
  });
  // Lorenzo, 13 Oct: "rose 1 point", "a 1-point drop" and "1 in 4" are not the whole.
  it('"rose 1 point": a 1 that is added is a point, not the whole — 13 + 1 = 113 is wrong, 13 + 1 = 14 right', () => {
    expect(verdicts('Overhead rose 1 point, so 13 + 1 = 113.')).toEqual([['13 + 1', 113, 'incorrect', false]]);
    expect(verdicts('Overhead rose 1 point, so 13 + 1 = 14.')).toEqual([['13 + 1', 14, 'correct', false]]);
  });
  it('only a 1 is the whole: 50 − 35.5 = 64.5 is wrong', () => {
    expect(verdicts('So 50 − 35.5 = 64.5.')).toEqual([['50 - 35.5', 64.5, 'incorrect', false]]);
  });
  it('a 1 written with a unit is that unit, not the whole: 1 point − 85.5 = 14.5 is wrong', () => {
    expect(verdicts('After the rise, 1 point − 85.5 = 14.5.')).toEqual([['1 point - 85.5', 14.5, 'incorrect', false]]);
  });
  it('"a 1-point drop": the glued 1 is no operand; a subtracted 1 is a point', () => {
    expect(verdicts('Margin after a 1-point drop − 85.5 = 14.5.')).toEqual([]);
    expect(verdicts('A 1-point drop takes 6 − 1 = 5.')).toEqual([['6 - 1', 5, 'correct', false]]);
    expect(verdicts('A 1-point drop takes 6 − 1 = 105.')).toEqual([['6 - 1', 105, 'incorrect', false]]);
  });
  it('"1 in 4": a ratio, not the whole — 1 + 4 = 104 is wrong, 1 / 4 = 25% right', () => {
    expect(verdicts('One in 4 stores: 1 + 4 = 104.')).toEqual([['1 + 4', 104, 'incorrect', false]]);
    expect(verdicts('That is 1 in 4, so 1 / 4 = 25%.')).toEqual([['1 / 4', 25, 'correct', false]]);
  });
  it('a 1 inside a product is not the whole: 1 × 0.5 + 14 = 64 is wrong', () => {
    expect(verdicts('So 1 × 0.5 + 14 = 64.')).toEqual([['1 × 0.5 + 14', 64, 'incorrect', false]]);
  });
});

describe('not a claim', () => {
  it.each([
    'Revenue grew 15% and margin fell from 24% to 6%, an 18-point decline.',
    'To hold contribution constant, volume can fall until 1.15 × 0.496 equals 1.00 × 0.42.',   // an equation, not a result
    'So 6 divided by 9 equals 2-thirds of a year.',                                              // "2-thirds" is not 2
    'A 5–7% increase recovers a lot; the 1.15x multiple holds.',
    'Beans are 25% of COGS and up 40%.',
  ])('%s', text => {
    expect(checkStatedArithmetic(text)).toEqual([]);
  });
});
