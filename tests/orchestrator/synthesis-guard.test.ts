import { describe, it, expect } from 'vitest';
import { suppliesRecommendation, SYNTHESIS_NARROW_SCRIPTS } from '@/lib/orchestrator/synthesis-guard';

// Rule 13 synthesis cap: the interviewer may narrow the frame but never supply
// the recommendation. Verbatim lines from the persona runs.
describe('suppliesRecommendation', () => {
  const supplied = [
    // Batch 6, Maya 19:42
    "Here's the shape, in plain words: raise menu prices, since they haven't moved while input costs rose. Pair that with supplier negotiation and a mix shift. Test the price move first, watching traffic closely. Can you repeat that back to me in your own words?",
    // Batch 6, Maya 19:38 — generated, then displaced by the time warning
    'Let me hand you the first sentence: "I recommend raising menu prices, because costs are up and prices haven\'t moved in two years." Now finish it: what\'s the risk, and what would you do about it?',
    // Batch 2, Maya
    'The direct lever is menu prices. What would you tell the CEO?',
  ];
  for (const text of supplied) {
    it(`catches: ${text.slice(0, 60)}…`, () => expect(suppliesRecommendation(text)).toBe(true));
  }

  const legitimate = [
    "What's your recommendation to the CEO?",
    "Let's simplify. Prices haven't changed in two years while input costs have risen. If you were the CEO, what would you do with menu prices, and what would worry you about it?",
    'Understood. I\'ll put it plainly: the data shows menu prices unchanged while input costs rose. If you could only pull one lever on that gap, which would it be, and why?',
    'Okay. In one or two sentences, start with "I recommend" and use your own words from earlier.',
    "What's the biggest risk to that recommendation, and how would you test for it?",
    'Raw coffee bean costs are up 40% over the past two years. With that, and everything else on the table, what would you tell the CEO to do first?',
    "We're near time. What's your bottom-line recommendation to the CEO?",
  ];
  for (const text of legitimate) {
    it(`keeps: ${text.slice(0, 60)}…`, () => expect(suppliesRecommendation(text)).toBe(false));
  }
});

describe('SYNTHESIS_NARROW_SCRIPTS', () => {
  it('are themselves clean narrowing questions', () => {
    for (const line of SYNTHESIS_NARROW_SCRIPTS) {
      expect(line).toMatch(/\?$/);
      expect(suppliesRecommendation(line)).toBe(false);
    }
  });
});
