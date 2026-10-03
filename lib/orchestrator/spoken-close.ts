import { pickScript } from '@/lib/agent/prompts/scripts';

// One goodbye, and only when the case actually ends (docs/interviewer-
// behavior.md Rule 12, v4.2 → v4.6). Run 1d76e3d9 looped on goodbyes because
// a spoken close never called end_case; batch 2 (Maya c6076209) said goodbye
// four times because the coverage gate blocked end_case twice and the
// goodbyes went out anyway — the narrow close pattern missed "You'll get a
// full written report afterward" and "Thanks for your time today".
//
// The close is one action:
// - a closing turn while the case may end → the end is confirmed;
// - a closing turn while it may not → the WHOLE turn is replaced by one
//   scripted probe for a stage not yet administered (brainstorm, then the
//   recommendation ask if none was received, then a risk probe);
// - a received recommendation plus an administered brainstorm and risk probe
//   opens the gate (remaining coverage gaps are candidate performance, Rule 13
//   "assisted vs. covered") — at most a couple of probes after the
//   recommendation, never a loop.
// C5 and conduct-termination turns are scripted early returns in the runner
// and never reach this check.

// Unambiguous goodbyes. Mid-case courtesy ("thanks for walking me through
// that", "thanks for working through the math") is not one.
const STRONG_CLOSE =
  /\b(that'?s (our )?time|time'?s up|we'?re out of time|we'?ll (stop|end|close|wrap)( it)? (there|here)|(that'?s|this is) where we'?ll (stop|end)|(i'?ll|let'?s|we'?ll) close (the case|it|things) (out |up )?(here|there)|close the case|that'?s the (end of the )?case|that concludes the case|good place to stop|that'?s all for today|thanks?( you)? for your time|thanks?( you)? for working through (it|the case|this)|take care)\b/i;

// Report hand-offs read as a goodbye only when nothing follows: the Rule 16
// meta-answer "You'll get a full written report afterward — for now, back to
// your structure" is mid-case, and so is Priya's (8baec6bf, 1:32) "You'll get a
// full written report afterward. Let's keep to the case."
const REPORT_CLOSE = /\b(report (with feedback )?will follow|you'?ll (get|receive) (a |the |your )?(full |written |detailed )*(report|feedback)|written report)\b/i;
const CONTINUES = /\?|\bfor now\b|\bback to\b|\bmeanwhile\b|\bin the meantime\b|\blet'?s (keep|get|go|stay|continue|return)\b/i;

// Batch 5 (Claire 8dce6c0b): "We'll leave it there." and "…the case is
// complete." were spoken as goodbyes and followed by more questions. "Leave X
// there" also moves between topics, so it counts only on a turn that doesn't
// go on.
const CASE_COMPLETE = /\b(the case is (now )?(complete|over|finished|done)|that completes the case)\b/i;
const LEAVE_IT_THERE = /\bwe'?ll leave (it|that|things|the \w+) there\b/i;

export function isClosingTurn(text: string): boolean {
  if (STRONG_CLOSE.test(text) || CASE_COMPLETE.test(text)) return true;
  return (REPORT_CLOSE.test(text) || LEAVE_IT_THERE.test(text)) && !CONTINUES.test(text);
}

// Kept for callers that only need the yes/no.
export const isSpokenClose = isClosingTurn;

// ── Stage administration (derived from the transcript) ──────────────────────

export const BRAINSTORM_ASK =
  /\bwhat else (could|can|should|might) [\w&' ]{1,40}? do\b|\bbeyond (pricing|price|a price increase|that|this|what we'?ve (discussed|covered)),? what\b|\bwhat other (levers|ideas|options)\b|\bbrainstorm/i;
const RISK_ASK =
  /\b(biggest risk|key risk|main risk|what could go wrong|what would change your mind|what would make you wrong|how would you (test|de-?risk)|risks? (to|of|with|in) (that|this|your) (recommendation|plan))\b/i;
const REC_ASK =
  /\b(bottom.?line recommendation|recommendation to the (ceo|client)|final recommendation|what'?s your recommendation|what would you (tell|recommend) (to )?the (ceo|client)|pull it together)\b/i;

export function asksBrainstorm(text: string): boolean { return BRAINSTORM_ASK.test(text); }
export function asksRisk(text: string): boolean { return RISK_ASK.test(text); }

export type StageAdministration = {
  brainstormAsked: boolean;
  riskAsked: boolean;
  recommendationAsked: boolean;
  recommendationAskCount: number;
  recommendationReceived: boolean;
};

// Rule 13 synthesis cap: a candidate asked for the recommendation this many
// times who still gives none has a candidate outcome, not a coverage gap — the
// case may close without one. Batch 3 (Maya 56b80c44) was asked 17 times.
export const RECOMMENDATION_ASK_LIMIT = 2;

export function stageAdministration(interviewerTexts: string[], recommendationReceived: boolean): StageAdministration {
  return {
    brainstormAsked: interviewerTexts.some(asksBrainstorm),
    riskAsked: interviewerTexts.some(asksRisk),
    recommendationAsked: interviewerTexts.some(t => REC_ASK.test(t)),
    recommendationAskCount: interviewerTexts.filter(t => REC_ASK.test(t)).length,
    recommendationReceived,
  };
}

export function recommendationUnresolved(s: StageAdministration): boolean {
  return !s.recommendationReceived && s.recommendationAskCount >= RECOMMENDATION_ASK_LIMIT;
}

export function stageGateOpen(s: StageAdministration): boolean {
  if (!s.brainstormAsked) return false;
  return s.recommendationReceived ? s.riskAsked : recommendationUnresolved(s);
}

// Rotating pools (Rule 7 anti-tell).
export const BLOCKED_CLOSE_PROBES = {
  brainstorm: [
    "Beyond what we've discussed, what else could the client do?",
    'What other levers could the client pull here?',
    "Beyond pricing, what else could the client do to protect margin?",
  ],
  recommendation: [
    "Pull it together — what's your recommendation to the CEO?",
    'Based on what you have, what would you tell the CEO to do?',
    "What's your recommendation to the client?",
  ],
  risk: [
    "What's the biggest risk to that recommendation, and how would you test for it?",
    'What would change your mind on that recommendation?',
    "What's the key risk with that plan, and how would you de-risk it?",
  ],
} as const;

export type BlockedCloseProbe = keyof typeof BLOCKED_CLOSE_PROBES;

export function chooseBlockedCloseProbe(s: StageAdministration): BlockedCloseProbe {
  if (!s.brainstormAsked) return 'brainstorm';
  if (!s.recommendationReceived && s.recommendationAskCount < RECOMMENDATION_ASK_LIMIT) return 'recommendation';
  return 'risk';
}

export type SpokenCloseResolution = {
  action: 'none' | 'promoted' | 'replaced';
  ended: boolean;
  spokenText: string;
  probe?: BlockedCloseProbe;
};

// endBlocked: the model called end_case and the gate refused it. A turn that
// carries no question is then a close in all but words (batch 6, Maya 20:35:
// end_case alone, and the blank-turn guard sent "Go on." after her
// recommendation) — it gets the missing stage's probe like a spoken close.
export function resolveSpokenClose(params: {
  spokenText: string;
  ended: boolean;
  mayEnd: boolean;
  endBlocked?: boolean;
  stages: StageAdministration;
  seed: string;
}): SpokenCloseResolution {
  const { spokenText, ended, mayEnd, endBlocked = false, stages, seed } = params;
  const silentBlockedEnd = endBlocked && !spokenText.includes('?');
  if (ended || !(silentBlockedEnd || isClosingTurn(spokenText))) return { action: 'none', ended, spokenText };
  if (mayEnd) return { action: 'promoted', ended: true, spokenText };
  const probe = chooseBlockedCloseProbe(stages);
  return { action: 'replaced', ended: false, spokenText: pickScript([...BLOCKED_CLOSE_PROBES[probe]], seed), probe };
}
