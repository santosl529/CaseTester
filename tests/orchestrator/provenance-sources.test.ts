import { describe, it, expect } from 'vitest';
import { changeFigures, auditNumericProvenance } from '@/lib/orchestrator/numeric-provenance';

// Live run eca39ec7: the interviewer said "the margin problem is the 16-point
// compression" and the provenance audit blocked "16" — it is 58 − 42 from the
// released COGS value (and the candidate had said "16 points" two turns
// earlier, but only the current candidate message counted). In the 50-case
// zero-invented-numbers gate that false positive would count as an incident.
const COGS = 'COGS is 58% of revenue today, up from 42% two years ago.';
const ATV = 'The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase, because customers are buying more items per visit.';

describe('changeFigures', () => {
  it('derives the change between same-unit figures within one released value', () => {
    expect(changeFigures([COGS])).toEqual(['16']);
    expect(changeFigures([ATV])).toEqual(['0.6']);
  });

  it('never pairs figures of different units, or figures from different values', () => {
    expect(changeFigures(['Labor is 22% of revenue, and it has been stable.', 'Total revenue is $480M a year.'])).toEqual([]);
  });
});

describe('auditNumericProvenance with change figures as a source', () => {
  it('passes "the 16-point compression" once the COGS value and its change are sources', () => {
    const result = auditNumericProvenance('The margin problem is the 16-point compression.', [COGS, ...changeFigures([COGS])]);
    expect(result.passed).toBe(true);
  });

  it('still blocks a unit-bearing figure no source supports', () => {
    const result = auditNumericProvenance('The margin problem is the 22-point compression.', [COGS, ...changeFigures([COGS])]);
    expect(result.passed).toBe(false);
  });
});
