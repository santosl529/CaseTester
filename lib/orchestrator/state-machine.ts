export const PHASES = [
  'INTRO', 'CLARIFY', 'STRUCTURE', 'ANALYSIS',
  'EXHIBIT', 'BRAINSTORM', 'RECOMMENDATION', 'WRAP', 'SCORING',
] as const;

export type Phase = typeof PHASES[number];

// Single wall-clock budget for the whole case. Phases carry no timers — they
// advance from the interviewer's declared moves and code's own decisions
// (progress.ts).
// 20 minutes (raised from 5 on 2026-09-15): a human-paced run showed 5 minutes
// allows only ~3 typed candidate replies. Case pacing budgets must sum to this.
export const TOTAL_CASE_MS = 20 * 60 * 1000;
// A case's own clock (Lorenzo, 13 Oct: a case where 2+ runs close owing a
// required stage gets 25 minutes — Larkspur). Default: TOTAL_CASE_MS.
export function caseTotalMs(c: { pacing?: { totalMs?: number } | null }): number {
  return c.pacing?.totalMs ?? TOTAL_CASE_MS;
}

export function nextPhase(current: Phase): Phase | null {
  const idx = PHASES.indexOf(current);
  if (idx === -1 || idx === PHASES.length - 1) return null;
  return PHASES[idx + 1];
}

