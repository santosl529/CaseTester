// Phase and stage administration from what the interviewer declared it was
// doing and what code did (spec 2026-10-06-plan-owns-decisions §7). Replaces
// the model's advance_phase bookkeeping (both 2026-09-14 live runs sat in
// STRUCTURE all case) and the stage regexes that guessed from wording. The
// regexes stay only for interviewer turns recorded before moves existed.
import { PHASES, type Phase } from './state-machine';
import type { Move } from '@/lib/agent/models/turn-schema';
import { asksBrainstorm, asksForConclusion, asksRiskQuestion, type StageAdministration } from './spoken-close';

const MOVE_PHASE: Partial<Record<Move, Phase>> = {
  clarify: 'CLARIFY',
  structure: 'STRUCTURE',
  pressure_test: 'STRUCTURE',
  analysis: 'ANALYSIS',
  exhibit: 'EXHIBIT',
  brainstorm: 'BRAINSTORM',
  risk: 'RECOMMENDATION',
  recommendation: 'RECOMMENDATION',
};

const CEILING: Phase = 'RECOMMENDATION';
const at = (p: Phase) => PHASES.indexOf(p);

export type ProgressEvidence = {
  move?: Move;                   // this turn's declared move (none on scripted turns)
  releasedReleaseWhen: Phase[];  // releaseWhen of every item released this turn
  exhibitShown: boolean;
  recAsk: boolean;               // code asked for the recommendation this turn
  close: boolean;
};

export function derivePhase(current: Phase, e: ProgressEvidence): Phase {
  if (e.close) return 'SCORING';
  const candidates: Phase[] = [current];
  if (current === 'INTRO') candidates.push('CLARIFY'); // INTRO is only the opening exchange
  if (e.move && MOVE_PHASE[e.move]) candidates.push(MOVE_PHASE[e.move]!);
  candidates.push(...e.releasedReleaseWhen);
  if (e.exhibitShown) candidates.push('EXHIBIT');
  if (e.recAsk) candidates.push('RECOMMENDATION');
  const best = candidates.reduce((a, b) => (at(b) > at(a) ? b : a), current);
  return at(best) > at(CEILING) && at(current) <= at(CEILING) ? CEILING : best;
}

// What an interviewer turn did, as recorded at commit: the model's move, or
// 'code_rec_ask' when code asked for the recommendation.
export type TurnMove = Move | 'code_rec_ask';

// v4.10 (round-3): a move label alone no longer counts — the delivered text
// has to do what the label says (batch 18: a "which lever matters most?"
// labelled brainstorm opened the end gate with no brainstorm asked). Code's
// own asks (code_rec_ask, code's stage asks recorded as moves) are trusted.
const BRAINSTORM_TEXT = /\b(?:what|how)\s+else\b|\bwhat\s+other\s+(?:ways|options|levers|ideas|things|moves|actions)\b|\bother\s+ways\s+(?:to|could|might|can)\b|\bas many (?:options|ideas)\b/i;
const RISK_TEXT = /\b(?:risk|go wrong|change your mind|wrong about|break (?:it|that|this))\b/i;
const REC_TEXT = /\b(?:recommend\w*|tell the (?:ceo|client)|should (?:they|the client|the company|brew)|what would you do|bottom.?line)\b/i;

export function stagesFromTurns(
  interviewerTurns: { turnIndex: number; text: string }[],
  moves: Record<number, TurnMove>,
  recommendationReceived: boolean,
): StageAdministration {
  let brainstormAsked = false, riskAsked = false, recommendationAskCount = 0;
  for (const t of interviewerTurns) {
    const m = moves[t.turnIndex];
    brainstormAsked ||= asksBrainstorm(t.text) || (m === 'brainstorm' && BRAINSTORM_TEXT.test(t.text));
    // Fact guards Phase 5 (batch 20): a risk question labelled recommendation is
    // no recommendation ask (R36 "…the biggest risk to recommending it now?");
    // the risk question counts once a recommendation has been asked, or in
    // strict wording — never an analysis "…how would you test that?" (R16, R18
    // closed with no risk asked).
    if (m === 'code_rec_ask' || asksForConclusion(t.text) || (m === 'recommendation' && t.text.includes('?') && REC_TEXT.test(t.text) && !asksRiskQuestion(t.text, false))) recommendationAskCount++;
    // Asked by this turn — not "received" now, which would count an earlier
    // analysis "Suppose the test shows…" once the recommendation came in.
    const recOnTable = recommendationAskCount > 0;
    riskAsked ||= asksRiskQuestion(t.text, recOnTable) || (recOnTable && m === 'risk' && t.text.includes('?') && RISK_TEXT.test(t.text));
  }
  return { brainstormAsked, riskAsked, recommendationAsked: recommendationAskCount > 0, recommendationAskCount, recommendationReceived };
}
