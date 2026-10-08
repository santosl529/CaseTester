import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { costOf, UnpricedModelError, MODEL_PRICES } from '@/lib/llm-pricing';
import { RunBudget, installRunBudget, clearRunBudget, requireRunBudget, BudgetExceededError } from '@/lib/llm-budget';
import { meteredFetch } from '@/lib/llm-meter';
import { INTERVIEWER_MODEL_ID, SCORING_MODEL_ID } from '@/lib/models';
import { DISTRESS_MODEL_ID } from '@/lib/orchestrator/distress';

const u = (model: string, i = 0, o = 0, r = 0, w = 0) => ({ model, inputTokens: i, outputTokens: o, cacheReadTokens: r, cacheWriteTokens: w });

describe('costOf', () => {
  it('prices every model id the product uses, dated ids included', () => {
    for (const id of [INTERVIEWER_MODEL_ID, SCORING_MODEL_ID, DISTRESS_MODEL_ID, 'claude-haiku-4-5-20251001', 'claude-haiku-5-5', 'claude-opus-5']) {
      expect(MODEL_PRICES[id], id).toBeDefined();
    }
    expect(costOf(u('claude-haiku-4-5-20251001', 1_000_000, 0))).toBeCloseTo(1);
  });

  it('throws on an unknown id instead of pricing it at $0 or another model\'s rate', () => {
    expect(() => costOf(u('claude-haiku-9', 1000, 10))).toThrow(UnpricedModelError);
    expect(() => costOf(u('openai/gpt-6-luna', 1000, 10))).toThrow(UnpricedModelError);
  });

  it('counts cache reads and writes at their own rates', () => {
    // Sonnet 5.5: 1M uncached $2 + 1M read $0.10 + 1M write $2.50 + 1M out $10
    expect(costOf(u('claude-sonnet-5-5', 1e6, 1e6, 1e6, 1e6))).toBeCloseTo(14.6);
  });

  it('applies Haiku 5.5\'s long-prompt price above 100k prompt tokens (cache counted in the prompt)', () => {
    expect(costOf(u('claude-haiku-5-5', 100_000, 1000))).toBeCloseTo(0.0105);
    expect(costOf(u('claude-haiku-5-5', 60_000, 1000, 50_000))).toBeCloseTo((60_000 * 0.5 + 50_000 * 0.05 + 1000 * 2.5) / 1e6);
  });
});

describe('RunBudget', () => {
  afterEach(() => { clearRunBudget(); delete process.env.LLM_BUDGET_USD; });

  it('refuses a call once spend reaches the cap, and refuses unpriced models up front', () => {
    const b = new RunBudget(0.01);
    b.check('claude-haiku-4-5');
    b.record({ ...u('claude-haiku-4-5', 10_000, 0), outputEstimated: false });   // $0.01
    expect(() => b.check('claude-haiku-4-5')).toThrow(BudgetExceededError);
    expect(() => new RunBudget(1).check('mystery-model')).toThrow(UnpricedModelError);
  });

  it('shares one cap across processes through a ledger file', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'budget-')), 'ledger.jsonl');
    const a = installRunBudget(0.02, file);
    a.record({ ...u('claude-haiku-4-5', 10_000, 0), outputEstimated: false });
    const other = new (a.constructor as typeof RunBudget)(0.02, undefined);   // a memory ledger sees nothing
    expect(other.spentUsd).toBe(0);
    const b = installRunBudget(0.02, file);                                      // a second process on the same file
    expect(b.spentUsd).toBeCloseTo(0.01);
    b.record({ ...u('claude-haiku-4-5', 10_000, 0), outputEstimated: false });
    expect(() => a.check('claude-haiku-4-5')).toThrow(BudgetExceededError);
  });

  it('paid scripts cannot start without a cap', () => {
    expect(() => requireRunBudget('test-script')).toThrow(/LLM_BUDGET_USD/);
    process.env.LLM_BUDGET_USD = '0.5';
    expect(requireRunBudget('test-script').capUsd).toBe(0.5);
  });
});

describe('meteredFetch', () => {
  afterEach(() => clearRunBudget());
  const url = 'https://api.anthropic.com/v1/messages';
  const init = (model: string) => ({ method: 'POST', body: JSON.stringify({ model, max_tokens: 10 }) });

  it('passes through untouched without a budget', async () => {
    let called = 0;
    const f = meteredFetch((async () => { called++; return new Response('{}'); }) as typeof fetch);
    await f(url, init('anything-unpriced'));
    expect(called).toBe(1);
  });

  it('records a JSON response from its usage, and refuses before sending once spent', async () => {
    const b = installRunBudget(0.001);
    let sent = 0;
    const f = meteredFetch((async () => { sent++; return new Response(JSON.stringify({ model: 'claude-haiku-4-5', usage: { input_tokens: 1000, output_tokens: 100 } }), { headers: { 'content-type': 'application/json' } }); }) as typeof fetch);
    await f(url, init('claude-haiku-4-5'));
    expect(b.spentUsd).toBeCloseTo(0.0015);
    await expect(f(url, init('claude-haiku-4-5'))).rejects.toThrow(BudgetExceededError);
    expect(sent).toBe(1);
  });

  it('refuses an unpriced model before sending', async () => {
    installRunBudget(1);
    let sent = 0;
    const f = meteredFetch((async () => { sent++; return new Response('{}'); }) as typeof fetch);
    await expect(f(url, init('claude-new-model'))).rejects.toThrow(UnpricedModelError);
    expect(sent).toBe(0);
  });

  const sse = (events: object[], close = true) => new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (const e of events) c.enqueue(enc.encode(`event: x\ndata: ${JSON.stringify(e)}\n\n`));
      // An abort lands after the delivered chunks were read (error() would drop queued ones).
      if (close) c.close(); else setTimeout(() => c.error(new Error('aborted')), 5);
    },
  });

  it('records a stream from message_start + message_delta, including cache tokens', async () => {
    const b = installRunBudget(1);
    const f = meteredFetch((async () => new Response(sse([
      { type: 'message_start', message: { model: 'claude-sonnet-5-5', usage: { input_tokens: 2000, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0, output_tokens: 1 } } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } },
      { type: 'message_delta', usage: { output_tokens: 300 } },
    ]), { headers: { 'content-type': 'text/event-stream' } })) as typeof fetch);
    const res = await f(url, init('claude-sonnet-5-5'));
    await res.text();                         // the caller reads its branch
    await new Promise(r => setTimeout(r, 0));
    expect(b.spentUsd).toBeCloseTo((2000 * 2 + 5000 * 0.1 + 300 * 10) / 1e6);
  });

  it('records an aborted stream from its input counts with an estimated output, flagged', async () => {
    const b = installRunBudget(1);
    const f = meteredFetch((async () => new Response(sse([
      { type: 'message_start', message: { model: 'claude-haiku-5-5', usage: { input_tokens: 9000, output_tokens: 1 } } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'x'.repeat(300) } },
    ], false), { headers: { 'content-type': 'text/event-stream' } })) as typeof fetch);
    const res = await f(url, init('claude-haiku-5-5'));
    await res.text().catch(() => {});
    await new Promise(r => setTimeout(r, 10));
    expect(b.byModel.get('claude-haiku-5-5')).toMatchObject({ calls: 1, estimated: 1 });
    expect(b.spentUsd).toBeCloseTo((9000 * 0.1 + 100 * 0.5) / 1e6);
  });
});

describe('anthropicClient (the SDK through the meter)', () => {
  afterEach(() => clearRunBudget());
  const msg = { id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 10 } };

  it('meters messages.create and messages.stream, and the SDK still gets its response', async () => {
    const { anthropicClient } = await import('@/lib/anthropic-client');
    const b = installRunBudget(1);
    const fake = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const stream = (JSON.parse(String(init?.body)) as { stream?: boolean }).stream;
      if (!stream) return new Response(JSON.stringify(msg), { headers: { 'content-type': 'application/json' } });
      const events = [
        { type: 'message_start', message: { ...msg, content: [], usage: { input_tokens: 2000, output_tokens: 1 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } },
        { type: 'message_stop' },
      ];
      return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
    }) as typeof fetch;
    const client = anthropicClient({ apiKey: 'test', fetch: fake, maxRetries: 0 });
    const r = await client.messages.create({ model: 'claude-haiku-5-5', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] });
    expect(r.content[0]).toMatchObject({ text: 'ok' });
    const final = await client.messages.stream({ model: 'claude-haiku-5-5', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }).finalMessage();
    expect(final.content[0]).toMatchObject({ text: 'hi' });
    await new Promise(res => setTimeout(res, 10));
    expect(b.byModel.get('claude-haiku-5-5')?.calls).toBe(2);
    expect(b.spentUsd).toBeCloseTo((1000 * 0.1 + 10 * 0.5 + 2000 * 0.1 + 20 * 0.5) / 1e6);
  });
});
