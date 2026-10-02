import { describe, it, expect } from 'vitest';
import { normalizeNumberWords } from '@/lib/number-words';

describe('normalizeNumberWords (v4.6: number words count — Yuki, and M2 speech-to-text)', () => {
  it('rewrites Yuki\'s spoken figures as digits', () => {
    expect(normalizeNumberWords('Beans ten and a half points, up forty percent, becomes about fourteen point seven.'))
      .toBe('Beans 10.5 points, up 40 percent, becomes about 14.7.');
    expect(normalizeNumberWords('So plus four point two points of revenue.')).toBe('So plus 4.2 points of revenue.');
    expect(normalizeNumberWords('Thirty-one and half points growing twelve points')).toBe('31.5 points growing 12 points');
    expect(normalizeNumberWords('about thirty-eight percent increase')).toBe('about 38 percent increase');
  });

  it('handles compound numbers and keeps the magnitude word', () => {
    expect(normalizeNumberWords('revenue is four hundred eighty million')).toBe('revenue is 480 million');
    expect(normalizeNumberWords('two point four million per store')).toBe('2.4 million per store');
    expect(normalizeNumberWords('two hundred stores')).toBe('200 stores');
    expect(normalizeNumberWords('a twenty-five percent share')).toBe('a 25 percent share');
  });

  it('splits sequences that cannot form one number', () => {
    expect(normalizeNumberWords('one two three')).toBe('1 2 3');
    expect(normalizeNumberWords('between two and three points')).toBe('between 2 and 3 points');
  });

  it('leaves a lone "one" alone unless it carries a unit or decimal', () => {
    expect(normalizeNumberWords('One thing I notice')).toBe('One thing I notice');
    expect(normalizeNumberWords('One — the other inputs also inflate.')).toBe('One — the other inputs also inflate.');
    expect(normalizeNumberWords('about one percent')).toBe('about 1 percent');
    expect(normalizeNumberWords('one point five points')).toBe('1.5 points');
  });

  it('leaves text with no number words unchanged', () => {
    const t = 'Do we have inflation data on milk and packaging? Someone, anyone, often.';
    expect(normalizeNumberWords(t)).toBe(t);
  });

  it('keeps digits as they are', () => {
    expect(normalizeNumberWords('COGS went from 42% to 58%')).toBe('COGS went from 42% to 58%');
  });
});
