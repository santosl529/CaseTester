// Where an unfinished interview stands, by the interviewer's own clock (Matt, 17 Nov, pre-pilot audit M3): time since
// the start, pauses excluded (lib/orchestrator/silence.ts), against the case's length. With time left it can be
// continued; with time up it counts as ended, with a report when something assessable happened (the End button's rule,
// lib/orchestrator/session-end.ts).
import { effectiveElapsedMs, INITIAL_SILENCE_STATE, type SilenceState } from '@/lib/orchestrator/silence';
import { hasAssessableEvidence } from '@/lib/orchestrator/session-outcome';

export type InterviewClock = { state: 'running'; minutesLeft: number } | { state: 'time_up'; report: boolean };

export function interviewClock(startedAt: Date, flags: unknown, totalMs: number, now: Date): InterviewClock {
  const f = (flags ?? {}) as Record<string, unknown>;
  const elapsed = effectiveElapsedMs(startedAt.getTime(), now.getTime(), (f.silence as SilenceState | undefined) ?? INITIAL_SILENCE_STATE);
  if (elapsed < totalMs) return { state: 'running', minutesLeft: Math.max(1, Math.ceil((totalMs - elapsed) / 60_000)) };
  return { state: 'time_up', report: hasAssessableEvidence(f) };
}
