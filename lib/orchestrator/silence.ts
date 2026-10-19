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

import { line, phrase, PHRASE_POOLS, type PhraseUses } from './phrasing';

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


// The check-in restates the pending question. `storedQuestion` is the
// question field the last turn ended on (flags.lastQuestion); the text
// fallback serves sessions recorded before it was stored. Batch 9, Maya t16:
// a question that itself began "The question on the table is…" was wrapped
// again ("The question on the table: the question on the table is…").
// \`uses\`, \`seed\`: the check-in in one of its versions (phrasing.ts check_in), never one of its last 3.
export function checkInText(lastInterviewerText: string | null, storedQuestion?: string | null, uses?: PhraseUses, seed = ''): string {
  const raw = storedQuestion?.trim() || lastInterviewerText?.match(/[^.?!]*\?/g)?.at(-1)?.trim();
  const question = raw ? withoutLeadIn(raw) : '';
  const checkIn = line('check_in', uses, seed);
  if (!question) return checkIn;
  return `${checkIn} The question on the table: ${lowerQuestionWord(question)}`;
}

// A question said again mid-sentence (batch 21 D8, Destiny t4: "The question
// on the table is lay out the main areas…"). Its first letter is lowered only
// when it opens with a question word ("how would you…") — never an
// imperative's, a name's or an acronym's ("COGS", "Hollis Bay"); "is" joins
// only one sentence that opens with a question word, anything else follows a colon.
const QUESTION_WORD = /^(?:what|which|how|why|where|who|whose|when|whether|is|are|was|were|do|does|did|can|could|would|should|will|has|have)\b/i;
// Any version of the stall lead (phrasing.ts stall_lead) before it, too.
const STALL_LEADS = PHRASE_POOLS.stall_lead.map(v => v.split('{x}')[0].trim()).filter(Boolean)
  .map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ +/g, '\\s+'));
const LEAD_IN = new RegExp(`^(?:(?:${STALL_LEADS.join('|')})\\s*)?the question on the table(?: is|:)\\s*`, 'i');
const withoutLeadIn = (q: string) => q.trim().replace(LEAD_IN, '').trim();
const lowerQuestionWord = (q: string) => (QUESTION_WORD.test(q) ? q.charAt(0).toLowerCase() + q.slice(1) : q);
export function restateOnTable(stored: string): string {
  const q = withoutLeadIn(stored);
  const oneSentence = q.split(/(?<=[.?!])\s+/).filter(Boolean).length === 1;
  return QUESTION_WORD.test(q) && oneSentence ? `The question on the table is ${lowerQuestionWord(q)}` : `The question on the table: ${q}`;
}

// The scripted silence lines (check-in, pause): the model never sees them in
// its history (spec 2026-10-06 D7) — it copied them into its own turns.
// Every version of the check-in and the pause (phrasing.ts), by its opening words.
const SILENCE_OPENINGS = [...PHRASE_POOLS.check_in, ...PHRASE_POOLS.pause.map(v => v.split(/\{[xX]\}/)[0])];
export function isSilenceLine(text: string): boolean {
  return SILENCE_OPENINGS.some(o => text.startsWith(o.trim()));
}

// \`uses\`, \`seed\`: the pause in one of its versions (phrasing.ts pause), never one of its last 3.
export function pauseText(limitMs: number, uses?: PhraseUses, seed = ''): string {
  const minutes = Math.max(1, Math.ceil(limitMs / 60_000));
  return phrase('pause', `${minutes} minute${minutes === 1 ? '' : 's'}`, uses, seed);
}
