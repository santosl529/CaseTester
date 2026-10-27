// "of" as multiplication (switch `ofAsMultiplication`, follow-up 3 of the 27
// Oct speech-normalization report, §5 item 3; Lorenzo's ruling of 27 Oct).
//
// `of` ends the expression by design — "25% of COGS" is not an operation, and
// that rule is what stops the reader turning a share into arithmetic. But the
// most frequent unread shape in the recordings is "X percent of Y is Z", where
// both sides are figures and the candidate is plainly multiplying. The narrow
// form below reads `of` as × only between **a share and a figure**, which is
// where it cannot be a noun.
//
// Lorenzo dropped the typed-identity requirement for this one, on the condition
// that typed output may only gain verified-correct claims or lose false flags.
// The tests that matter most are therefore the ones pinning what it leaves
// alone.
import { describe, it, expect } from 'vitest';
import { checkStatedArithmetic } from '@/lib/orchestrator/arithmetic-check';
import { ofAsMultiplication } from '@/lib/orchestrator/of-multiplication';

const ON = { spokenReadings: true, ofAsMultiplication: true } as const;
const OFF = { spokenReadings: true } as const;
const read = (t: string, opts: object) =>
  checkStatedArithmetic(t, opts).map(c => [c.expression, c.stated, c.verdict]);

describe('the recorded sentences it is for', () => {
  // voice-live 2026-10-17 9ccf0836 t24: 10% × 42 = 4.2 points of revenue.
  it('a percent of a figure, with the result in the same clause', () => {
    const s = 'so ten percent of forty two is four point two points of revenue.';
    expect(read(s, OFF)).toEqual([]);
    expect(read(s, ON)).toEqual([['10 percent × 42', 4.2, 'correct']]);
  });

  // voice-live 2026-10-17 9ccf0836 t24, the next sentence: 75% × 42 = 31.5.
  it('the result after "which is"', () => {
    const s = 'The other endpoints were seventy five percent of forty two, which is thirty one point five.';
    expect(read(s, OFF)).toEqual([]);
    expect(read(s, ON)).toEqual([['75 percent × 42', 31.5, 'correct']]);
  });

  // voice-live 2026-10-18 9813d6ce t12: 42 / 4 = 10.5, said as "one fourth of
  // forty two, which is around ten". A fraction word is a share said another
  // way, and on its own (pattern E of the report) it buys nothing — every
  // occurrence in the recordings is in this position.
  it('a fraction word in the same position', () => {
    const s = "it'll be one fourth of forty two, which is around ten points of revenue.";
    expect(read(s, OFF)).toEqual([]);
    expect(read(s, ON)).toEqual([['0.25 × 42', 10, 'correct']]);
  });
});

describe('what it must not touch', () => {
  it('a share of a noun is still not an operation', () => {
    for (const s of [
      'Beans were 25% of COGS, so 10 points of revenue.',
      'you just have to look at how much each factor is raising and then multiply it by its share of COGS',
      'that would be 25% of revenue.',
    ]) {
      expect(ofAsMultiplication(s), s).toBe(s);
      expect(read(s, ON), s).toEqual(read(s, OFF));
    }
  });

  it('an article between "of" and the figure keeps the expression closed', () => {
    const s = 'beans are 25% of the 42 points of revenue, which is 10.5';
    expect(ofAsMultiplication(s)).toBe(s);
    expect(read(s, ON)).toEqual(read(s, OFF));
  });

  it('a count of a count is not a share', () => {
    for (const s of ['two of three factors is most of it', 'one of 200 locations', '15 of 18 months is 83%']) {
      expect(ofAsMultiplication(s), s).toBe(s);
    }
  });

  it('a share of a figure with no stated result raises nothing', () => {
    expect(read('ten percent of forty two, in points of revenue.', ON)).toEqual([]);
  });

  it('"a quarter of the sixteen point increase" keeps its article', () => {
    // voice-live 9ccf0836 t24 — a real sentence the narrow form leaves alone.
    const s = 'So beans are only a quarter of the sixteen point COGS increase.';
    expect(ofAsMultiplication(s)).toBe(s);
  });
});
