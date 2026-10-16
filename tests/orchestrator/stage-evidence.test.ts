// The stage record (Rule 9 v4.10): delivery read from what was said or shown,
// outcome from the candidate's reply — never from a move label.
import { describe, it, expect } from 'vitest';
import { updateStages, missingRequiredStages, replyOutcome, asksBrainstormNow, stagesFromRecord, namesRiskAndMitigation, INITIAL_STAGES, type StageTurn } from '@/lib/orchestrator/stage-evidence';
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
    let u = updateStages(undefined, turn({ question: 'What other ways could they protect margin?', move: 'brainstorm' }));
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

// Lorenzo, 13 Oct: the end gate reads the stage record — one source of truth
// for what's owed — not its own reading of the transcript.
describe('the end gate reads the stage record', () => {
  it('stagesFromRecord: delivered stages and the recommendation asks counted', () => {
    let r = updateStages(undefined, turn({ question: "Beyond what we've discussed, what else could the client do?" }));
    r = updateStages(r, turn({ turnIndex: 6, question: "What's your recommendation to the CEO?", recAsked: true }));
    r = updateStages(r, turn({ turnIndex: 8, candidateText: 'Hmm, not sure.', question: 'Pull it together — what would you tell the CEO to do?', recAsked: true }));
    expect(stagesFromRecord(r, false)).toEqual({ brainstormAsked: true, riskAsked: false, recommendationAsked: true, recommendationAskCount: 2, recommendationReceived: false });
  });
  it('a stage the record lacks is not asked, whatever the transcript says', () => {
    expect(stagesFromRecord(INITIAL_STAGES, true)).toEqual({ brainstormAsked: false, riskAsked: false, recommendationAsked: false, recommendationAskCount: 0, recommendationReceived: true });
  });
});

// Lorenzo, 13 Oct: the record is the end gate's only reading, so it reads as
// the end gate did — a move label counts when the text does what it says.
describe('the record reads stages as the end gate did', () => {
  it('a risk move in risk words, once a recommendation is on the table (Ines 62d06bd6 t20)', () => {
    const q = "Understood. You named competitive reaction and price sensitivity as risks. Which single risk could most undermine this recommendation, and how would you know early that it's happening?";
    const rec = updateStages(undefined, turn({ question: 'What do you recommend?', move: 'recommendation' }));
    expect(updateStages(rec, turn({ turnIndex: 6, question: q, move: 'risk' })).risk.delivered).toBe(true);
    expect(updateStages(rec, turn({ turnIndex: 6, question: q })).risk.delivered).toBe(true);   // its words say it too, since 14 Oct (risk-question.test.ts)
    expect(updateStages(rec, turn({ turnIndex: 6, question: 'Which of those matters most to you?', move: 'risk' })).risk.delivered).toBe(false);   // a risk move needs risk words
    expect(updateStages(undefined, turn({ question: q, move: 'risk' })).risk.delivered).toBe(false);     // no recommendation yet
  });
  it("a recommendation move in recommendation words; code's ask by its move", () => {
    // Jasmine e7e02f18 t6: only the move says it — the wording rule doesn't count it.
    const q = "You've reached a recommendation, but before we close, which of your three levers carries the most risk to the client, and why?";
    expect(updateStages(undefined, turn({ question: q, move: 'recommendation' })).recommendation.delivered).toBe(true);
    expect(updateStages(undefined, turn({ question: q })).recommendation.delivered).toBe(false);
    expect(updateStages(undefined, turn({ question: 'Okay.', move: 'code_rec_ask' })).recommendation.delivered).toBe(true);
    expect(updateStages(undefined, turn({ question: 'Which of your levers carries the biggest risk to that recommendation?', move: 'recommendation' })).recommendation.delivered).toBe(false);
  });
  it('a "what else" probe is no brainstorm (Destiny df623412 t20, Tobias 79d7e1fa t9)', () => {
    expect(updateStages(undefined, turn({ question: 'Got it. What else would you need to rule out before concluding beans are the driver?', move: 'pressure_test' })).brainstorm.delivered).toBe(false);
    expect(updateStages(undefined, turn({ question: 'Does a flat labor percentage rule that out on its own, or what else would you want to see before you drop it?', move: 'analysis' })).brainstorm.delivered).toBe(false);
    expect(updateStages(undefined, turn({ question: "Beyond what we've discussed, what else could the client do?" })).brainstorm.delivered).toBe(true);
  });
});

describe('caseFinished reads the record', () => {
  it('the recommendation answered and the risk asked', async () => {
    const { caseFinished } = await import('@/lib/orchestrator/session-outcome');
    const done = { ...INITIAL_STAGES, recommendation: { delivered: true, outcome: 'answered' as const }, risk: { delivered: true } };
    expect(caseFinished({ stageEvidence: done })).toBe(true);
    expect(caseFinished({ stageEvidence: { ...done, risk: { delivered: false } } })).toBe(false);
    expect(caseFinished({})).toBe(false);
  });
});

// Lorenzo, 16 Oct (batch 29 Raj 2a86cb76 t17, verbatim): a risk named in the
// candidate's own recommendation, with its mitigation, counts as the risk — no
// risk question was ever read as one and the end gate stayed shut to time-up.
const RAJ_T17 = "My recommendation: Brew & Bean should pass through input inflation with a targeted menu price increase, backed by procurement hedging — this is a pass-through failure, not an operating problem.\n\nThe math: on 100 of revenue, COGS is 58, labor 22, overhead 14, profit 6. Hold costs flat and raise prices 10% — revenue 110, costs 94, profit 16, or 14.5% margin. A full return to 24% needs roughly a 24% increase, which is too aggressive in one move.\n\nSo, sequenced. Immediate: 8–10% price increase, weighted toward food and specialty drinks where elasticity is lowest, paired with a loyalty program to protect volume. Near-term: hedge or forward-contract green coffee and renegotiate dairy using 200-store scale — that stops the bleeding recurring. Medium-term: mix steering and a portioning/waste audit for a few more points.\n\nKey risk is volume loss. At 10%, we can afford to lose roughly 20% of units before we're worse off than today, so I'd pilot in 20 stores and measure before chain-wide rollout.";
describe('a risk named in the candidate\'s own recommendation (Raj b29 t17)', () => {
  it('names a risk and its mitigation', () => {
    expect(namesRiskAndMitigation(RAJ_T17)).toBe(true);
    expect(namesRiskAndMitigation('The biggest risk is that customers trade down, so I would test it in a few markets first.')).toBe(true);
  });
  it('not a risk without a mitigation, nor a plan with no risk named, nor risk talk that names none', () => {
    expect(namesRiskAndMitigation('My recommendation: raise prices 10%. Key risk is volume loss.')).toBe(false);
    expect(namesRiskAndMitigation('My recommendation: raise prices 10%, piloted in 20 stores first.')).toBe(false);
    expect(namesRiskAndMitigation('Pricing carries some risk, but I would pilot it in 20 stores.')).toBe(false);
  });
  it('the recommendation received with it: the risk is answered unasked — the end gate reads it as done', async () => {
    const r = updateStages({ ...INITIAL_STAGES, recommendation: { delivered: true, deliveredAt: 16, asks: 1 } }, turn({ turnIndex: 18, candidateText: RAJ_T17, recommendationDelivered: true, question: 'You said you can afford to lose roughly 20% of units. Walk me through how you got that?' }));
    expect(r.recommendation.outcome).toBe('answered');
    expect(r.risk).toMatchObject({ delivered: false, outcome: 'answered', spontaneous: true });
    expect(stagesFromRecord(r, true).riskAsked).toBe(true);
    const { caseFinished } = await import('@/lib/orchestrator/session-outcome');
    expect(caseFinished({ stageEvidence: r })).toBe(true);
  });
  it('as the reply to the pending recommendation ask (Raj\'s real path: t16 asked, t17 answered)', () => {
    const asked = updateStages(undefined, turn({ turnIndex: 16, question: 'Which levers would you actually pull, and in what order? Give me your recommendation for the CEO.' }));
    expect(asked.pending).toBe('recommendation');
    const r = updateStages(asked, turn({ turnIndex: 18, candidateText: RAJ_T17, recommendationDelivered: true, question: 'You said you can afford to lose roughly 20% of units. Walk me through how you got that?' }));
    expect(r.recommendation.outcome).toBe('answered');
    expect(r.risk).toMatchObject({ outcome: 'answered', spontaneous: true });
    expect(stagesFromRecord(r, true).riskAsked).toBe(true);
  });
  it('only in the recommendation itself: a later message naming a risk is no answer to an unasked risk', () => {
    const rec = updateStages({ ...INITIAL_STAGES, recommendation: { delivered: true, deliveredAt: 16, asks: 1 } }, turn({ turnIndex: 18, candidateText: 'My recommendation: raise prices 10%.', recommendationDelivered: true }));
    const later = updateStages(rec, turn({ turnIndex: 20, candidateText: 'Key risk is volume loss, so I would pilot it.', recommendationDelivered: true }));
    expect(later.risk.outcome).toBeUndefined();
    expect(stagesFromRecord(later, true).riskAsked).toBe(false);
  });
});

