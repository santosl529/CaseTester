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
