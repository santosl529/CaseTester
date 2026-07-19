import { describe, it, expect } from 'vitest';
import { checkMathSteps } from '@/lib/scoring/deterministic';

const mathSteps = [
  { id: 'margin', description: 'Current margin', answer: 6, tolerance: 0.5 },
  { id: 'cogs_impact', description: 'COGS dollar impact', answer: 76.8, tolerance: 2 },
];

describe('checkMathSteps', () => {
  it('passes when candidate answer is within tolerance', () => {
    const results = checkMathSteps(
      [{ role: 'candidate', text: 'The current margin is about 6%.' }],
      mathSteps
    );
    expect(results.find(r => r.id === 'margin')?.mentioned).toBe(true);
    expect(results.find(r => r.id === 'margin')?.withinTolerance).toBe(true);
  });

  it('marks step as not mentioned if no matching number in transcript', () => {
    const results = checkMathSteps(
      [{ role: 'candidate', text: 'The margin declined significantly.' }],
      mathSteps
    );
    expect(results.find(r => r.id === 'margin')?.mentioned).toBe(false);
  });

  it('fails when candidate answer is outside tolerance', () => {
    const results = checkMathSteps(
      [{ role: 'candidate', text: 'COGS impact is about 50 million.' }],
      mathSteps
    );
    const r = results.find(r => r.id === 'cogs_impact')!;
    expect(r.mentioned).toBe(true);
    expect(r.withinTolerance).toBe(false);
  });

  describe('errorClass (docs/interviewer-behavior.md Rule 14)', () => {
    it('classifies a within-tolerance answer as non_issue', () => {
      const results = checkMathSteps(
        [{ role: 'candidate', text: 'The current margin is about 6%.' }],
        mathSteps
      );
      expect(results.find(r => r.id === 'margin')?.errorClass).toBe('non_issue');
    });

    it('classifies an unmentioned figure as unmentioned', () => {
      const results = checkMathSteps(
        [{ role: 'candidate', text: 'The margin declined significantly.' }],
        mathSteps
      );
      expect(results.find(r => r.id === 'margin')?.errorClass).toBe('unmentioned');
    });

    it('classifies a same-direction, sub-2x error as minor', () => {
      // expected 76.8, candidate says 60 (ratio ~0.78, same sign, not ≥2x off)
      const results = checkMathSteps(
        [{ role: 'candidate', text: 'COGS impact is about 60 million.' }],
        mathSteps
      );
      expect(results.find(r => r.id === 'cogs_impact')?.errorClass).toBe('minor');
    });

    it('classifies a ≥2x magnitude error as case_breaking (run-3 bean-math scenario)', () => {
      // expected 76.8, candidate says 20 (ratio ~0.26, ≥2x off)
      const results = checkMathSteps(
        [{ role: 'candidate', text: 'COGS impact is about 20 million.' }],
        mathSteps
      );
      expect(results.find(r => r.id === 'cogs_impact')?.errorClass).toBe('case_breaking');
    });

    it('credits a defensible alternative answer as non_issue (the $103M vs $76.8M case)', () => {
      const steps = [{ id: 'cogs_impact', description: 'COGS dollar impact', answer: 76.8, tolerance: 2, altAnswers: [103.1] }];
      // Candidate stated the actual-spend-increase figure ($103.1M): a valid alternative.
      const results = checkMathSteps(
        [{ role: 'candidate', text: 'Total COGS increase = 278.4 - 175.3 = $103.1M.' }],
        steps,
      );
      const r = results.find(r => r.id === 'cogs_impact')!;
      expect(r.errorClass).toBe('non_issue');
      expect(r.withinTolerance).toBe(true);
    });

    it('still flags a value near neither the primary nor an alt answer', () => {
      const steps = [{ id: 'cogs_impact', description: 'COGS dollar impact', answer: 76.8, tolerance: 2, altAnswers: [103.1] }];
      const results = checkMathSteps(
        [{ role: 'candidate', text: 'COGS impact is about 50 million.' }],
        steps,
      );
      expect(results.find(r => r.id === 'cogs_impact')?.errorClass).not.toBe('non_issue');
    });

    it('classifies a wrong-direction error as case_breaking regardless of magnitude', () => {
      // extractNumbers never yields negatives, so simulate wrong-direction via
      // a negative expected answer (e.g. a decline) matched against a
      // candidate's positive-only spoken figure — sign(6) !== sign(-6).
      const results = checkMathSteps(
        [{ role: 'candidate', text: 'The change is about 6 points.' }],
        [{ id: 'change', description: 'change', answer: -6, tolerance: 0.5 }]
      );
      expect(results.find(r => r.id === 'change')?.errorClass).toBe('case_breaking');
    });
  });
});
