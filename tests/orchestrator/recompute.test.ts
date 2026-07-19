import { describe, it, expect } from 'vitest';
import { checkRecomputeForTurn, formatRecomputeHint } from '@/lib/orchestrator/recompute';

const mathSteps = [
  { id: 'cogs_impact', description: 'COGS dollar impact', answer: 76.8, tolerance: 2 },
  { id: 'margin', description: 'current margin', answer: 6, tolerance: 0.5 },
];

describe('checkRecomputeForTurn', () => {
  it('returns no flags when the candidate is within tolerance', () => {
    const flags = checkRecomputeForTurn('The current margin is about 6%.', mathSteps);
    expect(flags).toHaveLength(0);
  });

  it('returns no flags when the candidate never mentioned the figure', () => {
    const flags = checkRecomputeForTurn('Costs went up a lot.', mathSteps);
    expect(flags).toHaveLength(0);
  });

  it('flags a minor mismatch', () => {
    const flags = checkRecomputeForTurn('COGS impact is about 60 million.', mathSteps);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ stepId: 'cogs_impact', errorClass: 'minor', candidateValue: 60, expected: 76.8 });
  });

  it('flags a case-breaking mismatch (run-3 bean-math scenario)', () => {
    const flags = checkRecomputeForTurn('COGS impact is about 20 million.', mathSteps);
    expect(flags).toHaveLength(1);
    expect(flags[0].errorClass).toBe('case_breaking');
  });

  it('only recomputes against this turn — does not leak prior-turn mismatches', () => {
    // A step never mentioned in THIS candidate message should never flag,
    // even if it's a known case math step.
    const flags = checkRecomputeForTurn('Let me think about the structure first.', mathSteps);
    expect(flags).toHaveLength(0);
  });
});

describe('formatRecomputeHint', () => {
  it('returns empty string for no flags', () => {
    expect(formatRecomputeHint([])).toBe('');
  });

  it('marks case-breaking flags as always-address, minor as probe-once', () => {
    const hint = formatRecomputeHint([
      { stepId: 'a', description: 'desc a', expected: 76.8, candidateValue: 20, errorClass: 'case_breaking' },
      { stepId: 'b', description: 'desc b', expected: 6, candidateValue: 5.8, errorClass: 'minor' },
    ]);
    expect(hint).toContain('CASE-BREAKING');
    expect(hint).toContain('always address this');
    expect(hint).toContain('probe once');
    expect(hint).toContain('RECOMPUTE FLAG');
  });
});
