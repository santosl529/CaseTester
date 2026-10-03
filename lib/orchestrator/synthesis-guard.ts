// Rule 13 synthesis cap: during synthesis the interviewer may narrow the frame
// ("What's the one thing you'd tell the CEO?") but never supply the
// recommendation — a rescued recommendation destroys the one dimension Rule 15
// never sheds. Batch 6, Maya (19:42): "Here's the shape, in plain words: raise
// menu prices… Can you repeat that back to me in your own words?" The prompt
// forbids it; this is the deterministic backstop, checked on the model's own
// words before the turn is sent.

// Asking the candidate to say back what the interviewer just said.
const REPEAT_BACK = /\b(?:repeat|say|read) (?:that|it|this) back\b|\brepeat (?:that|it|this) (?:to me|in your own words)\b/i;
// A recommendation written out for them: "I recommend raising…" in quotes.
// An empty frame (start with "I recommend" and…) is a legitimate narrow.
const QUOTED_RECOMMENDATION = /["“]\s*I (?:would |'d )?recommend\s+[a-z]/i;
// "The direct lever is menu prices." (batch 2, Maya).
const LEVER_IS = /\bthe (?:direct|main|key|obvious|right|real|biggest|best) (?:lever|move|answer|fix) is\b/i;
// A statement (not a question) opening on a lever verb, at the start or after
// a colon or dash: "Here's the shape: raise menu prices, since…".
const LEVER_STATEMENT = /(?:^|[:;—–]\s*)(?:raise|increase|cut|reduce|lower|renegotiate|reprice|lock in|hedge|pass (?:on|through))\b/i;

export function suppliesRecommendation(text: string): boolean {
  if (REPEAT_BACK.test(text) || QUOTED_RECOMMENDATION.test(text) || LEVER_IS.test(text)) return true;
  return text.split(/(?<=[.!?])\s+/).some(s => !s.includes('?') && LEVER_STATEMENT.test(s.trim()));
}

// Level-2 narrow-the-frame replacements (Rule 13), rotated per Rule 7.
export const SYNTHESIS_NARROW_SCRIPTS = [
  "What's the one thing you'd tell the CEO to do first?",
  'If you had to pick a single move for the CEO, what would it be?',
  "Based on what you've found, what's the first step you'd recommend?",
];
