import { describe, it, expect } from 'vitest';
import { nextPhase, PHASES } from '@/lib/orchestrator/state-machine';

// Phase order. The phase itself is derived in code (progress.ts); the model
// has no phase actions any more.
describe('state machine', () => {
  it('INTRO -> CLARIFY', () => {
    expect(nextPhase('INTRO')).toBe('CLARIFY');
  });

  it('SCORING has no next phase', () => {
    expect(nextPhase('SCORING')).toBeNull();
  });

  it('PHASES has 9 entries', () => {
    expect(PHASES.length).toBe(9);
  });
});
