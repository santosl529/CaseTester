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

// Rule 11 backstop: fired when the interviewer promises a data delivery in
// speech (data-ledger.ts's promisesReveal) but no ledger item resolves to it
// — i.e. the candidate asked for a cut that genuinely isn't in the case.
// Deterministic, not model-composed, so the promise never gets silently
// swapped for unrelated data (docs/interviewer-behavior.md Rule 11).
export const REVEAL_REFUSAL_SCRIPTS = [
  "I don't have that level of detail. What would you do next to narrow it down?",
  "We don't have that specific cut. How would you approach it with what's available?",
  "That breakdown isn't something I have. What would you ask for instead?",
];

// Same backstop as REVEAL_REFUSAL_SCRIPTS, for the exhibit side: fired when
// the interviewer promises an exhibit (exhibits.ts's promisesExhibit) but
// none resolves — the case has no exhibit matching what was named, or has
// zero/multiple exhibits with no single safe fallback. Keeps a broken exhibit
// promise from reading as a silently dropped delivery.
export const EXHIBIT_REFUSAL_SCRIPTS = [
  "I don't have a chart for that. What would you like to look at instead?",
  "I don't have that exhibit to show you. What data would help most right now?",
  "That's not something I have a chart for. What would you ask for instead?",
];

// Rule 11 v4.1 force-resolve: lead-in spoken before ledger data the candidate
// asked for earlier and never got, released just before the recommendation
// ask (session-runner.ts). The ledger value follows verbatim and carries its
// own label (Rule 10), so these stay numeral-free (Rule 6 provenance).
export const FORCED_RELEASE_LEADINS = [
  "Before we wrap, on what you asked about earlier:",
  "One thing you asked for earlier:",
  "Picking up what you asked about before:",
];

export const CLOSE_SCRIPTS = [
  "That's time. Thanks for working through it.",
  "We'll stop there. Thanks for working through the case.",
  "That's our time. Thanks for walking through this with me.",
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

// The deterministic time warning (Rule 12) is a BACKSTOP for when the model
// doesn't warn on its own. A live run showed both firing — the model said
// "We're nearly out of time. Bring it home..." and the orchestrator then
// appended "We're near time. What's your bottom-line recommendation?" —
// a stutter. Suppress the append when the model already signaled time or
// asked for the recommendation this turn.
const TIME_CUE = /\b(out of time|near(ly)?\s+time|time'?s\s+(up|nearly)|almost out of time|we'?re (almost )?(out of|near) time|running out of time|wrap (up|it up)|near the end)\b/i;
const REC_ASK = /\b(bottom.?line recommendation|recommendation to the (ceo|client)|final recommendation|bring it home|what'?s your recommendation|what would you (tell|recommend) the (ceo|client))\b/i;

// Rule 12: does this turn already close the case? Used to guarantee a close
// line on ending turns that say something else (live run eca39ec7 ended on a
// bare correction after time-up). "Before we close" is not a close.
const CLOSE_CUE =
  /\b(that'?s (our )?time|we'?ll stop (there|here)|(that'?s|this is) where we'?ll stop|thanks?( you)? for (working|walking)|we'?re out of time|report (with feedback )?will follow)\b/i;

export function hasCloseCue(spokenText: string): boolean {
  return CLOSE_CUE.test(spokenText);
}

// Recommendation ask only, no bare time cue — used by phase repair
// (lib/orchestrator/phase-repair.ts): an interviewer asking for the
// recommendation means the case is in RECOMMENDATION whatever the phase
// machine says. "We're near time" alone does not.
export function asksForRecommendation(spokenText: string): boolean {
  return REC_ASK.test(spokenText);
}

export function alreadySignaledTimeOrRec(spokenText: string): boolean {
  return TIME_CUE.test(spokenText) || REC_ASK.test(spokenText);
}

// Deterministic per-session pick (not Math.random): stable within a session,
// varies across sessions, and reproducible in tests.
export function pickScript(pool: string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length];
}
