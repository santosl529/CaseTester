// Pure readings of a session's state for the end paths (Rule 18A, v4.10):
// whether the case ran its course, and whether anything assessable happened.
// Used by Plan (a typed stop) and session-end.ts (the End button).
import { anyAssessable, INITIAL_STAGES, type StageRecord } from './stage-evidence';
import type { PressureTestState } from './pressure-test';
import type { StallState } from './stall';

// The case has run its course: recommendation in and its risk probed.
// From the stage record only (Lorenzo, 13 Oct: one source of truth).
export function caseFinished(flags: Record<string, unknown>): boolean {
  const rec = (flags.stageEvidence as StageRecord | undefined) ?? INITIAL_STAGES;
  return rec.recommendation?.outcome === 'answered' && Boolean(rec.risk?.delivered);
}

// Whether the candidate has done anything a report could assess.
export function hasAssessableEvidence(flags: Record<string, unknown>): boolean {
  if (anyAssessable(flags.stageEvidence as StageRecord | undefined)) return true;
  const pt = flags.pressureTest as Partial<PressureTestState> | undefined;
  return Boolean(pt && (pt.structureGiven || pt.state === 'awaiting' || pt.state === 'satisfied'))
    || Boolean((flags.stall as StallState | undefined)?.recommendationDelivered);
}

