import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({ default: class {} }));

import { buildRequest } from '@/lib/agent/models/anthropic';

const ctx = {
  systemPrompt: 'FIXED',
  turnSystem: 'CASE STATE THIS TURN',
  history: [
    { role: 'user' as const, content: 'Okay, I would look at costs.' },
    { role: 'assistant' as const, content: 'Got it. Which cost line first?' },
    { role: 'user' as const, content: 'COGS, it went from 42 to 58.' },
  ],
};

describe('buildRequest', () => {
  it('state-in-system (today): state as a second system block, history uncached', () => {
    const r = buildRequest(ctx, 'state-in-system');
    expect(r.system.map(b => b.text)).toEqual(['FIXED', 'CASE STATE THIS TURN']);
    expect(r.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(r.messages).toHaveLength(3);
    expect(JSON.stringify(r.messages)).not.toContain('cache_control');
  });

  it('cached-history: breakpoint on the message before the current one, state last', () => {
    const r = buildRequest(ctx, 'cached-history');
    expect(r.system.map(b => b.text)).toEqual(['FIXED']);
    expect(r.messages[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'Got it. Which cost line first?', cache_control: { type: 'ephemeral' } }] });
    expect(r.messages[2]).toEqual({ role: 'user', content: 'COGS, it went from 42 to 58.' });
    expect(r.messages[3]).toEqual({ role: 'system', content: 'CASE STATE THIS TURN' });
  });

  it('cached-history: a retry note joins the state in one system message', () => {
    const r = buildRequest(ctx, 'cached-history', 'Write the whole turn again.');
    expect(r.messages).toHaveLength(4);
    expect(r.messages[3]).toEqual({ role: 'system', content: 'CASE STATE THIS TURN\n\nWrite the whole turn again.' });
  });

  it('the first turn has no earlier message to mark', () => {
    const r = buildRequest({ ...ctx, history: [ctx.history[0]] }, 'cached-history');
    expect(JSON.stringify(r.messages)).not.toContain('cache_control');
  });
});
