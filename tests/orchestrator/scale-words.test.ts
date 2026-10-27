// Scale and currency words after a figure (Phase 1, switch `scaleWordReading`;
// Lorenzo's ruling of 27 Oct: the absorbed reading may verify, and may **never**
// flag — a false `correct` is bad, but a false flag on a scale reading is worse,
// and the measurement found 7 false flags and 0 real errors caught).
import { describe, it, expect } from 'vitest';
import { absorbScaleWords } from '@/lib/orchestrator/scale-words';
import { checkStatedArithmetic } from '@/lib/orchestrator/arithmetic-check';
import { normalizeNumberWords } from '@/lib/number-words';

const ON = { spokenReadings: true, scaleWordReading: true };
const OFF = { spokenReadings: true };
const read = (text: string, opts: Record<string, boolean>) => checkStatedArithmetic(normalizeNumberWords(text), opts);

describe('absorbScaleWords', () => {
  it('folds a scale word after a figure into the figure', () => {
    expect(absorbScaleWords('200 thousand patients')).toBe('200k patients');
    expect(absorbScaleWords('320 million in net sales')).toBe('320m in net sales');
    expect(absorbScaleWords('1.6 billion pool')).toBe('1.6b pool');
    expect(absorbScaleWords('1,200 thousand')).toBe('1,200k');
  });
  it('folds a currency word after a figure', () => {
    expect(absorbScaleWords('40 cents a cup')).toBe('$0.40 a cup');
    expect(absorbScaleWords('6 dollars and 20 cents')).toBe('$6.20');
    expect(absorbScaleWords('6 dollars')).toBe('$6');
    expect(absorbScaleWords('3 bucks')).toBe('$3');
    expect(absorbScaleWords('8 cents')).toBe('$0.08');
  });
  it('leaves a word that is not immediately after a figure, or does not end there', () => {
    expect(absorbScaleWords('thousands of patients')).toBe('thousands of patients');
    expect(absorbScaleWords('200 thousands')).toBe('200 thousands');
    expect(absorbScaleWords('a million-dollar question')).toBe('a million-dollar question');
    expect(absorbScaleWords('the 200 eligible thousand')).toBe('the 200 eligible thousand');
    expect(absorbScaleWords('40 dollarsish')).toBe('40 dollarsish');
  });
});

describe('the reader with scaleWordReading', () => {
  it('reads a chain the scale word used to end, and verifies it', () => {
    const text = 'Two hundred thousand times twenty percent is forty thousand patients.';
    expect(read(text, OFF).some(c => c.stated === 40_000)).toBe(false);
    const on = read(text, ON).filter(c => c.stated === 40_000);
    expect(on).toHaveLength(1);
    expect(on[0].verdict).toBe('correct');
    expect(on[0].absorbed).toBe(true);
  });

  it('reads a currency word the same way', () => {
    const on = read('Beans are forty cents of a six dollar and twenty cent cup, so forty cents over six dollars and twenty cents is 6.5 percent.', ON);
    expect(on.some(c => c.absorbed && c.verdict === 'correct')).toBe(true);
  });

  // The ruling's hard half, on a real spoken scale error: $0.40 x 200,000 is $80,000,
  // not $16M. It must come out `unclear` — no flag (`flagsFromArithmetic` maps only
  // `incorrect` claims), and no evidence the other way either.
  it('never flags a scale-changing reading: a wrong one is unclear, not incorrect', () => {
    const on = read('Forty cents times two hundred thousand is sixteen million.', ON);
    expect(on.some(c => c.verdict === 'incorrect')).toBe(false);
    expect(on.filter(c => c.absorbed).every(c => c.verdict !== 'incorrect')).toBe(true);
    expect(on.some(c => c.absorbed && c.verdict === 'unclear')).toBe(true);
  });

  // Pinned limitation, deliberately: the absorption is byte-identical to the pre-pass
  // the 27 Oct measurement ran (589 claims, 50 of them hand-verified), so what ships is
  // exactly what was measured and sampled. One consequence is that a scale word *and* a
  // currency word on the same figure ("8 thousand dollars") still ends the expression:
  // the currency fold wants digits immediately before "dollars", and `thousand` is in
  // the way. Widening it would read claims no sample has checked, so it waits for its
  // own evidence.
  it('leaves a scale word and a currency word on the same figure unread, as measured', () => {
    expect(absorbScaleWords('8 thousand dollars')).toBe('8k dollars');
    expect(read('Two hundred thousand times eight thousand dollars is sixteen million.', ON)).toEqual([]);
  });

  it('adds to the reading, and never takes away: every claim the switch-off pass raises survives, unchanged', () => {
    for (const text of [
      'Costs are 94% x $480M = $451.2M, and revenue needs to be 451.2 / 0.76 = $593.7M.',
      'Beans 25% of 42 is 10.5 points, so 10.5 x 1.4 = 14.7 and the increase is 4.2.',
      '58 - 42 = 16 points, which is 16 / 42 = 38 percent relative.',
      'Two hundred thousand times twenty percent is forty thousand patients.',
      'Nine times zero point eight times zero point eight three is about six million bags.',
    ]) {
      const off = read(text, OFF), on = read(text, ON);
      for (const c of off) {
        const same = on.find(x => x.expression === c.expression && x.stated === c.stated && x.computed === c.computed);
        expect(same, `${text} :: ${c.expression} = ${c.stated}`).toBeDefined();
        expect(same!.verdict).toBe(c.verdict);
        expect(same!.span).toBe(c.span);
        expect(same!.absorbed).toBeUndefined();
      }
    }
  });

  it('keeps the span the candidate\'s own sentence, never the absorbed text', () => {
    const text = 'Two hundred thousand times twenty percent is forty thousand patients.';
    const on = read(text, ON).filter(c => c.absorbed);
    expect(on.length).toBeGreaterThan(0);
    for (const c of on) {
      expect(c.span).toBe(normalizeNumberWords(text).trim());
      expect(c.span).not.toContain('200k');
    }
  });

  it('is off by default and with the switch off', () => {
    const text = 'Two hundred thousand times twenty percent is forty thousand patients.';
    expect(checkStatedArithmetic(normalizeNumberWords(text)).some(c => c.absorbed)).toBe(false);
    expect(read(text, OFF).some(c => c.absorbed)).toBe(false);
  });
});
