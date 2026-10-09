import { describe, it, expect } from 'vitest';
import { CerebrasInterviewerModel, RateLimiter } from '@/lib/agent/models/cerebras';
import { streamInterviewerTurn } from '@/lib/agent/interviewer';
import type { TurnContext, InterviewerModel, TurnEvent } from '@/lib/agent/models/interface';
import { eventsFromTurn } from '@/lib/agent/models/turn-events';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';

const turnJson = (over: Record<string, unknown> = {}) => JSON.stringify({ say: 'Got it.', move: 'analysis', requests: [], exhibit: null, rescue_item: null, question: 'What next?', ...over });
function sse(texts: string[]): typeof fetch {
  let i = 0;
  return (async () => {
    const t = texts[Math.min(i++, texts.length - 1)];
    const enc = new TextEncoder();
    const parts = [`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`, `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`, 'data: [DONE]\n\n'];
    return new Response(new ReadableStream({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); } }), { status: 200 });
  }) as unknown as typeof fetch;
}
const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({
  systemPrompt: 'FIXED', turnSystem: 'STATE', history: [{ role: 'user', content: 'hi' }],
  resolveId: id => (id === 'cogs_pct' ? id : null), validIds: ['cogs_pct'], ...over,
});
async function drain(g: AsyncIterable<TurnEvent>) { for await (const _ of g) void _; }

describe('model-layer request / raw-output hooks', () => {
  it('Cerebras: reports the exact body and the raw text of every attempt, retry included', async () => {
    const reqs: { attempt: string; body: unknown }[] = [];
    const outs: { attempt: string; text: string }[] = [];
    const m = new CerebrasInterviewerModel('qwen-3.8-27b', 'none', sse([turnJson({ requests: [{ what: 'x', item_ids: ['nope'], explicit: true, respond: 'release' }] }), turnJson()]), new RateLimiter(100));
    await drain(m.streamTurn(ctx({ onRequest: r => reqs.push(r), onRawOutput: r => outs.push(r) })));
    expect(reqs.map(r => r.attempt)).toEqual(['first', 'retry']);
    expect((reqs[0].body as { model: string }).model).toBe('qwen-3.8-27b');
    expect(outs.map(o => o.attempt)).toEqual(['first', 'retry']);
    expect(outs[1].text).toBe(turnJson());
  });

  it('interviewer: guard-B attempts are tagged guard / guard_retry', async () => {
    const turns: ModelTurn[] = [
      { move: 'analysis', requests: [], exhibit: null, rescueItem: null, say: '', question: 'Q1?' },
      { move: 'analysis', requests: [{ what: 'costs', itemIds: ['cogs_pct'], explicit: true, respond: 'release' }], exhibit: null, rescueItem: null, say: '', question: 'Q2?' },
    ];
    const model: InterviewerModel = {
      runTurn: async () => turns[0],
      streamTurn: (c: TurnContext) => {
        c.onRequest?.({ attempt: 'first', model: 'fake', body: { turnSystem: c.turnSystem } });
        c.onRawOutput?.({ attempt: 'first', text: 'raw' });
        return eventsFromTurn(Promise.resolve(turns.shift()!));
      },
    };
    const reqs: string[] = [];
    await drain(streamInterviewerTurn({
      model, candidateText: 'Can I get the costs?', history: [], phase: 'ANALYSIS', requireRequests: true,
      promptCtx: { casePrompt: 'p', currentPhase: 'ANALYSIS', revealedValues: {}, unrevealedItems: [], exhibits: [], advancedLastTurn: false, elapsedMs: 0, totalMs: 1, phaseBudgetsMs: {} } as never,
      onRequest: r => reqs.push(r.attempt),
    }));
    expect(reqs).toEqual(['first', 'guard']);
  });
});
