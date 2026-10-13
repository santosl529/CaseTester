import { describe, it, expect } from 'vitest';
import { derivePhase, stagesFromTurns } from '@/lib/orchestrator/progress';

// Phase and stage administration derived from declared moves and code's own
// decisions (spec 2026-10-06 §7) — replaces advance_phase and the stage regexes.

const none = { releasedReleaseWhen: [], exhibitShown: false, recAsk: false, close: false };

describe('derivePhase', () => {
  it('leaves INTRO after the first exchange', () => {
    expect(derivePhase('INTRO', { ...none, move: 'other' })).toBe('CLARIFY');
  });
  it('follows the declared move, forward only', () => {
    expect(derivePhase('CLARIFY', { ...none, move: 'pressure_test' })).toBe('STRUCTURE');
    expect(derivePhase('STRUCTURE', { ...none, move: 'analysis' })).toBe('ANALYSIS');
    expect(derivePhase('BRAINSTORM', { ...none, move: 'analysis' })).toBe('BRAINSTORM');
  });
  it('rises with releases, an exhibit and a recommendation ask', () => {
    expect(derivePhase('ANALYSIS', { ...none, move: 'analysis', releasedReleaseWhen: ['EXHIBIT'] })).toBe('EXHIBIT');
    expect(derivePhase('ANALYSIS', { ...none, move: 'analysis', exhibitShown: true })).toBe('EXHIBIT');
    expect(derivePhase('ANALYSIS', { ...none, recAsk: true })).toBe('RECOMMENDATION');
  });
  it('never passes RECOMMENDATION except by close', () => {
    expect(derivePhase('RECOMMENDATION', { ...none, move: 'risk' })).toBe('RECOMMENDATION');
    expect(derivePhase('BRAINSTORM', { ...none, close: true })).toBe('SCORING');
  });
});

describe('stagesFromTurns', () => {
  // v4.10: a label counts only when the delivered text does what it says.
  it('reads stages from recorded moves the text corroborates', () => {
    const s = stagesFromTurns([
      { turnIndex: 3, text: 'Is that MECE?' }, { turnIndex: 9, text: 'What other ways could Brew & Bean protect margin?' },
      { turnIndex: 11, text: 'So what should they do first?' },
    ], { 3: 'pressure_test', 9: 'brainstorm', 11: 'recommendation' }, false);
    expect(s).toMatchObject({ brainstormAsked: true, riskAsked: false, recommendationAsked: true, recommendationAskCount: 1 });
  });
  it('a label alone is not a stage (batch 18: "which lever matters most?" labelled brainstorm)', () => {
    const s = stagesFromTurns([
      { turnIndex: 9, text: 'Which lever matters most?' }, { turnIndex: 11, text: 'Anything else?' },
    ], { 9: 'brainstorm', 11: 'recommendation' }, false);
    expect(s).toMatchObject({ brainstormAsked: false, recommendationAsked: false, recommendationAskCount: 0 });
  });
  it('counts code recommendation asks', () => {
    const s = stagesFromTurns([{ turnIndex: 5, text: 'Okay.' }], { 5: 'code_rec_ask' }, false);
    expect(s).toMatchObject({ recommendationAsked: true, recommendationAskCount: 1 });
  });
  // Fact guards Phase 5 (batch 20): the end gate closed on labels.
  it('an analysis "how would you test that?" labelled risk is no risk question (R16, R18)', () => {
    const s = stagesFromTurns([{ turnIndex: 9, text: 'Does the bean move explain it, and how would you test that?' }], { 9: 'risk' }, false);
    expect(s.riskAsked).toBe(false);
  });
  it('a contingency on the plan after the recommendation is the risk question (R20, R26, R37)', () => {
    const s = stagesFromTurns([
      { turnIndex: 5, text: "What's your recommendation to the client?" },
      { turnIndex: 7, text: 'If the pilot shows traffic falling, at what point would you stop the price increase, and what would you do instead?' },
    ], { 5: 'code_rec_ask', 7: 'risk' }, true);
    expect(s.riskAsked).toBe(true);
  });
  it('a risk question labelled recommendation is no recommendation ask (R36)', () => {
    const s = stagesFromTurns([{ turnIndex: 9, text: "What would make you commit to it, and what's the single biggest risk to recommending it now?" }], { 9: 'recommendation' }, false);
    expect(s).toMatchObject({ recommendationAskCount: 0, riskAsked: true });
  });
  it('a lever choice and "the CEO wants your recommendation" are recommendation asks', () => {
    const s = stagesFromTurns([
      { turnIndex: 5, text: 'The CEO wants your recommendation now. Which levers would you pull first?' },
      { turnIndex: 7, text: 'Which one would you put forward to the CEO as the primary recommendation?' },
    ], {}, false);
    expect(s.recommendationAskCount).toBe(2);
  });
  it('falls back to the wording for turns with no recorded move (legacy sessions)', () => {
    const s = stagesFromTurns([{ turnIndex: 2, text: 'Beyond pricing, what else could the client do?' }], {}, true);
    expect(s).toMatchObject({ brainstormAsked: true, recommendationReceived: true });
  });
});
