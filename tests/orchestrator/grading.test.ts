import { describe, it, expect } from 'vitest';
import { isGradingSentence, gradingRemainder } from '@/lib/orchestrator/grading';

// Rule 1: acknowledge, probe, never grade mid-case. Lines from batch 19
// (Haiku 5.5) and batch 18 v3 (Sonnet 5.5), read by hand (12 Oct).
describe('isGradingSentence', () => {
  it.each([
    'Clear structure, with revenue and cost branches.',
    'Clear split between revenue and cost, with the fixed-variable cut underneath.',
    'Clear objective, and a sensible split between revenue and cost.',
    'Clear decomposition.',
    'A clean split, and the below-the-line point is a good one.',
    'Good, that\'s a clear cost split.',
    'That\'s a clear way in.',
    'Your test design is sound.',
    'Your bean math holds up, and it leaves about 11.8 points of COGS increase to explain.',
    'Your reconciliation holds.',
    'The reconciliation ties out.',
    'The 58% reconciles with the data.',
    'Both bases check out, and the cost lines do sum to the decline.',
    'Good catch on the spend-versus-price question.',
    'You\'ve given three ways the structure could break, and the store-level distribution point is strong.',
    'Costs growing faster than revenue is the right direction.',
    'Your split accounts for the full 16 points, with beans around 4 and other inputs around 12.',
    'Your aggregate closes the gap, but your 37.5% was applied to all non-bean COGS.',
    'Right, the gap now reconciles.',
    'Understood, the conversion holds and the exhibit matches it.',
    'A two-year grind, read cleanly.',
    'That\'s correct.',
    'Exactly right.',
  ])('grades: %s', s => expect(isGradingSentence(s)).toBe(true));

  it.each([
    // bare acknowledgments stay allowed
    'Right.', 'Understood.', 'Mm-hm.', 'Got it.', 'Okay, got it.',
    // neutral summaries of what the candidate did
    'A cost-first split, then revenue quality.',
    'Three buckets, with revenue quality and cost structure at the core.',
    'You\'ve got a root cause in pricing.',
    // questions and probes that only mention a verdict word
    'Is that split MECE, or is anything missing from your cost tree?',
    'Walk me through how you got there, and whether that holds once you factor in the overhead line.',
    'Suppose the pilot shows a 5% traffic loss but a clear margin gain.',
    'Walk me through why cost-per-dollar would scale that cleanly, and what the non-bean price change does to the remaining 11.8 points.',
    'Check that your bridge adds up before you rely on it.',
    // restating the candidate's claim
    'Before we go further, you said COGS moved 19 points and that accounts for the entire 18-point decline.',
    'You said a 10% price increase would recover most of the 18 points if volume holds.',
    'You\'ve said a straight price increase isn\'t the right call.',
    // doubt, not praise
    'That\'s a strong assumption.',
    'It\'s not clear how you got from 42 to 61.',
    'That doesn\'t add up to the 16 points.',
    // data talk and flat corrections (Rule 6)
    'COGS shows a sharp rise over the two years.',
    'The correct figure is 58%, not 61%.',
    'It\'s closer to 16, not 38.',
    // the interviewer conceding its own slip
    'You\'re right, that was a repeat and I\'m sorry for it.',
    // replay over batches 12–19 (12 Oct): a probe after a connective, the
    // interviewer conceding its own delivery failure, a restatement
    'Then walk me through how COGS, labor and overhead add up to the margin decline.',
    'You\'re right, they didn\'t come through.',
    'You\'re right, the figures never reached you.',
    'You\'re right, there\'s nothing for you to react to yet.',
    'You reconciled that growth against COGS going from the low forties to the high fifties as a share of revenue.',
    // other conduct
    'That\'s fine, take your time.',
    'Thanks for telling me that.',
  ])('does not grade: %s', s => expect(isGradingSentence(s)).toBe(false));
});

// In the question, a grade that only sets up a challenge ("X holds, but …")
// keeps the challenge; anything else is withheld whole.
describe('gradingRemainder', () => {
  it('keeps the challenge after ", but"', () => {
    expect(gradingRemainder('Your aggregate closes the gap, but your 37.5% was applied to all non-bean COGS.'))
      .toBe('Your 37.5% was applied to all non-bean COGS.');
  });
  it.each([
    'Your bean math holds up, and it leaves about 11.8 points of COGS increase to explain.',
    'Your bean and non-bean split accounts for all of COGS, so the input-price story holds up.',
    'Clear structure, but a sensible one.',
  ])('withholds the whole sentence otherwise: %s', s => expect(gradingRemainder(s)).toBeNull());
});
