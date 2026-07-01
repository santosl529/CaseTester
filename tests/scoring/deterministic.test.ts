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
});
