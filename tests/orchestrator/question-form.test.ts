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

// Final review I4 (f0fbaf8..5f73bc8): recall on common data asks, and two statements
// read as questions. what's/where's/how's + a determiner or noun; a wh-word + auxiliary
// + a determiner or noun; how much / how long only when inverted (no subject pronoun
// before the auxiliary). A pseudo-cleft ("What was clear is…", "What's driving it is…")
// stays a statement.
describe('final review I4: question form', () => {
  it.each([
    "What's the revenue",
    "What's driving margin",
    'What was revenue in 2024',
    'How did sales change',
    'Is the revenue growing',
    "Where's the cost data",
    'So whats the margin trend',
    'How much does it cost per bag',
    'How long will the contracts run',
    'How much revenue did they make last year',
    'What does COGS include',
  ])('question form: %s', s => expect(isQuestionForm(s)).toBe(true));

  it.each([
    'How much we charge will decide it.',
    'How long it takes depends on the contracts.',
    'What was clear is that margins fell.',
    "What's driving margin is the bean cost.",
    "What's interesting is the labor line.",
    "What's more, the margins fell.",
    // b28–b35 candidates' own (scanned over 39,177 sentences): a pseudo-cleft with a colon.
    "What's missing: product and channel mix.",
    "What's driving a 16-point COGS jump: either input cost inflation — green coffee and dairy have both spiked — or they haven't raised menu prices to pass it through.",
    'Had the prices risen, volume would have dropped.',
    'Do the math on the stores first.',
  ])('not a question: %s', s => expect(isQuestionForm(s)).toBe(false));
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
