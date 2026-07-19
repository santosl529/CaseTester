import { PHASES, type Phase } from './state-machine';
import type { Case } from '@/lib/cases/schema';

// Rule 8/12 (docs/interviewer-behavior.md): phase pacing and the time warning
// both need a "budget" concept. Case-config-driven with a uniform fallback so
// cases authored before pacing config existed still get reasonable behavior.

export const DEFAULT_TIME_WARNING_MS = 30_000;

const ACTIVE_PHASES = PHASES.filter(p => p !== 'SCORING') as Exclude<Phase, 'SCORING'>[];

export function resolvePhaseBudgets(caseData: Pick<Case, 'pacing'>, totalMs: number): Record<Phase, number> {
  const configured = caseData.pacing?.phaseBudgetsMs;
  if (configured) {
    // Any phase missing from a partial config falls back to an even split of
    // whatever time remains after the configured phases.
    const configuredTotal = Object.values(configured).reduce((a, b) => a + (b ?? 0), 0);
    const missingPhases = ACTIVE_PHASES.filter(p => configured[p] === undefined);
    const perMissing = missingPhases.length > 0
      ? Math.max(0, totalMs - configuredTotal) / missingPhases.length
      : 0;
    const budgets = {} as Record<Phase, number>;
    for (const p of ACTIVE_PHASES) budgets[p] = configured[p] ?? perMissing;
    budgets.SCORING = 0;
    return budgets;
  }
  // Uniform fallback (pre-item-4 behavior): split evenly across active phases.
  const even = totalMs / ACTIVE_PHASES.length;
  const budgets = {} as Record<Phase, number>;
  for (const p of ACTIVE_PHASES) budgets[p] = even;
  budgets.SCORING = 0;
  return budgets;
}

export function resolveTimeWarningMs(caseData: Pick<Case, 'pacing'>): number {
  return caseData.pacing?.timeWarningMs ?? DEFAULT_TIME_WARNING_MS;
}

// Load-shedding window (Rule 15). In the last stretch the interviewer stops
// optional probing and protects the recommendation. NOTE: deliberately keyed to
// TOTAL remaining time, not per-phase budget — phase advancement is currently
// unreliable (the model under-calls advance_phase), so a phase-budget trigger
// would misfire whenever the session is stuck in an early phase. Total-remaining
// time is robust to that. 90s shed window sits above the 30s recommendation-ask
// warning, so: shed probes from T−90s, force the recommendation ask at T−30s.
export const LOAD_SHED_REMAINING_MS = 90_000;

export function isUnderTimePressure(elapsedMs: number, totalMs: number): boolean {
  const remaining = totalMs - elapsedMs;
  return remaining > 0 && remaining < LOAD_SHED_REMAINING_MS;
}
