import { describe, it, expect } from 'vitest';
import { actionsFromContent } from '@/lib/agent/models/anthropic';

describe('actionsFromContent (batch 4: Sonnet narration)', () => {
  it("drops plain-text narration on a turn that uses tools (Maya's 'The candidate is asking…')", () => {
    expect(actionsFromContent([
      { type: 'text', text: 'The candidate is asking about menu price changes, which is a direct data item.' },
      { type: 'tool_use', name: 'reveal_data', input: { item_id: 'menu_price_change' } },
    ])).toEqual([{ type: 'reveal_data', itemId: 'menu_price_change' }]);
  });

  it('keeps speak alongside other tools', () => {
    expect(actionsFromContent([
      { type: 'text', text: 'Reasoning here.' },
      { type: 'tool_use', name: 'speak', input: { text: 'What would you look at first?' } },
      { type: 'tool_use', name: 'advance_phase', input: {} },
    ])).toEqual([{ type: 'speak', text: 'What would you look at first?' }, { type: 'advance_phase' }]);
  });

  it('speaks a plain-text-only turn', () => {
    expect(actionsFromContent([{ type: 'text', text: 'Go on.' }])).toEqual([{ type: 'speak', text: 'Go on.' }]);
  });
});
