import { describe, it, expect, afterEach } from 'vitest';
import { SseReader, buildMessages, buildBody, CerebrasInterviewerModel, OpenAIInterviewerModel, RateLimiter, retryDelayMs } from '@/lib/agent/models/cerebras';
import type { TurnContext, TurnEvent } from '@/lib/agent/models/interface';
import { installRunBudget, clearRunBudget, BudgetExceededError } from '@/lib/llm-budget';
import { UnpricedModelError } from '@/lib/llm-pricing';

const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({
  systemPrompt: 'FIXED', turnSystem: 'STATE',
  history: [{ role: 'user', content: 'Can I see the cost breakdown?' }],
  resolveId: id => (id === 'cogs_pct' ? 'cogs_pct' : null), validIds: ['cogs_pct'],
  ...over,
});

// A fetch that streams the given JSON turn as SSE chunks of `size` characters.
function fakeFetch(turns: string[], size = 7): { fetch: typeof fetch; bodies: unknown[]; calls: { url: string; auth: string }[] } {
  const bodies: unknown[] = [];
  const calls: { url: string; auth: string }[] = [];
  let call = 0;
  const f = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
    bodies.push(JSON.parse(init.body));
    calls.push({ url, auth: init.headers.Authorization });
    const text = turns[Math.min(call++, turns.length - 1)];
    const parts: string[] = [];
    for (let i = 0; i < text.length; i += size) parts.push(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + size) } }] })}\n\n`);
    parts.push(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 60 } } })}\n\n`, 'data: [DONE]\n\n');
    const enc = new TextEncoder();
    return new Response(new ReadableStream({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetch: f, bodies, calls };
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

  it('Qwen: one leading system message (its chat template rejects a later one) — fixed instructions, then state, then history', () => {
    expect(buildMessages(ctx(), 'RETRY', 'leading-system').map(m => [m.role, m.content])).toEqual([
      ['system', 'FIXED\n\nSTATE\n\nRETRY'], ['user', 'Can I see the cost breakdown?'],
    ]);
  });

  it('sends Qwen its state in the leading system message, gpt-oss its state last', async () => {
    const q = fakeFetch([turn()]);
    await all(new CerebrasInterviewerModel('qwen-3.8-27b', 'none', q.fetch).streamTurn(ctx()));
    expect((q.bodies[0] as { messages: { role: string }[] }).messages.map(m => m.role)).toEqual(['system', 'user']);
    const g = fakeFetch([turn()]);
    await all(new CerebrasInterviewerModel('gpt-oss-120b', 'low', g.fetch).streamTurn(ctx()));
    expect((g.bodies[0] as { messages: { role: string }[] }).messages.map(m => m.role)).toEqual(['system', 'user', 'system']);
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

  it('reports reasoning tokens (part of the output) and marks the first reasoning chunk', async () => {
    const enc = new TextEncoder();
    const parts = [
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning: 'Candidate asked for costs.' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: turn() } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 30 } } })}\n\n`,
      'data: [DONE]\n\n',
    ];
    const f = (async () => new Response(new ReadableStream({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); } }), { status: 200 })) as unknown as typeof fetch;
    const usage: { reasoningTokens?: number; outputTokens: number }[] = [];
    const marks: string[] = [];
    await all(new CerebrasInterviewerModel('qwen-3.8-27b', 'low', f).streamTurn(ctx({ onUsage: u => usage.push(u), onMark: m => marks.push(m) })));
    expect(usage[0]).toMatchObject({ outputTokens: 50, reasoningTokens: 30 });
    expect(marks.indexOf('model_first_reasoning')).toBeLessThan(marks.indexOf('model_first_token'));
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

  it('retries a 429 up to three times, then throws a readable error', async () => {
    let calls = 0;
    const f = (async () => { calls++; return new Response('rate limited', { status: 429 }); }) as unknown as typeof fetch;
    const m = new CerebrasInterviewerModel('gpt-oss-120b', 'low', f, new RateLimiter(100), async () => {});
    await expect(all(m.streamTurn(ctx()))).rejects.toThrow('Cerebras 429');
    expect(calls).toBe(4);
  });

  it('recovers when a retry after a 429 succeeds', async () => {
    const ok = fakeFetch([turn()]).fetch;
    let calls = 0;
    const f = (async (u: string, init: RequestInit) => (++calls === 1 ? new Response('busy', { status: 429, headers: { 'retry-after': '2' } }) : ok(u, init))) as unknown as typeof fetch;
    const slept: number[] = [];
    const m = new CerebrasInterviewerModel('gpt-oss-120b', 'low', f, new RateLimiter(100), async ms => { slept.push(ms); });
    const ev = await all(m.streamTurn(ctx()));
    expect(ev.at(-1)).toMatchObject({ type: 'done', turn: { say: 'Got it.' } });
    expect(slept).toEqual([2100]);
  });

  it('marks a 429 wait as a rate wait, before the retried request', async () => {
    const ok = fakeFetch([turn()]).fetch;
    let calls = 0;
    const f = (async (u: string, init: RequestInit) => (++calls === 1 ? new Response('busy', { status: 429, headers: { 'retry-after': '1' } }) : ok(u, init))) as unknown as typeof fetch;
    const marks: string[] = [];
    await all(new CerebrasInterviewerModel('gpt-oss-120b', 'low', f, new RateLimiter(100), async () => {}).streamTurn(ctx({ onMark: m => marks.push(m) })));
    expect(marks.slice(0, 3)).toEqual(['model_request', 'model_rate_wait', 'model_request']);
  });
});

describe('OpenAIInterviewerModel (latency screening, 7 Oct)', () => {
  it('sends the same turn to OpenAI with the OpenAI key, the chosen reasoning effort and usage on the stream', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const { fetch, bodies, calls } = fakeFetch([turn()]);
    const usage: unknown[] = [];
    const ev = await all(new OpenAIInterviewerModel('gpt-6-luna', 'none', fetch).streamTurn(ctx({ onUsage: u => usage.push(u) })));
    expect(calls[0]).toEqual({ url: 'https://api.openai.com/v1/chat/completions', auth: 'Bearer test-openai-key' });
    expect(bodies[0]).toMatchObject({ model: 'gpt-6-luna', reasoning_effort: 'none', stream: true, stream_options: { include_usage: true },
      response_format: { type: 'json_schema', json_schema: { strict: true } } });
    expect(ev.at(-1)).toMatchObject({ type: 'done', turn: { say: 'Got it.', question: 'What drove it?' } });
    expect(usage).toMatchObject([{ model: 'openai/gpt-6-luna', inputTokens: 40, cacheReadTokens: 60 }]);
  });

  it('is not rate-limited client-side', async () => {
    const { fetch } = fakeFetch([turn()]);
    const m = new OpenAIInterviewerModel('gpt-6-luna', 'none', fetch);
    for (let i = 0; i < 8; i++) await all(m.streamTurn(ctx()));   // Cerebras's limiter would wait after 5
  });
});

describe('RateLimiter', () => {
  it('lets five through, then waits for the oldest to leave the minute', async () => {
    let t = 0;
    const waits: number[] = [];
    const lim = new RateLimiter(5, () => t, async ms => { waits.push(ms); t += ms; });
    for (let i = 0; i < 5; i++) { expect(await lim.acquire()).toBe(0); t += 1000; }
    expect(await lim.acquire()).toBe(55_050);
    expect(waits).toEqual([55_050]);
  });

  it('retry delay: retry-after seconds, else exponential from 5s', () => {
    expect(retryDelayMs('3', 0)).toBe(3100);
    expect(retryDelayMs(null, 0)).toBe(5000);
    expect(retryDelayMs(null, 2)).toBe(20_000);
  });
});

describe('CerebrasInterviewerModel under a run budget (Qwen screening, 8 Oct)', () => {
  afterEach(() => clearRunBudget());

  it('records each call from the API usage, cached tokens included', async () => {
    const b = installRunBudget(1);
    const { fetch } = fakeFetch([turn()]);
    await all(new CerebrasInterviewerModel('qwen-3.8-27b', 'none', fetch).streamTurn(ctx()));
    // usage: 40 uncached + 60 cached in (both $0.99), 20 out ($1.49)
    expect(b.spentUsd).toBeCloseTo((100 * 0.99 + 20 * 1.49) / 1e6, 10);
    expect(b.byModel.get('cerebras/qwen-3.8-27b')).toMatchObject({ calls: 1, estimated: 0 });
  });

  it('records an aborted attempt (unknown id) with estimated tokens', async () => {
    const b = installRunBudget(1);
    const { fetch } = fakeFetch([
      turn({ requests: [{ what: 'x', item_ids: ['cost_breakdown'], explicit: true, respond: 'release' }] }),
      turn(),
    ]);
    await all(new CerebrasInterviewerModel('qwen-3.8-27b', 'none', fetch).streamTurn(ctx()));
    expect(b.byModel.get('cerebras/qwen-3.8-27b')).toMatchObject({ calls: 2, estimated: 1 });
  });

  it('refuses before sending once the cap is spent, and still refuses an unpriced model', async () => {
    const b = installRunBudget(0.000001);
    b.record({ model: 'cerebras/qwen-3.8-27b', inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputEstimated: false });
    const { fetch, bodies } = fakeFetch([turn()]);
    await expect(all(new CerebrasInterviewerModel('qwen-3.8-27b', 'none', fetch).streamTurn(ctx()))).rejects.toThrow(BudgetExceededError);
    installRunBudget(1);
    await expect(all(new CerebrasInterviewerModel('llama-unpriced', 'low', fetch).streamTurn(ctx()))).rejects.toThrow(UnpricedModelError);
    expect(bodies).toHaveLength(0);
  });
});
