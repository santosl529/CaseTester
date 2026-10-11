// Rule 18A (round-3): the candidate can stop. Positives are Cole's and
// Victor's batch-18 lines; the negatives are what must never end a case.
import { describe, it, expect } from 'vitest';
import { classifyExitIntent, isBareSignOff, isRefusalToStart, exitReplyChoice } from '@/lib/orchestrator/candidate-exit';

describe('explicit requests to stop', () => {
  it.each([
    "So blended, COGS inputs up maybe 38%... but — honestly can we just stop, this isn't going well. I don't think I'm getting anywhere useful with this.", // Cole t7
    "That's about all I have. Can we end it here? I'd rather just read the written feedback.",                                                          // Cole t9
    "That's genuinely all I have. Can we call it here?",                                                                                                  // Cole t15
    "That's really all I've got. I'd like to stop here.",
    'Ending it here. Good luck with the rest of the testing.',                                                                                             // Victor t19
    "I'm fine — appreciate you asking.\n\nBut no, let's stop here. That's my preference.",                                                                 // Victor t39
    'Please end the session.',
    "I'm done with the interview.",
    'I want to stop.',
  ])('%s', text => {
    expect(classifyExitIntent(text).kind).toBe('stop');
  });
});

describe('never an exit', () => {
  it.each([
    "Let's move on to costs.",
    'Give me a sec.',
    "Give me a second to think — I'm stuck on the conversion.",
    'Can we stop and look at revenue first?',
    "Let's stop on costs for a moment and check volume.",
    "Can we pause for a sec? I need to grab water.",
    "OK so 25% of 42 is 10.5, and up 40% that's 4.2 points. I'm done.",          // "I'm done" after a calculation
    "That's it from me on the brainstorm — mix shift, loyalty, and supplier contracts. Thanks.",
    "I'd stop discounting and raise prices.",
    "The CEO should stop the expansion and end the loyalty program.",
    "I'm going to stop responding to that question now, since my answer won't change.",
    "Thanks.",
  ])('%s', text => {
    expect(classifyExitIntent(text).kind).toBe('none');
  });
});

describe('ambiguous sign-offs (clarified once)', () => {
  it.each(['Done here.', 'It won\'t. Done here.', 'No. Goodbye.', 'Goodbye.', 'Nothing further from me.', "I'm done.", "That's all I have. Thanks."])('%s', text => {
    expect(classifyExitIntent(text).kind).toBe('ambiguous');
    expect(isBareSignOff(text)).toBe(true);
  });

  it('a goodbye next to case work is not a bare sign-off', () => {
    expect(isBareSignOff('Raise prices 8%, hedge beans. Goodbye.')).toBe(false);
    expect(isBareSignOff('Goodbye? Is that it?')).toBe(false);
  });
});

describe('refusing to start the case', () => {
  it.each([
    "On structure: I'd rather not perform one.",
    "I'll be straight with you: I'm not going to work the case.",
    'Still a no.', 'No.', 'Acknowledged. My answer stands.', 'No change.',
  ])('%s', text => {
    expect(isRefusalToStart(text)).toBe(true);
  });

  it.each([
    "No, I think costs are the driver, so I'd start there.",
    "I won't know until I see the cost breakdown.",
    'Not sure yet — revenue and costs?',
  ])('not a refusal: %s', text => {
    expect(isRefusalToStart(text)).toBe(false);
  });
});

describe('the reply to "Do you want to stop the interview here?"', () => {
  it.each([
    ['Yes.', 'stop'], ['Yes please.', 'stop'], ['No — I\'ll leave it there.', 'stop'], ['Goodbye.', 'stop'],
    ['No.', 'continue'], ['No, let\'s keep going.', 'continue'], ['Not yet — give me a minute.', 'continue'],
    ['Okay so costs: COGS went from 42 to 58.', 'continue'],
  ] as const)('%s → %s', (text, choice) => {
    expect(exitReplyChoice(text)).toBe(choice);
  });
});
