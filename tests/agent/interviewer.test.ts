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
  unrevealedItems: [{ id: 'rev', label: 'Total revenue' }],
  exhibits: [],
  advancedLastTurn: false,
  elapsedMs: 0,
  totalMs: 5 * 60 * 1000,
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
    // advance_phase is illegal in WRAP
    const model = mockModel([
      { type: 'speak', text: 'Thanks for your time.' },
      { type: 'advance_phase' },
    ]);
    const result = await runInterviewerTurn({
      model, candidateText: 'I am done.', history: [],
      promptCtx: { ...baseCtx, currentPhase: 'WRAP' }, phase: 'WRAP',
    });
    expect(result.some(a => a.type === 'advance_phase')).toBe(false);
    expect(result.some(a => a.type === 'speak')).toBe(true);
  });

  it('allows end_case in early phases (time can run out anywhere)', async () => {
    const model = mockModel([
      { type: 'speak', text: 'We are out of time — thanks for coming in.' },
      { type: 'end_case' },
    ]);
    const result = await runInterviewerTurn({
      model, candidateText: 'OK', history: [], promptCtx: baseCtx, phase: 'CLARIFY',
    });
    expect(result.some(a => a.type === 'end_case')).toBe(true);
  });

  it('allows reveal_data in INTRO when the candidate asks', async () => {
    const model = mockModel([
      { type: 'speak', text: 'Sure, here is the revenue.' },
      { type: 'reveal_data', itemId: 'rev' },
    ]);
    const result = await runInterviewerTurn({
      model, candidateText: 'What is the revenue?', history: [],
      promptCtx: { ...baseCtx, currentPhase: 'INTRO' }, phase: 'INTRO',
    });
    expect(result.some(a => a.type === 'reveal_data')).toBe(true);
  });

  it('allows show_exhibit in CLARIFY when the candidate asks', async () => {
    const model = mockModel([
      { type: 'speak', text: 'Here is the exhibit.' },
      { type: 'show_exhibit', exhibitId: 'exhibit-a' },
    ]);
    const result = await runInterviewerTurn({
      model, candidateText: 'Can I see the exhibit?', history: [], promptCtx: baseCtx, phase: 'CLARIFY',
    });
    expect(result.some(a => a.type === 'show_exhibit')).toBe(true);
  });

  it('returns fallback speak if all actions filtered', async () => {
    const model = mockModel([{ type: 'advance_phase' }]); // illegal in WRAP
    const result = await runInterviewerTurn({
      model, candidateText: 'OK', history: [],
      promptCtx: { ...baseCtx, currentPhase: 'WRAP' }, phase: 'WRAP',
    });
    expect(result[0].type).toBe('speak');
  });
});
