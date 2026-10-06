import { describe, it, expect } from 'vitest';
import {
  parseCoverageResponse, isCoverageComplete, canEndCase, formatCoverageSteer,
  COVERAGE_THRESHOLD, COVERAGE_MIN_GUARD_MS, type CoverageScores,
} from '@/lib/scoring/coverage';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';

const TOTAL = 5 * 60 * 1000;

function full(score: number): CoverageScores {
  return Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, score]));
}

describe('parseCoverageResponse', () => {
  it('parses a clean JSON response and clamps to 0-100', () => {
    const raw = '{"structure":80,"quantitative":30,"dataExhibit":150,"judgment":-5,"creativity":40,"synthesis":10,"communication":70,"pushback":60}';
    const c = parseCoverageResponse(raw)!;
    expect(c.structure).toBe(80);
    expect(c.dataExhibit).toBe(100); // clamped
    expect(c.judgment).toBe(0);      // clamped
  });

  it('strips code fences', () => {
    const raw = '```json\n{"structure":50}\n```';
    expect(parseCoverageResponse(raw)?.structure).toBe(50);
  });

  it('returns null on garbage', () => {
    expect(parseCoverageResponse('not json')).toBeNull();
    expect(parseCoverageResponse('{}')).toBeNull();
  });
});

describe('isCoverageComplete', () => {
  it('true only when every dimension meets the threshold', () => {
    expect(isCoverageComplete(full(COVERAGE_THRESHOLD))).toBe(true);
    const oneShort = { ...full(90), quantitative: COVERAGE_THRESHOLD - 1 };
    expect(isCoverageComplete(oneShort)).toBe(false);
  });

  it('treats a missing dimension as 0 (incomplete)', () => {
    const missing = { ...full(90) };
    delete missing.pushback;
    expect(isCoverageComplete(missing)).toBe(false);
  });
});

describe('canEndCase', () => {
  it('always allows ending when time is up', () => {
    expect(canEndCase({ coverage: null, elapsedMs: TOTAL, totalMs: TOTAL, timeUp: true })).toBe(true);
    expect(canEndCase({ coverage: full(0), elapsedMs: 0, totalMs: TOTAL, timeUp: true })).toBe(true);
  });

  it('with full coverage, allows ending past the minimum guard', () => {
    expect(canEndCase({ coverage: full(90), elapsedMs: COVERAGE_MIN_GUARD_MS + 1, totalMs: TOTAL, timeUp: false })).toBe(true);
  });

  it('blocks ending on full coverage before the minimum guard (guards against a bad reading)', () => {
    expect(canEndCase({ coverage: full(90), elapsedMs: 5_000, totalMs: TOTAL, timeUp: false })).toBe(false);
  });

  it('blocks ending when a dimension is still undertested', () => {
    const oneShort = { ...full(90), quantitative: 20 };
    expect(canEndCase({ coverage: oneShort, elapsedMs: 3 * 60_000, totalMs: TOTAL, timeUp: false })).toBe(false);
  });

  it('with NO coverage signal, degrades to an 80% time floor', () => {
    expect(canEndCase({ coverage: null, elapsedMs: 0.5 * TOTAL, totalMs: TOTAL, timeUp: false })).toBe(false);
    expect(canEndCase({ coverage: null, elapsedMs: 0.85 * TOTAL, totalMs: TOTAL, timeUp: false })).toBe(true);
  });
});

describe('formatCoverageSteer', () => {
  it('lists undertested dimensions to steer toward (ending is code\'s, spec 2026-10-06)', () => {
    const steer = formatCoverageSteer({ ...full(90), quantitative: 30, judgment: 45 });
    expect(steer).toContain('undertested');
    expect(steer).toContain('Quantitative');
    expect(steer).toContain('30/100');
    expect(steer).not.toContain('end_case');
  });

  it('says all tested when every dimension is covered', () => {
    const steer = formatCoverageSteer(full(90));
    expect(steer).toContain('every rubric area has now been tested');
  });

  it('returns empty when there is no coverage signal', () => {
    expect(formatCoverageSteer(null)).toBe('');
  });
});
