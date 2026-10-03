import { describe, it, expect } from 'vitest';
import { actionsFromContent, describeBlocks } from '@/lib/agent/models/anthropic';

describe('actionsFromContent (batch 4: Sonnet narration)', () => {
  it('keeps plain text as the reply when the turn has no speak call (batch 5: Ines, Destiny)', () => {
    expect(actionsFromContent([
      { type: 'text', text: "No guessing. How would you break this down?" },
      { type: 'tool_use', name: 'advance_phase', input: {} },
    ])).toEqual([{ type: 'speak', text: 'No guessing. How would you break this down?' }, { type: 'advance_phase' }]);
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

// The narration check batch counts narration in the model's raw text, before
// the runner's strip — so the log must carry the text, not just the type.
describe('describeBlocks', () => {
  it('logs text blocks with their text', () => {
    expect(describeBlocks([
      { type: 'text', text: "I'll release the data now." },
      { type: 'tool_use', name: 'reveal_data', input: { item_id: 'cogs' } },
    ])).toEqual([
      { type: 'text', text: "I'll release the data now." },
      { type: 'tool_use', name: 'reveal_data', input: { item_id: 'cogs' } },
    ]);
  });
});
