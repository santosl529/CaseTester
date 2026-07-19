import { describe, it, expect } from 'vitest';
import { loadCases, getCaseById } from '@/lib/cases/loader';

describe('case loader', () => {
  it('loads at least one case', () => {
    const cases = loadCases();
    expect(cases.length).toBeGreaterThan(0);
  });

  it('loads prof-001 by id', () => {
    const c = getCaseById('prof-001');
    expect(c.id).toBe('prof-001');
    expect(c.dataLedger.length).toBeGreaterThan(0);
    expect(c.mathSteps.length).toBeGreaterThan(0);
    expect(c.structureKey).toBeTruthy();
    expect(c.recommendationKey).toBeTruthy();
  });

  it('accepts cases with or without legacy rubricAnchors', () => {
    // rubricAnchors is deprecated (judge uses the generic rubric in lib/scoring/rubric.ts)
    // but still tolerated in case files
    const c = getCaseById('prof-001');
    if (c.rubricAnchors) {
      expect(c.rubricAnchors.structure.needs_work).toBeTruthy();
    }
  });

  it('throws on unknown case id', () => {
    expect(() => getCaseById('does-not-exist')).toThrow('Case not found');
  });
});
