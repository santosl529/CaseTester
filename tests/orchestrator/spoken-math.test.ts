// The spoken-math parser (Phase 1 contract §5 Stream 3 task 6, switch
// `spokenMathParser`). Chained speech has more than one reading — "three minus
// seventy cents plus thirty plus thirty plus twenty equals one fifty" is
// 3 − (0.70 + 0.30 + 0.30 + 0.20) = 1.50 — and today's left-to-right reader
// flags the chain as a math error. With the switch on, a sentence that is
// consistent under *any* reading is consistent: the parser may only downgrade
// `incorrect` to `unclear`, never raise a claim and never make one `correct`.
//
// Every sentence below is a real candidate line from `Case Interview Runs`
// (run file and turn named) or Lorenzo's own contract example.
import { describe, it, expect } from 'vitest';
import { checkStatedArithmetic, spokenReadings } from '@/lib/orchestrator/arithmetic-check';

const ON = { spokenReadings: true } as const;
const verdicts = (t: string, opts?: { spokenReadings?: boolean }) =>
  checkStatedArithmetic(t, opts).map(c => [c.expression, c.stated, c.verdict]);

describe('the chain Lorenzo named', () => {
  // b37h 527217df t5 (pricing-001, 21 Oct) — the written form of the contract's example.
  const WRITTEN = 'Contribution per bag: $3.00 minus $0.70 + $0.30 + $0.30 + $0.20 = $1.50 variable, so $1.50 per bag, a 50% margin.';
  // The contract's spoken form, as STT would hand it over.
  const SPOKEN = 'Three minus seventy cents plus thirty plus thirty plus twenty equals one fifty.';

  it('off: the left-to-right reading flags both', () => {
    expect(verdicts(WRITTEN)).toEqual([['$3.00 - $0.70 + $0.30 + $0.30 + $0.20', 1.5, 'incorrect']]);
    expect(verdicts(SPOKEN)).toEqual([['30 + 30 + 20', 1, 'incorrect']]);
  });

  it('on: a − (b + c + d) is a reading, so the sentence is consistent', () => {
    expect(verdicts(WRITTEN, ON)).toEqual([['$3.00 - $0.70 + $0.30 + $0.30 + $0.20', 1.5, 'unclear']]);
    expect(verdicts(SPOKEN, ON)).toEqual([['30 + 30 + 20', 1, 'unclear']]);
  });

  it('the spoken form needs all three readings at once', () => {
    // 3 − (0.70 + 0.30 + 0.30 + 0.20) = 1.50: cents inherited by the bare
    // numbers after it, the minus distributed over the plus chain, and
    // "one fifty" read as 1.50.
    const r = spokenReadings('3 minus 70 cents plus 30 plus 30 plus 20 equals 1 50');
    expect(r.some(x => Math.abs(x.computed - 1.5) < 1e-9 && Math.abs(x.stated - 1.5) < 1e-9)).toBe(true);
  });
});

describe('a unit word after the number', () => {
  // b34a 14055867 t17 (entry-001, 20 Oct): "$320 million" — today the number
  // is 320 and "million" ends the expression, so the claim misses by 10^8.
  it('b34a 14055867 t17: "= $320 million" is 200,000 × 20% × $8,000', () => {
    const t = 'Running both: Build gives 200,000 × 20% × $8,000 = $320 million net sales, less $80 million selling costs = $240 million to Aldermoor.';
    expect(verdicts(t).map(x => x[2])).toEqual(['incorrect']);
    expect(verdicts(t, ON).map(x => x[2])).toEqual(['unclear']);
  });

  it('b34a 14055867 t17: the partner line too', () => {
    const t = 'Partner gives 200,000 × 25% × $8,000 = $400 million net sales, of which we keep 30% = $120 million, with no costs.';
    expect(verdicts(t).map(x => x[2])).toEqual(['incorrect']);
    expect(verdicts(t, ON).map(x => x[2])).toEqual(['unclear']);
  });
});

describe('chained equations in one sentence', () => {
  // "A = B plus C × D = E": E is the result of C × D, not of B + C × D.
  it('b35q ee99bd82 t23: "$905k plus 350 × $2,800 = $980k"', () => {
    const t = 'Control: 1,000 × $905 = $905k plus 350 × $2,800 = $980k = $1.89m.';
    expect(verdicts(t).map(x => [x[0], x[2]])).toEqual([['$905k + 350 × $2,800', 'incorrect']]);
    expect(verdicts(t, ON).map(x => x[2])).toEqual(['unclear']);
  });

  it('b35q 087451cb t25: "$40,000 plus 400 × $80 = $32,000"', () => {
    const t = 'Redoing the test group: 800 × $50 = $40,000 plus 400 × $80 = $32,000 = $72,000, versus $58,000 control.';
    expect(verdicts(t).map(x => x[2])).toEqual(['incorrect']);
    expect(verdicts(t, ON).map(x => x[2])).toEqual(['unclear']);
  });

  it('b37q 3376e5fe t7: "$1.02M plus 150 × $1,200 = $180K"', () => {
    const t = 'Redoing cannibalization: lose 150 × $4,000 = $600K, gain 850 × $1,200 = $1.02M plus 150 × $1,200 = $180K → net ≈ +$600K/month.';
    expect(verdicts(t).map(x => x[2])).toContain('incorrect');
    expect(verdicts(t, ON).map(x => x[2])).not.toContain('incorrect');
  });
});

// The guard P3 is about: the parser must not buy its false-flag removals with
// real math errors. Each of these stays `incorrect` with the switch on.
describe('true flags the parser must not suppress', () => {
  it.each([
    // batch 18 v3, Maya t20 — the slip that started the whole check.
    ["So COGS is like 16 out of 18, which is... 16 divided by 18, that's about 1.6%.", 1],
    // batch 12, Claire / batch 18 Rachel: the chain is wrong before she fixes it.
    ['Two years ago: 42 plus 22 plus 12 equals 94 — sorry, that\'s 76, which leaves a 24% margin.', 1],
    // A plus chain with no minus in it has nothing to distribute.
    ['Revenue is 42 plus 22 plus 12 equals 100.', 1],
    // One "+" after the minus is the ordinary reading, not a spoken group.
    ['So 100 minus 40 plus 10 equals 50.', 1],
  ])('%s', (text, flags) => {
    expect(verdicts(text, ON).filter(x => x[2] === 'incorrect')).toHaveLength(flags);
  });

  it('the parser raises no claim of its own', () => {
    // "cents" ends the expression today, so there is no claim to downgrade —
    // and the parser must not invent one, right or wrong.
    expect(checkStatedArithmetic('Contribution: $3.00 minus 70 cents equals $1.40.', ON)).toEqual([]);
    expect(checkStatedArithmetic('Contribution: $3.00 minus 70 cents equals $2.30.', ON)).toEqual([]);
  });

  it('voice-live 2026-10-18 9813d6ce t33: a merged figure does not excuse a wrong result', () => {
    // Her real line is "So two thirty eight minus twenty eight."; with a
    // result spoken after it the sentence is consistent as 238 − 28 = 210,
    // and the same sentence with a wrong result stays flagged.
    expect(verdicts('So two thirty eight minus twenty eight equals two ten.', ON).map(x => x[2])).toEqual(['unclear']);
    expect(verdicts('So two thirty eight minus twenty eight equals two forty.', ON).map(x => x[2])).toEqual(['incorrect']);
  });

  it('the parser never turns a claim correct, only unclear', () => {
    const on = checkStatedArithmetic('Contribution per bag: $3.00 minus $0.70 + $0.30 + $0.30 + $0.20 = $1.50 variable.', ON);
    expect(on.map(c => c.verdict)).toEqual(['unclear']);
  });
});

// Two guards that nothing else in the corpus exercises, pinned directly.
describe('a reading excuses only its own claim', () => {
  it('b35q ee99bd82 t23 beside batch 18 Maya t20, in one sentence', () => {
    // The tail reading makes the first claim consistent; the second claim is
    // Maya's real slip and keeps its flag. Without the `statedFirst` tie, the
    // first reading would excuse the second as well.
    const t = "Control: 1,000 × $905 = $905k plus 350 × $2,800 = $980k; and 16 divided by 18, that's about 1.6%.";
    expect(verdicts(t).map(x => x[2])).toEqual(['incorrect', 'incorrect']);
    expect(verdicts(t, ON).map(x => x[2])).toEqual(['unclear', 'incorrect']);
  });
});

describe('only a plain two-digit second figure joins the figure before it', () => {
  const stated = (s: string) => [...new Set(spokenReadings(s).map(r => r.stated))].sort((a, b) => a - b);
  const CHAIN = '3 minus 70 cents plus 30 plus 30 plus 20 equals';
  it('"one fifty" is 1.50 and 150; "one five", "one five hundred" and "one point five fifty" are not', () => {
    expect(stated(`${CHAIN} 1 50`)).toEqual([1, 1.5, 150]);
    expect(stated(`${CHAIN} 1 5`)).toEqual([1]);
    expect(stated(`${CHAIN} 1 500`)).toEqual([1]);
    expect(stated(`${CHAIN} 1.5 50`)).toEqual([1.5]);
    expect(stated(`${CHAIN} 1 50%`)).toEqual([1]);
  });
});

describe('with the switch off, every claim is byte-identical', () => {
  const SENTENCES = [
    'Contribution per bag: $3.00 minus $0.70 + $0.30 + $0.30 + $0.20 = $1.50 variable, so $1.50 per bag, a 50% margin.',
    'Control: 1,000 × $905 = $905k plus 350 × $2,800 = $980k = $1.89m.',
    'Running both: Build gives 200,000 × 20% × $8,000 = $320 million net sales, less $80 million selling costs = $240 million to Aldermoor.',
    "So COGS is like 16 out of 18, which is... 16 divided by 18, that's about 1.6%.",
    'Revenue per flight: Lakeport 26.4/2,000 = $13,200 → 16.8/2,000 = $8,400.',
    'Three minus seventy cents plus thirty plus thirty plus twenty equals one fifty.',
  ];
  it.each(SENTENCES)('%s', text => {
    expect(checkStatedArithmetic(text, { spokenReadings: false })).toEqual(checkStatedArithmetic(text));
  });
});
