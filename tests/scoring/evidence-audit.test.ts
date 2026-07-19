import { describe, it, expect } from 'vitest';
import { quoteAppearsIn, auditEvidence } from '@/lib/scoring/evidence-audit';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { RubricScores, DimensionFeedback } from '@/lib/scoring/judge';

const CANDIDATE_TURNS = [
  "My structure: 1. Isolate the margin driver — is this expansion-driven or same-store deterioration?",
  "Parallel track: supplier renegotiation, volume commitments across our 200 stores, and hedging or forward contracts on beans and dairy so we're not exposed to spot-price swings.",
  "The average transaction is $6.80, so COGS per transaction is $3.94.",
];

describe('quoteAppearsIn', () => {
  it('matches an exact quote', () => {
    expect(quoteAppearsIn('supplier renegotiation, volume commitments', CANDIDATE_TURNS.join('\n'))).toBe(true);
  });

  it('matches despite curly quotes, dashes, and case differences', () => {
    expect(quoteAppearsIn('My structure: 1. Isolate the margin driver — IS THIS expansion-driven', CANDIDATE_TURNS.join('\n'))).toBe(true);
  });

  it('matches spliced fragments joined with ellipsis when all fragments exist', () => {
    expect(quoteAppearsIn('supplier renegotiation ... hedging or forward contracts on beans', CANDIDATE_TURNS.join('\n'))).toBe(true);
  });

  it('rejects when one ellipsis fragment is fabricated', () => {
    expect(quoteAppearsIn('supplier renegotiation ... we should acquire a competitor', CANDIDATE_TURNS.join('\n'))).toBe(false);
  });

  it('rejects a quote that never appears', () => {
    expect(quoteAppearsIn('I would raise prices by 30% immediately', CANDIDATE_TURNS.join('\n'))).toBe(false);
  });

  it('matches numbers with currency and decimals', () => {
    expect(quoteAppearsIn('COGS per transaction is $3.94', CANDIDATE_TURNS.join('\n'))).toBe(true);
  });

  describe('tolerance for judge reformatting (the live over-stripping bug)', () => {
    const REDERIVATION =
      "You're right to push on this — I was sloppy with units. Beans at ~20% of COGS. COGS is 58% of revenue. So beans as % of revenue = 20% × 58% = ~11.6% of revenue. The increase in bean spend = 40% × 11.6% = ~4.6% of revenue. So beans rising 40% adds ~4.6 percentage points. I conflated \"% of COGS\" with \"% of revenue\" — that was the error. There's still ~11 points of COGS increase unexplained.";

    it('matches a lightly-reworded single sentence (dropped/changed connective words)', () => {
      // Candidate said "that was the error"; judge quotes "that was my error" — one word off.
      expect(quoteAppearsIn('I conflated "% of COGS" with "% of revenue" — that was the error.', REDERIVATION)).toBe(true);
    });

    it('matches a multi-sentence quote by checking sentences independently', () => {
      const quote = "beans as % of revenue = 20% × 58% = ~11.6% of revenue. The increase in bean spend = 40% × 11.6% = ~4.6% of revenue.";
      expect(quoteAppearsIn(quote, REDERIVATION)).toBe(true);
    });

    it('still rejects a fabricated number even when the surrounding words are real', () => {
      // "~4.6%" swapped for a never-said "~9.9%": the number guard must reject.
      expect(quoteAppearsIn('The increase in bean spend = 40% × 11.6% = ~9.9% of revenue.', REDERIVATION)).toBe(false);
    });

    it('still rejects a fully fabricated sentence', () => {
      expect(quoteAppearsIn('I recommend we acquire a competitor to fix this.', REDERIVATION)).toBe(false);
    });
  });
});

function dimension(quotes: string[]): DimensionFeedback {
  return {
    rating: 'strong',
    wentWell: [{ point: 'Good point.', quotes }],
    needsWork: [],
    missedOpportunities: [],
  };
}

function rubricWith(quotes: string[]): RubricScores {
  return {
    ...Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, dimension(quotes)])),
    overallRating: 'strong',
    topFix: 'x',
  } as RubricScores;
}

describe('auditEvidence', () => {
  it('keeps real quotes and strips fabricated ones', () => {
    const rubric = rubricWith([
      'supplier renegotiation, volume commitments',
      'I never said this sentence',
    ]);
    const { rubric: cleaned, violations } = auditEvidence(rubric, CANDIDATE_TURNS);
    expect(cleaned.structure.wentWell[0].quotes).toEqual(['supplier renegotiation, volume commitments']);
    expect(violations.length).toBe(RUBRIC_DIMENSION_KEYS.length); // one fabricated quote per dimension
    expect(violations[0].quote).toBe('I never said this sentence');
  });

  it('reports no violations for a fully grounded rubric', () => {
    const { violations } = auditEvidence(rubricWith(['hedging or forward contracts']), CANDIDATE_TURNS);
    expect(violations).toEqual([]);
  });

  it('does not mutate the input rubric', () => {
    const rubric = rubricWith(['I never said this sentence']);
    auditEvidence(rubric, CANDIDATE_TURNS);
    expect(rubric.structure.wentWell[0].quotes).toHaveLength(1);
  });
});
