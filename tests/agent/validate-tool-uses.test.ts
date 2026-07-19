import { describe, it, expect } from 'vitest';
import { validateToolUses, type ToolUseLike } from '@/lib/agent/models/tool-input';
import type { ToolIdValidator } from '@/lib/agent/models/interface';

// A stand-in exhibit validator: only "exhibit-a" is real; tolerant on "Exhibit A".
const exhibitValidator: ToolIdValidator = {
  idKey: 'exhibit_id',
  resolve: raw => {
    if (!raw) return null;
    const n = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
    return n === 'exhibita' || n.includes('exhibita') ? 'exhibit-a' : null;
  },
  validOptions: ['exhibit-a'],
};
const validators = { show_exhibit: exhibitValidator };

describe('validateToolUses', () => {
  it('passes a valid (or tolerantly-valid) exhibit id with no error', () => {
    const tus: ToolUseLike[] = [{ id: 't1', name: 'show_exhibit', input: { exhibit_id: 'Exhibit A' } }];
    const { toolResults, anyInvalid } = validateToolUses(tus, validators);
    expect(anyInvalid).toBe(false);
    expect(toolResults[0].is_error).toBeUndefined();
    expect(toolResults[0].content).toContain('exhibit-a');
  });

  it('flags an unresolvable id and lists the valid options back to the model', () => {
    const tus: ToolUseLike[] = [{ id: 't1', name: 'show_exhibit', input: { exhibit_id: 'the cost chart' } }];
    const { toolResults, anyInvalid } = validateToolUses(tus, validators);
    expect(anyInvalid).toBe(true);
    expect(toolResults[0].is_error).toBe(true);
    expect(toolResults[0].content).toContain('exhibit-a');
    expect(toolResults[0].content).toContain('Call show_exhibit again');
  });

  it('recovers the id even when the model used it as the KEY (the crash shape)', () => {
    const tus: ToolUseLike[] = [{ id: 't1', name: 'show_exhibit', input: { 'exhibit-a': 'exhibit-a' } }];
    const { anyInvalid } = validateToolUses(tus, validators);
    expect(anyInvalid).toBe(false); // extractToolId recovers "exhibit-a"
  });

  it('always emits a tool_result per tool_use (API requires one each), passing un-validated tools', () => {
    const tus: ToolUseLike[] = [
      { id: 't1', name: 'speak', input: { text: 'hi' } },
      { id: 't2', name: 'show_exhibit', input: { exhibit_id: 'bogus' } },
    ];
    const { toolResults, anyInvalid } = validateToolUses(tus, validators);
    expect(toolResults).toHaveLength(2);
    expect(toolResults.find(r => r.tool_use_id === 't1')?.is_error).toBeUndefined(); // speak passes
    expect(toolResults.find(r => r.tool_use_id === 't2')?.is_error).toBe(true);
    expect(anyInvalid).toBe(true);
  });

  it('reports "(none available)" when a case has no valid options', () => {
    const tus: ToolUseLike[] = [{ id: 't1', name: 'show_exhibit', input: { exhibit_id: 'x' } }];
    const { toolResults } = validateToolUses(tus, { show_exhibit: { ...exhibitValidator, validOptions: [], resolve: () => null } });
    expect(toolResults[0].content).toContain('(none available)');
  });
});
