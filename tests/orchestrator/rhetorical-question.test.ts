// Lorenzo, 14 Oct (batch-24 ruling 4): the close never answers a rhetorical
// question with data. Sofia 84910bd6 t25 thought aloud — "First I'd want to
// know what kind of drop it is. Is it transaction count falling, or is the same
// customer buying less…? Those need different responses." — and the goodbye
// read out the average ticket. Only the close reads a question so (Lorenzo,
// 15 Oct): mid-case it stays a real ask.
import { describe, it, expect } from 'vitest';
import { addressedAskSentences } from '@/lib/orchestrator/request-signal';

const CLOSE = { closing: true };
const SOFIA = "First I'd want to know what kind of drop it is. Is it transaction count falling, or is the same customer buying less — dropping the pastry, skipping the upsize? Those need different responses. A ticket-size drop I can fix with bundling. A transaction drop means customers walked.";

describe('a rhetorical question is no ask', () => {
  it('Sofia t25', () => expect(addressedAskSentences(SOFIA, 'RECOMMENDATION', CLOSE)).toEqual([]));
  it('a question set up as their own, then answered', () => {
    expect(addressedAskSentences("First I'd want to know what kind of drop it is. Is it transaction count falling? A transaction drop means customers walked.", 'RECOMMENDATION', CLOSE)).toEqual([]);
  });
  it('an either/or the candidate goes on to answer herself', () => {
    expect(addressedAskSentences('Is the margin drop chain-wide, or concentrated in a few stores? My guess is chain-wide, given flat labor.', 'RECOMMENDATION', CLOSE)).toEqual([]);
  });
});

describe('real asks are still answered', () => {
  it.each([
    'What was the store count two years ago?',
    "What was the store count two years ago? I'm trying to size how much of the growth is new stores.",
    'Do we have transaction counts by year, or only the average ticket? That would settle it.',
    'Is the margin drop chain-wide, or concentrated in a few stores?',
  ])('%s', text => expect(addressedAskSentences(text, 'RECOMMENDATION', CLOSE).length).toBeGreaterThan(0));
});

describe('mid-case, an either/or or self-framed question is still an ask', () => {
  it.each([
    "Is it the bean price, or the dairy price? I'd guess beans.",
    'Is the COGS increase coming from beans, or from dairy? I\'d guess beans.',
    'Is the margin drop chain-wide, or concentrated in a few stores? My guess is chain-wide, given flat labor.',
    SOFIA,
  ])('%s', text => {
    expect(addressedAskSentences(text, 'ANALYSIS').length).toBeGreaterThan(0);
    expect(addressedAskSentences(text, 'RECOMMENDATION').length).toBeGreaterThan(0);
  });
});
