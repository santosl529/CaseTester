// Spoken close without end_case (Rule 12). Run 1d76e3d9: at 15:33 of a
// 20-minute case the model said "That's time… I'll close the case here" but
// never called end_case, and the session looped on goodbyes until time-up. The
// words and the state must agree:
// - the case may end (coverage gate / time-up) → promote the close to an end;
// - it may not end yet → strip the closing sentences and keep going, with a
//   recommendation-phase depth probe if nothing is left to say.
//
// Deliberately narrower than hasCloseCue (lib/agent/prompts/scripts.ts), which
// also matches "thanks for walking me through…" — fine for checking that an
// ending turn closed, dangerous as a trigger to END a case.

const SPOKEN_CLOSE =
  /\b(that'?s (our )?time|we'?re out of time|we'?ll (stop|end|close|wrap)( it)? (there|here)|(that'?s|this is) where we'?ll (stop|end)|(i'?ll|let'?s|we'?ll) close (the case|it|things) (out |up )?(here|there)|that'?s the (end of the )?case|that concludes the case)\b/i;

// Sentences to drop when a close must be withdrawn: the close itself plus the
// sign-off that travels with it (thanks-for-working, report-will-follow).
const CLOSE_SENTENCE =
  /\b(that'?s (our )?time|we'?re out of time|we'?ll (stop|end|close|wrap)|where we'?ll (stop|end)|close (the case|it|things)|that'?s the (end of the )?case|concludes the case|thanks?( you)? for (working|walking) through (it|the case|this)|report .*(will follow|separately|soon)|debrief)\b/i;

export const CLOSE_DEFERRED_PROBE = "Before we close — what's the biggest risk to that recommendation, and how would you test for it?";

export function isSpokenClose(text: string): boolean {
  return SPOKEN_CLOSE.test(text);
}

export type SpokenCloseResolution = {
  action: 'none' | 'promoted' | 'stripped';
  ended: boolean;
  spokenText: string;
};

export function resolveSpokenClose(params: { spokenText: string; ended: boolean; mayEnd: boolean }): SpokenCloseResolution {
  const { spokenText, ended, mayEnd } = params;
  if (ended || !isSpokenClose(spokenText)) return { action: 'none', ended, spokenText };
  if (mayEnd) return { action: 'promoted', ended: true, spokenText };

  const kept = (spokenText.match(/[^.!?\n]+[.!?]*/g) ?? [])
    .map(s => s.trim())
    .filter(s => s && !CLOSE_SENTENCE.test(s))
    .join(' ')
    .trim();
  return { action: 'stripped', ended: false, spokenText: kept || CLOSE_DEFERRED_PROBE };
}
