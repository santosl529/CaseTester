import { describe, it, expect, vi } from 'vitest';
import { AnthropicInterviewerModel } from '@/lib/agent/models/anthropic';
import type { TurnContext } from '@/lib/agent/models/interface';

// The model layer's structured-output loop (json-actions.ts), against a
// stubbed client: one regeneration for unusable drafts, none for refusals.
function stubbed(replies: { text: string; stop_reason?: string }[]) {
  const model = new AnthropicInterviewerModel('test-model');
  const create = vi.fn();
  for (const r of replies) {
    create.mockResolvedValueOnce({
      content: [{ type: 'text', text: r.text }],
      stop_reason: r.stop_reason ?? 'end_turn',
      stop_details: null,
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });
  }
  (model as unknown as { client: unknown }).client = { beta: { messages: { create } } };
  return { model, create };
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
    const { model, create } = stubbed([{ text: '{"actions":[{"type":"say","text":"Go on."}]}' }]);
    expect(await model.runTurn(ctx())).toEqual([{ type: 'speak', text: 'Go on.' }]);
    const req = create.mock.calls[0][0];
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.tools).toBeUndefined();
    expect(req.stop_sequences).toBeUndefined();
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.system[0].text).toContain('RESPONSE FORMAT');
    expect(req.system[1].text).toBe('STATE');
  });

  it('regenerates once with a note when an id does not exist', async () => {
    const onValidation = vi.fn();
    const { model, create } = stubbed([
      { text: '{"actions":[{"type":"reveal_data","item_id":"cost_breakdown"}]}' },
      { text: '{"actions":[{"type":"reveal_data","item_id":"cogs_pct"},{"type":"say","text":"What stands out?"}]}' },
    ]);
    expect(await model.runTurn(ctx(onValidation))).toEqual([
      { type: 'reveal_data', itemId: 'cogs_pct' },
      { type: 'speak', text: 'What stands out?' },
    ]);
    expect(create).toHaveBeenCalledTimes(2);
    const retryMessages = create.mock.calls[1][0].messages;
    expect(retryMessages.at(-1).role).toBe('system');
    expect(retryMessages.at(-1).content).toContain('"cost_breakdown"');
    expect(retryMessages.at(-1).content).toContain('"cogs_pct"');
    expect(onValidation).toHaveBeenCalledWith(expect.objectContaining({ retried: true }));
  });

  it('regenerates once when the reply is not a complete JSON object', async () => {
    const { model, create } = stubbed([
      { text: '{"actions":[{"type":"say","text":"cut' },
      { text: '{"actions":[{"type":"say","text":"Go on."}]}' },
    ]);
    expect(await model.runTurn(ctx())).toEqual([{ type: 'speak', text: 'Go on.' }]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not regenerate a refusal; the neutral continuation stands', async () => {
    const { model, create } = stubbed([{ text: '', stop_reason: 'refusal' }]);
    const actions = await model.runTurn(ctx());
    expect(create).toHaveBeenCalledTimes(1);
    expect(actions).toEqual([{ type: 'speak', text: 'I see. What would you like to explore next?' }]);
  });

  it('regenerates at most once', async () => {
    const bad = { text: '{"actions":[{"type":"reveal_data","item_id":"nope"}]}' };
    const { model, create } = stubbed([bad, bad]);
    await model.runTurn(ctx());
    expect(create).toHaveBeenCalledTimes(2);
  });
});
