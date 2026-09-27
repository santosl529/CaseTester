import { describe, it, expect } from 'vitest';
import {
  evaluateStall, classifyTurn, INITIAL_STALL_STATE,
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

  it('classifies a data question as question', () => {
    expect(classifyTurn('What is the total revenue?', null).kind).toBe('question');
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
      'What is the revenue?',      // clarify #1 (progress)
      'What are the main costs?',  // clarify #2 (progress)
    ]);
    expect(rungs).toEqual([0, 0]);
    expect(CLARIFY_BUDGET).toBe(2);
  });

  it('the (N+1)th consecutive clarifying question stops counting as progress', () => {
    const { rungs } = runSequence([
      'What is the revenue?',        // #1 progress
      'What are the main costs?',    // #2 progress
      'What is the labor cost?',     // #3 over budget → no-progress (np=1)
      'What is the overhead cost?',  // #4 over budget → no-progress (np=2 → L1)
    ]);
    expect(rungs).toEqual([0, 0, 0, 1]);
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
