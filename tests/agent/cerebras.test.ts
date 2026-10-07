import { describe, it, expect } from 'vitest';
import { SseReader, buildMessages, buildBody, CerebrasInterviewerModel } from '@/lib/agent/models/cerebras';
import type { TurnContext, TurnEvent } from '@/lib/agent/models/interface';

const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({
  systemPrompt: 'FIXED', turnSystem: 'STATE',
  history: [{ role: 'user', content: 'Can I see the cost breakdown?' }],
  resolveId: id => (id === 'cogs_pct' ? 'cogs_pct' : null), validIds: ['cogs_pct'],
  ...over,
});

// A fetch that streams the given JSON turn as SSE chunks of `size` characters.
function fakeFetch(turns: string[], size = 7): { fetch: typeof fetch; bodies: unknown[] } {
  const bodies: unknown[] = [];
  let call = 0;
  const f = (async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    const text = turns[Math.min(call++, turns.length - 1)];
    const parts: string[] = [];
    for (let i = 0; i < text.length; i += size) parts.push(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + size) } }] })}\n\n`);
    parts.push(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 60 } } })}\n\n`, 'data: [DONE]\n\n');
    const enc = new TextEncoder();
    return new Response(new ReadableStream({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetch: f, bodies };
}

const turn = (over: Record<string, unknown> = {}) => JSON.stringify({
  say: 'Got it.', move: 'analysis', requests: [], exhibit: null, rescue_item: null, question: 'What drove it?', ...over,
});

async function all(gen: AsyncGenerator<TurnEvent>) { const out: TurnEvent[] = []; for await (const e of gen) out.push(e); return out; }

describe('Cerebras adapter pieces', () => {
  it('reads SSE chunks across split lines and [DONE]', () => {
    const r = new SseReader();
    expect(r.push('data: {"choices":[{"delta":{"content":"a"}}]}\n\ndata: {"choi')).toEqual([{ choices: [{ delta: { content: 'a' } }] }]);
    expect(r.push('ces":[]}\n\ndata: [DONE]\n\n')).toEqual([{ choices: [] }, 'done']);
  });

  it('puts the fixed instructions first, the history, then one state message', () => {
    expect(buildMessages(ctx(), 'RETRY').map(m => [m.role, m.content])).toEqual([
      ['system', 'FIXED'], ['user', 'Can I see the cost breakdown?'], ['system', 'STATE\n\nRETRY'],
    ]);
  });

  it('asks for the strict turn schema, streamed, at low reasoning', () => {
    const b = buildBody('gpt-oss-120b', [], 'low');
    expect(b).toMatchObject({ model: 'gpt-oss-120b', stream: true, reasoning_effort: 'low', response_format: { type: 'json_schema', json_schema: { strict: true } } });
  });
});

describe('CerebrasInterviewerModel.streamTurn', () => {
  it('streams say first, then the declarations, and reports usage with cached tokens', async () => {
    const { fetch } = fakeFetch([turn({ requests: [{ what: 'the cost split', item_ids: ['cogs_pct'], explicit: true, respond: 'release' }] })]);
    const usage: unknown[] = [];
    const ev = await all(new CerebrasInterviewerModel('gpt-oss-120b', 'low', fetch).streamTurn(ctx({ onUsage: u => usage.push(u) })));
    expect(ev.find(e => e.type === 'sentence')).toEqual({ type: 'sentence', text: 'Got it.' });
    expect(ev.filter(e => e.type === 'field').map(e => (e as { key: string }).key)).toEqual(['say', 'move', 'requests', 'exhibit', 'rescue_item', 'question']);
    expect(ev.at(-1)).toMatchObject({ type: 'done', turn: { say: 'Got it.', question: 'What drove it?', requests: [{ itemIds: ['cogs_pct'] }] } });
    expect(usage).toEqual([{ component: 'interviewer', model: 'cerebras/gpt-oss-120b', inputTokens: 40, outputTokens: 20, cacheReadTokens: 60, cacheWriteTokens: 0 }]);
  });

  it('regenerates once on an unknown id while nothing was delivered', async () => {
    const { fetch, bodies } = fakeFetch([
      turn({ requests: [{ what: 'x', item_ids: ['cost_breakdown'], explicit: true, respond: 'release' }] }),
      turn({ requests: [{ what: 'x', item_ids: ['cogs_pct'], explicit: true, respond: 'release' }] }),
    ]);
    const ev = await all(new CerebrasInterviewerModel('gpt-oss-120b', 'low', fetch).streamTurn(ctx()));
    expect(bodies).toHaveLength(2);
    expect(ev.some(e => e.type === 'restart')).toBe(true);
    const lastMsg = (bodies[1] as { messages: { content: string }[] }).messages.at(-1)!.content;
    expect(lastMsg).toContain('"cost_breakdown"');
    expect(ev.at(-1)).toMatchObject({ type: 'done', validation: { retried: true } });
  });

  it('throws a readable error on an HTTP failure', async () => {
    const f = (async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
    await expect(all(new CerebrasInterviewerModel('gpt-oss-120b', 'low', f).streamTurn(ctx()))).rejects.toThrow('Cerebras 429');
  });
});
