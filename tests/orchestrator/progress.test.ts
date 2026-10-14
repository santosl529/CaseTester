import { describe, it, expect } from 'vitest';
import { derivePhase } from '@/lib/orchestrator/progress';

// Phase and stage administration derived from declared moves and code's own
// decisions (spec 2026-10-06 §7) — replaces advance_phase and the stage regexes.

const none = { releasedReleaseWhen: [], exhibitShown: false, recAsk: false, close: false };

describe('derivePhase', () => {
  it('leaves INTRO after the first exchange', () => {
    expect(derivePhase('INTRO', { ...none, move: 'other' })).toBe('CLARIFY');
  });
  it('follows the declared move, forward only', () => {
    expect(derivePhase('CLARIFY', { ...none, move: 'pressure_test' })).toBe('STRUCTURE');
    expect(derivePhase('STRUCTURE', { ...none, move: 'analysis' })).toBe('ANALYSIS');
    expect(derivePhase('BRAINSTORM', { ...none, move: 'analysis' })).toBe('BRAINSTORM');
  });
  it('rises with releases, an exhibit and a recommendation ask', () => {
    expect(derivePhase('ANALYSIS', { ...none, move: 'analysis', releasedReleaseWhen: ['EXHIBIT'] })).toBe('EXHIBIT');
    expect(derivePhase('ANALYSIS', { ...none, move: 'analysis', exhibitShown: true })).toBe('EXHIBIT');
    expect(derivePhase('ANALYSIS', { ...none, recAsk: true })).toBe('RECOMMENDATION');
  });
  it('never passes RECOMMENDATION except by close', () => {
    expect(derivePhase('RECOMMENDATION', { ...none, move: 'risk' })).toBe('RECOMMENDATION');
    expect(derivePhase('BRAINSTORM', { ...none, close: true })).toBe('SCORING');
  });
});

