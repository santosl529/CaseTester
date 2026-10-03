export type AuditResult = {
  passed: boolean;
  unexplainedNumbers: string[];
};

function extractNumbers(text: string): string[] {
  // Extract digit sequences (strips commas for comparison).
  // Use a lookahead/lookbehind-free approach: match digits possibly prefixed by
  // currency symbols or other non-digit chars. The regex \b doesn't work well
  // with $480M because $ is not a word char, so we match digits anywhere and
  // strip surrounding non-numeric noise.
  // Negative lookahead (?!\.\s) excludes ordinal list markers like "1. " or "2.\n"
  // while still matching decimals like "1.5" and end-of-sentence numbers like "42."
  const matches = text.matchAll(/\d[\d,]*(?:\.\d+)?(?!\.\s)/g);
  return [...matches].map(m => m[0].replace(/,/g, ''));
}

// Style rules from docs/interviewer-behavior.md Rules 4–5: interviewer turns
// must be short spoken language (1–3 sentences), one candidate task, no
// markdown formatting. 60 words ≈ the ceiling of a 3-sentence spoken turn.
export const MAX_INTERVIEWER_WORDS = 60;

// too_long / markdown are hard violations (gate in QA). stacked_questions is
// a soft QA flag per Rule 4: "one task" is a cognitive-load unit that
// question-mark counting only approximates — flag for review, never block.
export type StyleViolation = 'too_long' | 'markdown';

export type StyleAuditResult = {
  passed: boolean;
  violations: StyleViolation[];
  flags: 'stacked_questions'[];
  wordCount: number;
  questionCount: number;
};

export type StyleAuditOptions = {
  // Exempt turn types per the interviewer-behavior.md whitelist (opening,
  // labeled read-outs, rescues, close). Turn type is derived from the turn's
  // actions/position by the caller, not self-reported by the model.
  lengthExempt?: boolean;
};

export function auditTurnStyle(spokenText: string, opts: StyleAuditOptions = {}): StyleAuditResult {
  const violations: StyleViolation[] = [];
  const flags: 'stacked_questions'[] = [];

  const wordCount = spokenText.split(/\s+/).filter(Boolean).length;
  if (!opts.lengthExempt && wordCount > MAX_INTERVIEWER_WORDS) violations.push('too_long');

  // Bold/italic markers, headers, or bullet/numbered list lines
  const hasMarkdown =
    /\*\*|__|(?:^|\n)\s*#{1,6}\s|(?:^|\n)\s*(?:[-*•]|\d+\.)\s/.test(spokenText);
  if (hasMarkdown) violations.push('markdown');

  const questionCount = (spokenText.match(/\?/g) ?? []).length;
  if (questionCount > 1) flags.push('stacked_questions');

  return { passed: violations.length === 0, violations, flags, wordCount, questionCount };
}

// Meta-leak strip (docs/interviewer-behavior.md Rules 1/5 — spoken register).
// A live run leaked the model's internal planning into the candidate-facing
// turn: "The candidate has anchored on pricing lag. Let me pressure it once
// before moving on. You attribute the gap to..." The interviewer must speak
// ONLY to the candidate. The prompt now forbids this, but as a backstop we
// strip clearly-meta sentences here so a model slip never reaches the user.
//
// Conservative by construction: only sentences matching tight meta patterns are
// removed. Patterns are ones that have no legitimate place in interviewer
// speech. An all-meta turn comes back empty and the runner supplies the
// fallback (batch 5: keeping it spoke pure narration).

// Third-person reference to the candidate — you speak TO them ("you"), never
// ABOUT them ("the candidate has...").
const META_THIRD_PERSON = /\bthe candidate\b/i;
// Self-narration of an interviewing tactic. Note the verb list is specific:
// "let me show/give you the data" is legitimate and NOT matched.
const META_SELF_NARRATION =
  /\b(let me|i'?ll|i will|i'?m going to|i am going to|i should|i need to|i'?m about to|i want to)\s+(?:also\s+|now\s+|first\s+|just\s+)?(pressure|press|probe|push\b|push back|challenge|redirect|see if|move on|check whether)\b/i;
// Internal jargon that should never surface to a candidate.
const META_JARGON = /\b(stall (ladder|intervention|rung)|\brung\b|socratic|recompute|provenance|directive rescue|one[- ]task per turn)\b/i;

// Narration of its own tool use (batch 4, Sonnet 5.5 interviewer, Ines): "The
// question maps to the store count and revenue per store, so I'll release
// both." An interviewer never "releases" data or maps questions to items out
// loud.
const META_TOOL_NARRATION = /\b(i'?ll|i will|let me|i'?m going to)\s+release\b|\bmaps (?:best )?to (the|a|your)\b|\breveal_data\b|\bledger\b/i;

// Batch 5 (Sonnet 5.5, thinking off): the model reasons about each release
// in plain text before the tool call — "They haven't asked for it", "the items
// that answer it", "so I'll hold that", "Revealing those items now". The
// candidate is "they" here; customers and the client never ask for, assert,
// or earn data.
const META_RELEASE_REASONING = new RegExp([
  /\bthey(?:'ve| have)?\s+(?:already\s+|now\s+)?(?:asked|asserted|requested|earned)\b/.source,
  /\bhaven'?t asked for\b/.source,
  /\blet them\b/.source,
  /^\s*(?:revealing|releasing)\b/.source,
  /^\s*best:/.source,
  /\bis answered by\b/.source,
  /\bthe items? that answers?\b/.source,
  /\bitems I hold\b/.source,
  /\b(?:requests?|items?|lines?) (?:are|is) (?:now |all |too )*(?:earned|revealed)\b/.source,
  /\bso I'?ll (?:hold|ask)\b/.source,
  // Batch 7 smoke (Claire): "Available items match: bean_share_of_cogs, …".
  /\bitems? match(?:es)?\b/.source,
  /\b[a-z]+_[a-z0-9_]+\b/.source,
].join('|'), 'i');

// "I'll show the exhibit" / "I'll reveal the bean price data" — a tool call
// announced to no one. Addressed to the candidate ("I'll show you…") it is
// ordinary speech and kept.
const TOOL_VERB = /\b(?:i'?ll|i will|let me|i'?m going to)\s+(?:also\s+|now\s+|just\s+)?(?:show|reveal|release)\b/i;
const ADDRESSED = /\byou\b/i;

function isMetaSentence(sentence: string): boolean {
  return META_THIRD_PERSON.test(sentence) || META_SELF_NARRATION.test(sentence) || META_JARGON.test(sentence)
    || META_TOOL_NARRATION.test(sentence) || META_RELEASE_REASONING.test(sentence)
    || (TOOL_VERB.test(sentence) && !ADDRESSED.test(sentence));
}

export type MetaLeakResult = { cleaned: string; strippedSentences: string[] };

// The silence check-in is scripted by the orchestrator (silence.ts), never
// the model's to say. Batch 4: the Sonnet interviewer copied it from history
// into its own turns ("…walk me through that. Still with me? Take your time.
// The question on the table: …") right after asking, with no silence at all.
const COPIED_CHECK_IN = /\s*Still with me\?(?:\s*Take your time\.)?(?:\s*The question on the table:[^?.!]*[?.!])?/gi;

export function stripCopiedCheckIn(spokenText: string): { text: string; stripped: boolean } {
  const text = spokenText.replace(COPIED_CHECK_IN, '').trim();
  return { text, stripped: text !== spokenText.trim() };
}

// Round-3 fix 5: system vocabulary in an otherwise valid answer. Ines
// (batch 3, 153135fc) asked about strategic changes and heard "I don't have
// anything flagged on that." Stripping the sentence would leave her question
// unanswered, so the phrase is rewritten into an interviewer's words. Only
// the interviewer's OWN system language: "you flagged menu prices" (the
// candidate flagging something) is ordinary speech and untouched.
const SYSTEM_LANGUAGE: [RegExp, string][] = [
  [/\b(?:I )?(?:don'?t|do not) have anything flagged(?: (?:on|about|for) (?:that|this|it))?/gi, "That's not in the information I have"],
  [/\b(?:there'?s |there is )?nothing (?:is )?flagged(?: (?:on|about|for) (?:that|this|it))?/gi, "That's not in the information I have"],
  [/\b(?:in|from) (?:my|the) (?:notes|ledger|case file|system|data list)\b/gi, 'in the information I have'],
  [/\bthe (?:ledger|system) (shows|says|has)\b/gi, 'the data $1'],
];

export function rewriteSystemLanguage(spokenText: string): { text: string; rewrites: string[] } {
  const rewrites: string[] = [];
  let text = spokenText;
  for (const [re, replacement] of SYSTEM_LANGUAGE) {
    text = text.replace(re, (m, ...groups) => {
      rewrites.push(m);
      const out = replacement.replace('$1', typeof groups[0] === 'string' ? groups[0] : '');
      // Keep a sentence-initial capital ("The ledger shows" → "The data shows").
      return /^[A-Z]/.test(m) ? out.charAt(0).toUpperCase() + out.slice(1) : out;
    });
  }
  return { text, rewrites };
}

export function stripMetaLeak(spokenText: string): MetaLeakResult {
  const sentences = spokenText.split(/(?<=[.?!])\s+/).filter(Boolean);
  const kept: string[] = [];
  const stripped: string[] = [];
  for (const s of sentences) {
    if (isMetaSentence(s)) stripped.push(s);
    else kept.push(s);
  }
  return { cleaned: kept.join(' ').trim(), strippedSentences: stripped };
}

// A line that opens as another speaker: the model kept generating past its own
// turn and wrote the other side of the dialogue (live run 58cb8061: the
// brainstorm question followed by "\n\nuser Several levers…" — the candidate's
// answer, written by the interviewer, then scored). Matched only at the start
// of a line after a newline and only as a whole word followed by a label mark
// or more text, so "Candidates often…" and "what the user would pay" pass.
const FABRICATED_SPEAKER_LINE = /\n[ \t]*(?:user|human|candidate|assistant|interviewer)\b(?=[ \t]*[:\-—]|[ \t]+\S)/i;

export type FabricatedTurnResult = { cleaned: string; fabricated: string | null };

export function stripFabricatedTurn(text: string): FabricatedTurnResult {
  const match = FABRICATED_SPEAKER_LINE.exec(text);
  if (!match) return { cleaned: text, fabricated: null };
  return { cleaned: text.slice(0, match.index).trim(), fabricated: text.slice(match.index).trim() };
}

export function auditTurn(
  spokenText: string,
  revealed: Record<string, string>,
  alwaysAllowedText?: string,
): AuditResult {
  const spoken = extractNumbers(spokenText);
  const allowedSources = Object.values(revealed);
  if (alwaysAllowedText) allowedSources.push(alwaysAllowedText);
  const allowed = new Set(allowedSources.flatMap(v => extractNumbers(v)));
  const unexplained = spoken.filter(n => !allowed.has(n));
  return { passed: unexplained.length === 0, unexplainedNumbers: unexplained };
}
