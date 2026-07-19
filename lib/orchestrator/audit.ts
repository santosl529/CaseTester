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
// removed, and only if at least one non-meta sentence survives (never blank a
// turn). Patterns are ones that have no legitimate place in interviewer speech.

// Third-person reference to the candidate — you speak TO them ("you"), never
// ABOUT them ("the candidate has...").
const META_THIRD_PERSON = /\bthe candidate\b/i;
// Self-narration of an interviewing tactic. Note the verb list is specific:
// "let me show/give you the data" is legitimate and NOT matched.
const META_SELF_NARRATION =
  /\b(let me|i'?ll|i will|i'?m going to|i am going to|i should|i need to|i'?m about to|i want to)\s+(pressure|press|probe|push\b|push back|challenge|redirect|see if|move on)\b/i;
// Internal jargon that should never surface to a candidate.
const META_JARGON = /\b(stall (ladder|intervention|rung)|\brung\b|socratic|recompute|provenance|directive rescue|one[- ]task per turn)\b/i;

function isMetaSentence(sentence: string): boolean {
  return META_THIRD_PERSON.test(sentence) || META_SELF_NARRATION.test(sentence) || META_JARGON.test(sentence);
}

export type MetaLeakResult = { cleaned: string; strippedSentences: string[] };

export function stripMetaLeak(spokenText: string): MetaLeakResult {
  const sentences = spokenText.split(/(?<=[.?!])\s+/).filter(Boolean);
  const kept: string[] = [];
  const stripped: string[] = [];
  for (const s of sentences) {
    if (isMetaSentence(s)) stripped.push(s);
    else kept.push(s);
  }
  // Never blank a turn: if every sentence looked meta, keep the original.
  if (kept.length === 0) return { cleaned: spokenText, strippedSentences: [] };
  return { cleaned: kept.join(' ').trim(), strippedSentences: stripped };
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
