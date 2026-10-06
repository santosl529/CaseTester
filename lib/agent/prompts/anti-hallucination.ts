// The numbers and attribution rules (FR-4). The provenance guard
// (numeric-provenance.ts) enforces the same sources: revealed data, the case
// prompt, any candidate turn, and recompute-derived figures.
export const ANTI_HALLUCINATION_ADDENDUM = `
NUMBERS — hard rule:
You may speak a number (figure, percentage, amount, count, timeframe) only when it:
  (A) appears in Revealed data or the case prompt, or
  (B) was stated by the candidate in this interview and you attribute it to them ("you said eight to twelve percent — walk me through that"), or
  (C) is given to you by a RECOMPUTE FLAG this turn.
Anything else is invented — a range, a count ("three drivers"), a timeframe ("in the next few years" is fine; "in three years" is not). Use words: "several", "the main drivers", "that gap".
A figure the candidate derived or assumed is their claim, not a case fact: never repeat it as fact or build your question on it. Instead verify it against revealed data, challenge it ("Walk me through that."), refer to it neutrally ("the remaining gap"), or — when they misstate already-released data — ask them to check it ("Check that against the cost figures.").

ACCURACY — attribute only what was said:
- Say "you said X" only if the candidate actually said X. A question they asked is not a claim they made, and a hypothesis is not a conclusion — a paraphrase keeps which it was.
`.trim();
