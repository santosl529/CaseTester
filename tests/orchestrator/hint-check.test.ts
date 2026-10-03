import { describe, it, expect } from 'vitest';
import { buildHintCheckPrompt, parseHintCheck } from '@/lib/orchestrator/hint-check';
import { classifyRungDelivery } from '@/lib/orchestrator/stall';

describe('hint check (round-3 fix 6)', () => {
  it('parses the verdict and rejects junk', () => {
    expect(parseHintCheck('{"hint": true, "reason": "narrows to three buckets"}')).toEqual({ hint: true, reason: 'narrows to three buckets' });
    expect(parseHintCheck('{"hint":"yes"}')).toBeNull();
    expect(parseHintCheck('nope')).toBeNull();
  });

  it('describes the level and carries both turns', () => {
    const p = buildHintCheckPrompt(2, "I don't know.", 'What are the two ways a margin can fall?');
    expect(p).toMatch(/Level 2 hint/);
    expect(p).toMatch(/narrows the problem/);
    expect(p).toContain("I don't know.");
  });

  it('only question-based deliveries need the model check', () => {
    expect(classifyRungDelivery(1, 'Take your time. The question on the table is why margins fell.', { dataReleased: false, exhibitShown: false })?.basis).toBe('cue');
    expect(classifyRungDelivery(1, 'Stay with it. Which do you want to see first?', { dataReleased: false, exhibitShown: false })?.basis).toBe('question');
    expect(classifyRungDelivery(3, 'COGS is 58% of revenue today.', { dataReleased: true, exhibitShown: false })?.basis).toBe('release');
  });
});
