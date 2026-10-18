// Speech-to-text spellings of case terms the checks read by name (Lorenzo's
// brief, 17 Oct; session 9ccf0836: "It's the Cogshare from two years ago"):
// "Cogshare", "cog share", "cogs share" → "COGS share". The checks match
// "COGS" in any case, but not inside one word or as "cog". Applied to what the
// checks read (planTurn: this message and the history); the saved transcript
// keeps what was heard (TurnCtx.heardText).
const COGS_SHARE = /\bcogs?\s*(share)(s?)\b/gi;

export function normalizeAsrTerms(text: string): string {
  return text.replace(COGS_SHARE, (_m, _share: string, s: string) => `COGS share${s}`);
}
