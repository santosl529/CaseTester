import { describe, it, expect, vi } from 'vitest';
import { AnthropicInterviewerModel } from '@/lib/agent/models/anthropic';
import type { TurnContext, TurnEvent } from '@/lib/agent/models/interface';

// streamTurn against a stubbed client stream (spec 2026-10-06 §4): fields as
// they close, say by sentence; one regeneration — caught as soon as
// `requests` names an unknown id — only while nothing was delivered.

function fakeStream(text: string, stop_reason = 'end_turn', chunk = 7) {
  const events = Array.from({ length: Math.ceil(text.length / chunk) }, (_, i) => ({
    type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(i * chunk, i * chunk + chunk) },
  }));
  return {
    async *[Symbol.asyncIterator]() { for (const e of events) yield e; },
    abort: vi.fn(),
    finalMessage: async () => ({
      content: [{ type: 'text', text }], stop_reason, stop_details: null,
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    }),
  };
}

function stubbed(replies: { text: string; stop_reason?: string }[]) {
  const model = new AnthropicInterviewerModel('test-model');
  const stream = vi.fn();
  for (const r of replies) stream.mockReturnValueOnce(fakeStream(r.text, r.stop_reason));
  (model as unknown as { client: unknown }).client = { beta: { messages: { stream } } };
  return { model, stream };
}

const turn = (over: Record<string, unknown> = {}) => JSON.stringify({
  say: 'Okay.', move: 'analysis', requests: [], exhibit: null, rescue_item: null, question: 'What drove it?', ...over,
});

const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({
  systemPrompt: 'FIXED', turnSystem: 'STATE',
  history: [{ role: 'user', content: 'Can I see the cost breakdown?' }],
  resolveId: raw => (raw === 'cogs_pct' ? raw : null), validIds: ['cogs_pct'],
  ...over,
});

async function all(it: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('AnthropicInterviewerModel.streamTurn', () => {
  it('sends the turn schema with the cached system blocks and no tools', async () => {
    const { model, stream } = stubbed([{ text: turn() }]);
    await all(model.streamTurn(ctx()));
    const req = stream.mock.calls[0][0];
    expect(req.output_config.format.type).toBe('json_schema');
    expect(Object.keys(req.output_config.format.schema.properties)).toEqual(['say', 'move', 'requests', 'exhibit', 'rescue_item', 'question']);
    expect(req.tools).toBeUndefined();
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.system[1].text).toBe('STATE');
  });

  it('streams the say sentences, the declarations, then the turn', async () => {
    const { model } = stubbed([{ text: turn({
      requests: [{ what: 'the cost split', item_ids: ['cogs_pct'], explicit: true, respond: 'release' }],
      say: 'Okay. Here we go.',
    }) }]);
    const ev = await all(model.streamTurn(ctx()));
    expect(ev.filter(e => e.type === 'sentence')).toEqual([{ type: 'sentence', text: 'Okay.' }, { type: 'sentence', text: 'Here we go.' }]);
    expect(ev.filter(e => e.type === 'field').map(e => (e as { key: string }).key)).toEqual(['say', 'move', 'requests', 'exhibit', 'rescue_item', 'question']);
    expect(ev.at(-1)).toMatchObject({ type: 'done', turn: {
      move: 'analysis', say: 'Okay. Here we go.', question: 'What drove it?',
      requests: [{ what: 'the cost split', itemIds: ['cogs_pct'], explicit: true, respond: 'release' }],
    } });
  });

  it('regenerates when requests name an unknown id while the caller has delivered nothing', async () => {
    const { model, stream } = stubbed([
      { text: turn({ requests: [{ what: 'x', item_ids: ['cost_breakdown'], explicit: true, respond: 'release' }] }) },
      { text: turn({ requests: [{ what: 'x', item_ids: ['cogs_pct'], explicit: true, respond: 'release' }] }) },
    ]);
    const ev = await all(model.streamTurn(ctx()));
    expect(stream).toHaveBeenCalledTimes(2);
    const restartAt = ev.findIndex(e => e.type === 'restart');
    expect(restartAt).toBeGreaterThan(-1);
    // say streams first, so its sentence precedes the restart; the caller
    // (canRegenerate) is what says nothing was delivered yet.
    expect(ev.slice(restartAt + 1).some(e => e.type === 'sentence')).toBe(true);
    const note = stream.mock.calls[1][0].messages.at(-1);
    expect(note.role).toBe('system');
    expect(note.content).toContain('"cost_breakdown"');
    expect(note.content).toContain('"cogs_pct"');
  });

  it('does not regenerate once the caller has delivered something', async () => {
    const { model, stream } = stubbed([{ text: turn({ requests: [{ what: 'x', item_ids: ['nope'], explicit: true, respond: 'release' }] }) }]);
    const ev = await all(model.streamTurn(ctx({ canRegenerate: () => false })));
    expect(stream).toHaveBeenCalledTimes(1);
    expect(ev.at(-1)).toMatchObject({ type: 'done', validation: { unknownIds: ['nope'], retried: false } });
  });

  it('regenerates once on an unparseable reply, at most once', async () => {
    const { model, stream } = stubbed([{ text: '{"move":"analysis","say":"cut' }, { text: '{"move":' }]);
    const ev = await all(model.streamTurn(ctx()));
    expect(stream).toHaveBeenCalledTimes(2);
    expect(ev.at(-1)).toMatchObject({ type: 'done', turn: { question: 'What would you like to explore next?' }, validation: { unparsed: true, retried: true } });
  });

  it('returns the neutral turn on a refusal, without regenerating', async () => {
    const { model, stream } = stubbed([{ text: '', stop_reason: 'refusal' }]);
    const ev = await all(model.streamTurn(ctx()));
    expect(stream).toHaveBeenCalledTimes(1);
    expect(ev.at(-1)).toMatchObject({ type: 'done', validation: { refused: true }, turn: { question: 'What would you like to explore next?' } });
  });
});
