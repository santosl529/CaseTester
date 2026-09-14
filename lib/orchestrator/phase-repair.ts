import { PHASES, type Phase } from './state-machine';
import { asksForRecommendation } from '@/lib/agent/prompts/scripts';

// Rule 8 silent phase repair (docs/interviewer-behavior.md): "the orchestrator
// may repair stale state by any number of phases, at any time". Both
// 2026-09-14 live runs sat in STRUCTURE from ~0:30 to the end while data, the
// exhibit, the brainstorm, and the recommendation all happened — the model
// called advance_phase once per session, one phase at a time. So after each
// turn the orchestrator raises the phase to the highest stage the turn's
// observable evidence supports:
//   - a ledger reveal → that item's releaseWhen (authored as the earliest phase
//     the item belongs to);
//   - an exhibit shown → EXHIBIT (interpreting an exhibit is that stage);
//   - an interviewer question asking what else the client could do → BRAINSTORM;
//   - a recommendation ask → RECOMMENDATION.
// Forward only and never past RECOMMENDATION: WRAP and SCORING come only from
// end_case / the model. The two phrase signals are soft — unusual wording is
// missed (the phase lags, as before) but can never move state backwards.

export type PhaseEvidence = {
  revealedReleaseWhen: Phase[]; // releaseWhen of every ledger item revealed this turn, by any path
  exhibitShown: boolean;
  interviewerText: string;      // the final spoken turn
};

export type PhaseRepair = { from: Phase; to: Phase; reasons: string[] };

const REPAIR_CEILING: Phase = 'RECOMMENDATION';

// Client-action framing only. "What else could be driving the gap?" is an
// analysis probe, not a brainstorm, so a bare "what else could" is not enough.
const BRAINSTORM_ASK =
  /\bwhat else (could|can|should|might) [\w&' ]{1,40}? do\b|\bbeyond (pricing|price|that|this|what we'?ve (discussed|covered)),? what\b|\bwhat other (levers|ideas|options)\b|\bbrainstorm/i;

const indexOf = (phase: Phase) => PHASES.indexOf(phase);

function isBrainstormAsk(text: string): boolean {
  return text
    .split(/(?<=[.!?])\s+/)
    .some(sentence => sentence.trim().endsWith('?') && BRAINSTORM_ASK.test(sentence));
}

export function inferPhaseRepair(current: Phase, evidence: PhaseEvidence): PhaseRepair | null {
  if (indexOf(current) >= indexOf(REPAIR_CEILING)) return null;

  const signals: { phase: Phase; reason: string }[] = [
    ...evidence.revealedReleaseWhen.map(phase => ({ phase, reason: `ledger reveal (releaseWhen ${phase})` })),
  ];
  if (evidence.exhibitShown) signals.push({ phase: 'EXHIBIT', reason: 'exhibit shown' });
  if (isBrainstormAsk(evidence.interviewerText)) signals.push({ phase: 'BRAINSTORM', reason: 'brainstorm question' });
  if (asksForRecommendation(evidence.interviewerText)) signals.push({ phase: 'RECOMMENDATION', reason: 'recommendation ask' });

  const ahead = signals.filter(s => indexOf(s.phase) > indexOf(current) && indexOf(s.phase) <= indexOf(REPAIR_CEILING));
  if (ahead.length === 0) return null;

  const to = ahead.reduce<Phase>((best, s) => (indexOf(s.phase) > indexOf(best) ? s.phase : best), current);
  return { from: current, to, reasons: [...new Set(ahead.map(s => s.reason))] };
}
