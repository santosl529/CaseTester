import { describe, it, expect } from 'vitest';
import {
  isClosingTurn, resolveSpokenClose, stageAdministration, stageGateOpen, chooseBlockedCloseProbe, BLOCKED_CLOSE_PROBES,
  type StageAdministration,
} from '@/lib/orchestrator/spoken-close';
import { CLOSE_SCRIPTS, GRACE_ASK_SCRIPTS, TIME_WARNING_SCRIPTS, asksForRecommendation } from '@/lib/agent/prompts/scripts';

// Run 1d76e3d9: the model said this at 15:33 of a 20-minute case without
// calling end_case, and the session looped on goodbyes until time-up.
const DEREK_CLOSE = "That's time. Thanks for working through it — you'll get a full written report with detailed feedback rather than a debrief now.\n\nI'll close the case here.";
// Batch 2, Maya c6076209: goodbyes the narrow v4.2 pattern missed.
const MAYA_18_08 = "That's a recommendation. You'll get a full written report afterward.";
const MAYA_19_41 = "That's your recommendation. The full written report will follow. Thanks for your time today.";

const NONE_RUN: StageAdministration = { brainstormAsked: false, riskAsked: false, recommendationAsked: false, recommendationReceived: false };

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

  it('chooses the probe by what was not administered: brainstorm, recommendation, then risk', () => {
    expect(chooseBlockedCloseProbe(NONE_RUN)).toBe('brainstorm');
    expect(chooseBlockedCloseProbe({ ...NONE_RUN, brainstormAsked: true })).toBe('recommendation');
    expect(chooseBlockedCloseProbe({ ...NONE_RUN, brainstormAsked: true, recommendationReceived: true })).toBe('risk');
  });
});

describe('resolveSpokenClose', () => {
  it('leaves a turn alone when the end is already confirmed', () => {
    expect(resolveSpokenClose({ spokenText: DEREK_CLOSE, ended: true, mayEnd: true, stages: NONE_RUN, seed: 's' }))
      .toEqual({ action: 'none', ended: true, spokenText: DEREK_CLOSE });
  });

  it('leaves a turn with no close alone', () => {
    const text = 'Okay. What would you tell the CEO?';
    expect(resolveSpokenClose({ spokenText: text, ended: false, mayEnd: true, stages: NONE_RUN, seed: 's' }))
      .toEqual({ action: 'none', ended: false, spokenText: text });
  });

  it('confirms the end when the interviewer closes and the case may end', () => {
    expect(resolveSpokenClose({ spokenText: DEREK_CLOSE, ended: false, mayEnd: true, stages: NONE_RUN, seed: 's' }))
      .toEqual({ action: 'promoted', ended: true, spokenText: DEREK_CLOSE });
  });

  it("replaces Maya's blocked 18:08 goodbye — the whole turn — with a risk probe", () => {
    const stages = { brainstormAsked: true, riskAsked: false, recommendationAsked: true, recommendationReceived: true };
    const r = resolveSpokenClose({ spokenText: MAYA_18_08, ended: false, mayEnd: false, stages, seed: 'maya' });
    expect(r.action).toBe('replaced');
    expect(r.probe).toBe('risk');
    expect(BLOCKED_CLOSE_PROBES.risk).toContain(r.spokenText);
    expect(asksForRecommendation(r.spokenText)).toBe(false);
    expect(isClosingTurn(r.spokenText)).toBe(false);
  });
});
