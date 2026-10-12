// Rule 1 (docs/interviewer-behavior.md): acknowledge, probe, never grade
// mid-case. A sentence of the model's own words that passes a verdict on the
// candidate's work — "Clear structure.", "Your bean math holds up.", "The
// reconciliation ties out." — is withheld (veto `grading`), in "say" and in
// the question. Batch 19 (Haiku 5.5): ~1 a run vs ~0.3 for Sonnet 5.5 in batch
// 18 v3; the prompt's ban alone didn't hold it.
//
// Not grading: bare acknowledgments ("Right.", "Understood."), neutral
// summaries of what they did ("A cost-first split."), questions and probes
// that only mention a verdict word ("…whether that holds…"), the candidate's
// claim said back ("You said … if volume holds"), doubt ("That's a strong
// assumption.", "That doesn't add up"), flat corrections ("The correct figure
// is 58%"), and the interviewer conceding its own slip ("You're right, that
// was a repeat").

const VERDICT = '(?:clear|clean|good|great|nice|excellent|solid|strong|sound|sharp|crisp|tight|thorough|sensible|reasonable|logical|neat|careful|valid|well[- ](?:done|structured|reasoned|built))';

const GRADE = new RegExp([
  // A verdict first: "Clear structure, …", "A clean split", "Good, that's a
  // clear cost split", "That's a clear way in".
  `^(?:(?:right|okay|ok|good|yes|understood|mm-?hm)[,.]\\s*)?(?:(?:that'?s|this is|it'?s)\\s+)?(?:a |an )?${VERDICT}\\b`,
  // A verdict as predicate: "Your test design is sound", "… point is strong",
  // "… is the right direction".
  `\\b(?:is|are|looks?|seems?)\\s+(?:very |quite |pretty |really )?${VERDICT}\\b`,
  /\b(?:is|are) the right (?:direction|one|call|instinct|question|way|place)\b/.source,
  // Verdict verbs: it holds, ties out, reconciles, checks out, adds up.
  /\bholds? up\b|\bholds? together\b|\bholds(?=[.,!]|\s+and\b)|\bties? out\b|\breconcil(?:es|ed)\b|\bchecks? out\b|\badds? up\b|\bcloses? cleanly\b|\bcloses the gap\b|\bmakes sense\b|\bread cleanly\b/.source,
  /\baccounts for (?:all|the full|the whole|the entire)\b/.source,
  // Direct verdicts.
  /\b(?:that'?s|you'?re|you are|that is|exactly|quite) (?:right|correct)\b|^correct\b|\bgood (?:catch|point|call|question|instinct)\b|\bwell done\b|\bnice work\b|\bfair point\b|\bspot[- ]on\b/.source,
].join('|'), 'i');

// A probe that only mentions a verdict word asks, it doesn't grade.
const PROBE_OPENER = /^(?:(?:then|and|so|now|first),?\s+)?(?:walk me through|talk me through|tell me|explain|suppose|assume|imagine|check|make sure|confirm|test|what|how|why|which|where|does|do|is|are|would|could)\b/i;
// The candidate's claim said back ("You said … accounts for the entire
// decline", "…if volume holds") isn't a verdict on it.
const RESTATEMENT = /^(?:before we go further, )?you(?:'ve)? (?:said|made clear|sized|assumed|argued|claimed|treated|reconciled|compared|split|built)\b|\b(?:if|assuming|as long as) (?:volume|traffic|demand|that|it|this) holds\b/i;
// Doubt and data, not praise.
const NEGATED = new RegExp(`(?:\\bnot|\\bnever|n't)\\s+(?:quite\\s+|yet\\s+|really\\s+|fully\\s+|entirely\\s+)?(?:${VERDICT.slice(3, -1)}|hold|add up|tie out|reconcile|check out|make sense|right|correct)\\b`, 'i');
const NOT_ABOUT_WORK = /\b(?:strong|sharp|clear|big) (?:assumption|claim|premise|leap|bet|rise|increase|drop|fall|jump|decline)\b|\bthe correct (?:figure|number|value|base|share)\b|\byou'?re right,? (?:that was|i\b|i'?m|i'?ve|my\b)/i;
// "You're right, they didn't come through." — the interviewer conceding its
// own slip (a negation after it), not a verdict on their work.
const CONCESSION = /^you'?re right\b.*(?:n't|\bnever\b|\bnothing\b|\bno\b)/i;

// Leading acknowledgment words ("Right, …", "Understood, …"): a sentence that
// is nothing else is a bare acknowledgment and allowed.
const LEADING_ACK = /^(?:(?:okay|ok|understood|got it|mm-?hm+|i see|i follow|right|sure|alright|thanks)[,.!]?\s*)+/i;

export function isGradingSentence(sentence: string): boolean {
  const s = sentence.trim();
  if (!s || s.endsWith('?') || s.replace(LEADING_ACK, '') === '') return false;
  if (PROBE_OPENER.test(s) || RESTATEMENT.test(s) || NEGATED.test(s) || NOT_ABOUT_WORK.test(s) || CONCESSION.test(s)) return false;
  return GRADE.test(s);
}

// In the question, a grade that only sets up a challenge — "Your aggregate
// closes the gap, but your 37.5% was applied to all non-bean COGS." — keeps
// the challenge, so the question after it still has its referent; any other
// grading sentence is withheld whole (null).
export function gradingRemainder(sentence: string): string | null {
  const m = /^(.+?),\s+but\s+(.+)$/i.exec(sentence.trim());
  if (!m || !isGradingSentence(`${m[1]}.`) || isGradingSentence(m[2])) return null;
  return m[2].charAt(0).toUpperCase() + m[2].slice(1);
}
