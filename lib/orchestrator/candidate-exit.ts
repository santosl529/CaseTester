// The candidate can stop (docs/interviewer-behavior.md Rule 18A, round-3
// fixes, 11 Oct 2026). Batch 18: Cole asked to stop five times ("honestly can
// we just stop", "Can we end it here?", "Can we call it here?") and was kept
// going; Victor refused the case and said "Done here." / "Goodbye." seven
// times — each read as possible distress — while the structure question was
// asked 16 times over the full clock.
//
// Three readings of a candidate message, deterministic:
//   - stop: an explicit request or decision to end the interview ("can we
//     stop", "I'd like to end the session", "ending it here"). Ends it — no
//     confirmation, no further case question.
//   - ambiguous: a bare sign-off with nothing else in the message ("Done
//     here.", "Goodbye.", "That's all I have."). One clarifying question, once
//     a session; "I'm done" next to case work is not a sign-off.
//   - none.
// Plus a refusal to start the case ("I'm not going to work the case", "Still
// no."), which counts toward a bound (plan-turn.ts): the opening question is
// asked at most three times, then the candidate is offered to stop.
// A stop request is never graded (lib/scoring: the exchange is excluded).

export type ExitIntent = { kind: 'stop' | 'ambiguous' | 'none'; reason: string };

const OBJ = String.raw`(?:\s+(?:it|this|things|the (?:case|interview|session|practice)|here|there|now|for (?:now|today)|at that|early))*`;
// Followed by nothing case-like: the end of a sentence or a comma ("can we
// just stop, this isn't going well"). "Can we stop and look at revenue?" and
// "let's stop on costs for a second" are not requests to end.
const END = String.raw`(?=\s*(?:[.!?,;—–-]|$|please\b|i'?d rather\b|i'?m (?:not|done)\b|i (?:don'?t|can'?t)\b))`;

const STOP: [RegExp, string][] = [
  [new RegExp(String.raw`\b(?:can|could|may)\s+(?:we|i)\s+(?:just\s+|please\s+)?(?:stop|end|finish|quit|call it(?: a day| quits)?|wrap (?:it |this |things )?up)${OBJ}${END}`, 'i'), 'asks to stop'],
  [new RegExp(String.raw`\bi(?:'?d| would)\s+(?:like|prefer|rather|love)\s+to\s+(?:just\s+)?(?:stop|end|finish|quit|call it|leave it)${OBJ}${END}`, 'i'), 'would like to stop'],
  [new RegExp(String.raw`\bi\s+(?:want|need)\s+to\s+(?:just\s+)?(?:stop|end|quit|leave)${OBJ}${END}`, 'i'), 'wants to stop'],
  [new RegExp(String.raw`\b(?:let'?s|let us)\s+(?:just\s+)?(?:stop|end|call it|wrap (?:it |this )?up)(?:\s+(?:here|there|now|the (?:case|interview|session)|it here|it there|for (?:now|today)))+${END}`, 'i'), 'proposes stopping'],
  [/\b(?:please\s+)?end\s+(?:the|this)\s+(?:session|interview|case)\b/i, 'asks to end the session'],
  [/\b(?:i'?m|i am)\s+(?:ending|stopping|calling)\s+(?:it|this|the (?:session|interview|case))(?:\s+(?:here|now|there))?\b/i, 'ends it'],
  [/\b(?:i'?m|i am)\s+leaving\s+(?:it|this|the (?:session|interview|case))\s+(?:here|there)\b/i, 'ends it'],
  [/^(?:i'?m\s+)?ending\s+it\s+here\b/i, 'ends it'],
  [/\b(?:i'?m|i am)\s+(?:done|finished)\s+with\s+(?:the|this)\s+(?:interview|session|case|practice)\b/i, 'done with the interview'],
  [/\bi\s+quit\b/i, 'quits'],
  [/\b(?:i'?d like|i want)\s+(?:the|my)\s+(?:written\s+)?(?:feedback|report)\s+now\b/i, 'asks for the report now'],
];

// Bare sign-offs: alone in a message, ambiguous; next to case work, nothing.
const SIGN_OFF = /^(?:(?:ok(?:ay)?|alright|right|well|so|anyway|honestly|then|yeah|no|nope|it won'?t|that'?s it|still no)[,.!—–-]*\s+)*(?:good-?bye|bye(?:-bye)?|done here|i'?m done|i am done|done|that'?s (?:all|it)(?: i have| from me| for me)?|that'?s genuinely all i have|nothing (?:else|further|more)(?: from me| to add)?|i'?ll leave it (?:there|here)|i'?m out|signing off|i'?m finished|take care|see you|thanks for your time|thank you for your time|over and out|that'?s everything)[.!]*$/i;

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

// The message is only a sign-off (with at most a short courtesy or refusal
// beside it) — no case content, no question, no figures.
export function isBareSignOff(text: string): boolean {
  const t = text.trim();
  if (!t || /\d/.test(t) || t.includes('?') || t.split(/\s+/).length > 14) return false;
  const parts = sentencesOf(t);
  return parts.some(p => SIGN_OFF.test(p))
    && parts.every(p => SIGN_OFF.test(p) || /^(?:thanks?(?: you)?(?: (?:again|so much))?|cheers|it won'?t|no|nope|still no|good luck(?: with [\w\s-]+)?|appreciate (?:it|you|the time))[.!]*$/i.test(p));
}

export function classifyExitIntent(text: string): ExitIntent {
  for (const [re, reason] of STOP) if (re.test(text)) return { kind: 'stop', reason };
  if (isBareSignOff(text)) return { kind: 'ambiguous', reason: 'bare sign-off' };
  return { kind: 'none', reason: '' };
}

// Declining to start the case (counted only while no structure is on the table).
const REFUSAL = /\b(?:i'?m|i am)\s+not\s+(?:going to|gonna)\s+(?:do|work|run|attempt|perform|play|continue|structure|engage with)\b|\bi\s+won'?t\s+(?:do|work|run|attempt|perform|structure)\b|\bi'?d\s+rather\s+not\s+(?:do|perform|work|structure|attempt|run|start)\b|\b(?:i'?m|i am)\s+not\s+doing\s+(?:the|this|a)\s+case\b|\bi\s+decline\b|\bmy answer (?:stands|won'?t change|is the same)\b|^(?:still\s+)?(?:a\s+)?no(?:pe)?\b[.!]?$|^no change[.!]?$|^same answer[.!]?$|^(?:i\s+)?pass[.!]?$|\bi'?m\s+(?:leaving|keeping)\s+it\s+closed\b|\bnot\s+going\s+to\s+happen\b/i;

export function isRefusalToStart(text: string): boolean {
  const t = text.trim();
  return sentencesOf(t).some(s => REFUSAL.test(s));
}

// The reply to the clarifying question ("Do you want to stop the interview
// here?"): continue phrases win, then stop phrases, then a bare yes / no.
// Anything else — case work — continues.
const CONTINUE = /\b(?:keep going|carry on|continue|let'?s (?:keep|go on|continue|do (?:it|this))|i'?ll (?:keep going|continue|try)|let me (?:keep going|continue|try|finish|think)|not (?:yet|now)|i want to (?:keep going|continue|finish)|i'?m (?:fine|ok(?:ay)?|good) to (?:keep going|continue)|back to (?:the )?case)\b/i;
const AFFIRM = /^(?:yes|yeah|yep|yup|sure|please|correct|i do|ok(?:ay)?|stop)\b/i;
const NEGATE = /^(?:no|nope|nah|not really)\b/i;
const LEAVE = /\b(?:leave it (?:there|here)|done here|i'?m done|end (?:it|the (?:session|interview))|call it|good-?bye|bye|that'?s (?:all|it))\b/i;

export function exitReplyChoice(text: string): 'stop' | 'continue' {
  const t = text.trim();
  if (CONTINUE.test(t)) return 'continue';
  if (classifyExitIntent(t).kind === 'stop' || LEAVE.test(t)) return 'stop';
  // A bare yes / no answers the question; "Okay so costs: …" is case work.
  const short = t.split(/\s+/).length <= 5;
  if (short && AFFIRM.test(t)) return 'stop';
  if (NEGATE.test(t)) return 'continue';
  return 'continue';
}

// ── Scripted lines ──────────────────────────────────────────────────────────
// No case question in any of them (Rule 18A).

export const EXIT_CLARIFY = {
  withReport: 'Do you want to stop the interview here? If you do, you\'ll get written feedback on what we covered.',
  noReport: 'Do you want to stop the interview here? We haven\'t got into the case yet, so there wouldn\'t be a report.',
} as const;

export const REFUSAL_OFFER =
  'It sounds like you\'d rather not work the case today. Do you want to stop the interview here? We haven\'t got into the case yet, so there wouldn\'t be a report.';

export const EXIT_CLOSE = {
  withReport: 'Understood — we\'ll stop here. You\'ll get written feedback on what we covered.',
  noReport: 'Understood — we\'ll stop here. Since we didn\'t get into the case, there\'s no report this time; you can start a new case whenever you like.',
  declined: 'We\'ll end the session here. You can start a new case whenever you\'re ready.',
} as const;
