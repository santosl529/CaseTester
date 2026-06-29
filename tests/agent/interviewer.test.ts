import { describe, it, expect, vi } from 'vitest';
import { runInterviewerTurn } from '@/lib/agent/interviewer';
import type { InterviewerModel } from '@/lib/agent/models/interface';
import type { Action } from '@/lib/orchestrator/actions';

function mockModel(actions: Action[]): InterviewerModel {
  return { runTurn: vi.fn().mockResolvedValue(actions) };
}

const baseCtx = {
  casePrompt: 'Client has declining profits.',
  currentPhase: 'CLARIFY' as const,
  revealedValues: {},
  unrevealedLabels: ['Total revenue'],
  pushbackDone: false,
  phaseElapsedMs: 0,
  phaseBudgetMs: 5 * 60 * 1000,
};

describe('runInterviewerTurn', () => {
  it('returns speak actions', async () => {
    const model = mockModel([{ type: 'speak', text: 'Good question.' }]);
    const result = await runInterviewerTurn({
      model, candidateText: 'Hello', history: [], promptCtx: baseCtx, phase: 'CLARIFY',
    });
    expect(result).toEqual([{ type: 'speak', text: 'Good question.' }]);
  });

  it('filters illegal actions for the phase', async () => {
    // show_exhibit is illegal in CLARIFY
    const model = mockModel([
      { type: 'speak', text: 'Here is the exhibit.' },
      { type: 'show_exhibit', exhibitId: 'exhibit-a' },
    ]);
    const result = await runInterviewerTurn({
      model, candidateText: 'Show me data', history: [], promptCtx: baseCtx, phase: 'CLARIFY',
    });
    expect(result.some(a => a.type === 'show_exhibit')).toBe(false);
    expect(result.some(a => a.type === 'speak')).toBe(true);
  });

  it('returns fallback speak if all actions filtered', async () => {
    const model = mockModel([{ type: 'end_case' }]); // illegal in CLARIFY
    const result = await runInterviewerTurn({
      model, candidateText: 'OK', history: [], promptCtx: baseCtx, phase: 'CLARIFY',
    });
    expect(result[0].type).toBe('speak');
  });
});
