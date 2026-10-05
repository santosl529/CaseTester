import { describe, it, expect } from 'vitest';
import { buildSystemBlocks } from '@/lib/agent/models/anthropic';

// Latency plan step 3: prompt caching layout.
describe('buildSystemBlocks', () => {
  it('caches the fixed instructions and appends the turn state uncached', () => {
    expect(buildSystemBlocks('FIXED', 'CASE STATE THIS TURN')).toEqual([
      { type: 'text', text: 'FIXED', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'CASE STATE THIS TURN' },
    ]);
  });

  it('sends only the fixed block when there is no turn state', () => {
    expect(buildSystemBlocks('FIXED')).toHaveLength(1);
  });
});
