import { describe, it, expect } from 'vitest';
import { inferPhaseRepair } from '@/lib/orchestrator/phase-repair';

// Both live runs (58cb8061, db41a01e) sat in STRUCTURE from ~0:30 to the end
// while data, the exhibit, the brainstorm, and the recommendation all
// happened: the model called advance_phase once per session, one phase at a
// time. Rule 8 permits silent orchestrator repair by any number of phases;
// these are the observable signals it repairs from.
const none = { revealedReleaseWhen: [], exhibitShown: false, interviewerText: 'Go on.' };

describe('inferPhaseRepair', () => {
  it('exhibit shown + EXHIBIT-stage reveals while still in CLARIFY → EXHIBIT (run db41a01e, 0:17–0:35)', () => {
    const repair = inferPhaseRepair('CLARIFY', {
      revealedReleaseWhen: ['EXHIBIT', 'EXHIBIT'],
      exhibitShown: true,
      interviewerText: "That holds. Let's get inside COGS. Here's the bean price data and the share of COGS beans represent.",
    });
    expect(repair).toMatchObject({ from: 'CLARIFY', to: 'EXHIBIT' });
    expect(repair!.reasons.length).toBeGreaterThan(0);
  });

  it('an ANALYSIS-stage reveal from STRUCTURE → ANALYSIS', () => {
    expect(inferPhaseRepair('STRUCTURE', { ...none, revealedReleaseWhen: ['ANALYSIS'] })).toMatchObject({ to: 'ANALYSIS' });
  });

  it('a brainstorm question → BRAINSTORM (run db41a01e, 1:14)', () => {
    const repair = inferPhaseRepair('STRUCTURE', {
      ...none,
      interviewerText: "That reconciles. Before we get to sizing the fix, let's widen the lens. Beyond pricing, what else could Brew & Bean do to reverse the margin decline?",
    });
    expect(repair).toMatchObject({ from: 'STRUCTURE', to: 'BRAINSTORM' });
  });

  it('a recommendation ask → RECOMMENDATION, even alongside lower-stage evidence (run db41a01e, 1:44)', () => {
    const repair = inferPhaseRepair('STRUCTURE', {
      revealedReleaseWhen: ['CLARIFY', 'ANALYSIS'],
      exhibitShown: false,
      interviewerText: "That holds. The CEO walks in and wants your answer now. What's your recommendation?",
    });
    expect(repair).toMatchObject({ to: 'RECOMMENDATION' });
  });

  it('brainstorm wording without a question is not a brainstorm ask', () => {
    expect(inferPhaseRepair('ANALYSIS', { ...none, interviewerText: 'Beyond that, labor is flat.' })).toBeNull();
  });

  it('never moves backwards', () => {
    expect(inferPhaseRepair('BRAINSTORM', { ...none, revealedReleaseWhen: ['ANALYSIS'], exhibitShown: true })).toBeNull();
  });

  it('does nothing once in WRAP or SCORING, and never repairs past RECOMMENDATION', () => {
    const ask = { ...none, interviewerText: "What's your recommendation?" };
    expect(inferPhaseRepair('WRAP', ask)).toBeNull();
    expect(inferPhaseRepair('SCORING', ask)).toBeNull();
    expect(inferPhaseRepair('RECOMMENDATION', ask)).toBeNull();
  });

  it('returns null when the turn carries no phase evidence', () => {
    expect(inferPhaseRepair('STRUCTURE', none)).toBeNull();
  });
});
