import { describe, it, expect } from 'vitest';
import { GeminiInterviewerModel, geminiSchema } from '@/lib/agent/models/gemini';
import type { TurnContext, TurnEvent } from '@/lib/agent/models/interface';

const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({
  systemPrompt: 'FIXED', turnSystem: 'STATE',
  history: [{ role: 'assistant', content: 'How would you approach it?' }, { role: 'user', content: 'Can I see the cost breakdown?' }],
  resolveId: id => (id === 'cogs_pct' ? 'cogs_pct' : null), validIds: ['cogs_pct'],
  ...over,
});
const turn = (over: Record<string, unknown> = {}) => JSON.stringify({
  say: 'Got it.', move: 'analysis', requests: [], exhibit: null, rescue_item: null, question: 'What drove it?', ...over,
});

// A fetch that streams a thought part, then the JSON turn in `size`-char parts, then usage.
function fakeFetch(turns: string[], size = 9) {
  const calls: { url: string; key: string; body: Record<string, any> }[] = [];
  let n = 0;
  const f = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
    calls.push({ url, key: init.headers['x-goog-api-key'], body: JSON.parse(init.body) });
    const text = turns[Math.min(n++, turns.length - 1)];
    const ev = (o: unknown) => `data: ${JSON.stringify(o)}\r\n\r\n`;
    const parts = [ev({ candidates: [{ content: { parts: [{ text: 'thinking about it', thought: true }] } }] })];
    for (let i = 0; i < text.length; i += size) parts.push(ev({ candidates: [{ content: { parts: [{ text: text.slice(i, i + size) }] } }] }));
    parts.push(ev({ candidates: [], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5, cachedContentTokenCount: 60 } }));
    const enc = new TextEncoder();
    return new Response(new ReadableStream({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}
async function all(gen: AsyncGenerator<TurnEvent>) { const out: TurnEvent[] = []; for await (const e of gen) out.push(e); return out; }

describe('GeminiInterviewerModel (latency screening, 7 Oct)', () => {
  it('streams the same JSON turn; thought parts are never the answer; usage counts thinking as output', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const { fetch, calls } = fakeFetch([turn()]);
    const usage: unknown[] = [];
    const ev = await all(new GeminiInterviewerModel('gemini-3.8-flash', 'low', fetch).streamTurn(ctx({ onUsage: u => usage.push(u) })));
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse');
    expect(calls[0].key).toBe('test-gemini-key');
    expect(calls[0].body.systemInstruction.parts[0].text).toBe('FIXED\n\nSTATE');
    expect(calls[0].body.contents.map((c: { role: string }) => c.role)).toEqual(['model', 'user']);
    expect(calls[0].body.generationConfig).toMatchObject({ responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } });
    expect(ev.find(e => e.type === 'sentence')).toEqual({ type: 'sentence', text: 'Got it.' });
    expect(ev.at(-1)).toMatchObject({ type: 'done', turn: { say: 'Got it.', question: 'What drove it?' } });
    expect(usage).toEqual([{ component: 'interviewer', model: 'gemini/gemini-3.8-flash', inputTokens: 40, outputTokens: 25, cacheReadTokens: 60, cacheWriteTokens: 0 }]);
  });

  it('regenerates once on an unknown id while nothing was delivered', async () => {
    const bad = turn({ requests: [{ what: 'x', item_ids: ['nope'], explicit: true, respond: 'release' }] });
    const { fetch, calls } = fakeFetch([bad, turn()]);
    const ev = await all(new GeminiInterviewerModel('gemini-3.8-flash', 'low', fetch).streamTurn(ctx()));
    expect(calls).toHaveLength(2);
    expect(calls[1].body.systemInstruction.parts[0].text).toContain('STATE\n\n');
    expect(ev.some(e => e.type === 'restart')).toBe(true);
    expect(ev.at(-1)).toMatchObject({ type: 'done', validation: { retried: true } });
  });

  it('keeps the schema, with null-able fields in a form Gemini accepts', () => {
    const s = geminiSchema() as { properties: Record<string, unknown>; required: string[] };
    expect(s.required).toEqual(['say', 'move', 'requests', 'exhibit', 'rescue_item', 'question']);
    expect(JSON.stringify(s)).not.toContain('"const"');
  });
});
