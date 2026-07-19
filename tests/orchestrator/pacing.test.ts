import { describe, it, expect } from 'vitest';
import {
  resolvePhaseBudgets, resolveTimeWarningMs, DEFAULT_TIME_WARNING_MS,
  isUnderTimePressure, LOAD_SHED_REMAINING_MS,
} from '@/lib/orchestrator/pacing';
import type { Case } from '@/lib/cases/schema';

const TOTAL_MS = 300_000;

describe('resolvePhaseBudgets', () => {
  it('uses case-config budgets when fully specified', () => {
    const caseData = {
      pacing: {
        phaseBudgetsMs: {
          INTRO: 10_000, CLARIFY: 30_000, STRUCTURE: 50_000, ANALYSIS: 80_000,
          EXHIBIT: 30_000, BRAINSTORM: 40_000, RECOMMENDATION: 50_000, WRAP: 10_000,
        },
      },
    } as Pick<Case, 'pacing'>;
    const budgets = resolvePhaseBudgets(caseData, TOTAL_MS);
    expect(budgets.STRUCTURE).toBe(50_000);
    expect(budgets.SCORING).toBe(0);
    const sum = Object.values(budgets).reduce((a, b) => a + b, 0);
    expect(sum).toBe(TOTAL_MS);
  });

  it('falls back to a uniform split when no pacing config is present', () => {
    const caseData = {} as Pick<Case, 'pacing'>;
    const budgets = resolvePhaseBudgets(caseData, TOTAL_MS);
    // 8 active phases (excludes SCORING)
    expect(budgets.INTRO).toBeCloseTo(TOTAL_MS / 8, 5);
    expect(budgets.WRAP).toBeCloseTo(TOTAL_MS / 8, 5);
    expect(budgets.SCORING).toBe(0);
  });

  it('splits remaining time evenly across phases missing from a partial config', () => {
    const caseData = {
      pacing: { phaseBudgetsMs: { STRUCTURE: 100_000 } },
    } as Pick<Case, 'pacing'>;
    const budgets = resolvePhaseBudgets(caseData, TOTAL_MS);
    expect(budgets.STRUCTURE).toBe(100_000);
    // remaining 200_000 split across the other 7 active phases
    expect(budgets.INTRO).toBeCloseTo(200_000 / 7, 5);
  });
});

describe('resolveTimeWarningMs', () => {
  it('defaults to 30s when not configured', () => {
    expect(resolveTimeWarningMs({} as Pick<Case, 'pacing'>)).toBe(DEFAULT_TIME_WARNING_MS);
  });

  it('uses the case-configured value when present', () => {
    const caseData = { pacing: { timeWarningMs: 45_000 } } as Pick<Case, 'pacing'>;
    expect(resolveTimeWarningMs(caseData)).toBe(45_000);
  });
});

describe('isUnderTimePressure (Rule 15 load-shedding window)', () => {
  it('is false early in the case', () => {
    expect(isUnderTimePressure(0.5 * TOTAL_MS, TOTAL_MS)).toBe(false);
  });

  it('is true inside the final shed window', () => {
    // 80s remaining < 90s window
    expect(isUnderTimePressure(TOTAL_MS - 80_000, TOTAL_MS)).toBe(true);
  });

  it('is false exactly at the window edge, true just inside', () => {
    expect(isUnderTimePressure(TOTAL_MS - LOAD_SHED_REMAINING_MS, TOTAL_MS)).toBe(false);
    expect(isUnderTimePressure(TOTAL_MS - LOAD_SHED_REMAINING_MS + 1, TOTAL_MS)).toBe(true);
  });

  it('is false once time is fully up (that is the close, not shedding)', () => {
    expect(isUnderTimePressure(TOTAL_MS, TOTAL_MS)).toBe(false);
    expect(isUnderTimePressure(TOTAL_MS + 5_000, TOTAL_MS)).toBe(false);
  });
});
