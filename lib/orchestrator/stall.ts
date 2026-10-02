import { extractNumbers } from '@/lib/scoring/deterministic';
import { normalizeNumberWords } from '@/lib/number-words';
import type { Phase } from './state-machine';

// Stall ladder (docs/interviewer-behavior.md Rule 13). Resolves the deadlock
// Rules 1+2+4 create against a struggling candidate: cold affect + no help +
// no advancement. A graduated, trigger-driven escalation ladder, deterministic
// where the doc says it can be.
//
// Honesty note (matches the doc's own caveat): "no analytical progress" in
// free text is only *partly* deterministic. We err toward NOT flagging — a
// substantive turn is treated as progress even if we can't verify its quality
// (the doc: a judged quality test "would misfire worst on the nervous
// candidates Part III protects"). Only clear stalls count against the
// candidate: hedges, near-empty turns, verbatim-repeat questions, and the
// (N+1)th consecutive clarifying question. Genuine quality assessment is
// deferred to the debrief.

export const CLARIFY_BUDGET = 2;   // Rule 13: N consecutive clarifying turns count as progress
export const STALL_THRESHOLD = 2;  // Rule 13: two consecutive no-progress turns trigger intervention
export const MAX_RUNG = 3;
export const SYNTHESIS_RUNG_CAP = 2; // Rule 13: synthesis/CLOSE ladder stops at Level 2

export type StallState = {
  ladderLevel: number;            // highest rung delivered so far (0 = none); monotonic, never repeats a rung
  consecutiveNoProgress: number;  // resets on progress or after an intervention fires
  consecutiveClarify: number;     // consecutive clarifying-question turns
  lastCandidateQuestion: string | null; // for verbatim-repeat detection
  recommendationDelivered: boolean;     // synthesis done — the ladder has nothing left to rescue
  // Rule 13 v4.5 logging: why each turn in the current no-progress streak
  // counted as no progress, so a rung can be diagnosed from the log alone.
  // Optional: sessions persisted before v4.6 lack it.
  noProgressReasons?: string[];
};

export const INITIAL_STALL_STATE: StallState = {
  ladderLevel: 0,
  consecutiveNoProgress: 0,
  consecutiveClarify: 0,
  lastCandidateQuestion: null,
  recommendationDelivered: false,
};

export type LadderRung = 1 | 2 | 3;
export type TurnKind = 'analysis' | 'data_request' | 'question' | 'hedge';

export type StallDecision = {
  state: StallState;
  intervene: boolean;
  rung?: LadderRung;
  guidance?: string;
  synthesisUnresolved?: boolean; // in synthesis, capped, still stalling → session should close w/o rec
  classification: { kind: TurnKind; isRepeat: boolean; reason: string; progress: boolean };
  firedOn?: string[]; // when a rung fires: the no-progress reasons that triggered it
};

const SYNTHESIS_PHASES: Phase[] = ['RECOMMENDATION', 'WRAP'];

// A committed recommendation, as opposed to a refusal to commit ("I can't
// commit without more data" is substantive prose, so it classifies as
// analysis — this is what separates Claire from a delivered close).
const RECOMMENDATION_PATTERN = /\b(recommend(ation)?|bottom line|my answer|i'?d (raise|cut|take|push|go with|prioriti[sz]e|start|focus)|(they|the client|brew (&|and) bean|we|the ceo) should)\b/i;
// v4.6 (Maya c6076209, 18:06): "Raise prices, I guess. But I don't know past
// that." names a lever in reply to the ask — a recommendation, if a hedged
// one. A sentence that opens on a lever verb counts even inside a hedge turn;
// an explicit refusal to commit never does.
const LEVER_LEAD = /(?:^|[.!?]\s+)(?:(?:um+|uh+|so|okay|ok|well|i think|i guess|maybe|probably|honestly)[,.]?\s+)*(raise|increase|cut|reduce|lower|lock in|hedge|renegotiate|reprice|pass (on|through)|introduce|launch|switch)\b(?!\s+(in|of)\b)/i;
const COMMIT_REFUSAL = /\b(can'?t (commit|recommend)|cannot (commit|recommend)|not (ready|able) to (commit|recommend)|need more (data|information) (before|to))\b/i;

export function isRecommendationStatement(text: string, kind: TurnKind): boolean {
  if (COMMIT_REFUSAL.test(text)) return false;
  if (LEVER_LEAD.test(text.trim())) return true;
  return kind === 'analysis' && RECOMMENDATION_PATTERN.test(text);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function isQuestion(text: string): boolean {
  return /\?/.test(text) || /^\s*(what|what'?s|how|why|which|who|when|where|do|does|is|are|can|could|would|should)\b/i.test(text);
}

const HEDGE_PATTERN = /\b(i (really )?(don'?t|do not) know|not sure|no idea|i'?m stuck|i am stuck|stuck|can you help|help me|give me a hint|i give up|i can'?t (do|figure|think)|no clue|i'?m lost|i am lost|blank|um+|uh+|hmm+)\b/i;

// Deterministic "analytical progress" signal: a numeric derivation, or an
// explicit enumerated structure. Intentionally narrow — its job is to
// RECOGNIZE progress, not to grade it, so a false negative just means a
// substantive non-question turn falls through to 'analysis' anyway (below).
// v4.6: number words are normalized first — Yuki (41ece01e) wrote every
// figure in words and her analytical turns read as clarifying questions.
function hasAnalysisSignal(raw: string): boolean {
  const text = normalizeNumberWords(raw);
  const nums = extractNumbers(text);
  const computeContext = /%|\bpercent\b|=|\bof\b|\bper\b|×|\btimes\b|\bdivided\b|\bminus\b|\bplus\b|\bso that'?s\b|\bwhich is\b/i;
  if (nums.length >= 2 || (nums.length >= 1 && computeContext.test(text))) return true;
  if (/\b(first(ly)?|second(ly)?|third(ly)?)\b/i.test(text)) return true;
  if (/\b(two|three|four|2|3|4)\s+(ways|areas|buckets|reasons|drivers|factors|things|categories|levers|candidates|hypotheses|explanations|possibilities|options|causes|pieces|parts)\b/i.test(text)) return true;
  // Spoken enumeration: "One — … Two — …" at the start of separate lines or
  // sentences.
  const enumerated = text.match(/(?:^|[\n.!?]\s*)(?:one|two|three|1|2|3)\s*[—–:-]\s/gim) ?? [];
  if (enumerated.length >= 2) return true;
  return false;
}

// A request for case data is progress in its own right and never a clarifying
// question (Rule 13 v4.5). Explicit request phrasing, or a question sentence
// about a case quantity. Soft, like every phrase signal here — a miss falls
// back to the clarifying-question budget, the pre-v4.5 behavior.
const DATA_REQUEST_PHRASE =
  /\b(do we have|do you have|can (i|we) (get|see|have|look at)|could (i|we|you) (get|see|share|pull)|is there (any )?(data|information|a breakdown)|any (data|numbers|figures|information) on|i'?d (like|want|love) to (see|get|look at)|what (does|do) the (data|numbers|breakdown|exhibit) (show|say))\b/i;
const DATA_NOUN =
  /\b(revenue|costs?|cogs|margins?|prices?|pricing|volume|data|numbers?|figures?|breakdown|split|trend|history|share|growth|ticket|transactions?|labor|overhead|inflation|sales|units|traffic|spend)\b/i;
const INTERROGATIVE_START =
  /^\s*(?:and |so |okay,? |ok,? )?(what|what'?s|how|why|which|who|when|where|do|does|did|is|are|was|were|can|could|would|should|has|have|any)\b/i;

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(Boolean);
}

// A real question sentence: ends in "?" AND opens like a question. Uptalk
// answers ("Maybe buy in bulk, or lock in a price?") are statements.
function isQuestionSentence(sentence: string): boolean {
  return sentence.endsWith('?') && INTERROGATIVE_START.test(sentence);
}

function isDataRequest(text: string): boolean {
  if (DATA_REQUEST_PHRASE.test(text)) return true;
  return sentencesOf(text).some(s => isQuestionSentence(s) && DATA_NOUN.test(s));
}

// Rule 13 v4.5: the budget counts only question-only turns. A sentence that is
// not a question and has some substance (not "Okay." / "Sure.") is content.
function hasSubstantiveStatement(text: string): boolean {
  return sentencesOf(text).some(s => !isQuestionSentence(s) && wordCount(s) >= 4);
}

// A turn is classified by its content, not its last sentence (Rule 13 v4.5).
export function classifyTurn(text: string, lastQuestion: string | null): { kind: TurnKind; isRepeat: boolean; reason: string } {
  const trimmed = text.trim();
  const q = isQuestion(trimmed);
  const isRepeat = q && lastQuestion !== null && normalize(trimmed) === normalize(lastQuestion);

  if (hasAnalysisSignal(trimmed)) return { kind: 'analysis', isRepeat: false, reason: 'analysis signal (figures in a derivation, or an enumerated structure)' };
  if (isRepeat) return { kind: 'question', isRepeat, reason: 'verbatim repeat of the previous question' };
  if (isDataRequest(trimmed)) return { kind: 'data_request', isRepeat: false, reason: 'data request' };
  if (HEDGE_PATTERN.test(trimmed)) return { kind: 'hedge', isRepeat, reason: 'hedge language' };
  if (wordCount(trimmed) <= 4 && !q) return { kind: 'hedge', isRepeat, reason: 'near-empty turn' };
  if (q && !hasSubstantiveStatement(trimmed)) return { kind: 'question', isRepeat, reason: 'question-only turn' };
  // Substantive prose with no analysis signal: give the benefit of the doubt
  // (Rule 13 — err toward not flagging the nervous candidate).
  return { kind: 'analysis', isRepeat: false, reason: 'substantive statement' };
}

const RUNG_GUIDANCE: Record<LadderRung, string> = {
  1: `STALL INTERVENTION — Level 1 (restate/anchor). The candidate has stalled. Do NOT introduce new information or hand them any part of the answer. Calmly restate the question already on the table and give them room. Intent: "Take your time. The question on the table is [restate it]." One or two sentences, flat register — "take your time" is the only reassurance allowed.`,
  2: `STALL INTERVENTION — Level 2 (narrow the frame). The candidate is still stuck after an anchor. Narrow the problem to a simpler decomposing sub-question, still WITHOUT giving the answer. Intent: "Let's simplify — what are the two ways a margin can fall?" One question, flat register.`,
  3: `STALL INTERVENTION — Level 3 (directive rescue). The candidate cannot proceed unaided. This OVERRIDES the one-task-per-turn and never-contain-the-answer defaults: hand them the next branch and move the case forward. Intent: "Let's look at costs — here's the cost data." If a specific data item is the natural next step, reveal it this turn. Then continue.`,
};

const RUNG_NAME: Record<LadderRung, string> = { 1: 'restate_anchor', 2: 'narrow_frame', 3: 'directive_rescue' };

export function rungName(rung: LadderRung): string {
  return RUNG_NAME[rung];
}

// A rung counts only when it reaches the candidate (Rule 13 v4.5). The ladder's
// decision is an intent; batch 2 logged a Level 1 for Yuki (41ece01e) whose
// delivered turn was only a data release, and her report cited the assist
// twice. Delivery is read from the sent text: each rung has a cue its
// guidance asks for. Soft by design — a missed cue under-counts assists, which
// errs toward the candidate.
const RUNG_CUE: Record<LadderRung, RegExp> = {
  1: /\b(take your time|the question (on the table|is|was|we'?re on)|back to (the|your|our) question|to restate|let me restate|coming back to)\b/i,
  2: /\b(let'?s simplify|simpl(er|ify)|narrow (it|this|that)|break (it|this|that) down|start (with|by)|just (the )?one|what are the (two|three|main))\b/i,
  3: /\b(let'?s (look at|go to|take|move to|turn to|focus on)|here'?s the)\b/i,
};

export function findRungDelivery(
  rung: LadderRung,
  spokenText: string,
  ctx: { dataReleased: boolean; exhibitShown: boolean },
): string | null {
  const sentence = spokenText.split(/(?<=[.!?])\s+/).find(s => RUNG_CUE[rung].test(s));
  if (sentence) return sentence.trim();
  // A Level 3 rescue hands over the branch; a release or exhibit is that hand-off.
  if (rung === 3 && (ctx.dataReleased || ctx.exhibitShown)) return spokenText.trim();
  return null;
}

// An undelivered rung is not "used": the next stall starts from it again.
export function revertUndeliveredRung(state: StallState, prior: StallState): StallState {
  return { ...state, ladderLevel: prior.ladderLevel };
}

// Text-mode silence past the tolerance window (lib/orchestrator/silence.ts)
// counts as one no-progress turn. It never fires a rung on its own — the
// check-in is the response to silence (Rule 16) — but silence followed by a
// hedge escalates on that candidate turn.
export function recordSilenceStall(prior: StallState): StallState {
  return { ...prior, consecutiveNoProgress: prior.consecutiveNoProgress + 1, consecutiveClarify: 0 };
}

// Pure state transition: classify this candidate turn, update counters, and
// decide whether to fire the next ladder rung.
export function evaluateStall(candidateText: string, phase: Phase, prior: StallState): StallDecision {
  // Once the recommendation is in, short sign-offs are not stalls (run
  // 1d76e3d9 logged Level 1, Level 2 and synthesis_unresolved on "Goodbye.").
  if (prior.recommendationDelivered) {
    return { state: prior, intervene: false, classification: { kind: 'analysis', isRepeat: false, reason: 'recommendation already delivered — ladder stood down', progress: true } };
  }

  const { kind, isRepeat, reason } = classifyTurn(candidateText, prior.lastCandidateQuestion);
  const state: StallState = { ...prior };
  if (SYNTHESIS_PHASES.includes(phase) && isRecommendationStatement(candidateText, kind)) {
    state.recommendationDelivered = true;
  }

  let progress = false;
  let countedReason = reason;
  if (kind === 'analysis' || kind === 'data_request') {
    // Data requests never count toward the clarifying-question budget.
    progress = true;
    state.consecutiveClarify = 0;
  } else if (kind === 'question' && !isRepeat && prior.consecutiveClarify < CLARIFY_BUDGET) {
    // A clarifying question counts as progress, but only up to the budget.
    progress = true;
    state.consecutiveClarify = prior.consecutiveClarify + 1;
  } else if (kind === 'question' && !isRepeat) {
    // Over-budget clarifying question: no longer progress; keep the streak so
    // a pure clarify-loop escalates rather than resetting each time.
    state.consecutiveClarify = prior.consecutiveClarify + 1;
    countedReason = `question-only turn over the clarifying budget (${CLARIFY_BUDGET})`;
  } else {
    // Hedge or verbatim-repeat question: a clear stall; the clarify streak breaks.
    state.consecutiveClarify = 0;
  }

  state.consecutiveNoProgress = progress ? 0 : prior.consecutiveNoProgress + 1;
  state.noProgressReasons = progress ? [] : [...(prior.noProgressReasons ?? []), countedReason];
  const classification = { kind, isRepeat, reason: countedReason, progress };
  if (isQuestion(candidateText)) state.lastCandidateQuestion = candidateText;

  const cap = SYNTHESIS_PHASES.includes(phase) ? SYNTHESIS_RUNG_CAP : MAX_RUNG;

  if (state.consecutiveNoProgress >= STALL_THRESHOLD && state.ladderLevel < cap) {
    const rung = (state.ladderLevel + 1) as LadderRung;
    state.ladderLevel = rung;
    state.consecutiveNoProgress = 0; // acted this turn; give the rung a chance to land
    const firedOn = state.noProgressReasons ?? [];
    state.noProgressReasons = [];
    return { state, intervene: true, rung, guidance: RUNG_GUIDANCE[rung], classification, firedOn };
  }

  // In synthesis, capped, and still stalling → no rung left; the case should
  // close without a recommendation (logged as a candidate outcome, Rule 13).
  const synthesisUnresolved =
    !progress &&
    state.consecutiveNoProgress >= STALL_THRESHOLD &&
    state.ladderLevel >= cap &&
    SYNTHESIS_PHASES.includes(phase);

  return { state, intervene: false, synthesisUnresolved, classification };
}
