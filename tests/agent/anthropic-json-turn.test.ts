import { describe, it, expect, vi } from 'vitest';
import { AnthropicInterviewerModel } from '@/lib/agent/models/anthropic';
import type { TurnContext } from '@/lib/agent/models/interface';

// The model layer's structured-output loop (json-actions.ts), against a
// stubbed client stream: one regeneration for unusable drafts, none for refusals.
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

const ctx = (onValidation?: TurnContext['onValidation']): TurnContext => ({
  systemPrompt: 'FIXED',
  turnSystem: 'STATE',
  history: [{ role: 'user', content: 'Can I see the cost breakdown?' }],
  tools: [],
  idValidators: {
    reveal_data: { idKey: 'item_id', resolve: raw => (raw === 'cogs_pct' ? raw : null), validOptions: ['cogs_pct'] },
  },
  onValidation,
});

describe('AnthropicInterviewerModel structured turn', () => {
  it('sends JSON output config, no tools, and the cached system blocks', async () => {
    const { model, stream } = stubbed([{ text: '{"actions":[{"type":"say","text":"Go on."}]}' }]);
    expect(await model.runTurn(ctx())).toEqual([{ type: 'speak', text: 'Go on.' }]);
    const req = stream.mock.calls[0][0];
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.tools).toBeUndefined();
    expect(req.stop_sequences).toBeUndefined();
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.system[0].text).toContain('RESPONSE FORMAT');
    expect(req.system[1].text).toBe('STATE');
  });

  it('regenerates once with a note when an id does not exist', async () => {
    const onValidation = vi.fn();
    const { model, stream } = stubbed([
      { text: '{"actions":[{"type":"reveal_data","item_id":"cost_breakdown"}]}' },
      { text: '{"actions":[{"type":"reveal_data","item_id":"cogs_pct"},{"type":"say","text":"What stands out?"}]}' },
    ]);
    expect(await model.runTurn(ctx(onValidation))).toEqual([
      { type: 'reveal_data', itemId: 'cogs_pct' },
      { type: 'speak', text: 'What stands out?' },
    ]);
    expect(stream).toHaveBeenCalledTimes(2);
    const retryMessages = stream.mock.calls[1][0].messages;
    expect(retryMessages.at(-1).role).toBe('system');
    expect(retryMessages.at(-1).content).toContain('"cost_breakdown"');
    expect(retryMessages.at(-1).content).toContain('"cogs_pct"');
    expect(onValidation).toHaveBeenCalledWith(expect.objectContaining({ retried: true }));
  });

  it('regenerates once when the reply is not a complete JSON object', async () => {
    const { model, stream } = stubbed([
      { text: '{"actions":[{"type":"say","text":"cut' },
      { text: '{"actions":[{"type":"say","text":"Go on."}]}' },
    ]);
    expect(await model.runTurn(ctx())).toEqual([{ type: 'speak', text: 'Go on.' }]);
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it('does not regenerate a refusal; the neutral continuation stands', async () => {
    const { model, stream } = stubbed([{ text: '', stop_reason: 'refusal' }]);
    const actions = await model.runTurn(ctx());
    expect(stream).toHaveBeenCalledTimes(1);
    expect(actions).toEqual([{ type: 'speak', text: 'I see. What would you like to explore next?' }]);
  });

  it('regenerates at most once', async () => {
    const bad = { text: '{"actions":[{"type":"reveal_data","item_id":"nope"}]}' };
    const { model, stream } = stubbed([bad, bad]);
    await model.runTurn(ctx());
    expect(stream).toHaveBeenCalledTimes(2);
  });
});
