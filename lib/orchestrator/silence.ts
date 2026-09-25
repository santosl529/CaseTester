// Text-mode silence (docs/interviewer-behavior.md Rules 13, 16, 19). The
// channel reports how long the candidate has been silent since the
// interviewer's last turn; typing is not silence. Pure policy — the runner
// (runSilence in session-runner.ts) persists and speaks.
//
// - Under SILENCE_CHECK_IN_MS: nothing. Rule 13's tolerance window — a slow
//   thinker is never rescued for being slow.
// - At SILENCE_CHECK_IN_MS: one check-in per silence ("Still with me? Take
//   your time."), which doubles as a Level 1 anchor by restating the question
//   on the table. It counts as ONE no-progress turn for the ladder
//   (recordSilenceStall) but never fires a rung itself: silence alone is
//   ambiguous between thinking and a dropout (Rule 16).
// - At SILENCE_PAUSE_MS, after the check-in: technical pause (Rule 19). The
//   pause is backdated to when the silence began, so the whole dropout is
//   excluded from case time, and it ends on the candidate's next turn.
//
// silentMs comes from the channel, so it is bounded server-side: a silence
// can't predate the last turn, and once checked in, it can't predate the
// silence start recorded then (the check-in is itself a turn). A client can't
// inflate silentMs to backdate a pause and claw back case time.

export const SILENCE_CHECK_IN_MS = 60_000;
export const SILENCE_PAUSE_MS = 180_000;

export type SilenceState = {
  checkedIn: boolean;        // check-in already delivered for the current silence
  silenceStartedAtMs: number | null; // recorded at the check-in
  pausedAtMs: number | null; // open technical pause (epoch ms), null if none
  pausedTotalMs: number;     // closed pauses, excluded from case time
};

export const INITIAL_SILENCE_STATE: SilenceState = { checkedIn: false, silenceStartedAtMs: null, pausedAtMs: null, pausedTotalMs: 0 };

export type SilenceAction = 'none' | 'check_in' | 'pause';

export function evaluateSilence(
  reportedSilentMs: number, nowMs: number, prior: SilenceState, lastTurnMs: number,
): { action: SilenceAction; state: SilenceState } {
  if (prior.pausedAtMs !== null) return { action: 'none', state: prior };
  const floorMs = prior.silenceStartedAtMs ?? lastTurnMs;
  const silentMs = Math.min(reportedSilentMs, Math.max(0, nowMs - floorMs));
  // Check-in always comes first, even if a coarse tick lands past the pause threshold.
  if (!prior.checkedIn) {
    if (silentMs < SILENCE_CHECK_IN_MS) return { action: 'none', state: prior };
    return { action: 'check_in', state: { ...prior, checkedIn: true, silenceStartedAtMs: nowMs - silentMs } };
  }
  if (silentMs < SILENCE_PAUSE_MS) return { action: 'none', state: prior };
  return { action: 'pause', state: { ...prior, pausedAtMs: nowMs - silentMs } };
}

// Any candidate turn ends the silence: clear the check-in and close an open pause.
export function resumeOnCandidateTurn(prior: SilenceState, nowMs: number): { state: SilenceState; resumedAfterMs: number | null } {
  if (prior.pausedAtMs === null) return { state: { ...prior, checkedIn: false, silenceStartedAtMs: null }, resumedAfterMs: null };
  const resumedAfterMs = nowMs - prior.pausedAtMs;
  return {
    state: { checkedIn: false, silenceStartedAtMs: null, pausedAtMs: null, pausedTotalMs: prior.pausedTotalMs + resumedAfterMs },
    resumedAfterMs,
  };
}

// Case time with pauses excluded (Rule 19) — drives the clock, time warning,
// load shedding, and case_complete analytics.
export function effectiveElapsedMs(startedAtMs: number, nowMs: number, state: SilenceState): number {
  const open = state.pausedAtMs !== null ? nowMs - state.pausedAtMs : 0;
  return nowMs - startedAtMs - state.pausedTotalMs - open;
}

const CHECK_IN = 'Still with me? Take your time.';

export function checkInText(lastInterviewerText: string | null): string {
  const question = lastInterviewerText?.match(/[^.?!]*\?/g)?.at(-1)?.trim();
  if (!question) return CHECK_IN;
  return `${CHECK_IN} The question on the table: ${question.charAt(0).toLowerCase()}${question.slice(1)}`;
}
