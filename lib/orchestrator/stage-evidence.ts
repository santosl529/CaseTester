// What actually happened, stage by stage (docs/interviewer-behavior.md Rule
// 9; round-3 fixes, 11 Oct 2026). Batch 18: the exhibit was never shown in 8
// interviews and the brainstorm never asked in 1, yet all 8 were rated on
// Data & Exhibit, and the brainstorm report rated Creativity "strong"; stages
// were read from the model's move labels, and "exhibit shown" stood for
// "exhibit interpreted".
//
// The record is code's, kept per session (flags.stageEvidence), updated after
// every turn from what was delivered — the saved interviewer line, the exhibit
// on screen, code's own stage asks — and from the candidate's reply to it:
//   delivered: the interviewer actually put the stage to the candidate;
//   outcome:   answered | declined | unable | waived | time_up — how it
//              resolved (waived is the pressure test's v3 bound, kept apart
//              from answered; both resolve the gate);
//   spontaneous: the candidate did it before being asked.
// A stage is assessed only when answered (or done spontaneously). Scoring
// reads the record; missing evidence becomes "not assessed", never an
// invented rating (lib/scoring/stage-caps.ts).
import { asksBrainstorm, asksForConclusion, asksRiskQuestion, type StageAdministration } from './spoken-close';
import { asksCaseBrainstorm } from './brainstorm';
import { classifyTurn } from './stall';
import { isRefusalToStart } from './candidate-exit';
import type { PressureTestState } from './pressure-test';

export const STAGES = ['structure', 'pressure_test', 'analysis', 'exhibit', 'brainstorm', 'recommendation', 'risk'] as const;
export type StageKey = (typeof STAGES)[number];
export type StageOutcome = 'answered' | 'declined' | 'unable' | 'waived' | 'time_up';
// asks: the turns that put the stage to the candidate (the recommendation's ask limit reads it).
export type StageEntry = { delivered: boolean; deliveredAt?: number; outcome?: StageOutcome; spontaneous?: boolean; codeAsked?: boolean; asks?: number };
export type StageRecord = Record<StageKey, StageEntry> & {
  pending?: StageKey | null;   // delivered last turn, waiting for the candidate's reply
  pendingReplies?: number;     // replies that only asked something back
};

export const INITIAL_STAGES: StageRecord = {
  structure: { delivered: true, deliveredAt: 0 },   // the opening question
  pressure_test: { delivered: false },
  analysis: { delivered: false },
  exhibit: { delivered: false },
  brainstorm: { delivered: false },
  recommendation: { delivered: false },
  risk: { delivered: false },
  pending: null,
};

// A brainstorm question in the interviewer's own words — the open "what else /
// what other ways / beyond X" ask, not a single-lever probe.
const BRAINSTORM_OPEN = /\b(?:what|how)\s+else\b|\bwhat\s+other\s+(?:ways|options|levers|ideas|things|moves|actions|initiatives)\b|\bother\s+ways\s+(?:to|could|might|can)\b|\bbeyond\s+[^?]{1,60}?,\s*what\b|\bas many (?:options|ideas)\b|\bbrainstorm/i;
// The end gate's wording for a labelled move (progress.ts until 13 Oct).
const BRAINSTORM_TEXT = /\b(?:what|how)\s+else\b|\bwhat\s+other\s+(?:ways|options|levers|ideas|things|moves|actions)\b|\bother\s+ways\s+(?:to|could|might|can)\b|\bas many (?:options|ideas)\b/i;
const RISK_TEXT = /\b(?:risks?|go wrong|change your mind|wrong about|break (?:it|that|this))\b/i;
const REC_TEXT = /\b(?:recommend\w*|tell the (?:ceo|client)|should (?:they|the client|the company|brew)|what would you do|bottom.?line)\b/i;

export function asksBrainstormNow(question: string): boolean {
  return asksBrainstorm(question) || BRAINSTORM_OPEN.test(question);
}

// How a reply resolves a stage put to the candidate. A question back (a
// clarification, a data ask) leaves it pending — twice at most.
export function replyOutcome(text: string): StageOutcome | 'pending' {
  if (isRefusalToStart(text) || /\b(?:i'?d rather not|skip (?:it|this|that)|pass on (?:this|that|it)|i'?ll pass)\b/i.test(text)) return 'declined';
  const kind = classifyTurn(text, null).kind;
  if (kind === 'analysis') return 'answered';
  if (kind === 'hedge') return 'unable';
  return 'pending';
}

export type StageTurn = {
  turnIndex: number;            // the interviewer line's index
  candidateText: string;        // this turn's candidate message (the reply to what was pending)
  question: string;             // the interviewer question as delivered
  exhibitShown: boolean;        // an exhibit reached the screen this turn
  released: boolean;            // case data was released this turn
  recAsked: boolean;            // code asked for the recommendation this turn
  recommendationDelivered: boolean;
  pressureTest: PressureTestState;
  candidateFigures: number;     // figures the candidate derived so far (math-talk.ts)
  codeAsked?: StageKey;         // code administered this stage this turn
  ended?: 'time_up' | null;     // the session closed this turn at time-up
  brainstormAsks?: string[];    // the case's own brainstorm question (brainstorm.ts)
  brainstormDue?: boolean;      // false: the brainstorm waits on exhibits — no question counts as it yet (code's own ask aside)
  move?: string;                // the turn's move as saved: the model's declared move, code's stage move, or code_rec_ask
};

// The stages a delivered question asks, in the record's own reading (below):
// the brainstorm, the recommendation, the risk. recOnTable: a recommendation
// asked or given before this question.
export type StageQuestions = { brainstorm: boolean; recommendation: boolean; risk: boolean };
export function stageQuestions(question: string, o: { move?: string; recOnTable: boolean; brainstormAsks?: string[]; brainstormDue?: boolean }): StageQuestions {
  // The brainstorm: the closing grammar ("what else could X do", "what other
  // levers"), a brainstorm move in brainstorm wording, or the case's own ask —
  // not any "what else" ("What else would you need to rule out…?" is a probe:
  // Destiny df623412 t20); none before it is due.
  const brainstorm = o.brainstormDue !== false
    && (asksBrainstorm(question) || (o.move === 'brainstorm' && BRAINSTORM_TEXT.test(question)) || asksCaseBrainstorm(question, o.brainstormAsks ?? []));
  // A recommendation ask in any wording, or a recommendation move in
  // recommendation wording that is no risk question.
  const recommendation = asksForConclusion(question)
    || (o.move === 'recommendation' && question.includes('?') && REC_TEXT.test(question) && !asksRiskQuestion(question, false));
  // The risk question once a recommendation is on the table, in risk wording
  // or as a risk move in risk words ("Which single risk could most undermine
  // this recommendation…?" — Ines 62d06bd6 t20).
  const onTable = o.recOnTable || recommendation;
  const risk = asksRiskQuestion(question, onTable) || (onTable && o.move === 'risk' && question.includes('?') && RISK_TEXT.test(question));
  return { brainstorm, recommendation, risk };
}

export function updateStages(prev: StageRecord | undefined, t: StageTurn): StageRecord {
  const r: StageRecord = structuredClone(prev ?? INITIAL_STAGES);
  for (const k of STAGES) r[k] ??= { delivered: false };

  // The reply to what was pending.
  if (r.pending) {
    const stage = r.pending;
    const outcome = replyOutcome(t.candidateText);
    if (outcome !== 'pending') {
      r[stage] = { ...r[stage], outcome: r[stage].outcome ?? outcome };
      r.pending = null; r.pendingReplies = 0;
    } else if ((r.pendingReplies ?? 0) + 1 >= 2) {
      r[stage] = { ...r[stage], outcome: r[stage].outcome ?? 'unable' };
      r.pending = null; r.pendingReplies = 0;
    } else {
      r.pendingReplies = (r.pendingReplies ?? 0) + 1;
    }
  }

  // Structure and its probe, from the pressure-test state (code's, not a label).
  const pt = t.pressureTest;
  if (pt.structureGiven || pt.state === 'awaiting' || pt.state === 'satisfied') r.structure = { ...r.structure, outcome: r.structure.outcome ?? 'answered' };
  if (pt.askedAt !== undefined && !r.pressure_test.delivered) r.pressure_test = { ...r.pressure_test, delivered: true, deliveredAt: pt.askedAt };
  if (pt.state === 'satisfied') r.pressure_test = { ...r.pressure_test, outcome: 'answered' };
  if (pt.state === 'waived') r.pressure_test = { ...r.pressure_test, outcome: r.pressure_test.outcome ?? 'waived' };

  // Analysis: data out, and the candidate working it.
  if (t.released && !r.analysis.delivered) r.analysis = { ...r.analysis, delivered: true, deliveredAt: t.turnIndex };
  if (r.analysis.delivered && t.candidateFigures > 0) r.analysis = { ...r.analysis, outcome: r.analysis.outcome ?? 'answered' };

  // The recommendation: received counts whoever asked (a volunteered one is spontaneous).
  if (t.recommendationDelivered && !r.recommendation.outcome) {
    r.recommendation = { ...r.recommendation, outcome: 'answered', spontaneous: !r.recommendation.delivered };
  }

  // This turn's deliveries; the newest becomes pending.
  const deliver = (k: StageKey, codeAsked = false) => {
    r[k] = { ...r[k], asks: (r[k].asks ?? 0) + 1 };
    if (!r[k].delivered) r[k] = { ...r[k], delivered: true, deliveredAt: t.turnIndex, ...(codeAsked ? { codeAsked: true } : {}) };
    if (!r[k].outcome) { r.pending = k; r.pendingReplies = 0; }
  };
  if (t.exhibitShown) deliver('exhibit', t.codeAsked === 'exhibit');
  // The record is the end gate's only reading (Lorenzo, 13 Oct: one source of
  // truth), so it reads as the end gate did (v4.10 round 3, fact guards Phase
  // 5): a move label counts only when the delivered text does what it says.
  const move = t.move;
  const codeRecAsk = t.recAsked || move === 'code_rec_ask';
  const asked = stageQuestions(t.question, {
    move, brainstormAsks: t.brainstormAsks, brainstormDue: t.brainstormDue,
    recOnTable: r.recommendation.delivered || Boolean(r.recommendation.outcome) || t.recommendationDelivered || codeRecAsk,
  });
  if (t.codeAsked === 'brainstorm' || asked.brainstorm) deliver('brainstorm', t.codeAsked === 'brainstorm');
  if (codeRecAsk || asked.recommendation) deliver('recommendation');
  if (asked.risk) deliver('risk');

  if (t.ended === 'time_up') {
    for (const k of STAGES) if (!r[k].outcome && (r[k].delivered || k === 'exhibit' || k === 'brainstorm')) r[k] = { ...r[k], outcome: 'time_up' };
    r.pending = null;
  }
  return r;
}

// A stage that counts as assessable evidence.
export function assessed(e: StageEntry | undefined): boolean {
  return Boolean(e && (e.outcome === 'answered' || e.spontaneous));
}

export function anyAssessable(r: StageRecord | undefined): boolean {
  return Boolean(r && STAGES.some(k => assessed(r[k])));
}

// The stages the case still owes before a normal end (interviewer-led): the
// exhibit (when the case has one) and the brainstorm (unless the case has no
// brainstorm module), each once — answered, declined or unable all resolve it.
export function missingRequiredStages(r: StageRecord | undefined, p: { hasExhibit: boolean; format?: 'interviewer_led' | 'candidate_led'; brainstormRequired?: boolean }): StageKey[] {
  if (p.format === 'candidate_led') return [];
  const rec = r ?? INITIAL_STAGES;
  const out: StageKey[] = [];
  if (p.hasExhibit && !rec.exhibit.delivered) out.push('exhibit');
  if (!rec.brainstorm.delivered && p.brainstormRequired !== false) out.push('brainstorm');
  return out;
}

// The end gate's reading (Lorenzo, 13 Oct: one source of truth for what's
// owed — the record, not a second reading of the transcript). A record saved
// before the ask count existed counts a delivered recommendation as one ask.
export function stagesFromRecord(r: StageRecord, recommendationReceived: boolean): StageAdministration {
  const rec = r.recommendation ?? { delivered: false };
  return {
    brainstormAsked: Boolean(r.brainstorm?.delivered),
    riskAsked: Boolean(r.risk?.delivered),
    recommendationAsked: rec.delivered,
    recommendationAskCount: rec.asks ?? (rec.delivered ? 1 : 0),
    recommendationReceived,
  };
}
