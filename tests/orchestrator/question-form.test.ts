// Task 57 (round 5b): the held-question rule detects question form, not "?".
// Voice STT often drops the "?" (22% of the candidate's turns in the voice exports).
import { describe, it, expect } from 'vitest';
import { isQuestionForm, isQuestionSentence } from '@/lib/orchestrator/stall';
import { matchAskDetections } from '@/lib/orchestrator/request-signal';

describe('isQuestionForm', () => {
  it.each([
    'Do we have information about total sales or pricing.',
    'So what was the suite',
    'What am I doing',
    'Would you be able to summarize the the information I have so far that you revealed',
    'Is there a breakdown of COGS?',
  ])('question form: %s', s => expect(isQuestionForm(s)).toBe(true));

  it.each([
    'So what we need to look at is the revenue and costs.',
    'and where I would start is COGS, um, because, yeah, I think that would...',
    'could be things like COGS, things like labor costs, as well as...',
    'and do it very slowly and gradually rather than hiking up the prices immediately, um, as that could really anger the customers and and lose us some loyalty.',
    'And in addition to that, I would like to see how COGS has been changing in the past two years.',
    'What would make me change course: one, pilot elasticity above that threshold; two, competitors confirmed to be holding prices.',
    'Maybe buy in bulk, or lock in a price?',
  ])('not a question: %s', s => expect(isQuestionForm(s)).toBe(false));

  it('isQuestionSentence still needs the "?"', () => {
    expect(isQuestionSentence('So what was the suite')).toBe(false);
  });
});

describe('matchAskDetections, held branch without "?"', () => {
  const detection = { what: 'total sales', ledgerItemIds: ['sales_total'] };
  const mk = (text: string) => ({ text, isHeld: () => true, itemNames: () => ['total sales'], caseNames: ['Brew & Bean'] });
  it('keeps a held item named in a question with no "?"', () => {
    expect(matchAskDetections([], [detection], mk('Do we have information about total sales or pricing.')).kept).toEqual([detection]);
  });
  it('drops the same words as a statement', () => {
    expect(matchAskDetections([], [detection], mk('And in addition to that, we know total sales or pricing matter.')).kept).toEqual([]);
  });
});
