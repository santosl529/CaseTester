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
  // Batch 21 wave 1 (Owen, Raj): counted live only through move labels.
  it('"Pulling it together, what do you recommend to the CEO" is a recommendation ask; the risk question may come as "what would you do if…" or "Suppose…"', () => {
    const s = stagesFromTurns([
      { turnIndex: 12, text: "Pulling it together, what do you recommend to the CEO, and how would you sequence the levers you've named?" },
      { turnIndex: 14, text: "What evidence would tell you that's wrong, and what would you do if the pilot shows volume falling faster than you can offset?" },
    ], {}, false);
    expect(s).toMatchObject({ recommendationAskCount: 1, riskAsked: true });
    const raj = stagesFromTurns([
      { turnIndex: 16, text: 'Pulling it together, what do you recommend to the CEO?' },
      { turnIndex: 18, text: 'Suppose the pilot shows transactions falling enough that the price increase delivers little. What would you do then?' },
    ], {}, false);
    expect(raj.riskAsked).toBe(true);
    expect(stagesFromTurns([{ turnIndex: 5, text: 'What would you recommend we look at next?' }], {}, false).recommendationAskCount).toBe(0);
  });
  // Batch 21 Jasmine t22 → t24: not recognised, so code asked again right after the answer.
  it.each([
    'If you had to give the CEO one sentence on what to do first and why, what would it be?',
    'In one sentence, what should the client do first?',
    'Give the CEO a single line: what would you have them do?',
  ])('a one-sentence ask for what to do is a recommendation ask: %s', text => {
    expect(stagesFromTurns([{ turnIndex: 22, text }], {}, false).recommendationAskCount).toBe(1);
  });
  it.each([
    'In one sentence, what drove the margin decline?',
    'Give me one sentence on what the exhibit tells you.',
    'Which data would you look at first?',
  ])('not one for the diagnosis or the analysis: %s', text => {
    expect(stagesFromTurns([{ turnIndex: 22, text }], {}, false).recommendationAskCount).toBe(0);
  });
  it('an analysis "Suppose the test shows…" before any recommendation ask is no risk question, even once one is received (6a7fd865 replay)', () => {
    const s = stagesFromTurns([
      { turnIndex: 18, text: 'Suppose the mix test shows mix explains only a small share. What would you do then?' },
      { turnIndex: 26, text: "What's your recommendation to the client?" },
    ], { 26: 'code_rec_ask' }, true);
    expect(s.riskAsked).toBe(false);
  });
  it('a contingency that refers to the candidate\'s volunteered recommendation is the risk question (0f0158a5 replay); "put one recommendation in front of the CEO" is an ask (eb97713e)', () => {
    expect(stagesFromTurns([{ turnIndex: 18, text: "You proposed a ten percent price increase, piloted in 20 stores. If the pilot shows traffic falling sharply, what's your plan, and how would you decide whether to proceed, adjust, or stop?" }], {}, true).riskAsked).toBe(true);
    expect(stagesFromTurns([{ turnIndex: 14, text: "If you had to put one recommendation in front of the CEO, which would you commit to, and what's the first step?" }], {}, false).recommendationAskCount).toBe(1);
  });
  it('"what single result would make you change that?" is the risk question (batch 21 wave 2, Caleb t24)', () => {
    expect(stagesFromTurns([{ turnIndex: 24, text: 'With the time left, what is the one thing you would tell the CEO to do first, and what single result would make you change that?' }], {}, true).riskAsked).toBe(true);
  });
  it('falls back to the wording for turns with no recorded move (legacy sessions)', () => {
    const s = stagesFromTurns([{ turnIndex: 2, text: 'Beyond pricing, what else could the client do?' }], {}, true);
    expect(s).toMatchObject({ brainstormAsked: true, recommendationReceived: true });
  });
});
