import { describe, it, expect } from 'vitest';
import { dropTrailingQuestions } from '@/lib/orchestrator/data-requests';

// Live run eca39ec7, 4:40: the model ended its turn with "What specifically do
// you want on beans?", then the orchestrator appended the forced release and
// "What's your bottom-line recommendation to the CEO?" — two questions, the
// first left hanging. When the scripted recommendation ask is appended, the
// model's trailing question is superseded.
describe('dropTrailingQuestions', () => {
  it('drops the trailing question the scripted recommendation ask supersedes', () => {
    expect(dropTrailingQuestions("I don't have the itemized COGS breakdown. But I can speak to bean costs. What specifically do you want on beans?"))
      .toBe("I don't have the itemized COGS breakdown. But I can speak to bean costs.");
  });

  it('drops several consecutive trailing questions', () => {
    expect(dropTrailingQuestions('Okay. Which lever? And why?')).toBe('Okay.');
  });

  it('keeps questions that are not at the end, and text with no questions', () => {
    expect(dropTrailingQuestions('Why that one? Understood.')).toBe('Why that one? Understood.');
    expect(dropTrailingQuestions('Understood.')).toBe('Understood.');
  });

  it('returns empty when the turn was only a question', () => {
    expect(dropTrailingQuestions('Which bucket first?')).toBe('');
  });
});
