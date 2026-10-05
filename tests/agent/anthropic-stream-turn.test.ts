import { describe, it, expect, vi } from 'vitest';
import { AnthropicInterviewerModel } from '@/lib/agent/models/anthropic';
import type { TurnContext, TurnEvent } from '@/lib/agent/models/interface';

// streamTurn against a stubbed client stream: sentences and resolved actions
// as they close; one regeneration only while nothing has been delivered.

// A fake BetaMessageStream: async-iterates text deltas, then finalMessage().
function fakeStream(text: string, stop_reason = 'end_turn', chunk = 7) {
  const events = Array.from({ length: Math.ceil(text.length / chunk) }, (_, i) => ({
    type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(i * chunk, i * chunk + chunk) },
  }));
  return {
    async *[Symbol.asyncIterator]() { for (const e of events) yield e; },
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

const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({
  systemPrompt: 'FIXED',
  turnSystem: 'STATE',
  history: [{ role: 'user', content: 'Can I see the cost breakdown?' }],
  tools: [],
  idValidators: {
    reveal_data: { idKey: 'item_id', resolve: raw => (raw === 'cogs_pct' ? raw : null), validOptions: ['cogs_pct'] },
  },
  ...over,
});

async function all(it: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('AnthropicInterviewerModel.streamTurn', () => {
  it('streams sentences and resolved actions, then done', async () => {
    const { model } = stubbed([{ text: '{"actions":[{"type":"say","text":"Okay. Here it is."},{"type":"reveal_data","item_id":"cogs_pct"},{"type":"say","text":"What stands out?"}]}' }]);
    const ev = await all(model.streamTurn(ctx()));
    expect(ev.filter(e => e.type !== 'done')).toEqual([
      { type: 'sentence', text: 'Okay.', sayIndex: 0 },
      { type: 'sentence', text: 'Here it is.', sayIndex: 0 },
      { type: 'action', action: { type: 'reveal_data', itemId: 'cogs_pct' } },
      { type: 'sentence', text: 'What stands out?', sayIndex: 1 },
    ]);
    expect(ev.at(-1)).toMatchObject({ type: 'done', retried: false, actions: [
      { type: 'speak', text: 'Okay. Here it is.' },
      { type: 'reveal_data', itemId: 'cogs_pct' },
      { type: 'speak', text: 'What stands out?' },
    ] });
  });

  it('skips an unresolvable id mid-stream and regenerates once', async () => {
    const { model, stream } = stubbed([
      { text: '{"actions":[{"type":"reveal_data","item_id":"bogus"}]}' },
      { text: '{"actions":[{"type":"reveal_data","item_id":"cogs_pct"}]}' },
    ]);
    const ev = await all(model.streamTurn(ctx()));
    expect(stream).toHaveBeenCalledTimes(2);
    expect(ev.map(e => e.type)).toEqual(['restart', 'action', 'done']);
  });

  it('does not regenerate once the caller has delivered something', async () => {
    const { model, stream } = stubbed([{ text: '{"actions":[{"type":"say","text":"Okay."},{"type":"reveal_data","item_id":"bogus"}]}' }]);
    const ev = await all(model.streamTurn(ctx({ canRegenerate: () => false })));
    expect(stream).toHaveBeenCalledTimes(1);
    expect(ev.at(-1)).toMatchObject({ type: 'done', retried: false, actions: [{ type: 'speak', text: 'Okay.' }] });
  });

  it('stops streaming live events at the action cap (normalizeActions drops the rest)', async () => {
    // Batch 9, Lena t7: 11 actions; the stream delivered three reveals the cap then dropped.
    const reveals = Array.from({ length: 10 }, () => '{"type":"reveal_data","item_id":"cogs_pct"}');
    const { model } = stubbed([{ text: `{"actions":[{"type":"say","text":"One."},${reveals.join(',')},{"type":"say","text":"Late."}]}` }]);
    const ev = await all(model.streamTurn(ctx()));
    const stopAt = ev.findIndex(e => e.type === 'stop');
    expect(stopAt).toBeGreaterThan(-1);
    expect(ev.slice(0, stopAt).filter(e => e.type === 'action')).toHaveLength(7); // actions 1–7 after the say (0)
    expect(ev.slice(stopAt + 1).filter(e => e.type === 'sentence' || e.type === 'action')).toEqual([]);
    expect(ev.filter(e => e.type === 'stop')).toHaveLength(1);
  });

  it('returns the neutral continuation on a refusal, without regenerating', async () => {
    const { model, stream } = stubbed([{ text: '', stop_reason: 'refusal' }]);
    const ev = await all(model.streamTurn(ctx()));
    expect(stream).toHaveBeenCalledTimes(1);
    expect(ev.at(-1)).toMatchObject({ type: 'done', refused: true, actions: [{ type: 'speak', text: 'I see. What would you like to explore next?' }] });
  });
});
