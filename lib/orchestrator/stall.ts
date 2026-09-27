import { extractNumbers } from '@/lib/scoring/deterministic';
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
};

export const INITIAL_STALL_STATE: StallState = {
  ladderLevel: 0,
  consecutiveNoProgress: 0,
  consecutiveClarify: 0,
  lastCandidateQuestion: null,
  recommendationDelivered: false,
};

export type LadderRung = 1 | 2 | 3;
export type TurnKind = 'analysis' | 'question' | 'hedge';

export type StallDecision = {
  state: StallState;
  intervene: boolean;
  rung?: LadderRung;
  guidance?: string;
  synthesisUnresolved?: boolean; // in synthesis, capped, still stalling → session should close w/o rec
};

const SYNTHESIS_PHASES: Phase[] = ['RECOMMENDATION', 'WRAP'];

// A committed recommendation, as opposed to a refusal to commit ("I can't
// commit without more data" is substantive prose, so it classifies as
// analysis — this is what separates Claire from a delivered close).
const RECOMMENDATION_PATTERN = /\b(recommend(ation)?|bottom line|my answer|i'?d (raise|cut|take|push|go with|prioriti[sz]e|start|focus)|(they|the client|brew (&|and) bean|we|the ceo) should)\b/i;

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
function hasAnalysisSignal(text: string): boolean {
  const nums = extractNumbers(text);
  const computeContext = /%|\bpercent\b|=|\bof\b|\bper\b|×|\btimes\b|\bdivided\b|\bminus\b|\bplus\b|\bso that'?s\b|\bwhich is\b/i;
  if (nums.length >= 2 || (nums.length >= 1 && computeContext.test(text))) return true;
  if (/\b(first(ly)?|second(ly)?|third(ly)?)\b/i.test(text)) return true;
  if (/\b(two|three|four|2|3|4)\s+(ways|areas|buckets|reasons|drivers|factors|things|categories|levers)\b/i.test(text)) return true;
  return false;
}

export function classifyTurn(text: string, lastQuestion: string | null): { kind: TurnKind; isRepeat: boolean } {
  const trimmed = text.trim();
  const q = isQuestion(trimmed);
  const isRepeat = q && lastQuestion !== null && normalize(trimmed) === normalize(lastQuestion);

  if (hasAnalysisSignal(trimmed)) return { kind: 'analysis', isRepeat: false };
  if (HEDGE_PATTERN.test(trimmed) || (wordCount(trimmed) <= 4 && !q)) return { kind: 'hedge', isRepeat };
  if (q) return { kind: 'question', isRepeat };
  // Substantive non-question prose with no analysis signal: give the benefit of
  // the doubt (Rule 13 — err toward not flagging the nervous candidate).
  return { kind: 'analysis', isRepeat: false };
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
  if (prior.recommendationDelivered) return { state: prior, intervene: false };

  const { kind, isRepeat } = classifyTurn(candidateText, prior.lastCandidateQuestion);
  const state: StallState = { ...prior };
  if (kind === 'analysis' && SYNTHESIS_PHASES.includes(phase) && RECOMMENDATION_PATTERN.test(candidateText)) {
    state.recommendationDelivered = true;
  }

  let progress = false;
  if (kind === 'analysis') {
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
  } else {
    // Hedge or verbatim-repeat question: a clear stall; the clarify streak breaks.
    state.consecutiveClarify = 0;
  }

  state.consecutiveNoProgress = progress ? 0 : prior.consecutiveNoProgress + 1;
  if (isQuestion(candidateText)) state.lastCandidateQuestion = candidateText;

  const cap = SYNTHESIS_PHASES.includes(phase) ? SYNTHESIS_RUNG_CAP : MAX_RUNG;

  if (state.consecutiveNoProgress >= STALL_THRESHOLD && state.ladderLevel < cap) {
    const rung = (state.ladderLevel + 1) as LadderRung;
    state.ladderLevel = rung;
    state.consecutiveNoProgress = 0; // acted this turn; give the rung a chance to land
    return { state, intervene: true, rung, guidance: RUNG_GUIDANCE[rung] };
  }

  // In synthesis, capped, and still stalling → no rung left; the case should
  // close without a recommendation (logged as a candidate outcome, Rule 13).
  const synthesisUnresolved =
    !progress &&
    state.consecutiveNoProgress >= STALL_THRESHOLD &&
    state.ladderLevel >= cap &&
    SYNTHESIS_PHASES.includes(phase);

  return { state, intervene: false, synthesisUnresolved };
}
