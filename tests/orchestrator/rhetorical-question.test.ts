// Lorenzo, 14 Oct (batch-24 ruling 4): the close never answers a rhetorical
// question with data. Sofia 84910bd6 t25 thought aloud — "First I'd want to
// know what kind of drop it is. Is it transaction count falling, or is the same
// customer buying less…? Those need different responses." — and the goodbye
// read out the average ticket.
import { describe, it, expect } from 'vitest';
import { addressedAskSentences } from '@/lib/orchestrator/request-signal';

const SOFIA = "First I'd want to know what kind of drop it is. Is it transaction count falling, or is the same customer buying less — dropping the pastry, skipping the upsize? Those need different responses. A ticket-size drop I can fix with bundling. A transaction drop means customers walked.";

describe('a rhetorical question is no ask', () => {
  it('Sofia t25', () => expect(addressedAskSentences(SOFIA, 'RECOMMENDATION')).toEqual([]));
  it('a question set up as their own, then answered', () => {
    expect(addressedAskSentences("First I'd want to know what kind of drop it is. Is it transaction count falling? A transaction drop means customers walked.", 'RECOMMENDATION')).toEqual([]);
  });
  it('an either/or the candidate goes on to answer herself', () => {
    expect(addressedAskSentences('Is the margin drop chain-wide, or concentrated in a few stores? My guess is chain-wide, given flat labor.', 'RECOMMENDATION')).toEqual([]);
  });
});

describe('real asks are still answered', () => {
  it.each([
    'What was the store count two years ago?',
    "What was the store count two years ago? I'm trying to size how much of the growth is new stores.",
    'Do we have transaction counts by year, or only the average ticket? That would settle it.',
    'Is the margin drop chain-wide, or concentrated in a few stores?',
  ])('%s', text => expect(addressedAskSentences(text, 'RECOMMENDATION').length).toBeGreaterThan(0));
});
