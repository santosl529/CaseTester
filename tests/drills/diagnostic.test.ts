// The diagnostic's rules (docs/prd-drills.md "Onboarding and diagnostic").
import { describe, it, expect } from 'vitest';
import {
  combinedTotals, diagnosticParts, diagnosticPrescriptions, overallScore, placeFor, placements, type DiagnosticPart,
} from '@/lib/drills/program/diagnostic';

const part = (drill_id: string, totals: Record<string, [number, number]>, item_scores: number[] = [], miss_tags: string[] = []): DiagnosticPart => ({
  drill_id, size: item_scores.length, set_id: `set-${drill_id}`, done: true, item_scores, miss_tags,
  totals: Object.fromEntries(Object.entries(totals).map(([k, [sum, count]]) => [k, { sum, weight: count, count }])),
});

describe('the diagnostic', () => {
  it('has the PRD parts: 22 auto-checked items and 2 written ones, at tier 2', () => {
    const parts = diagnosticParts();
    expect(parts.map(p => `${p.drill_id}×${p.size}`)).toEqual(['PS-1×3', 'HY-1×3', 'EX-1×3', 'SY-1×3', 'CL-1×3', 'QN-1×2', 'QN-3×3', 'EX-2×2', 'PS-3×1', 'SY-2×1']);
    expect(parts.slice(0, 8).reduce((s, p) => s + p.size, 0)).toBe(22);
  });

  it('places by score: below 50% Recognize, 50–79% Recognize tier 2 (no Repair drill yet), 80%+ test-out', () => {
    expect(placeFor('PS.mece', 0.49)).toBe('recognize');
    expect(placeFor('PS.mece', 0.5)).toBe('recognize_t2');
    expect(placeFor('PS.mece', 0.79)).toBe('recognize_t2');
    expect(placeFor('PS.mece', 0.8)).toBe('test_out');
  });

  it('places only skills with at least 2 items or checks, combining parts', () => {
    const parts = [
      part('PS-1', { 'PS.mece': [1, 2], 'PS.case_specific': [0, 1] }),
      part('PS-3', { 'PS.mece': [2, 2], 'PS.case_specific': [0, 1], 'PS.depth': [1, 1] }),
    ];
    expect(combinedTotals(parts).get('PS.mece')).toEqual({ sum: 3, weight: 4, count: 4 });
    expect(placements(parts)).toEqual({
      'PS.mece': { score: 0.75, count: 4, place: 'recognize_t2' },
      'PS.case_specific': { score: 0, count: 2, place: 'recognize' },
    });
  });

  it('places from the parts finished so far when the student stops partway', () => {
    const parts = [part('QN-3', { 'QN.percentages': [3, 3] }, [1, 1, 1]), { drill_id: 'QN-1', size: 2, set_id: null }];
    expect(placements(parts)).toEqual({ 'QN.percentages': { score: 1, count: 3, place: 'test_out' } });
    expect(overallScore(parts)).toBe(1);
  });

  it('scores every item equally for the overall score', () => {
    expect(overallScore([part('PS-1', {}, [1, 0, 1]), part('SY-2', {}, [0.25])])).toBeCloseTo(0.5625);
    expect(overallScore([{ drill_id: 'PS-1', size: 3, set_id: null }])).toBeNull();
  });

  it('prescribes up to 3 skills, +1 per distinct tag, at most 2 per area, skipping open ones', () => {
    const parts = [
      part('QN-3', {}, [], ['M.zeros_error', 'M.zeros_error', 'M.unit_error', 'M.wrong_base', 'M.growth_error']),
      part('PS-1', {}, [], ['M.missing_bucket', 'M.overlapping_buckets']),
    ];
    const rx = diagnosticPrescriptions(parts, new Set());
    // QN.magnitude 2 tags, PS.mece 2, QN.percentages 1, QN.growth 1: the area cap stops a third QN skill.
    expect(rx.map(r => [r.skill_id, r.priority])).toEqual([['PS.mece', 2], ['QN.magnitude', 2], ['QN.percentages', 1]]);
    expect(rx[1].reason).toBe('In the diagnostic: zeros error, unit error. This set practices zeros and units.');
    // With PS.mece already prescribed, only QN skills are left: the area cap allows two.
    expect(diagnosticPrescriptions(parts, new Set(['PS.mece'])).map(r => r.skill_id)).toEqual(['QN.magnitude', 'QN.percentages']);
  });
});
