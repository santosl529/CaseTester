import { describe, it, expect } from 'vitest';
import { candidateSystem, personaDataAsk } from '@/lib/eval/simulator-prompt';

describe('simulated candidate prompt by case', () => {
  it('prof-001 keeps the exact wording batches 18–21 ran with', () => {
    expect(candidateSystem('prof-001')).toContain("you know profitability frameworks");
    expect(candidateSystem('prof-001')).toContain("In a profitability case you'd naturally want things like the cost breakdown, what's inside the biggest cost line, whether menu prices changed, ticket size, and volume.");
    expect(personaDataAsk('prof-001')).toBe('ask for one piece of data a profitability case like this would plausibly hold but that an interviewer might skip past (e.g. menu-price history, transaction volume, or a split of the biggest cost line)');
  });

  it.each(['prof-002', 'entry-001', 'pricing-001', 'launch-001'])('%s gets a case-neutral version', id => {
    const text = `${candidateSystem(id)} ${personaDataAsk(id)}`;
    expect(text).not.toMatch(/menu|profitability|cost line|ticket size|coffee/i);
    expect(candidateSystem(id)).toContain('When you need a number, ask for it explicitly');
  });
});
