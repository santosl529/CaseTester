// Round 5c Task 63 (Lorenzo's ruling 4): the "?"-dependent checks on candidate text that gate
// asks and stages read the question FORM too — voice STT drops the "?" (22% of the candidate's
// turns in the 17-19 Oct exports). Sentences verbatim from those exports.
import { describe, it, expect } from 'vitest';
import { classifyTurn, evaluateStall, INITIAL_STALL_STATE } from '@/lib/orchestrator/stall';
import { isQuestionForm } from '@/lib/orchestrator/stall';
import { asksAboutAssessment } from '@/lib/orchestrator/spoken-close';
import { addressedAskSentences } from '@/lib/orchestrator/request-signal';

const UNPUNCTUATED = [
  'Do we have information about total sales or pricing.',
  'So what was the suite',
  'What am I doing',
  'Would you be able to summarize the the information I have so far that you revealed',
];
const STATEMENTS = [
  'So what we need to look at is the revenue and costs.',
  'could be things like COGS, things like labor costs, as well as the rest of the overhead.',
  'and do it very slowly and gradually rather than hiking up the prices immediately, um, as that could really anger the customers and and lose us some loyalty.',
  'How much we charge will decide it.',
];

describe('classifyTurn reads the question form (stall / clarify counts)', () => {
  it.each(UNPUNCTUATED.slice(1))('an unpunctuated question-only turn is a question: %s', t => {
    expect(classifyTurn(t, null).kind).toBe('question');
  });
  it('an unpunctuated data ask is a data request', () => {
    expect(classifyTurn(UNPUNCTUATED[0], null).kind).toBe('data_request');
    expect(classifyTurn('What was revenue in 2024', null).kind).toBe('data_request');
  });
  // (the "um" statement reads as a hedge by HEDGE_PATTERN, unrelated to the "?": it must not be a question)
  it.each(STATEMENTS)('a statement is not a question-only turn: %s', t => {
    expect(classifyTurn(t, null).kind).not.toBe('question');
  });
  it.each(STATEMENTS.filter(t => !/\bum\b/.test(t)))('a statement is analysis: %s', t => {
    expect(classifyTurn(t, null).kind).toBe('analysis');
  });
  it('a question after a substantive statement is not question-only', () => {
    expect(classifyTurn('I think the price rise is the main driver here. What am I missing', null).kind).toBe('analysis');
  });
  it('the clarify budget counts unpunctuated questions', () => {
    let state = { ...INITIAL_STALL_STATE };
    for (const t of ['What am I doing', 'So what was the suite']) state = evaluateStall(t, 'CLARIFY', state).state;
    expect(state.consecutiveClarify).toBe(2);
  });
});

describe('addressedAskSentences reads the question form (ask detection)', () => {
  it('an unpunctuated data question is an ask', () => {
    expect(addressedAskSentences('So what was the revenue last year', 'ANALYSIS')).toEqual(['So what was the revenue last year']);
    expect(addressedAskSentences('Do we have information about total sales or pricing.', 'ANALYSIS')).toHaveLength(1);
  });
  it('a want-cue sentence in question form is an ask outside the ask phases', () => {
    expect(addressedAskSentences("Is there something else I'd want to know about the clients", 'RECOMMENDATION')).toHaveLength(1);
  });
  it.each(STATEMENTS)('a statement is no ask: %s', t => {
    expect(addressedAskSentences(t, 'ANALYSIS')).toEqual([]);
  });
  it('the close keeps a question followed only by another unpunctuated question', () => {
    const t = 'Is the margin drop chain-wide, or concentrated in a few stores. What was the store count two years ago';
    expect(addressedAskSentences(t, 'RECOMMENDATION', { closing: true })).toHaveLength(2);
  });
  it('the close reads an unpunctuated self-question as rhetorical', () => {
    const t = "First I'd want to know what kind of drop it is. Is it transaction count falling, or is the same customer buying less. Those need different responses.";
    expect(addressedAskSentences(t, 'RECOMMENDATION', { closing: true })).toEqual([]);
    expect(addressedAskSentences(t, 'RECOMMENDATION').length).toBeGreaterThan(0);
  });
});

describe('asksAboutAssessment reads the question form (report hand-off)', () => {
  it.each(['How am I doing', 'How did I do', 'So how am I doing on this'])('asks: %s', t => expect(asksAboutAssessment(t)).toBe(true));
  it('a statement is no ask', () => {
    expect(asksAboutAssessment('I did my best on that one.')).toBe(false);
    expect(asksAboutAssessment('How I did it was fine, I would say.')).toBe(false);
  });
});

describe('question-shaped statements without a "?" (Review Focus 4)', () => {
  const SELF = [
    'Is the price the main driver here, I would say yes because volume is flat and costs are up.',
    'Do we know the margin is falling because of costs, I would assume so and move on to pricing.',
  ];
  const CLEFT = 'What do we do about the cost of beans is raise prices.';
  it.each([...SELF, CLEFT])('is no question and no ask: %s', t => {
    expect(isQuestionForm(t)).toBe(false);
    expect(addressedAskSentences(t, 'ANALYSIS')).toEqual([]);
    expect(classifyTurn(t, null).kind).not.toBe('question');
    expect(classifyTurn(t, null).kind).not.toBe('data_request');
  });
  it('"Can we assume ..." stays a question (an ask for confirmation)', () => {
    expect(isQuestionForm('Can we assume the market is growing and look at the share of the client instead.')).toBe(true);
  });
  it('questions with an if-clause or a plain wh stay questions', () => {
    expect(isQuestionForm('What do we do if the price is 5')).toBe(true);
    expect(isQuestionForm('Is the price the main driver here')).toBe(true);
  });
});
