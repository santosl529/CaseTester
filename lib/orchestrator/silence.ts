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
//   clock stops FROM the pause point — the silence before it is ordinary case
//   time, so going quiet is never a way to buy thinking time. The pause line
//   warns that the session ends if the candidate isn't back within the limit.
// - A pause lasts at most SILENCE_PAUSE_MAX_MS, and a session gets
//   SESSION_PAUSE_BUDGET_MS of paused time in total; once the budget is spent,
//   silence still gets its check-in but never pauses again. A pause that runs
//   out with no candidate message expires: the session is abandoned (Rule 19,
//   unscored). A candidate who returns late is credited at most the limit.
//
// silentMs comes from the channel, so it is bounded server-side: a silence
// can't predate the last turn, and once checked in, it can't predate the
// silence start recorded then (the check-in is itself a turn).

export const SILENCE_CHECK_IN_MS = 60_000;
export const SILENCE_PAUSE_MS = 180_000;
export const SILENCE_PAUSE_MAX_MS = 5 * 60_000;
export const SESSION_PAUSE_BUDGET_MS = 5 * 60_000;

export type SilenceState = {
  checkedIn: boolean;                // check-in already delivered for the current silence
  silenceStartedAtMs: number | null; // recorded at the check-in
  pausedAtMs: number | null;         // open technical pause (epoch ms), null if none
  pauseLimitMs: number | null;       // how long the open pause may last
  pausedTotalMs: number;             // closed pauses, excluded from case time
};

export const INITIAL_SILENCE_STATE: SilenceState = {
  checkedIn: false, silenceStartedAtMs: null, pausedAtMs: null, pauseLimitMs: null, pausedTotalMs: 0,
};

export type SilenceAction = 'none' | 'check_in' | 'pause' | 'expire';

export function evaluateSilence(
  reportedSilentMs: number, nowMs: number, prior: SilenceState, lastTurnMs: number,
): { action: SilenceAction; state: SilenceState } {
  const floorMs = prior.silenceStartedAtMs ?? lastTurnMs;
  const silentMs = Math.min(reportedSilentMs, Math.max(0, nowMs - floorMs));
  if (prior.pausedAtMs !== null) {
    const pausedForMs = silentMs - SILENCE_PAUSE_MS;
    return { action: pausedForMs >= (prior.pauseLimitMs ?? 0) ? 'expire' : 'none', state: prior };
  }
  // Check-in always comes first, even if a coarse tick lands past the pause threshold.
  if (!prior.checkedIn) {
    if (silentMs < SILENCE_CHECK_IN_MS) return { action: 'none', state: prior };
    return { action: 'check_in', state: { ...prior, checkedIn: true, silenceStartedAtMs: nowMs - silentMs } };
  }
  const budgetLeftMs = SESSION_PAUSE_BUDGET_MS - prior.pausedTotalMs;
  if (silentMs < SILENCE_PAUSE_MS || budgetLeftMs <= 0) return { action: 'none', state: prior };
  return {
    action: 'pause',
    state: {
      ...prior,
      pausedAtMs: nowMs - silentMs + SILENCE_PAUSE_MS,
      pauseLimitMs: Math.min(SILENCE_PAUSE_MAX_MS, budgetLeftMs),
    },
  };
}

function creditedPauseMs(state: SilenceState, nowMs: number): number {
  if (state.pausedAtMs === null) return 0;
  return Math.min(Math.max(0, nowMs - state.pausedAtMs), state.pauseLimitMs ?? 0);
}

// Any candidate turn ends the silence: clear the check-in and close an open
// pause, banking at most its limit.
export function resumeOnCandidateTurn(prior: SilenceState, nowMs: number): { state: SilenceState; resumedAfterMs: number | null } {
  const cleared = { ...prior, checkedIn: false, silenceStartedAtMs: null, pausedAtMs: null, pauseLimitMs: null };
  if (prior.pausedAtMs === null) return { state: cleared, resumedAfterMs: null };
  const credited = creditedPauseMs(prior, nowMs);
  return { state: { ...cleared, pausedTotalMs: prior.pausedTotalMs + credited }, resumedAfterMs: credited };
}

// Case time with pauses excluded (Rule 19) — drives the clock, time warning,
// load shedding, and case_complete analytics.
export function effectiveElapsedMs(startedAtMs: number, nowMs: number, state: SilenceState): number {
  return nowMs - startedAtMs - state.pausedTotalMs - creditedPauseMs(state, nowMs);
}

const CHECK_IN = 'Still with me? Take your time.';

// The check-in restates the pending question. `storedQuestion` is the
// question field the last turn ended on (flags.lastQuestion); the text
// fallback serves sessions recorded before it was stored. Batch 9, Maya t16:
// a question that itself began "The question on the table is…" was wrapped
// again ("The question on the table: the question on the table is…").
export function checkInText(lastInterviewerText: string | null, storedQuestion?: string | null): string {
  const raw = storedQuestion?.trim() || lastInterviewerText?.match(/[^.?!]*\?/g)?.at(-1)?.trim();
  const question = raw?.replace(/^(?:take your time\.\s*)?the question on the table(?: is|:)\s*/i, '').trim();
  if (!question) return CHECK_IN;
  return `${CHECK_IN} The question on the table: ${question.charAt(0).toLowerCase()}${question.slice(1)}`;
}

// The scripted silence lines (check-in, pause): the model never sees them in
// its history (spec 2026-10-06 D7) — it copied them into its own turns.
export function isSilenceLine(text: string): boolean {
  return text.startsWith(CHECK_IN) || text.startsWith('Looks like we may have lost you');
}

export function pauseText(limitMs: number): string {
  const minutes = Math.max(1, Math.ceil(limitMs / 60_000));
  return `Looks like we may have lost you — I've paused the clock. If you're not back within ${minutes} minute${minutes === 1 ? '' : 's'}, we'll end the session here.`;
}
