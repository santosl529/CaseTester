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
// A reply ended by the stop sequence: the API leaves the matched sequence out of the
// text and names it in stop_sequence.
const stoppedReply = (text: string) => ({ ...reply(text), stop_reason: 'stop_sequence', stop_sequence: ']}' });
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
  it('claude-haiku-5-5: the JSON schema, no prefill, no stop sequence', async () => {
    create.mockResolvedValueOnce(reply('{"items":[]}'));
    expect(await classifyAsk({ what: 'competitor pricing', catalog, model: 'claude-haiku-5-5' })).toEqual({ items: [] });
    const req = create.mock.calls[0][0] as { messages: { role: string }[]; output_config?: { format?: { type: string } }; stop_sequences?: string[] };
    expect(req.messages.map(m => m.role)).toEqual(['user']);
    expect(req.output_config?.format?.type).toBe('json_schema');
    expect(req.stop_sequences).toBeUndefined();
  });
});

// Task 56 fix round 4 (the second paid run, haiku5b2-verdicts.json): 15 of 68 calls
// took 1.6–2.6 s, over the live check's 1.5 s cap, each a correct JSON reply followed
// by prose (median 133 output tokens vs 16). On the prefill path the reply stops at
// the JSON's end ("]}"), and the cut text is put back before parsing.
describe('classifyAsk: the stop sequence at the JSON\'s end (claude-haiku-4-5)', () => {
  it('the request carries stop_sequences ["]}"] on claude-haiku-4-5', async () => {
    create.mockResolvedValueOnce(stoppedReply(''));
    await classifyAsk({ what: 'transaction volume', catalog, model: 'claude-haiku-4-5' });
    const req = create.mock.calls[0][0] as { stop_sequences?: string[] };
    expect(req.stop_sequences).toEqual([']}']);
  });
  it('a reply cut by the stop sequence is put back together and parses; onRaw gets the whole JSON', async () => {
    create.mockResolvedValueOnce(stoppedReply('{"id":"cogs_pct","answers":"full"}'));
    const raw: string[] = [];
    expect(await classifyAsk({ what: 'COGS today', catalog, model: 'claude-haiku-4-5', onRaw: t => raw.push(t) })).toEqual({ items: [{ id: 'cogs_pct', answers: 'full' }] });
    expect(raw).toEqual(['{"items":[{"id":"cogs_pct","answers":"full"}]}']);
  });
  it('an empty items reply (the stop sequence at once) → no items, not a null verdict', async () => {
    create.mockResolvedValueOnce(stoppedReply(''));
    const raw: string[] = [];
    expect(await classifyAsk({ what: 'transaction volume', catalog, model: 'claude-haiku-4-5', onRaw: t => raw.push(t) })).toEqual({ items: [] });
    expect(raw).toEqual(['{"items":[]}']);
  });
  it('… and with no text block at all', async () => {
    create.mockResolvedValueOnce({ content: [], usage: { input_tokens: 700, output_tokens: 2 }, stop_reason: 'stop_sequence', stop_sequence: ']}' });
    expect(await classifyAsk({ what: 'transaction volume', catalog, model: 'claude-haiku-4-5' })).toEqual({ items: [] });
  });
  it('a reply cut inside a string ("]}" in a missing part) fails safe to null', async () => {
    create.mockResolvedValueOnce(stoppedReply('{"id":"cogs_pct","answers":"partial","missing":"COGS [by year'));
    expect(await classifyAsk({ what: 'COGS [by year]} today', catalog, model: 'claude-haiku-4-5' })).toBeNull();
  });
  it('a text that already ends with the stop sequence is not given a second one', async () => {
    create.mockResolvedValueOnce(stoppedReply('{"id":"cogs_pct","answers":"full"}]}'));
    const raw: string[] = [];
    expect(await classifyAsk({ what: 'COGS today', catalog, model: 'claude-haiku-4-5', onRaw: t => raw.push(t) })).toEqual({ items: [{ id: 'cogs_pct', answers: 'full' }] });
    expect(raw).toEqual(['{"items":[{"id":"cogs_pct","answers":"full"}]}']);
  });
  it('a reply that ended for another reason gets nothing appended', async () => {
    create.mockResolvedValueOnce({ ...reply('{"id":"cogs_pct","answers":"full"}'), stop_reason: 'max_tokens', stop_sequence: null });
    const raw: string[] = [];
    expect(await classifyAsk({ what: 'COGS today', catalog, model: 'claude-haiku-4-5', onRaw: t => raw.push(t) })).toBeNull();
    expect(raw).toEqual(['{"items":[{"id":"cogs_pct","answers":"full"}']);
  });
});

// Final review I3: the check's usage is its own component ('ask_check'), not the message
// classifier's and post-turn's 'data_request', so its cost per session can be read apart.
describe('classifyAsk: usage logged as its own component', () => {
  it('onUsage gets component "ask_check" with the call\'s tokens', async () => {
    create.mockResolvedValueOnce(stoppedReply('{"id":"cogs_pct","answers":"full"}'));
    const rows: unknown[] = [];
    await classifyAsk({ what: 'COGS today', catalog, model: 'claude-haiku-4-5', onUsage: u => rows.push(u) });
    expect(rows).toEqual([{ component: 'ask_check', model: 'claude-haiku-4-5', inputTokens: 700, outputTokens: 20 }]);
  });
});
