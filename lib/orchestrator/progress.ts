// Phase and stage administration from what the interviewer declared it was
// doing and what code did (spec 2026-10-06-plan-owns-decisions §7). Replaces
// the model's advance_phase bookkeeping (both 2026-09-14 live runs sat in
// STRUCTURE all case) and the stage regexes that guessed from wording. The
// regexes stay only for interviewer turns recorded before moves existed.
import { PHASES, type Phase } from './state-machine';
import type { Move } from '@/lib/agent/models/turn-schema';
import { asksBrainstorm, asksRisk, asksRecommendationAsk, type StageAdministration } from './spoken-close';

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

export function stagesFromTurns(
  interviewerTurns: { turnIndex: number; text: string }[],
  moves: Record<number, TurnMove>,
  recommendationReceived: boolean,
): StageAdministration {
  let brainstormAsked = false, riskAsked = false, recommendationAskCount = 0;
  for (const t of interviewerTurns) {
    const m = moves[t.turnIndex];
    if (m !== undefined) {
      brainstormAsked ||= m === 'brainstorm';
      riskAsked ||= m === 'risk';
      if (m === 'recommendation' || m === 'code_rec_ask') recommendationAskCount++;
    } else {
      brainstormAsked ||= asksBrainstorm(t.text);
      riskAsked ||= asksRisk(t.text);
      if (asksRecommendationAsk(t.text)) recommendationAskCount++;
    }
  }
  return { brainstormAsked, riskAsked, recommendationAsked: recommendationAskCount > 0, recommendationAskCount, recommendationReceived };
}
