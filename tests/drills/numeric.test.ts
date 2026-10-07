import { describe, it, expect } from 'vitest';
import {
  parseNumericInput, scoreNumeric, defaultTolerance, withinTolerance, type NumericKey,
} from '@/lib/drills/numeric';

const value = (raw: string) => {
  const p = parseNumericInput(raw);
  return p.ok ? (p.percent ? `${p.value}%` : p.value) : null;
};

describe('parseNumericInput (PRD "Numeric parsing and tolerance")', () => {
  it.each([
    ['2.5M', 2_500_000],
    ['2,500,000', 2_500_000],
    ['2.5 million', 2_500_000],
    ['$2.5m', 2_500_000],
    ['$2.5 mm', 2_500_000],
    ['2.5 MN', 2_500_000],
    ['1.2bn', 1_200_000_000],
    ['3B', 3_000_000_000],
    ['4 billion', 4_000_000_000],
    ['40k', 40_000],
    ['40K', 40_000],
    ['12 thousand', 12_000],
    ['0.25', 0.25],
    ['.5', 0.5],
    ['-12', -12],
    ['−12', -12],
    ['-$5', -5],
    ['$-5', -5],
    ['  42  ', 42],
    ['1,000.5', 1000.5],
  ])('%s → %s', (raw, expected) => {
    expect(value(raw)).toBe(expected);
  });

  it.each([['25%', '25%'], ['25 %', '25%'], ['12.5 percent', '12.5%']])('%s keeps its percent sign', (raw, expected) => {
    expect(value(raw)).toBe(expected);
  });

  it.each(['', 'abc', '2,5', '25,00', '1,0000', '2.5.1', '$', '5k%', '--5', 'twenty', '5 apples', '1e6'])(
    'rejects %j',
    raw => expect(parseNumericInput(raw).ok).toBe(false),
  );
});

const key = (over: Partial<NumericKey>): NumericKey => ({
  answer: 25, ...defaultTolerance(25), percent_format: 'percent', trap_values: [], ...over,
});
const score = (raw: string, k: NumericKey) => {
  const p = parseNumericInput(raw);
  if (!p.ok) throw new Error(`unparseable ${raw}`);
  return scoreNumeric(p, k);
};

describe('tolerance', () => {
  it('defaults to exact for integers and ±1% otherwise', () => {
    expect(defaultTolerance(40)).toEqual({ tolerance_type: 'absolute', tolerance_value: 0 });
    expect(defaultTolerance(12.5)).toEqual({ tolerance_type: 'relative', tolerance_value: 0.01 });
  });

  it('survives floating-point noise on exact answers', () => {
    expect(withinTolerance(0.1 + 0.2, 0.3, { tolerance_type: 'absolute', tolerance_value: 0 })).toBe(true);
  });

  it('applies relative tolerance around the answer', () => {
    const k = key({ answer: 12.5, ...defaultTolerance(12.5) });
    expect(score('12.6', k).correct).toBe(true);
    expect(score('12.7', k).correct).toBe(false);
  });
});

describe('percent formats', () => {
  it('percent: 25 and 25% count; 0.25 is 0.25%', () => {
    const k = key({ percent_format: 'percent' });
    expect(score('25', k).correct).toBe(true);
    expect(score('25%', k).correct).toBe(true);
    expect(score('0.25', k).correct).toBe(false);
  });

  it('percent_or_decimal: 0.25 also counts for 25%', () => {
    const k = key({ percent_format: 'percent_or_decimal' });
    expect(score('0.25', k).correct).toBe(true);
    expect(score('25', k).correct).toBe(true);
    expect(score('0.25%', k).correct).toBe(false);
  });

  it('none: 25% means 0.25', () => {
    const k = key({ answer: 0.25, ...defaultTolerance(0.25), percent_format: 'none' });
    expect(score('25%', k).correct).toBe(true);
    expect(score('25', k).correct).toBe(false);
  });
});

describe('QN-3 trap diagnosis order (named trap → ×10^k → arithmetic)', () => {
  const k = key({ answer: 25, trap_values: [{ value: 20, tag: 'M.wrong_base' }] });

  it('names the trap', () => {
    expect(score('20', k)).toMatchObject({ correct: false, tag: 'M.wrong_base' });
  });

  it('matches a trap with rounding slack (16.67 typed as 17)', () => {
    const k2 = key({ answer: 20, trap_values: [{ value: 16.6667, tag: 'M.wrong_base' }] });
    expect(score('17', k2)).toMatchObject({ tag: 'M.wrong_base' });
  });

  it('calls a power-of-ten miss a zeros error', () => {
    expect(score('2.5', k)).toMatchObject({ tag: 'M.zeros_error' });
    expect(score('250', k)).toMatchObject({ tag: 'M.zeros_error' });
    expect(score('2500000', key({ answer: 2_500 }))).toMatchObject({ tag: 'M.zeros_error' });
  });

  it('checks a named trap before ×10^k when both match', () => {
    const k2 = key({ answer: 25, trap_values: [{ value: 250, tag: 'M.percent_vs_points' }] });
    expect(score('250', k2)).toMatchObject({ tag: 'M.percent_vs_points' });
  });

  it('calls anything else an arithmetic error, however far off', () => {
    expect(score('24', k)).toMatchObject({ tag: 'M.arithmetic_error' });
    expect(score('999999', k)).toMatchObject({ tag: 'M.arithmetic_error' });
    expect(score('-25', k)).toMatchObject({ tag: 'M.arithmetic_error' });
  });

  it('never diagnoses an answer within tolerance', () => {
    const k2 = key({ answer: 20, ...defaultTolerance(20.5), trap_values: [{ value: 20.1, tag: 'M.wrong_base' }] });
    expect(score('20.1', k2).correct).toBe(true);
  });
});
