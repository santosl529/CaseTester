// Deterministic, orchestrator-injected scripts (docs/interviewer-behavior.md
// Rule 12) — appended directly to spoken text, never composed by the model,
// so they fire regardless of model behavior. Small rotation pools per Rule 7's
// anti-tell principle ("the same rotating-pool requirement applies to every
// scripted phrase in this doc"), seeded by session id so a given session sees
// one consistent phrase while different sessions vary.

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
export const CONDUCT_REDIRECT = "Let's stay on the case.";
// C5 — break persona, acknowledge plainly, offer pause/stop without penalty.
export const DISTRESS_OFFER =
  "Let's set the case aside for a second — are you okay? We can pause or stop here, and it won't count against anything.";
// C5 accepted — a calm, non-clinical acknowledgement before ending.
export const DISTRESS_CLOSE =
  "That's completely okay. We'll stop here — nothing about this counts against you. Take care of yourself.";

// The deterministic time warning (Rule 12) is a BACKSTOP for when the model
// doesn't warn on its own. A live run showed both firing — the model said
// "We're nearly out of time. Bring it home..." and the orchestrator then
// appended "We're near time. What's your bottom-line recommendation?" —
// a stutter. Suppress the append when the model already signaled time or
// asked for the recommendation this turn.
const TIME_CUE = /\b(out of time|near(ly)?\s+time|time'?s\s+(up|nearly)|almost out of time|we'?re (almost )?(out of|near) time|running out of time|wrap (up|it up)|near the end)\b/i;
const REC_ASK = /\b(bottom.?line recommendation|recommendation to the (ceo|client)|final recommendation|bring it home|what'?s your recommendation|what would you (tell|recommend) the (ceo|client))\b/i;

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
