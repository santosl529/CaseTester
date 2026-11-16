import { describe, expect, it } from 'vitest';
import { compareCases, previousCase, type ComparedCase } from '@/lib/drills/case-compare';

const day = (d: number) => new Date(Date.UTC(2026, 10, d));
const kase = (sessionId: string, caseId: string, tier: number, d: number, ratings: Record<string, string> = {}, partial = false): ComparedCase =>
  ({ sessionId, caseId, tier, completedAt: day(d), ratings, partial });

describe('case to case (Matt, 15 Nov)', () => {
  it('compares with the latest earlier case at the same level that was neither a retake nor ended early', () => {
    const history = [kase('a', 'prof-002', 1, 1), kase('b', 'launch-001', 1, 3, {}, true), kase('c', 'prof-001', 2, 4), kase('d', 'prof-002', 1, 5)];
    const now = kase('e', 'entry-001', 1, 6);
    // b ended early; d is a retake of prof-002; c is Medium: a is the one.
    expect(previousCase(now, [...history, now])).toMatchObject({ kind: 'same_level', previous: { sessionId: 'a' } });
    expect(previousCase(kase('f', 'pricing-001', 3, 7), history)).toBeNull();
  });

  it('on a retake, compares with the earlier attempt of the same case', () => {
    const history = [kase('a', 'prof-002', 1, 1), kase('b', 'launch-001', 1, 3)];
    expect(previousCase(kase('c', 'prof-002', 1, 5), history)).toMatchObject({ kind: 'same_case', previous: { sessionId: 'a' } });
  });

  it('says how many drill sets on a dimension’s skills came between, only where it went up', () => {
    const prev = kase('a', 'prof-002', 1, 1, { structure: 'needs_work', quantitative: 'meets_bar', judgment: 'meets_bar', dataExhibit: 'meets_bar' });
    const now = kase('b', 'launch-001', 1, 10, { structure: 'meets_bar', quantitative: 'meets_bar', judgment: 'needs_work' });
    const sets = [
      { drillId: 'PS-4', focus: null, completedAt: day(3) }, { drillId: 'PS-3', focus: 'PS.mece', completedAt: day(4) },
      { drillId: 'QN-3', focus: 'QN.percentages', completedAt: day(5) }, { drillId: 'PS-4', focus: null, completedAt: day(12) },
    ];
    const c = compareCases(now, [prev], sets)!;
    expect(c.rows).toEqual([
      { dimension: 'structure', before: 'needs_work', after: 'meets_bar', move: 1, sets: 2 },
      { dimension: 'quantitative', before: 'meets_bar', after: 'meets_bar', move: 0, sets: 0 },
      { dimension: 'judgment', before: 'meets_bar', after: 'needs_work', move: -1, sets: 0 },
    ]);
  });
});
