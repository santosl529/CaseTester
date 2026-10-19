import { describe, it, expect } from 'vitest';
import { heldItemFeedback, heldStepFeedback, type StepFeedback } from '@/lib/drills/sets/feedback';

describe('feedback at the end of the set (held feedback)', () => {
  const step: StepFeedback = {
    type: 'single_choice', correct: true, your_answer: 'B', correct_answer: 'B', feedback: 'Right: it names one cause.', correct_option_id: 'b',
  };

  it('keeps the student\'s answer and drops every verdict and key', () => {
    const held = heldStepFeedback(step);
    expect(held).toEqual({ type: 'single_choice', correct: false, correct_option_id: null, your_answer: 'B', correct_answer: '', feedback: '', held: true });
  });

  it('keeps what the next step needs: the new fact, the follow-up and QN-5\'s drivers', () => {
    const drivers = [{ id: '1', text: 'Households' }];
    const held = heldStepFeedback({ ...step, reveal: 'Prices rose 10%.', followup: { type: 'justify', text: 'Why?' }, drivers, correct_answer: 'Households' });
    expect(held.reveal).toBe('Prices rose 10%.');
    expect(held.followup?.text).toBe('Why?');
    expect(held.drivers).toEqual(drivers);
    expect(held.correct_answer).toBe('Households');
    expect(held.correct).toBe(false);
    expect(held.feedback).toBe('');
  });

  it('holds a whole item: no score, mistakes, explanation or model answer', () => {
    const held = heldItemFeedback({ skipped: false, timed_out: true });
    expect(held).toEqual({ done: true, correct: false, score: 0, skipped: false, timed_out: true, steps: [], mistakes: [], explanation: '', held: true });
  });
});
