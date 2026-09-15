export const PHASES = [
  'INTRO', 'CLARIFY', 'STRUCTURE', 'ANALYSIS',
  'EXHIBIT', 'BRAINSTORM', 'RECOMMENDATION', 'WRAP', 'SCORING',
] as const;

export type Phase = typeof PHASES[number];

// Single wall-clock budget for the whole case. Phases carry no timers —
// they advance only when the interviewer decides the candidate is ready.
// 20 minutes (raised from 5 on 2026-09-15): a human-paced run showed 5 minutes
// allows only ~3 typed candidate replies. Case pacing budgets must sum to this.
export const TOTAL_CASE_MS = 20 * 60 * 1000;

export function nextPhase(current: Phase): Phase | null {
  const idx = PHASES.indexOf(current);
  if (idx === -1 || idx === PHASES.length - 1) return null;
  return PHASES[idx + 1];
}

// reveal_data and show_exhibit are legal in every active phase: a real
// interviewer hands over data or an exhibit when asked instead of hiding it
// behind the interview stage. Whether to give or redirect is the model's
// judgment call — but if it commits, the orchestrator must deliver.
// end_case is also legal everywhere: when the wall clock runs out in an early
// phase, the model must be able to close the case — filtering its end_case
// produced silent final turns.
export const LEGAL_ACTIONS: Record<Phase, string[]> = {
  INTRO:          ['speak', 'reveal_data', 'show_exhibit', 'advance_phase', 'end_case'],
  CLARIFY:        ['speak', 'reveal_data', 'show_exhibit', 'advance_phase', 'end_case'],
  STRUCTURE:      ['speak', 'reveal_data', 'show_exhibit', 'advance_phase', 'end_case'],
  ANALYSIS:       ['speak', 'reveal_data', 'show_exhibit', 'advance_phase', 'end_case'],
  EXHIBIT:        ['speak', 'reveal_data', 'show_exhibit', 'advance_phase', 'end_case'],
  BRAINSTORM:     ['speak', 'reveal_data', 'show_exhibit', 'advance_phase', 'end_case'],
  RECOMMENDATION: ['speak', 'reveal_data', 'show_exhibit', 'advance_phase', 'end_case'],
  WRAP:           ['speak', 'reveal_data', 'show_exhibit', 'end_case'],
  SCORING:        [],
};
