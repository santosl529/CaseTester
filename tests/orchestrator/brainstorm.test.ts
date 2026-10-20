import { describe, it, expect } from 'vitest';
import { brainstormAsks, brainstormRequired, asksCaseBrainstorm, GENERIC_BRAINSTORM_ASKS } from '@/lib/orchestrator/brainstorm';
import { getCaseById } from '@/lib/cases/loader';
import { stageGateOpen, asksBrainstorm } from '@/lib/orchestrator/spoken-close';
import { missingRequiredStages, updateStages, INITIAL_STAGES, type StageTurn } from '@/lib/orchestrator/stage-evidence';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';

// New cases (13 Oct): each case's own brainstorm question is the brainstorm —
// code asks it, and recognises it when the interviewer asks it — and a case
// without a brainstorm module (Quillpath) owes none.
describe('a case brainstorm', () => {
  it("is the case's own ask, else the generic pool — which has no profitability line", () => {
    expect(brainstormAsks(getCaseById('launch-001'))).toEqual(['What could Hollis Bay do to get shoppers to try its chickpea snacks — and to keep buying them?']);
    expect(brainstormAsks({})).toEqual([...GENERIC_BRAINSTORM_ASKS]);
    expect(GENERIC_BRAINSTORM_ASKS.join(' ')).not.toMatch(/margin|pricing/);
  });

  it("prof-001 keeps its three lines, the profitability one among them", () => {
    expect(brainstormAsks(getCaseById('prof-001'))).toEqual([
      "Beyond what we've discussed, what else could the client do?",
      'What other levers could the client pull here?',
      'What else could the client do to protect margin?',
    ]);
  });

  // Session 9813d6ce (18 Oct): "Beyond pricing, what else…" was the first
  // brainstorm question though pricing hadn't come up. Code asks one of these
  // whatever was said, so none may name a lever — and each still reads as the
  // brainstorm to the generic grammar.
  it("no prof-001 ask presumes a lever was discussed, and each reads as the brainstorm", () => {
    for (const a of brainstormAsks(getCaseById('prof-001'))) {
      expect(a).not.toMatch(/pric|cost|cogs|procure|supplier|bean|labor|overhead/i);
      expect(asksBrainstorm(a)).toBe(true);
    }
  });

  it('is required unless the case says not (Quillpath has no brainstorm module)', () => {
    expect(brainstormRequired(getCaseById('pricing-001'))).toBe(false);
    for (const id of ['prof-001', 'prof-002', 'entry-001', 'launch-001']) expect(brainstormRequired(getCaseById(id))).toBe(true);
  });

  it.each([
    ['launch-001', 'What could Hollis Bay do to get shoppers to try its chickpea snacks — and to keep buying them?'],
    ['launch-001', 'Before we size it: what could Hollis Bay do to get shoppers to try the chickpea snacks and keep buying them?'],
    ['entry-001', 'If Aldermoor builds its own team, how could it reduce the risk of a slow start?'],
    ['entry-001', 'Say Aldermoor builds its own team — how could it reduce the risk of a slow start?'],
    ['prof-002', "What else could Larkspur do to make sure it's profitable in the first year?"],
  ])('recognises %s asked in the interviewer\'s words: %s', (id, question) => {
    expect(updateStages(undefined, { turnIndex: 9, candidateText: 'Okay.', question, exhibitShown: false, released: false, recAsked: false,
      recommendationDelivered: false, pressureTest: INITIAL_PRESSURE_TEST, candidateFigures: 0, brainstormAsks: brainstormAsks(getCaseById(id)) }).brainstorm.delivered).toBe(true);
  });

  it.each([
    ['launch-001', 'How many shoppers said they would try the chickpea snacks?'],
    ['launch-001', 'What does the survey tell you about shoppers who would keep buying?'],
    ['entry-001', 'What does it cost Aldermoor to build its own team?'],
    ['prof-002', 'Is Larkspur profitable on the other routes?'],
    ['launch-001', 'Hollis Bay could get shoppers to try its chickpea snacks and keep buying them.'],  // no question
  ])('not an analysis question on the same nouns: %s — %s', (id, question) => {
    expect(asksCaseBrainstorm(question, brainstormAsks(getCaseById(id)))).toBe(false);
  });
});

describe('the stage gate and stage record read the case brainstorm', () => {
  const asks = brainstormAsks(getCaseById('launch-001'));
  const hollis = { turnIndex: 9, text: 'What could Hollis Bay do to get shoppers to try its chickpea snacks — and to keep buying them?' };

  it('the gate opens without a brainstorm when the case owes none', () => {
    const s = { brainstormAsked: false, riskAsked: true, recommendationAsked: true, recommendationAskCount: 1, recommendationReceived: true };
    expect(stageGateOpen(s)).toBe(false);
    expect(stageGateOpen(s, { brainstormRequired: false })).toBe(true);
  });

  it('the brainstorm is not owed when the case has none', () => {
    expect(missingRequiredStages(INITIAL_STAGES, { hasExhibit: false })).toEqual(['brainstorm']);
    expect(missingRequiredStages(INITIAL_STAGES, { hasExhibit: false, brainstormRequired: false })).toEqual([]);
  });

  it('updateStages records the case ask as the brainstorm delivered', () => {
    const t: StageTurn = { turnIndex: 9, candidateText: 'Okay.', question: hollis.text, exhibitShown: false, released: false, recAsked: false,
      recommendationDelivered: false, pressureTest: INITIAL_PRESSURE_TEST, candidateFigures: 0 };
    expect(updateStages(undefined, t).brainstorm.delivered).toBe(false);
    expect(updateStages(undefined, { ...t, brainstormAsks: asks }).brainstorm.delivered).toBe(true);
  });
});

describe("word overlap only for asks the generic grammar doesn't know", () => {
  it("prof-001: an analysis question on its brainstorm's nouns is not the brainstorm", () => {
    expect(asksCaseBrainstorm('How does pricing protect margin for the client?', brainstormAsks(getCaseById('prof-001')))).toBe(false);
  });
  it('Larkspur: the grammar recognises its line ("what else could Larkspur do")', () => {
    expect(updateStages(undefined, { turnIndex: 9, candidateText: 'Okay.', question: "What else could Larkspur do to make sure it's profitable in the first year?", exhibitShown: false, released: false, recAsked: false,
      recommendationDelivered: false, pressureTest: INITIAL_PRESSURE_TEST, candidateFigures: 0 }).brainstorm.delivered).toBe(true);
  });
});

// Task 43 (round 5, A7): B1 Aldermoor — the model's reworded brainstorm ask was
// not credited because its lead-in ("Suppose Aldermoor builds its own US team.")
// was a separate sentence, so the question alone fell under the overlap; code's
// stage turn then re-asked the case's ask word for word (Raj t18 -> t20, Marcus t14 -> t20).
describe('a reworded case ask with its lead-in sentence', () => {
  const asks = () => brainstormAsks(getCaseById('entry-001'));
  const stage = (question: string, brainstormDue?: boolean) => updateStages(undefined, { turnIndex: 18, candidateText: 'Okay.', question, exhibitShown: false, released: false,
    recAsked: false, recommendationDelivered: false, pressureTest: INITIAL_PRESSURE_TEST, candidateFigures: 0, brainstormAsks: asks(), brainstormDue, move: 'brainstorm' }).brainstorm.delivered;

  it.each([
    ['Raj t18', 'Suppose Aldermoor builds its own US team. How could it reduce the risk of a slow start, given the barriers the specialists named?'],
    ['Marcus t14', 'Suppose Aldermoor chooses to build its own US team, which keeps the economics but means a slow start. What could it do to reduce that risk?'],
  ])('credits %s', (_n, q) => {
    expect(stage(q)).toBe(true);
  });
  it('a question that only mentions the topic is not it', () => {
    expect(stage('What are the risks of a slow start?')).toBe(false);
    expect(stage('Suppose Aldermoor builds its own US team. What are the risks of a slow start?')).toBe(false);
  });
  it('waits for the exhibits: a paraphrase before Exhibit 3 does not count', () => {
    expect(stage('Suppose Aldermoor builds its own US team. How could it reduce the risk of a slow start, given the barriers the specialists named?', false)).toBe(false);
  });
});
