// Task 56 fix round 1 (the paid Haiku rerun, 20 Oct): claude-haiku-4-5 gets no
// structured output, and 16 of 68 replies put prose around the JSON (median 115
// output tokens, 13 over the 1.5 s cap) → no verdict. The check's call prefills
// the reply on that model so it is JSON from the first token, and puts the prefill
// back before parsing; claude-haiku-5-5 keeps its JSON schema and gets no prefill.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/anthropic-client', () => ({ anthropicClient: () => ({ messages: { create } }) }));

import { classifyAsk, type AskCheckItem } from '@/lib/orchestrator/data-requests';

const catalog: AskCheckItem[] = [{ id: 'cogs_pct', label: 'COGS as % of revenue', line: 'COGS is #% of revenue today.' }];
const reply = (text: string) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 700, output_tokens: 20 } });
beforeEach(() => { create.mockReset(); });

describe('classifyAsk', () => {
  it('claude-haiku-4-5: the reply is prefilled with {"items":[ and put back together before parsing', async () => {
    create.mockResolvedValueOnce(reply('{"id":"cogs_pct","answers":"full"}]}'));
    const raw: string[] = [];
    expect(await classifyAsk({ what: 'COGS today', catalog, model: 'claude-haiku-4-5', onRaw: t => raw.push(t) })).toEqual({ items: [{ id: 'cogs_pct', answers: 'full' }] });
    const req = create.mock.calls[0][0] as { messages: { role: string; content: string }[]; output_config?: unknown };
    expect(req.messages.map(m => m.role)).toEqual(['user', 'assistant']);
    expect(req.messages[1].content).toBe('{"items":[');
    expect(req.output_config).toBeUndefined();
    expect(raw).toEqual(['{"items":[{"id":"cogs_pct","answers":"full"}]}']);
  });
  it('… a no-item reply with prose after it: no items (not a null verdict)', async () => {
    create.mockResolvedValueOnce(reply(']}\n\nNo catalog item holds competitor pricing.'));
    expect(await classifyAsk({ what: 'competitor pricing', catalog, model: 'claude-haiku-4-5' })).toEqual({ items: [] });
  });
  it('claude-haiku-5-5: the JSON schema, no prefill', async () => {
    create.mockResolvedValueOnce(reply('{"items":[]}'));
    expect(await classifyAsk({ what: 'competitor pricing', catalog, model: 'claude-haiku-5-5' })).toEqual({ items: [] });
    const req = create.mock.calls[0][0] as { messages: { role: string }[]; output_config?: { format?: { type: string } } };
    expect(req.messages.map(m => m.role)).toEqual(['user']);
    expect(req.output_config?.format?.type).toBe('json_schema');
  });
});
