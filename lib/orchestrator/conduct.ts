// Conduct track (docs/interviewer-behavior.md Part IV, Rules 17–19). A separate
// track from case administration that intercepts BEFORE case rules apply.
//
// SAFETY POSTURE — read before touching the lexicons:
// This is a deterministic first-pass screen. The doc's design is a deterministic
// pre-screen with "model judgment as tiebreaker". v4.10 (11 Oct) builds it
// (conduct-model.ts): a C3 the lists miss ends the session through the model
// layer, and a hit on an ambiguous slur stem ("chink", "spic", "retard",
// "fag") is decided there ("confirm") instead of ending a session on a word
// that has innocent uses. The rest of this note still holds for the lists:
//   - It WILL have false positives and false negatives. Tune conservatively.
//   - Destructive actions (terminate) require CLEAR, specific signals — we would
//     rather miss a borderline C2 than wrongly terminate an innocent candidate.
//   - C5 (distress) is the opposite: err toward TRIGGERING. A false positive is a
//     needless "are you okay?" (low harm); a false negative is the screenshot of
//     an AI coldly ignoring a spiraling student (high harm). C5 is checked with
//     sensitive patterns and deliberately runs before hostility checks.
// Before production this needs the model tiebreaker AND human review of the
// lexicons with the actual pilot population. Do not treat these regexes as
// sufficient safety coverage on their own.

export type ConductCategory = 'none' | 'C1' | 'C2' | 'C3' | 'C4' | 'C5';

// ignore: proceed with the normal case turn (no scripted response, no log for C1)
// warn/redirect/offer_pause: the interviewer's turn IS the scripted response (short-circuit the case turn)
// terminate: scripted closing sentence, session ends with NO score/debrief (Rule 18)
export type ConductAction = 'ignore' | 'warn' | 'terminate' | 'redirect' | 'offer_pause' | 'confirm';
// confirm: an ambiguous C3 stem — the model layer decides (plan-turn.ts); until
// it does, nothing is delivered (the screen gate in stream-turn.ts).

export type ConductAssessment = {
  category: ConductCategory;
  action: ConductAction;
  reason: string; // which signal fired — logged for QA / classifier tuning
};

// ---- C3: harassment, slurs, sexual content, threats → terminate immediately ---
// Kept deliberately specific. This is the most destructive path (no warning), so
// it must not fire on ordinary frustration. Threats and explicit sexual content
// aimed at the interviewer; a small set of unambiguous slur stems.
// "find/beat you" need carve-outs for helpful/idiomatic usage: "I'll find you
// the exact number" (offering data) and "I'll beat you to it" (joking) are not
// threats, and this path terminates with no warning — a false positive here is
// the worst outcome in the file. "I'll find you and..." / "beat you to death"
// still fire (the continuation isn't an object/idiom).
const C3_THREAT = /\b(i'?ll|i will|i'?m going to|im going to|i am going to|imma|i'?m gonna|gonna)\s+(kill|hurt|find|beat|rape|murder|assault|hunt)\s+(you|u|ya)\b(?!\s+(?:the|a|an|some|more|that|this|these|those|it)\b)(?!\s+to\s+(?:it|the)\b)/i;
const C3_SEXUAL = /\b(send nudes|sexual|f[uc]+k me|suck (my|your)|i want to (f[uc]+k|touch) you|are you (horny|wet)|\bsext\b)\b/i;
// Slur stems: intentionally short and only the most unambiguous group-targeting
// terms. This list is illustrative and MUST be reviewed/expanded with counsel
// and the real population before production — an English-only regex is not a
// hate-speech classifier.
// v4.10: split by ambiguity. The unambiguous stems end the session at once;
// the ambiguous ones have common innocent uses and go to the model tiebreaker,
// unless the context is plainly innocent ("a chink in the armor", "spic and
// span", "fire retardant", "retard growth").
const C3_SLUR = /\b(n[i1]gg(er|a)s?|f[a4]gg[o0]ts?|k[i1]kes?|tr[a4]nn(y|ies))\b/i;
const C3_SLUR_AMBIGUOUS = /\b(r[e3]tard(s|ed)?|sp[i1]cs?|ch[i1]nks?|f[a4]gs?)\b/i;
const C3_INNOCENT = /\bch[i1]nks? in (?:the|their|its|our|your|his|her|my) armou?r\b|\bspic and span\b|\b(?:fire|flame)[- ]retard\w*|\bretard(?:s|ed|ing)? (?:the |its |their )?(?:growth|progress|development|decline|spread|rate|ripening|combustion)\b|\b(?:smoke|bum|light|roll) (?:a )?fags?\b/i;

// ---- C5: distress signals → break persona, offer pause/stop, NEVER terminate ---
// Sensitive by design. Self-harm language, or despair generalized beyond the
// task ("every", "all", "point of anything", hopelessness).
const C5_SELF_HARM = /\b(kill myself|hurt myself|end it all|don'?t want to (live|be here|exist)|no reason to (live|go on)|better off (dead|without me)|want to die)\b/i;
// "what's the point" / "why even try" are ALSO ordinary case-analysis phrasing
// ("what's the point of the loyalty program?", "why even try to compete with
// Starbucks on price?"). Carve out the clearly-analytic continuations (an
// of-the/of-a object, "where", or "try to <verb>") while keeping the bare and
// despair-shaped forms firing — still err toward triggering on ambiguity
// ("what's the point of this" fires).
// v4.3 (persona run 4ea2840a — Sam's disclosure fired nothing): "don't see the
// point in any of it / anymore" is despair generalized beyond the case. The
// "of a/the <thing>" continuation stays analytic ("I don't see the point of a
// loyalty program here") — the C1/C5 boundary in Rule 17.
const C5_NO_POINT = /\b(?:don'?t|do not|didn'?t|did not|can'?t|cannot) (?:really |even |genuinely )*see (?:the|any) point(?!\s+(?:of|in)\s+(?:the|a|an|our|your|this|that)\s+(?!case\b)\w)/i;
// Non-case hardship disclosures: not risk-to-self on their own, but a real
// interviewer would stop and check in.
const C5_HARDSHIP = /\b(?:i'?m not sleeping|i haven'?t been sleeping|i can'?t sleep|(?:bad|rough|dark|awful) few (?:weeks|months)|(?:has|have) (?:kind of |really )?broken me|i'?m falling apart)\b/i;
// v4.12 (batch 39, aldermoor p07 35740806 t17 — Lorenzo's ruling, 26 Oct): "nothing (matters|works)" removed. His
// message was pure case arithmetic ending "both miss, and nothing works" — a verdict on two options, not on himself —
// and the regex floor fired C5 "despair", skipped the model layer, and spoke the 988 script. Generalized hopelessness
// in those words is the model layer's call now (conduct-model.ts); the floor keeps the first-person forms.
// v4.6: "i (always|never) (fail|screw|mess)" removed — "ugh, I always mess up
// the math" is C1 by the Rule 17 boundary, and the eval corpus showed it
// firing on exactly that. Generalized self-talk is the model layer's job.
const C5_DESPAIR = /\b(what'?s the point(?!\s+(?:of\s+(?:the|a|an|our|your)\b|where\b|at which\b|to\s))|why do i (?:even )?(?:bother|try)\b|why (?:even )?(?:bother|try)(?:ing)?\s*(?:anymore|at all|with (?:any of )?this|[.?!]|$)|i'?m going to (bomb|fail|blow|screw up) (every|all|everything|it all)|i (hate|can'?t stand) myself|i'?m (worthless|hopeless|a failure|useless at everything)|i can'?t do (this|anything) anymore|i give up on everything)/i;

// ---- C4: prompt injection → redirect + log, NEVER terminate --------------------
// Tuned against an adversarial probe corpus (July 2026, see conduct.test.ts):
// the original flat regex both missed standard jailbreaks ("Ignore all
// previous instructions" — only one qualifier word was allowed) and fired on
// ordinary case speech ("override the default pricing rules", "you are now
// paying 40% more", "the CEO issued new instructions"). The rules below all
// share one principle: an injection needs BOTH a meddling/probing shape AND an
// object that refers to the model's own operation (instructions/prompt/rules/
// persona/AI) — either half alone is normal business language. "act as ..."
// must target the model itself (a live run false-positived on the case answer
// "select stores to act as a test pilot").
const C4_PATTERNS: RegExp[] = [
  // meddle-verb + any run of qualifiers + a model-operation object
  /\b(?:ignore|disregard|forget|override|bypass|skip|drop)\s+(?:(?:your|all|the|previous|prior|earlier|these|those|any|my)\s+)*(?:instructions?|rules?|prompts?|guidelines?|constraints?|restrictions?)\b/i,
  // "forget everything you ..." (self-corrections use "forget everything I said")
  /\bforget everything you\b/i,
  // probing for the model's own prompt/instructions
  /\bsystem prompt\b/i,
  /\b(?:show|tell|reveal|repeat|print|share|display)\s+(?:me\s+)?your\s+(?:system\s+|original\s+|initial\s+|hidden\s+)?(?:prompt|instructions|rules)\b/i,
  /\bwhat (?:is|are|were)\s+your\s+(?:system\s+|original\s+|initial\s+|hidden\s+)?(?:prompt|instructions)\b/i,
  // persona reassignment ("you are now a pirate / DAN / in developer mode") —
  // NOT bare "you are now", which is how a candidate addresses the client
  // ("you are now paying 40% more for beans")
  /\byou are now (?:an?\s+\w+|dan\b|in developer mode|free of|unrestricted|no longer)\b/i,
  /\bpretend to be\b/i,
  /\bpretend you(?:'?re| are)? (?:an? )?(?:ai|assistant|chatbot|bot|language model|dan)\b/i,
  /\bpretend you (?:have|had) no (?:rules|restrictions|filters?|instructions)\b/i,
  /\bact (?:as|like) (?:if you\b|you\b|an? (?:ai|assistant|chatbot|language model|bot)\b)/i,
  // persona-break asks
  /\b(?:drop the (?:act|persona|character)|break character|stop (?:being|playing|acting (?:as|like)) (?:the |an? )?(?:interviewer|ai|assistant|character|persona))\b/i,
  // acknowledging/leveraging the interviewer being an AI
  /\byou'?re (?:just )?an ai\b/i,
  // "new instructions" as a directive (colon / handoff), not as case content
  // ("the CEO issued new instructions to store managers")
  /\bnew instructions\s*:/i,
  /\b(?:here are|these are) (?:your|the) new instructions\b/i,
  /\bjailbreak\b/i,
];
const C4_SCORE_GAMING_PATTERNS: RegExp[] = [
  /\bgive me (?:a |the )?(?:perfect|top|highest|full|max)\s*(?:score|rating|grade|marks?)\b/i,
  /\bscore me (?:highly|high|a? ?perfect|as strong)\b/i,
  /\bmark me (?:as )?(?:strong|excellent|top)\b/i,
  /\brate me (?:highly|perfect)\b/i,
  // "score everything as strong" / "rate this all strong"
  /\b(?:score|rate|grade|mark) (?:this|everything|it all|all (?:eight )?dimensions?) (?:as |at )?(?:strong|perfect|top|highly?|excellent)\b/i,
  // dictating the report's content
  /\b(?:write|say|note|put|record) (?:in (?:the|my) (?:report|feedback) )?that i (?:was|did|am) (?:great|excellent|strong|perfect|amazing|good)\b/i,
];
const anyMatch = (patterns: RegExp[], text: string) => patterns.some(p => p.test(text));

// ---- C2: directed hostility → warn once, then terminate ------------------------
// The threshold is DIRECTEDNESS (second-person), not vocabulary. "this f***ing
// case is hard" is C1; "you're a f***ing idiot" is C2. Two deliberate
// narrowings (probe-driven): "your" is EXCLUDED — the candidate addresses the
// interviewer as the client, so "your margins are terrible" / "your
// competitors sell garbage" is ordinary case speech, not hostility (the old
// `you|r` alternation matched "your"); and "the worst" doesn't fire when it's
// "the worst case" ("you are right that the worst-case scenario...").
const C2_INSULT = /\b(?:you'?re|you are|u r)\b[^.?!]*\b(stupid|idiot|useless|worthless|dumb|pathetic|garbage|trash|terrible|awful|moron|incompetent|clueless|a joke|the worst(?!\s*-?\s*case)|braindead|brain dead)\b/i;
const C2_DIRECTED_PROFANITY = /\b(f[uc]+k (you|u|off)|screw you|shut (the )?(f[uc]+k )?up|you (suck|f[uc]+king suck)|go f[uc]+k yourself|piss off|you'?re (an? )?ass)\b/i;

// Rule 17-C2 (v4.3): reported speech and generic "you" are never directed at
// the interviewer. Persona run faa999fd: "I gather the CEO basically said
// you're an idiot if you think it's labor" drew a warning, an apology, and a
// "professionalism lapse" in the report. Quoted text, sentences that report
// someone else's words, and conditional generic-you ("you're an idiot if you
// think X") are removed before the C2 lexicons run.
const REPORTED_SPEECH = /\b(?:said|says|saying|told|tells|telling|called|calls|claimed|claims|thinks|according to|put it|quote)\b/i;
const GENERIC_YOU = /\b(?:you'?re|you are)\b[^.?!]*\bif (?:you|u)\b/i;

function directedText(text: string): string {
  return text
    .replace(/"[^"]*"|“[^”]*”/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(s => !REPORTED_SPEECH.test(s) && !GENERIC_YOU.test(s))
    .join(' ');
}

// ---- C1: self-directed profanity / frustration → ignore entirely ---------------
const C1_PROFANITY = /\b(damn|shit|crap|hell|f[uc]+k|f[uc]+king|goddamn|bloody|ass|piss)\b/i;

// priorHostilityWarnings: count of C2 warnings already issued this session.
export function classifyConduct(text: string, priorHostilityWarnings: number): ConductAssessment {
  // Order matters. C3 first (unambiguous, most severe). C5 before hostility so a
  // distressed candidate who also swears is offered help, not warned/terminated.
  if (C3_THREAT.test(text)) return { category: 'C3', action: 'terminate', reason: 'threat' };
  if (C3_SLUR.test(text)) return { category: 'C3', action: 'terminate', reason: 'slur' };
  if (C3_SLUR_AMBIGUOUS.test(text.replace(C3_INNOCENT, ' '))) return { category: 'C3', action: 'confirm', reason: 'slur_ambiguous' };
  if (C3_SEXUAL.test(text)) return { category: 'C3', action: 'terminate', reason: 'sexual' };

  if (C5_SELF_HARM.test(text)) return { category: 'C5', action: 'offer_pause', reason: 'self_harm' };
  if (C5_DESPAIR.test(text) || C5_NO_POINT.test(text)) return { category: 'C5', action: 'offer_pause', reason: 'despair' };
  if (C5_HARDSHIP.test(text)) return { category: 'C5', action: 'offer_pause', reason: 'hardship' };

  if (anyMatch(C4_PATTERNS, text) || anyMatch(C4_SCORE_GAMING_PATTERNS, text)) {
    return { category: 'C4', action: 'redirect', reason: 'prompt_injection' };
  }

  const directed = directedText(text);
  if (C2_INSULT.test(directed) || C2_DIRECTED_PROFANITY.test(directed)) {
    // First instance warns; a second directed-hostility instance terminates.
    return priorHostilityWarnings >= 1
      ? { category: 'C2', action: 'terminate', reason: 'directed_hostility_repeat' }
      : { category: 'C2', action: 'warn', reason: 'directed_hostility_first' };
  }
  // The lexicon matched only quoted/reported/generic-you text: log, never warn.
  if (C2_INSULT.test(text) || C2_DIRECTED_PROFANITY.test(text)) {
    return { category: 'C2', action: 'ignore', reason: 'reported_or_generic_you' };
  }

  // Undirected profanity with no directedness, distress, or injection: normal
  // human frustration under pressure. Ignore entirely (no log, Rule 17-C1).
  if (C1_PROFANITY.test(text)) return { category: 'C1', action: 'ignore', reason: 'self_directed_frustration' };

  return { category: 'none', action: 'ignore', reason: 'clean' };
}

// Rule 17-C5 element 3: the crisis line goes with signals suggesting risk to
// self (self-harm language, generalized hopelessness), not hardship alone.
export function isRiskToSelf(a: ConductAssessment): boolean {
  return a.category === 'C5' && (a.reason === 'self_harm' || a.reason === 'despair');
}

// Does a candidate reply to a C5 pause offer ACCEPT stopping/pausing?
// Conservative: an explicit accept. Anything ambiguous continues the case
// (declining to stop is the safe default — we never force-end on a distress
// offer the candidate didn't accept).
const PAUSE_ACCEPT = /\b(yes|yeah|yep|ok|okay|sure|please|let'?s (stop|pause|end)|i(?:'?d| would) like to (stop|pause|end)|stop|pause|end (it|the (session|case))|i'?m done|can we stop)\b/i;
// v4.10 (batch 18, Sam t27): "I'm alright, honestly… We finished the case, so
// there's nothing left to pause for" was read as accepting the pause — the
// word "pause" was there. Saying they're alright, or that there's nothing to
// pause or stop for, is declining.
const PAUSE_DECLINE = /\b(no|nah|nope|keep going|continue|carry on|i'?m (ok|okay|fine|good|alright|all right|doing (?:ok|okay|fine|better|alright))|let'?s (keep|continue|carry)|don'?t stop|not? need|nothing (?:left )?to (?:pause|stop) for|no need to (?:pause|stop)|(?:we )?finished the case)\b/i;

export function isPauseAccepted(text: string): boolean {
  // Decline wins ties: "no I'm okay, let's keep going" contains "ok" but declines.
  if (PAUSE_DECLINE.test(text)) return false;
  return PAUSE_ACCEPT.test(text);
}
