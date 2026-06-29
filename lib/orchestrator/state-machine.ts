export const PHASES = [
  'INTRO', 'CLARIFY', 'STRUCTURE', 'ANALYSIS',
  'EXHIBIT', 'BRAINSTORM', 'RECOMMENDATION', 'WRAP', 'SCORING',
] as const;

export type Phase = typeof PHASES[number];

export const PHASE_BUDGETS_MS: Record<Phase, number> = {
  INTRO:          2  * 60 * 1000,
  CLARIFY:        5  * 60 * 1000,
  STRUCTURE:      5  * 60 * 1000,
  ANALYSIS:       15 * 60 * 1000,
  EXHIBIT:        5  * 60 * 1000,
  BRAINSTORM:     5  * 60 * 1000,
  RECOMMENDATION: 5  * 60 * 1000,
  WRAP:           2  * 60 * 1000,
  SCORING:        0,
};

export function nextPhase(current: Phase): Phase | null {
  const idx = PHASES.indexOf(current);
  if (idx === -1 || idx === PHASES.length - 1) return null;
  return PHASES[idx + 1];
}

export const LEGAL_ACTIONS: Record<Phase, string[]> = {
  INTRO:          ['speak', 'advance_phase'],
  CLARIFY:        ['speak', 'reveal_data', 'advance_phase'],
  STRUCTURE:      ['speak', 'reveal_data', 'advance_phase'],
  ANALYSIS:       ['speak', 'reveal_data', 'show_exhibit', 'advance_phase'],
  EXHIBIT:        ['speak', 'reveal_data', 'show_exhibit', 'advance_phase'],
  BRAINSTORM:     ['speak', 'reveal_data', 'advance_phase'],
  RECOMMENDATION: ['speak', 'reveal_data', 'advance_phase', 'end_case'],
  WRAP:           ['speak', 'end_case'],
  SCORING:        [],
};
