import { describe, it, expect } from 'vitest';
import { checkMathTurn } from '@/lib/eval/math-check';
import type { CorpusTurn } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';

const c = getCaseById('prof-001') as never;
const turn = (candidateText: string, reply: string): CorpusTurn => ({
  t: 10, candidateText, phase: 'analysis', kind: 'model', move: null, heard: '',
  segments: [{ kind: 'question', author: 'model', text: reply }],
  revealedBefore: ['cogs_pct', 'labor_pct', 'overhead_pct', 'revenue_total'],
  releasedNow: [], shownBefore: [], exhibitNow: null, seeded: false,
});
const WRONG = 'A 10% price increase at current volumes recovers roughly six to seven points of margin.';

describe('D6 — a math error the answering turn lets pass', () => {
  it('a pricing error with no probe is unhandled', () => {
    expect(checkMathTurn(turn(WRONG, 'Good. What else would you look at?'), c)).toMatchObject([{ error: { kind: 'pricing' }, handled: false }]);
  });
  it('a probe about the pricing math handles it', () => {
    expect(checkMathTurn(turn(WRONG, 'Walk me through how a 10% price rise gets you there.'), c)).toMatchObject([{ handled: true }]);
  });
  it('a probe about something else does not', () => {
    expect(checkMathTurn(turn(WRONG, 'Walk me through your thinking on store count.'), c)).toMatchObject([{ handled: false }]);
  });
  it('a correct claim is no error', () => {
    expect(checkMathTurn(turn('A 10% price increase recovers about 8.5 points of margin.', 'Good.'), c)).toEqual([]);
  });
});
