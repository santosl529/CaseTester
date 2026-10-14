// The stage record (Rule 9 v4.10): delivery read from what was said or shown,
// outcome from the candidate's reply — never from a move label.
import { describe, it, expect } from 'vitest';
import { updateStages, missingRequiredStages, replyOutcome, asksBrainstormNow, INITIAL_STAGES, type StageTurn } from '@/lib/orchestrator/stage-evidence';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';

const turn = (over: Partial<StageTurn>): StageTurn => ({
  turnIndex: 4, candidateText: 'ok', question: '', exhibitShown: false, released: false, recAsked: false,
  recommendationDelivered: false, pressureTest: INITIAL_PRESSURE_TEST, candidateFigures: 0, ...over,
});

describe('the risk and recommendation stages read as the end gate does (fact guards Phase 5)', () => {
  it('an analysis "how would you test that?" delivers no risk stage; a contingency after the recommendation does', () => {
    expect(updateStages(undefined, turn({ question: 'Does the bean move explain it, and how would you test that?' })).risk.delivered).toBe(false);
    let r = updateStages(undefined, turn({ question: 'The CEO wants your recommendation now. Which levers would you pull first?' }));
    expect(r.recommendation.delivered).toBe(true);
    r = updateStages(r, turn({ turnIndex: 6, question: 'If the pilot shows traffic falling, at what point would you stop the price increase?' }));
    expect(r.risk.delivered).toBe(true);
  });
});

describe('delivery and outcome', () => {
  it('an exhibit shown is delivered; it is assessed only when the reply engages with it', () => {
    let r = updateStages(undefined, turn({ exhibitShown: true, question: 'What does it tell you?' }));
    expect(r.exhibit).toMatchObject({ delivered: true, deliveredAt: 4 });
    expect(r.exhibit.outcome).toBeUndefined();
    expect(r.pending).toBe('exhibit');
    r = updateStages(r, turn({ turnIndex: 6, candidateText: 'COGS climbs eight points a year while labor is flat, so it is a steady squeeze.' }));
    expect(r.exhibit.outcome).toBe('answered');
  });

  it('a brainstorm declined or not managed still resolves the stage (bounded, no re-ask)', () => {
    let r = updateStages(undefined, turn({ question: "Beyond what we've discussed, what else could the client do?" }));
    r = updateStages(r, turn({ turnIndex: 6, candidateText: "I'd rather not brainstorm — I'll pass on this." }));
    expect(r.brainstorm.outcome).toBe('declined');
    let u = updateStages(undefined, turn({ question: 'What other ways could they protect margin?' }));
    u = updateStages(u, turn({ turnIndex: 6, candidateText: "I don't know." }));
    expect(u.brainstorm.outcome).toBe('unable');
  });

  it('a clarifying question back keeps it pending, twice at most', () => {
    let r = updateStages(undefined, turn({ exhibitShown: true }));
    r = updateStages(r, turn({ turnIndex: 6, candidateText: 'Is this in dollars or percent?' }));
    expect(r.pending).toBe('exhibit');
    r = updateStages(r, turn({ turnIndex: 8, candidateText: 'And which years?' }));
    expect(r.exhibit.outcome).toBe('unable');
    expect(r.pending).toBeNull();
  });

  it('the move label alone delivers nothing — the question has to ask for ideas', () => {
    expect(asksBrainstormNow('What else could Brew & Bean do to rebuild margin?')).toBe(true);
    expect(asksBrainstormNow('Which cost line moved most?')).toBe(false);
  });

  it('a waived pressure test is kept distinct from an answered one', () => {
    const r = updateStages(undefined, turn({ pressureTest: { ...INITIAL_PRESSURE_TEST, state: 'waived', askedAt: 2 } }));
    expect(r.pressure_test).toMatchObject({ delivered: true, outcome: 'waived' });
  });

  it('a recommendation volunteered before it was asked is spontaneous', () => {
    const r = updateStages(undefined, turn({ recommendationDelivered: true }));
    expect(r.recommendation).toMatchObject({ outcome: 'answered', spontaneous: true });
  });

  it('time-up resolves what never happened as time_up', () => {
    const r = updateStages(undefined, turn({ ended: 'time_up' }));
    expect(r.exhibit.outcome).toBe('time_up');
    expect(r.brainstorm.outcome).toBe('time_up');
  });

  it('a reply is classified by content', () => {
    expect(replyOutcome('Still no.')).toBe('declined');
    expect(replyOutcome('Mix shift, loyalty, supplier contracts, and portion control.')).toBe('answered');
  });
});

describe('what an interviewer-led case still owes before a normal end', () => {
  it('the exhibit (when the case has one) and the brainstorm, until delivered', () => {
    expect(missingRequiredStages(INITIAL_STAGES, { hasExhibit: true })).toEqual(['exhibit', 'brainstorm']);
    expect(missingRequiredStages(INITIAL_STAGES, { hasExhibit: false })).toEqual(['brainstorm']);
    expect(missingRequiredStages(INITIAL_STAGES, { hasExhibit: true, format: 'candidate_led' })).toEqual([]);
    const done = updateStages(updateStages(undefined, turn({ exhibitShown: true })), turn({ turnIndex: 6, candidateText: 'ok', question: 'What else could they do?' }));
    expect(missingRequiredStages(done, { hasExhibit: true })).toEqual([]);
  });
});

// Lorenzo, 13 Oct (Larkspur rulings e): before a brainstorm that waits on
// exhibits is due, no question counts as it — only code's own ask.
describe('a brainstorm not yet due', () => {
  const ASK = "What else could Larkspur do to make sure it's profitable in the first year?";
  it('a brainstorm question does not count while it waits', () => {
    expect(updateStages(undefined, turn({ question: ASK, brainstormAsks: [ASK], brainstormDue: false })).brainstorm.delivered).toBe(false);
    expect(updateStages(undefined, turn({ question: ASK, brainstormAsks: [ASK], brainstormDue: true })).brainstorm.delivered).toBe(true);
    expect(updateStages(undefined, turn({ question: ASK, brainstormAsks: [ASK] })).brainstorm.delivered).toBe(true);
  });
  it("code's own ask counts", () => {
    expect(updateStages(undefined, turn({ question: ASK, codeAsked: 'brainstorm', brainstormDue: false })).brainstorm.delivered).toBe(true);
  });
});
