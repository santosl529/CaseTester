import { describe, it, expect } from 'vitest';
import {
  isClosingTurn, stageAdministration, stageGateOpen, chooseBlockedCloseProbe,
  type StageAdministration,
} from '@/lib/orchestrator/spoken-close';
import { CLOSE_SCRIPTS, GRACE_ASK_SCRIPTS, TIME_WARNING_SCRIPTS } from '@/lib/agent/prompts/scripts';

// Run 1d76e3d9: the model said this at 15:33 of a 20-minute case without
// calling end_case, and the session looped on goodbyes until time-up.
const DEREK_CLOSE = "That's time. Thanks for working through it — you'll get a full written report with detailed feedback rather than a debrief now.\n\nI'll close the case here.";
// Batch 2, Maya c6076209: goodbyes the narrow v4.2 pattern missed.
const MAYA_18_08 = "That's a recommendation. You'll get a full written report afterward.";
const MAYA_19_41 = "That's your recommendation. The full written report will follow. Thanks for your time today.";

const NONE_RUN: StageAdministration = { brainstormAsked: false, riskAsked: false, recommendationAsked: false, recommendationAskCount: 0, recommendationReceived: false };

describe('isClosingTurn (Rule 12 v4.6: wider goodbye detector)', () => {
  it('recognizes explicit closes, including the batch-2 ones', () => {
    for (const t of [DEREK_CLOSE, MAYA_18_08, MAYA_19_41, "That's the case. Thanks again.", "We're out of time, so we'll stop there.",
      "Time's up here. Take care.", "That's a good place to stop.", "That's all for today."]) {
      expect(isClosingTurn(t), t).toBe(true);
    }
  });

  it('does not treat mid-case thanks, warnings or meta-answers as a close', () => {
    for (const t of ['Thanks for walking me through that. What drives the COGS increase?',
      "Thanks for working through the math. Now let's look at costs.",
      "We're near time. What's your recommendation?",
      "You'll get a full written report afterward — for now, back to your structure.",
      "You'll get a full written report afterward. Let's keep to the case.",
      ...TIME_WARNING_SCRIPTS, ...GRACE_ASK_SCRIPTS]) {
      expect(isClosingTurn(t), t).toBe(false);
    }
  });

  // Batch 5, Claire 8dce6c0b: two goodbyes the detector missed — each was
  // followed by more questions.
  it('recognizes "we\'ll leave it there" and "the case is complete"', () => {
    for (const t of ["Okay, that's fine. We'll leave it there.",
      "Understood. We'll leave the recommendation there, and the case is complete.",
      'That completes the case.']) {
      expect(isClosingTurn(t), t).toBe(true);
    }
  });

  it('does not close on leaving one topic to move to another', () => {
    for (const t of ["We'll leave pricing there for now. What about costs?",
      "Let's leave it there and look at the exhibit.",
      "We'll leave the brainstorm there. What's your recommendation to the CEO?"]) {
      expect(isClosingTurn(t), t).toBe(false);
    }
  });

  it('recognizes its own close scripts', () => {
    for (const s of CLOSE_SCRIPTS) expect(isClosingTurn(s), s).toBe(true);
  });
});

describe('stage administration and the end gate', () => {
  const interviewer = [
    'Walk me through your structure.',
    'Still with me? Take your time. The question on the table: beyond a price increase, what else could the client do to protect margin?',
  ];

  it("reads Maya's 16:02 brainstorm as administered", () => {
    expect(stageAdministration(interviewer, true)).toMatchObject({ brainstormAsked: true, riskAsked: false });
  });

  it('opens only once the recommendation is in and brainstorm + risk were run', () => {
    expect(stageGateOpen(stageAdministration(interviewer, true))).toBe(false);
    expect(stageGateOpen(stageAdministration([...interviewer, "What's the biggest risk to that recommendation?"], true))).toBe(true);
    expect(stageGateOpen(stageAdministration([...interviewer, "What's the biggest risk to that recommendation?"], false))).toBe(false);
  });

  it('opens without a recommendation once it was asked for twice and refused (Maya, batch 3)', () => {
    const asks = [...interviewer, "Pull it together — what's your recommendation to the CEO?", 'What would you tell the CEO to do?'];
    expect(stageGateOpen(stageAdministration(asks.slice(0, 3), false))).toBe(false);
    expect(stageGateOpen(stageAdministration(asks, false))).toBe(true);
  });

  it('chooses the probe by what was not administered: brainstorm, recommendation, then risk', () => {
    expect(chooseBlockedCloseProbe(NONE_RUN)).toBe('brainstorm');
    expect(chooseBlockedCloseProbe({ ...NONE_RUN, brainstormAsked: true })).toBe('recommendation');
    expect(chooseBlockedCloseProbe({ ...NONE_RUN, brainstormAsked: true, recommendationReceived: true })).toBe('risk');
  });
});

describe('endAllowed', async () => {
  const { endAllowed } = await import('@/lib/orchestrator/spoken-close');
  const noAsk = { ...NONE_RUN, brainstormAsked: true };
  it('coverage alone cannot end the case before the recommendation is asked', () => {
    expect(endAllowed({ coverageMayEnd: true, timeUp: false, stageGate: false, stages: noAsk })).toBe(false);
  });
  it('coverage can end it once the recommendation was asked or given', () => {
    expect(endAllowed({ coverageMayEnd: true, timeUp: false, stageGate: false, stages: { ...noAsk, recommendationAsked: true, recommendationAskCount: 1 } })).toBe(true);
    expect(endAllowed({ coverageMayEnd: true, timeUp: false, stageGate: false, stages: { ...noAsk, recommendationReceived: true } })).toBe(true);
  });
  it('time-up and the stage gate still end it', () => {
    expect(endAllowed({ coverageMayEnd: true, timeUp: true, stageGate: false, stages: noAsk })).toBe(true);
    expect(endAllowed({ coverageMayEnd: false, timeUp: false, stageGate: true, stages: noAsk })).toBe(true);
  });
});

describe('recommendation ask detection (batch 5–6 phrasings)', () => {
  it('counts "what is your recommendation" and "give me your recommendation"', () => {
    const s = stageAdministration([
      'Okay. The CEO is waiting on your answer: what is your recommendation, and how would you sequence it?',
      'Now give me your recommendation to the CEO: what should Brew & Bean do?',
    ], false);
    expect(s.recommendationAskCount).toBe(2);
  });
});

describe('recommendation ask detection — "what would you recommend" (batch 13 phrasings)', () => {
  const positives = [
    'Okay. So what would your recommendation be, and what would you tell them to do first?',
    'Good. Given all that, what would you recommend, and which of those levers would you pull first?',
    "What would you recommend Brew & Bean do first, and what's the plan?",
    'What would you recommend?',
    'What would you recommend the company do?',
    'What would you recommend she do about the margin decline?',
    'What would you recommend — what should they do?',
    'What would you recommend.',
    // Fix round 1: a short tail after a separator is still the whole ask.
    'What would you recommend, then?',
    'What would you recommend, Maya?',
    'What would you recommend, given all that?',
    'What would you recommend — and why?',
    'What would you recommend. Take a moment.',
  ];
  const negatives = [
    'What would you recommend we look at next in the data?',
    'What data would you recommend pulling?',
    'Which test would you recommend to check the bean assumption?',
    'What would you recommend we do to size the market?',
    // Follow-up 9 Oct: "… to do" / "… looking at" / "in terms of" / "as the
    // next" are analysis questions, and a bare comma must not let a
    // "data-wise" aside through.
    'What would you recommend looking at to do the sizing?',
    'What would you recommend to do the sizing?',
    'What would you recommend in terms of analysis to do next?',
    'What would you recommend as the next analysis to do?',
    'What would you recommend, data-wise, to look at next?',
    // Fix round 1: any separator, not just the comma, can introduce an analysis question.
    'What would you recommend — which analysis should we run next?',
    'What would you recommend: should we look at costs or revenue first?',
    'What would you recommend, to do next?',
  ];

  it('counts each real recommendation ask', () => {
    for (const t of positives) expect(stageAdministration([t], false).recommendationAskCount, t).toBe(1);
    expect(stageAdministration(positives, false).recommendationAskCount).toBe(positives.length);
  });

  it('does not count analysis questions that use "recommend"', () => {
    for (const t of negatives) expect(stageAdministration([t], false).recommendationAsked, t).toBe(false);
  });
});

// Lorenzo, 13 Oct (Step 4, Blake ac38cd28 t14: "what would you actually
// recommend to the CEO, and in what order?" wasn't counted, so the early ask
// wasn't held and the end gate asked again). Every recommendation ask in the
// saved runs that wasn't counted (hand-read from a scan of all runs).
describe('recommendation asks found uncounted in the saved runs', () => {
  const found = [
      "Given that same-store footprint and menu prices were flat while coffee bean costs rose and COGS increased as a share of revenue, what is your current hypothesis for the margin decline, and what would you recommend to address it?",
      "What would you do about the price customers pay?",
      "Which of those would you put in front of the CEO first, and why?",
      "Using what we know about this client, what's one action you'd put in front of the CEO, and why?",
      "What would you do, and in what order?",
      "Which one would you tell the CEO to do first, and why?",
      "Pick the two or three of those ideas you'd put in front of the CEO first, and what criteria are you using to rank them?",
      "Now use it: if input costs rose and prices never moved, what's the first thing you'd tell the CEO to do?",
      "Of everything you've listed, which would you put in front of the CEO first, and what's your overall recommendation?",
      "What would you advise, and what are the key steps to carry it out?",
      "Of everything on the table, price, sourcing, and those other levers, what would you actually recommend to the CEO, and in what order?",
      "With the time left, what is the one thing you would tell the CEO to do first, and what single result would make you change that?",
      "Of those, which would you actually recommend to the CEO, and why that one first?",
      "Beyond the levers you've covered, what else could Brew & Bean do to recover that 16-point COGS hit, and which of these would you actually recommend first?",
      "And what would you advise the CEO to do about it?",
      "With the clock nearly out, what's the one thing you'd tell the CEO?",
      "Your analysis points to price, but a recommendation is a decision: what do you tell the CEO to do, in what order, and what has to be true for it to work?",
      "Pull that together for the CEO: which levers would you recommend, in what order, and what is your overall recommendation?",
      "Pull that together for the CEO: which levers would you actually recommend, in what order, and why?",
      "Which of those levers would you recommend, in what order, and why?",
      "Of those levers, which would you recommend to the CEO first, and why?",
      "What should Brew & Bean do, and how would you sequence it?",
      "The CEO is asking for your recommendation now: what should Brew & Bean do, and in what order?",
      "Of those levers, which would you put in front of the CEO first, and what would you expect each to recover in margin points?",
      "If you were the CEO, what would you do with menu prices, and what would worry you about it?",
      "If you were presenting to the CEO now, what is your single recommendation to reverse the margin decline, and how would you sequence it?",
      "If you'd like to give the CEO a recommendation before time runs out, what would you tell them?",
      "If you'd like to give the CEO your recommendation before time runs out, what would it be?",
      "If you were presenting to the CEO now, which of those would you recommend first, and why?"
  ];
  it.each(found)('counts: %s', q => {
    expect(stageAdministration([q], false).recommendationAskCount).toBe(1);
  });
  it.each([
    'Of everything you listed, which would you recommend the CEO act on first, and what\'s the single biggest risk to that recommendation?',
    "Of everything you've laid out, which would you put in front of the CEO first, and what would you want to see before committing to it?",
    'Which single recommendation would you put in front of the CEO, and what is its biggest risk?',
    'Given the time left, what pricing action would you recommend to the CEO, and what is its biggest risk?',
  ])('counts a recommendation ask with its risk: %s', q => {
    expect(stageAdministration([q], false).recommendationAskCount).toBe(1);
  });
  it.each([
    'What is the single biggest risk to your recommendation, and how would you mitigate it?',
    'Which of those two figures would you put in front of the CEO, and what has to be true for it to hold?',
    'What would you do next to narrow it down?',
    'Which test would you recommend to check the bean assumption?',
    'Before you recommend, think more broadly: beyond what we have discussed, what else could the client do?',
    'Does that change your recommendation?',
    "Given that a full recovery would take a very large price increase, what's the biggest risk to your recommendation, and how would that change what you tell the CEO to do?",
    'What should we do next to size it?',
    'If the pilot shows traffic falling, what would you do instead?',
  ])('does not count: %s', q => {
    expect(stageAdministration([q], false).recommendationAsked).toBe(false);
  });
});

