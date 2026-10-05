import { describe, it, expect, vi } from 'vitest';
import { streamInterviewerTurn, runInterviewerTurn } from '@/lib/agent/interviewer';
import type { InterviewerModel, TurnEvent } from '@/lib/agent/models/interface';
import type { PromptContext } from '@/lib/agent/prompts/system';
import type { Action } from '@/lib/orchestrator/actions';

// streamInterviewerTurn: the phase's legal actions filter the stream and the
// final list; a model without streamTurn is streamed from its finished turn.

const promptCtx: PromptContext = {
  casePrompt: 'Case', currentPhase: 'WRAP', revealedValues: {}, unrevealedItems: [], exhibits: [],
  advancedLastTurn: false, elapsedMs: 0, totalMs: 1_200_000,
};
const mock = (actions: Action[]): InterviewerModel => ({ runTurn: vi.fn().mockResolvedValue(actions) });

describe('streamInterviewerTurn', () => {
  it('drops actions illegal in the phase from the stream and the final list', async () => {
    const model = mock([{ type: 'speak', text: 'Thanks.' }, { type: 'advance_phase' }]);
    const ev: TurnEvent[] = [];
    for await (const e of streamInterviewerTurn({ model, candidateText: 'ok', history: [], promptCtx, phase: 'WRAP' })) ev.push(e);
    expect(ev.some(e => e.type === 'action' && e.action.type === 'advance_phase')).toBe(false);
    expect(ev.filter(e => e.type === 'sentence')).toEqual([{ type: 'sentence', text: 'Thanks.', sayIndex: 0 }]);
    expect(ev.at(-1)).toMatchObject({ type: 'done', actions: [{ type: 'speak', text: 'Thanks.' }] });
  });

  it('passes canRegenerate through to the model', async () => {
    const seen: (boolean | undefined)[] = [];
    const model: InterviewerModel = {
      runTurn: vi.fn(),
      async *streamTurn(ctx) {
        seen.push(ctx.canRegenerate?.());
        yield { type: 'done', actions: [{ type: 'speak', text: 'Go on.' }], report: { dropped: [], invalidIds: [], empty: false, capped: false }, retried: false, unparsed: false, refused: false };
      },
    };
    for await (const e of streamInterviewerTurn({ model, candidateText: 'ok', history: [], promptCtx, phase: 'ANALYSIS', canRegenerate: () => false })) void e;
    expect(seen).toEqual([false]);
  });

  it('runInterviewerTurn returns the same list as before', async () => {
    const model = mock([{ type: 'advance_phase' }]);
    expect(await runInterviewerTurn({ model, candidateText: 'ok', history: [], promptCtx, phase: 'WRAP' }))
      .toEqual([{ type: 'speak', text: "Let's continue — what are your thoughts?" }]);
  });
});
