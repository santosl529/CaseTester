import { describe, it, expect, vi } from 'vitest';
import { runInterviewerTurn, streamInterviewerTurn, catalogResolver } from '@/lib/agent/interviewer';
import type { InterviewerModel, TurnContext, TurnEvent } from '@/lib/agent/models/interface';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { PromptContext } from '@/lib/agent/prompts/system';

const promptCtx: PromptContext = {
  casePrompt: 'Client has declining profits.',
  currentPhase: 'CLARIFY',
  revealedValues: { stores_count: '200 stores.' },
  unrevealedItems: [{ id: 'cogs_pct', label: 'COGS as % of revenue' }, { id: 'bean_share_of_cogs', label: 'COGS breakdown: beans' }],
  exhibits: [{ id: 'exhibit-a', title: 'Cost Structure Over Time' }],
  advancedLastTurn: false,
  elapsedMs: 0,
  totalMs: 5 * 60 * 1000,
};

const TURN: ModelTurn = { move: 'clarify', requests: [], exhibit: null, rescueItem: null, say: 'Okay.', question: 'What else?' };

describe('runInterviewerTurn', () => {
  it('returns the model\'s turn and passes the prompt parts, history and resolver through', async () => {
    let seen: TurnContext | undefined;
    const model: InterviewerModel = { runTurn: vi.fn(async (c: TurnContext) => { seen = c; return TURN; }) };
    expect(await runInterviewerTurn({ model, candidateText: 'Hello', history: [], promptCtx, phase: 'CLARIFY' })).toEqual(TURN);
    expect(seen!.systemPrompt).toContain('YOUR TURN');
    expect(seen!.turnSystem).toContain('CASE STATE THIS TURN');
    expect(seen!.history.at(-1)).toEqual({ role: 'user', content: 'Hello' });
    expect(seen!.validIds).toEqual(['cogs_pct', 'bean_share_of_cogs', 'stores_count', 'exhibit-a']);
  });

  it('streams a model without streamTurn as one burst, say by sentence', async () => {
    const model: InterviewerModel = { runTurn: vi.fn(async () => ({ ...TURN, say: 'Okay. Go on.' })) };
    const ev: TurnEvent[] = [];
    for await (const e of streamInterviewerTurn({ model, candidateText: 'x', history: [], promptCtx, phase: 'CLARIFY' })) ev.push(e);
    expect(ev.filter(e => e.type === 'sentence').map(e => (e as { text: string }).text)).toEqual(['Okay.', 'Go on.']);
    expect(ev.at(-1)).toMatchObject({ type: 'done', turn: { question: 'What else?' } });
  });
});

describe('catalogResolver', () => {
  const { resolve } = catalogResolver(promptCtx);
  it('resolves ids and labels / titles exactly, ignoring case and punctuation', () => {
    expect(resolve('cogs_pct')).toBe('cogs_pct');
    expect(resolve('COGS as % of revenue')).toBe('cogs_pct');
    expect(resolve('cost structure over time')).toBe('exhibit-a');
    expect(resolve('stores_count')).toBe('stores_count');
  });
  it('never resolves a partial match (it could release an item nobody asked for)', () => {
    expect(resolve('cogs')).toBeNull();
    expect(resolve('beans')).toBeNull();
  });
});
