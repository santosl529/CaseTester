import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({ default: class {} }));

import { openerGate, openerPrompt } from '@/lib/agent/opener';

describe('openerGate', () => {
  it('passes a short naming of the move', () => {
    expect(openerGate('A cost-first structure.')).toBeNull();
    expect(openerGate('Take your time.')).toBeNull();
  });

  it('drops any figure, in digits or words — v1 silently corrected "16%" to "sixteen points"', () => {
    expect(openerGate('COGS moved sixteen points.')).toBe('number');
    expect(openerGate('Your 16% figure.')).toBe('number');
  });

  it('drops long or questioning openers, and empty ones', () => {
    expect(openerGate('You walked through pricing leverage on margin and volume risk today.')).toBe('too_long');
    expect(openerGate('Costs first?')).toBe('question');
    expect(openerGate('  ')).toBe('empty');
  });

  it('frames the last question and the reply', () => {
    expect(openerPrompt('', 'Costs.')).toContain('(the case prompt)');
  });
});
