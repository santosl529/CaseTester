// "Picking the next case" with a small library: one case must still work,
// and nothing may loop.
import { describe, it, expect } from 'vitest';
import { metTheBar, pickNextCase, type LibraryCase, type TakenCase } from '@/lib/drills/program/next-case';

const prof: LibraryCase = { id: 'prof-001', title: 'Brew & Bean Profitability', case_type: 'profitability', tier: 2 };
const t = (case_id: string, day: number, tier = 2, rubric: Record<string, string> | null = null): TakenCase =>
  ({ case_id, completed_at: new Date(Date.UTC(2026, 9, day)), tier, rubric });

describe('the bar (Matt, 2026-10-11)', () => {
  it('no dimension at needs work and at least half strong', () => {
    expect(metTheBar({ structure: 'strong', quantitative: 'meets_bar' })).toBe(true);
    expect(metTheBar({ structure: 'strong', quantitative: 'meets_bar', synthesis: 'meets_bar' })).toBe(false);
    expect(metTheBar({ structure: 'strong', quantitative: 'needs_work' })).toBe(false);
    expect(metTheBar({})).toBe(false);
    expect(metTheBar(null)).toBe(false);
  });
});

describe('next case with one case in the library', () => {
  it('suggests it before it is taken', () => {
    expect(pickNextCase([prof], [], 'QN')).toMatchObject({ case_id: 'prof-001', retake: false });
  });

  it('offers it again as a retake once taken, every time, without looping', () => {
    const once = pickNextCase([prof], [t('prof-001', 1)], 'QN');
    expect(once).toMatchObject({ case_id: 'prof-001', retake: true });
    const thrice = pickNextCase([prof], [t('prof-001', 1), t('prof-001', 5), t('prof-001', 9)], null);
    expect(thrice).toMatchObject({ case_id: 'prof-001', retake: true });
  });

  it('suggests nothing when the library is empty', () => {
    expect(pickNextCase([], [], 'QN')).toBeNull();
  });
});

describe('next case with a larger library', () => {
  const lib: LibraryCase[] = [
    prof,
    { id: 'size-001', title: 'Sizing', case_type: 'market_sizing', tier: 2 },
    { id: 'entry-001', title: 'Entry', case_type: 'market_entry', tier: 3 },
    { id: 'entry-002', title: 'Entry 2', case_type: 'market_entry', tier: 2 },
  ];

  it('prefers an untaken case at the right tier, then relaxes the area, then the tier', () => {
    // PS focus at tier 2: the market-entry case at tier 2 matches both rules.
    expect(pickNextCase(lib, [t('prof-001', 1)], 'PS')).toMatchObject({ case_id: 'entry-002', matched: { area: true, tier: true } });
    // BJ has no case of its own here: the area rule is relaxed, the tier rule decides.
    expect(pickNextCase(lib, [t('prof-001', 1)], 'BJ')).toMatchObject({ case_id: 'size-001', matched: { area: false, tier: true } });
    // Met the bar at tier 2 → tier 3.
    expect(pickNextCase(lib, [t('prof-001', 1, 2, { structure: 'strong' })], 'PS')!.case_id).toBe('entry-001');
    // Only a tier 2 case is left untaken, but tier 3 was the target: relax the tier.
    expect(pickNextCase(lib, [t('prof-001', 1), t('size-001', 2), t('entry-002', 3, 2, { a: 'strong' })], null)!.case_id).toBe('entry-001');
  });

  it('retakes the case taken longest ago once all are taken', () => {
    const all = [t('prof-001', 4), t('size-001', 2), t('entry-001', 3), t('entry-002', 5)];
    expect(pickNextCase(lib, all, null)).toMatchObject({ case_id: 'size-001', retake: true });
  });
});
