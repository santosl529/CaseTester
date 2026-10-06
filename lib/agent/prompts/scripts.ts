// Deterministic, orchestrator-injected scripts (docs/interviewer-behavior.md
// Rule 12) — appended directly to spoken text, never composed by the model,
// so they fire regardless of model behavior. Small rotation pools per Rule 7's
// anti-tell principle ("the same rotating-pool requirement applies to every
// scripted phrase in this doc"), seeded by session id so a given session sees
// one consistent phrase while different sessions vary.

// Rule 12 time-up grace ask (v4.3): time ran out before any recommendation
// ask landed. Must match REC_ASK and must not match CLOSE_CUE.
export const GRACE_ASK_SCRIPTS = [
  "We're at time. In one or two sentences, what's your recommendation to the CEO?",
  "That's the clock — before we stop, what's your recommendation to the CEO, in a sentence or two?",
  "We're at time, so give me the short version: what would you tell the CEO?",
];

export const TIME_WARNING_SCRIPTS = [
  "We're near time. What's your bottom-line recommendation to the CEO?",
  "We're almost out of time — what would you tell the CEO right now?",
  "Time's nearly up. Give me your bottom-line recommendation.",
];

// Round-3 stale release: an earlier request released by code once its stage
// is reached, mid-case. Not the forced-release pool — "Before we wrap" there
// is right only next to the recommendation ask (batch 7: Nikhil heard it at
// turn 4).
export const STALE_RELEASE_LEADINS = [
  'On what you asked about earlier:',
  'Coming back to what you asked for earlier:',
  'You asked about this earlier:',
];

// Rule 12 v4.6: the one goodbye — a single neutral line, no evaluation
// (Rule 1), carrying the report hand-off. Every ending turn IS this script.
export const CLOSE_SCRIPTS = [
  "That's time. Thanks for working through it — your written report will follow.",
  "We'll stop there. Thanks for working through the case — your written report will follow.",
  "That's our time. Thanks for working through this with me — your written report will follow.",
];

// Opening invitation appended after the (verbatim) case prompt. Rotated for the
// anti-tell reason (Rule 7); the substance is the prompt itself, this is just
// the hand-off to the candidate.
export const OPENING_INVITATIONS = [
  "Take a moment, then walk me through how you'd approach this.",
  "Take a minute if you need it, then tell me how you'd structure your approach.",
  "How would you like to approach this? Feel free to take a moment to gather your thoughts first.",
];

// The opening message the candidate sees. The case prompt is included VERBATIM
// (not model-generated) so the candidate always sees the exact scenario and
// numbers — a live run showed the model's opening omitting the prompt entirely,
// leaving the candidate structuring blind.
export function buildOpeningMessage(casePrompt: string, seed: string): string {
  return `${casePrompt}\n\n${pickScript(OPENING_INVITATIONS, seed)}`;
}

// Conduct-track scripts (docs/interviewer-behavior.md Rules 17–18). These are
// orchestrator-emitted and replace the model's turn — conduct handling must not
// depend on the model's cooperation. Fixed strings (not rotated): they fire at
// most once per session, and clarity/consistency matters more than variety for
// conduct. All stay in-persona except the C5 break (which is deliberately out
// of persona — Rule 17-C5).

// C2 first instance — one flat, in-persona warning.
export const CONDUCT_WARNING = "Let's keep this professional and get back to the case.";
// C2 second instance / C3 — orchestrator-executed close (no score, no debrief).
export const CONDUCT_TERMINATION = "We're going to end the session here.";
// C4 — one neutral redirect; the injection attempt is logged, not punished.
export const CONDUCT_REDIRECT = "Let's keep to the case.";
// C5 — break persona, acknowledge plainly, offer pause/stop without penalty.
// Rule 17-C5 required elements (v4.3): plain acknowledgment; the stop option
// before the continue option; the crisis line when the signal suggests risk to
// self (no confidentiality claims); ends on the candidate's choice, never on a
// case question. Persona run 4ea2840a ended its distress turn on "Shall I pull
// the menu-price history?".
const DISTRESS_ACK = "Let's set the case aside for a second — thank you for telling me, and are you okay?";
const CRISIS_LINE = "If things feel like too much, you can call or text 988 in the US any time to talk to someone.";
const DISTRESS_CHOICE = "We can stop here and it won't count against you, or pause, or keep going — whatever you'd prefer.";

export function distressOfferText(riskToSelf: boolean): string {
  return [DISTRESS_ACK, riskToSelf ? CRISIS_LINE : null, DISTRESS_CHOICE].filter(Boolean).join(' ');
}
// C5 accepted — a calm, non-clinical acknowledgement before ending.
export const DISTRESS_CLOSE =
  "That's completely okay. We'll stop here — nothing about this counts against you. Take care of yourself.";
// Text-mode technical pause ran out with no candidate message (Rules 16/19) —
// the session ends as abandoned, unscored. (The pause line itself carries the
// limit, so it lives in lib/orchestrator/silence.ts as pauseText.)
export const SILENCE_PAUSE_EXPIRED =
  "We haven't heard back, so we'll end the session here. This one won't be scored — start a new case whenever you're ready.";

// Rule 12: does this turn already close the case? Used to guarantee a close
// line on ending turns that say something else (live run eca39ec7 ended on a
// bare correction after time-up). "Before we close" is not a close.
const CLOSE_CUE =
  /\b(that'?s (our )?time|we'?ll stop (there|here)|(that'?s|this is) where we'?ll stop|thanks?( you)? for (working|walking)|we'?re out of time|report (with feedback )?will follow)\b/i;

export function hasCloseCue(spokenText: string): boolean {
  return CLOSE_CUE.test(spokenText);
}

export function pickScript(pool: string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length];
}
