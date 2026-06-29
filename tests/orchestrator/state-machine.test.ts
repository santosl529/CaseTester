import { describe, it, expect } from 'vitest';
import { nextPhase, LEGAL_ACTIONS, PHASES } from '@/lib/orchestrator/state-machine';

describe('state machine', () => {
  it('INTRO -> CLARIFY', () => {
    expect(nextPhase('INTRO')).toBe('CLARIFY');
  });

  it('SCORING has no next phase', () => {
    expect(nextPhase('SCORING')).toBeNull();
  });

  it('SCORING has no legal actions', () => {
    expect(LEGAL_ACTIONS['SCORING']).toEqual([]);
  });

  it('show_exhibit is illegal in CLARIFY', () => {
    expect(LEGAL_ACTIONS['CLARIFY']).not.toContain('show_exhibit');
  });

  it('show_exhibit is legal in ANALYSIS', () => {
    expect(LEGAL_ACTIONS['ANALYSIS']).toContain('show_exhibit');
  });

  it('PHASES has 9 entries', () => {
    expect(PHASES.length).toBe(9);
  });
});
