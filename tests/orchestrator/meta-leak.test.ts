import { describe, it, expect } from 'vitest';
import { stripMetaLeak } from '@/lib/orchestrator/audit';

describe('stripMetaLeak', () => {
  it('strips the exact leak from the live run, keeping the real question', () => {
    const leaked =
      "The candidate has anchored on pricing lag. Let me pressure it once before moving on. You attribute the gap to pricing not keeping up, but we have no pricing data. What alternative explanation could produce the same 16 points, and how would you rule it out?";
    const { cleaned, strippedSentences } = stripMetaLeak(leaked);
    expect(strippedSentences).toHaveLength(2);
    expect(cleaned).toBe(
      "You attribute the gap to pricing not keeping up, but we have no pricing data. What alternative explanation could produce the same 16 points, and how would you rule it out?",
    );
  });

  it('strips third-person references to the candidate', () => {
    const { cleaned } = stripMetaLeak("The candidate is overconfident here. What would you check next?");
    expect(cleaned).toBe('What would you check next?');
  });

  it('leaves legitimate interviewer speech untouched', () => {
    const clean = "Okay. Walk me through that calculation.";
    expect(stripMetaLeak(clean)).toEqual({ cleaned: clean, strippedSentences: [] });
  });

  it('does not strip legitimate "let me show/give you" phrasing', () => {
    const clean = "Let me show you the cost structure. What do you make of it?";
    expect(stripMetaLeak(clean).strippedSentences).toHaveLength(0);
  });

  it('never blanks a turn even if every sentence looks meta', () => {
    const allMeta = "Let me probe this. The candidate is stalling.";
    const { cleaned, strippedSentences } = stripMetaLeak(allMeta);
    expect(cleaned).toBe(allMeta);
    expect(strippedSentences).toHaveLength(0);
  });

  it('strips leaked internal jargon', () => {
    const { cleaned } = stripMetaLeak("Time for a directive rescue. What are the two ways a margin falls?");
    expect(cleaned).toBe('What are the two ways a margin falls?');
  });
});
