// Conduct track (docs/interviewer-behavior.md Part IV, Rules 17–19). A separate
// track from case administration that intercepts BEFORE case rules apply.
//
// SAFETY POSTURE — read before touching the lexicons:
// This is a deterministic first-pass screen. The doc's design is a deterministic
// pre-screen with "model judgment as tiebreaker"; the tiebreaker is NOT built
// yet, so this classifier alone decides. That means:
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
export type ConductAction = 'ignore' | 'warn' | 'terminate' | 'redirect' | 'offer_pause';

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
const C3_SLUR = /\b(n[i1]gg(er|a)|f[a4]gg?(ot)?|r[e3]tard|k[i1]ke|sp[i1]c|ch[i1]nk|tr[a4]nny)\b/i;

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
const C5_DESPAIR = /\b(what'?s the point(?!\s+(?:of\s+(?:the|a|an|our|your)\b|where\b|at which\b|to\s))|why do i (?:even )?(?:bother|try)\b|why (?:even )?(?:bother|try)(?:ing)?\s*(?:anymore|at all|with (?:any of )?this|[.?!]|$)|i'?m going to (bomb|fail|blow|screw up) (every|all|everything|it all)|i (always|never) (fail|screw|mess)|nothing (matters|works)|i (hate|can'?t stand) myself|i'?m (worthless|hopeless|a failure|useless at everything)|i can'?t do (this|anything) anymore|i give up on everything)/i;

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

// ---- C1: self-directed profanity / frustration → ignore entirely ---------------
const C1_PROFANITY = /\b(damn|shit|crap|hell|f[uc]+k|f[uc]+king|goddamn|bloody|ass|piss)\b/i;

// priorHostilityWarnings: count of C2 warnings already issued this session.
export function classifyConduct(text: string, priorHostilityWarnings: number): ConductAssessment {
  // Order matters. C3 first (unambiguous, most severe). C5 before hostility so a
  // distressed candidate who also swears is offered help, not warned/terminated.
  if (C3_THREAT.test(text)) return { category: 'C3', action: 'terminate', reason: 'threat' };
  if (C3_SLUR.test(text)) return { category: 'C3', action: 'terminate', reason: 'slur' };
  if (C3_SEXUAL.test(text)) return { category: 'C3', action: 'terminate', reason: 'sexual' };

  if (C5_SELF_HARM.test(text)) return { category: 'C5', action: 'offer_pause', reason: 'self_harm' };
  if (C5_DESPAIR.test(text)) return { category: 'C5', action: 'offer_pause', reason: 'despair' };

  if (anyMatch(C4_PATTERNS, text) || anyMatch(C4_SCORE_GAMING_PATTERNS, text)) {
    return { category: 'C4', action: 'redirect', reason: 'prompt_injection' };
  }

  if (C2_INSULT.test(text) || C2_DIRECTED_PROFANITY.test(text)) {
    // First instance warns; a second directed-hostility instance terminates.
    return priorHostilityWarnings >= 1
      ? { category: 'C2', action: 'terminate', reason: 'directed_hostility_repeat' }
      : { category: 'C2', action: 'warn', reason: 'directed_hostility_first' };
  }

  // Undirected profanity with no directedness, distress, or injection: normal
  // human frustration under pressure. Ignore entirely (no log, Rule 17-C1).
  if (C1_PROFANITY.test(text)) return { category: 'C1', action: 'ignore', reason: 'self_directed_frustration' };

  return { category: 'none', action: 'ignore', reason: 'clean' };
}

// Does a candidate reply to a C5 pause offer ACCEPT stopping/pausing?
// Conservative: an explicit accept. Anything ambiguous continues the case
// (declining to stop is the safe default — we never force-end on a distress
// offer the candidate didn't accept).
const PAUSE_ACCEPT = /\b(yes|yeah|yep|ok|okay|sure|please|let'?s (stop|pause|end)|i(?:'?d| would) like to (stop|pause|end)|stop|pause|end (it|the (session|case))|i'?m done|can we stop)\b/i;
const PAUSE_DECLINE = /\b(no|nah|nope|keep going|continue|carry on|i'?m (ok|okay|fine|good)|let'?s (keep|continue|carry)|don'?t stop|not? need)\b/i;

export function isPauseAccepted(text: string): boolean {
  // Decline wins ties: "no I'm okay, let's keep going" contains "ok" but declines.
  if (PAUSE_DECLINE.test(text)) return false;
  return PAUSE_ACCEPT.test(text);
}
