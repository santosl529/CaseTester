// Deterministic, orchestrator-injected scripts (docs/interviewer-behavior.md
// Rule 12) — appended directly to spoken text, never composed by the model,
// so they fire regardless of model behavior. Small rotation pools per Rule 7's
// anti-tell principle ("the same rotating-pool requirement applies to every
// scripted phrase in this doc"), seeded by session id so a given session sees
// one consistent phrase while different sessions vary.

import { line, PHRASE_POOLS, type PhraseUses } from '@/lib/orchestrator/phrasing';

// Rule 12 time-up grace ask (v4.3): time ran out before any recommendation
// ask landed. Must match REC_ASK and must not match CLOSE_CUE.
export const GRACE_ASK_SCRIPTS: readonly string[] = PHRASE_POOLS.grace_ask;

// Code administers an owed exhibit (Rule 9 v4.10): the data line hands it over,
// then one of these asks about it.
export const STAGE_EXHIBIT_QUESTIONS: readonly string[] = PHRASE_POOLS.stage_exhibit_q;

// A late recommendation ask also asks for the biggest risk (Lorenzo, 15 Oct;
// batch 26 Blake 4755c03a: the recommendation came only with this line, and
// time-up left no turn for the risk question). One question.
export const TIME_WARNING_SCRIPTS: readonly string[] = PHRASE_POOLS.time_warning;

// Round-3 stale release: an earlier request released by code once its stage
// is reached, mid-case. Not the forced-release pool — "Before we wrap" there
// is right only next to the recommendation ask (batch 7: Nikhil heard it at
// turn 4).
export const STALE_RELEASE_LEADINS: readonly string[] = PHRASE_POOLS.earlier;

// Rule 12 v4.6: the one goodbye — a single neutral line, no evaluation
// (Rule 1), carrying the report hand-off. Every ending turn IS this script.
// v4.10: the line follows the reason the case ended — "That's time" only at
// time-up (batch 18: 32 sessions said it before minute 18).
export const CLOSE_SCRIPTS_BY_REASON = {
  time_up: PHRASE_POOLS.close_time_up,
  complete: PHRASE_POOLS.close_complete,
  unresolved: PHRASE_POOLS.close_unresolved,
} as const;

export const CLOSE_SCRIPTS = [...CLOSE_SCRIPTS_BY_REASON.time_up, ...CLOSE_SCRIPTS_BY_REASON.complete, ...CLOSE_SCRIPTS_BY_REASON.unresolved];

export function closeLine(reason: keyof typeof CLOSE_SCRIPTS_BY_REASON, seed: string, uses?: PhraseUses): string {
  return line(reason === 'time_up' ? 'close_time_up' : reason === 'complete' ? 'close_complete' : 'close_unresolved', uses, seed);
}

// Opening invitation appended after the (verbatim) case prompt. Rotated for the
// anti-tell reason (Rule 7); the substance is the prompt itself, this is just
// the hand-off to the candidate.
export const OPENING_INVITATIONS: readonly string[] = PHRASE_POOLS.opener_invite;

// After a prompt that ends in its own question: time to think, no second ask.
export const OPENING_INVITATIONS_AFTER_QUESTION: readonly string[] = PHRASE_POOLS.opener_after_q;

// The opening message the candidate sees. The case prompt is included VERBATIM
// (not model-generated) so the candidate always sees the exact scenario and
// numbers — a live run showed the model's opening omitting the prompt entirely,
// leaving the candidate structuring blind.
export function buildOpeningMessage(casePrompt: string, seed: string): string {
  // A prompt that already asks ("How would you approach this problem?") gets a
  // hand-off that doesn't ask again (Lorenzo's brief, 17 Oct: "…approach this
  // problem? Take a moment, then walk me through how you'd approach this.").
  return `${casePrompt}\n\n${line(/\?\s*$/.test(casePrompt) ? 'opener_after_q' : 'opener_invite', undefined, seed)}`;
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
// bare correction after time-up). "Before we close" is not a close. Lorenzo,
// 13 Oct (Jasmine 35897f4a t18 "That's all I have on the case." with stages
// owed): every closing-sounding line a scan of the saved runs found.
const CLOSE_CUE =
  /\b(that'?s (our )?time|we'?ll stop (there|here)|(that'?s|this is) where we'?ll stop|thanks?( you)? for (working|walking)|we'?re out of time|report (with feedback )?will follow|we'?ve covered everything|that covers what i wanted|that closes (?:the case|out|the recommendation)|that'?s all i need(?: from you)?(?: on (?:the|this) case)?(?=[.!])|that'?s all i have(?: (?:on|for) (?:the|this) case| for (?:you|today|now))?(?=[.!])|we'?re (?:all )?done(?: here)?(?=[.!])|that covers it(?=[.!])|that'?s (?:it|all) (?:from me|for (?:today|now|the case|this case))(?=[.!])|that wraps (?:it|things|us) up)\b/i;

export function hasCloseCue(spokenText: string): boolean {
  return CLOSE_CUE.test(spokenText);
}

export function pickScript(pool: readonly string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length];
}
