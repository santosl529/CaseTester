import { describe, it, expect } from 'vitest';
import { buildMathCheckSection } from '@/lib/scoring/judge';
import type { MathStepResult } from '@/lib/scoring/deterministic';

function result(overrides: Partial<MathStepResult>): MathStepResult {
  return {
    id: 'step', description: 'test step', expected: 6, tolerance: 0.5,
    mentioned: true, candidateValue: 6, withinTolerance: true, errorClass: 'non_issue',
    ...overrides,
  };
}

describe('buildMathCheckSection', () => {
  it('returns empty string when no steps were mentioned', () => {
    expect(buildMathCheckSection([result({ mentioned: false, candidateValue: null, errorClass: 'unmentioned' })])).toBe('');
  });

  it('marks a correct answer as CORRECT', () => {
    const section = buildMathCheckSection([result({})]);
    expect(section).toContain('CORRECT (within tolerance)');
  });

  it('marks a minor error as MATERIALLY WRONG, not a strength', () => {
    const section = buildMathCheckSection([
      result({ candidateValue: 60, expected: 76.8, errorClass: 'minor' }),
    ]);
    expect(section).toContain('MATERIALLY WRONG');
  });

  it('marks a case-breaking error as CASE-BREAKING WRONG and forbids citing it as a strength (run-3 bean-math scenario)', () => {
    const section = buildMathCheckSection([
      result({ description: 'beans share of revenue increase', candidateValue: 5, expected: 2, errorClass: 'case_breaking' }),
    ]);
    expect(section).toContain('CASE-BREAKING WRONG');
    expect(section).toContain('cannot be cited as a strength');
  });

  it('includes only mentioned steps', () => {
    const section = buildMathCheckSection([
      result({ description: 'mentioned step' }),
      result({ description: 'silent step', mentioned: false, candidateValue: null, errorClass: 'unmentioned' }),
    ]);
    expect(section).toContain('mentioned step');
    expect(section).not.toContain('silent step');
  });
});
