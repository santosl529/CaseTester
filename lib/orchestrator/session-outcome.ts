// Pure readings of a session's state for the end paths (Rule 18A, v4.10):
// whether the case ran its course, and whether anything assessable happened.
// Used by Plan (a typed stop) and session-end.ts (the End button).
import { anyAssessable, type StageRecord } from './stage-evidence';
import { stagesFromTurns, type TurnMove } from './progress';
import type { PressureTestState } from './pressure-test';
import type { StallState } from './stall';

// The case has run its course: recommendation in and its risk probed.
export function caseFinished(flags: Record<string, unknown>, interviewerTurns: { turnIndex: number; text: string }[]): boolean {
  const rec = flags.stageEvidence as StageRecord | undefined;
  if (rec) return rec.recommendation?.outcome === 'answered' && Boolean(rec.risk?.delivered);
  const recommendationDelivered = Boolean((flags.stall as StallState | undefined)?.recommendationDelivered);
  const stages = stagesFromTurns(interviewerTurns, (flags.moves as Record<number, TurnMove> | undefined) ?? {}, recommendationDelivered);
  return recommendationDelivered && stages.riskAsked;
}

// Whether the candidate has done anything a report could assess.
export function hasAssessableEvidence(flags: Record<string, unknown>): boolean {
  if (anyAssessable(flags.stageEvidence as StageRecord | undefined)) return true;
  const pt = flags.pressureTest as Partial<PressureTestState> | undefined;
  return Boolean(pt && (pt.structureGiven || pt.state === 'awaiting' || pt.state === 'satisfied'))
    || Boolean((flags.stall as StallState | undefined)?.recommendationDelivered);
}

