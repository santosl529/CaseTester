import { describe, it, expect } from 'vitest';
import {
  evaluateStall, classifyTurn, INITIAL_STALL_STATE, findRungDelivery, revertUndeliveredRung,
  CLARIFY_BUDGET, type StallState,
} from '@/lib/orchestrator/stall';
import type { Phase } from '@/lib/orchestrator/state-machine';

// Helper: drive a sequence of candidate turns through the ladder, returning the
// intervention rung (or 0) for each turn.
function runSequence(turns: string[], phase: Phase = 'ANALYSIS'): { rungs: number[]; final: StallState } {
  let state = { ...INITIAL_STALL_STATE };
  const rungs: number[] = [];
  for (const t of turns) {
    const d = evaluateStall(t, phase, state);
    state = d.state;
    rungs.push(d.intervene ? d.rung! : 0);
  }
  return { rungs, final: state };
}

// Batch 2, Yuki 41ece01e: every figure in words, lists as "One — / Two —".
  // These turns read as clarifying questions and fired a phantom Level 1.
const YUKI_11_14 = `Okay, that confirm it. Zero pass-through in two years.

So now the twelve remaining points. Since price is flat, revenue per unit is flat, which means every point of COGS increase is really a cost-per-unit increase, or a mix change. Two candidates for me.

One — the other inputs also inflate. Milk, dairy, cups, food. Thirty-one and half points growing twelve points is about thirty-eight percent increase. That is very close to the forty percent on beans. So honestly, general food and packaging inflation across the board explain it quite well.

Two — mix. If we sell more food and more milk-heavy drinks, those carry lower margin, and COGS percent rise without any supplier price move.

Both end at the same place: costs went up, price did not.

Do we have inflation data on milk and packaging, to separate these two? Or transaction volume and average ticket?`;
const YUKI_9_22 = `Okay, so let me put the number. Beans ten and a half points, up forty percent, becomes about fourteen point seven. So plus four point two points of revenue.

But the total COGS increase is sixteen points. So beans only explain about four — one quarter. Twelve points still unexplained. That is the bigger part of the problem.

Do we have the menu price history? Did Brew & Bean raise prices at all in two years?`;

describe('classifyTurn', () => {
  it('classifies a numeric derivation as analysis', () => {
    expect(classifyTurn('COGS is 58% and labor 22%, so profit is 6%.', null).kind).toBe('analysis');
  });

  it('classifies an enumerated structure as analysis', () => {
    expect(classifyTurn('I would look at two areas: revenue and costs.', null).kind).toBe('analysis');
  });

  it('classifies a hedge as hedge', () => {
    expect(classifyTurn("I don't know, I'm stuck.", null).kind).toBe('hedge');
  });

  it('classifies a very short non-question as hedge', () => {
    expect(classifyTurn('costs maybe', null).kind).toBe('hedge');
  });

  it('classifies a data question as a data request, not a clarifying question (v4.5)', () => {
    expect(classifyTurn('What is the total revenue?', null).kind).toBe('data_request');
    expect(classifyTurn('Do we have inflation data on milk and packaging?', null).kind).toBe('data_request');
  });

  it('classifies a scoping question as a clarifying question', () => {
    expect(classifyTurn('Is the client focused on the US only?', null).kind).toBe('question');
  });

  it('classifies by content, not by the last sentence (v4.5)', () => {
    expect(classifyTurn('Volume could be flat while mix shifted toward cheaper items. What does success look like for the CEO?', null).kind).toBe('analysis');
  });

  it('treats uptalk answers as statements', () => {
    expect(classifyTurn('Maybe buy in bulk, or lock in a price?', null).kind).toBe('analysis');
  });

  it('classifies Yuki\'s worded-number analysis as analysis', () => {
    expect(classifyTurn(YUKI_11_14, null).kind).toBe('analysis');
    expect(classifyTurn(YUKI_9_22, null).kind).toBe('analysis');
  });

  it('gives every classification a reason', () => {
    expect(classifyTurn(YUKI_11_14, null).reason).toMatch(/analysis signal/);
    expect(classifyTurn("I don't know.", null).reason).toBe('hedge language');
  });

  it('detects a verbatim-repeat question', () => {
    const r = classifyTurn('What is the revenue?', 'What is the revenue?');
    expect(r.kind).toBe('question');
    expect(r.isRepeat).toBe(true);
  });

  it('gives substantive non-question prose the benefit of the doubt (analysis)', () => {
    const text = 'I think the margin decline is probably driven by rising input costs rather than a demand problem, so I want to understand the cost side of the business more.';
    expect(classifyTurn(text, null).kind).toBe('analysis');
  });
});

describe('evaluateStall — triggers', () => {
  it('does not intervene on a single stall', () => {
    const { rungs } = runSequence(["I don't know."]);
    expect(rungs).toEqual([0]);
  });

  it('fires Level 1 after two consecutive stalls', () => {
    const { rungs } = runSequence(["I don't know.", 'hmm not sure']);
    expect(rungs).toEqual([0, 1]);
  });

  it('escalates one rung per intervention, never repeating a rung', () => {
    // stall, stall→L1, stall, stall→L2, stall, stall→L3, stall, stall→(capped)
    const stalls = Array(8).fill("I don't know");
    const { rungs } = runSequence(stalls);
    expect(rungs).toEqual([0, 1, 0, 2, 0, 3, 0, 0]);
  });

  it('resets the no-progress counter when the candidate makes analytical progress', () => {
    const { rungs } = runSequence([
      "I don't know",          // np=1
      'COGS is 58%, so margin is 6%', // analysis → np=0
      "I don't know",          // np=1
      'still stuck',           // np=2 → L1
    ]);
    expect(rungs).toEqual([0, 0, 0, 1]);
  });
});

describe('evaluateStall — clarifying-question budget (Rule 13)', () => {
  it('treats clarifying questions within budget as progress (no intervention)', () => {
    const { rungs } = runSequence([
      'Is the client focused on the US only?',  // clarify #1 (progress)
      'Is the goal to fix this within a year?', // clarify #2 (progress)
    ]);
    expect(rungs).toEqual([0, 0]);
    expect(CLARIFY_BUDGET).toBe(2);
  });

  it('the (N+1)th consecutive clarifying question stops counting as progress', () => {
    const { rungs, final } = runSequence([
      'Is the client focused on the US only?',     // #1 progress
      'Is the goal to fix this within a year?',    // #2 progress
      'Are there any competitors nearby?',         // #3 over budget → no-progress (np=1)
      'Is the CEO open to closing stores?',        // #4 over budget → no-progress (np=2 → L1)
    ]);
    expect(rungs).toEqual([0, 0, 0, 1]);
    expect(final.noProgressReasons).toEqual([]);
  });

  it('logs why each turn counted as no progress when a rung fires', () => {
    let state = { ...INITIAL_STALL_STATE };
    state = evaluateStall("I don't know.", 'ANALYSIS', state).state;
    const d = evaluateStall('Is the CEO open to closing stores?', 'ANALYSIS', { ...state, consecutiveClarify: 2 });
    expect(d.intervene).toBe(true);
    expect(d.firedOn).toEqual(['hedge language', 'question-only turn over the clarifying budget (2)']);
  });

  it('data requests never consume the clarifying budget (v4.5)', () => {
    const { rungs, final } = runSequence([
      'Is the client focused on the US only?',
      'Is the goal to fix this within a year?',
      'What is the labor cost?',
      'Do we have the overhead trend?',
    ]);
    expect(rungs).toEqual([0, 0, 0, 0]);
    expect(final.consecutiveClarify).toBe(0);
  });

  it('Yuki\'s batch-2 sequence fires no rung', () => {
    const { rungs } = runSequence([
      'Can I ask what the COGS is made of? Beans, milk, cups?',
      YUKI_9_22,
      YUKI_11_14,
    ], 'EXHIBIT');
    expect(rungs).toEqual([0, 0, 0]);
  });

  it('never counts a verbatim-repeat question as progress', () => {
    const { rungs } = runSequence([
      'What is the revenue?',  // #1 progress
      'What is the revenue?',  // verbatim repeat → stall (np=1)
      'What is the revenue?',  // verbatim repeat → stall (np=2 → L1)
    ]);
    expect(rungs).toEqual([0, 0, 1]);
  });
});

describe('evaluateStall — synthesis cap (Rule 13)', () => {
  it('caps the ladder at Level 2 during RECOMMENDATION', () => {
    const stalls = Array(8).fill("I don't know");
    const { rungs } = runSequence(stalls, 'RECOMMENDATION');
    // reaches L1, L2, then never L3
    expect(rungs).toEqual([0, 1, 0, 2, 0, 0, 0, 0]);
    expect(rungs).not.toContain(3);
  });

  it('flags synthesisUnresolved once capped and still stalling', () => {
    let state = { ...INITIAL_STALL_STATE };
    let lastDecision;
    for (const t of Array(8).fill("I don't know")) {
      lastDecision = evaluateStall(t, 'RECOMMENDATION', state);
      state = lastDecision.state;
    }
    expect(lastDecision!.synthesisUnresolved).toBe(true);
  });
});

// Run 1d76e3d9: after a full recommendation, the session looped on goodbyes and
// "Goodbye." read as a hedge — Level 1, Level 2, and synthesis_unresolved were
// logged as assists against a candidate who had already delivered.
describe('evaluateStall — after the recommendation is delivered', () => {
  const REC = 'My recommendation: take a 12% menu price increase phased over two quarters, because input inflation explains the whole COGS jump. Risks are elasticity; next step is a twenty-store test.';

  it('marks the recommendation delivered in a synthesis phase', () => {
    const d = evaluateStall(REC, 'RECOMMENDATION', INITIAL_STALL_STATE);
    expect(d.state.recommendationDelivered).toBe(true);
  });

  it('does not mark it outside synthesis (an answer-first sprinter has not closed)', () => {
    const d = evaluateStall(REC, 'STRUCTURE', INITIAL_STALL_STATE);
    expect(d.state.recommendationDelivered).toBe(false);
  });

  it('does not count a refusal to commit as a delivered recommendation', () => {
    const d = evaluateStall("I can't commit without a more detailed breakdown of the biggest cost line.", 'RECOMMENDATION', INITIAL_STALL_STATE);
    expect(d.state.recommendationDelivered).toBe(false);
  });

  it('never fires a rung or synthesisUnresolved on sign-offs after delivery', () => {
    let state = evaluateStall(REC, 'RECOMMENDATION', INITIAL_STALL_STATE).state;
    for (const t of ['Goodbye.', 'Thanks — take care.', 'Goodbye.', 'Goodbye.', 'Goodbye.', 'Goodbye.']) {
      const d = evaluateStall(t, 'RECOMMENDATION', state);
      expect(d.intervene).toBe(false);
      expect(d.synthesisUnresolved).toBeFalsy();
      state = d.state;
    }
  });

  it('a recommendation that never comes still escalates (Claire)', () => {
    const { rungs } = runSequence(["I don't know, I'd need more data", "I don't know", "I don't know", "I don't know"], 'RECOMMENDATION');
    expect(rungs).toEqual([0, 1, 0, 2]);
  });
});

describe('rung delivery (Rule 13 v4.5: a rung counts only when it reaches the candidate)', () => {
  it('finds the delivered hint sentence for each level', () => {
    expect(findRungDelivery(1, 'Okay. Take your time. The question on the table is why margins fell.', { dataReleased: false, exhibitShown: false }))
      .toBe('Take your time.');
    expect(findRungDelivery(2, "Let's simplify — what are the two ways a margin can fall?", { dataReleased: false, exhibitShown: false }))
      .toMatch(/^Let's simplify/);
    expect(findRungDelivery(3, "Let's look at costs.", { dataReleased: false, exhibitShown: false })).toBe("Let's look at costs.");
  });

  it("Yuki's turn 11: a data release is not a Level 1 anchor", () => {
    const delivered = "Here's the other-input cost changes from the COGS breakdown. Other input costs — dairy, packaging, and food — are up 37.5% over the past two years.";
    expect(findRungDelivery(1, delivered, { dataReleased: true, exhibitShown: false })).toBeNull();
  });

  it('a release delivers a Level 3 rescue', () => {
    expect(findRungDelivery(3, 'COGS is 58% of revenue today.', { dataReleased: true, exhibitShown: false })).not.toBeNull();
  });

  it('an undelivered rung does not advance the ladder', () => {
    const prior = { ...INITIAL_STALL_STATE, consecutiveNoProgress: 1 };
    const d = evaluateStall("I don't know.", 'ANALYSIS', prior);
    expect(d.rung).toBe(1);
    const reverted = revertUndeliveredRung(d.state, prior);
    expect(reverted.ladderLevel).toBe(0);
    const next = evaluateStall("I don't know.", 'ANALYSIS', { ...reverted, consecutiveNoProgress: 1 });
    expect(next.rung).toBe(1);
  });
});
