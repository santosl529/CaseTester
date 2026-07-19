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

  it('reveal_data and show_exhibit are legal in every active phase', () => {
    for (const phase of PHASES) {
      if (phase === 'SCORING') continue;
      expect(LEGAL_ACTIONS[phase]).toContain('show_exhibit');
      expect(LEGAL_ACTIONS[phase]).toContain('reveal_data');
    }
  });

  it('end_case is legal in every active phase (time can run out anywhere)', () => {
    for (const phase of PHASES) {
      if (phase === 'SCORING') continue;
      expect(LEGAL_ACTIONS[phase]).toContain('end_case');
    }
  });

  it('advance_phase is illegal in WRAP and SCORING', () => {
    expect(LEGAL_ACTIONS['WRAP']).not.toContain('advance_phase');
    expect(LEGAL_ACTIONS['SCORING']).not.toContain('advance_phase');
  });

  it('PHASES has 9 entries', () => {
    expect(PHASES.length).toBe(9);
  });
});
