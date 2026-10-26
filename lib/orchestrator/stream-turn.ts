// The Stream stage (specs 2026-10-05-streaming-turn §4.3 and 2026-10-06
// plan-owns-decisions §5). The model's "say" sentences stream first, each
// delivered only if no veto applies (vetoReason — the same function Settle
// uses to withhold); the first sentence a veto would withhold stops delivery
// and the rest is Settle's. Once "say" and the declarations have both closed,
// code's data line (releases, exhibit handover, refusals, deferrals, offers —
// turn-data.ts) is delivered. The question is never delivered here: Settle
// sends it with the tail. Nothing is delivered before the distress verdict
// (D1). Stream never books a reveal; Settle books what was delivered (D3).
import { growthProbeOnRatio, growthProbeUnchecked } from './growth-probe';
import type { TurnTimer } from './turn-timer';
import type { TurnEvent, TurnValidation } from '@/lib/agent/models/interface';
import { normalizeNumberWords } from '@/lib/number-words';
import { poolPattern, rotateOpeningAck, type PhraseUses } from './phrasing';
import { switchOn } from '@/lib/cases/engine-switches';
import { toRequests, type ModelTurn } from '@/lib/agent/models/turn-schema';
import { NEUTRAL_TURN } from '@/lib/agent/models/turn-events';
import type { ModelPlan, ModelState } from './plan-turn';
import type { SegmentKind, SegmentSink } from './turn-types';
import type { Phase } from './state-machine';
import type { VerifiedFigure } from './recompute';
import type { OpenRequestItem } from './assumption-guard';
import { isDistressVerdict, type DistressVerdict } from './distress';
import type { ConductModelVerdict } from './conduct-model';
import { stripFabricatedTurn, stripMetaLeak, rewriteSystemLanguage, stripCopiedCheckIn } from './audit';
import { enforceNumericProvenance, changeFigures } from './numeric-provenance';
import { challengeVerdict } from './probe-guard';
import { withholdAssumptionChallenges } from './assumption-guard';
import { suppliesRecommendation } from './synthesis-guard';
import { isClosingTurn, isReportAnswer, asksAboutAssessment } from './spoken-close';
import { hasCloseCue } from '@/lib/agent/prompts/scripts';
import { handoffSentences } from './data-ledger';
import { promisesExhibit } from './exhibits';
import { revealedValues } from './data-ledger';
import type { OnUsage } from '@/lib/llm-usage';
import { turnDataChecked, pressureTestOutcomeNow, messageAsks, withAsks } from './turn-data';
import { renderDataLines } from './data-decisions';
import { findFalseFacts, findEchoes, findFalseRefusals, refusedItemIds, findUndeliveredClaims, type FactBase, type Echo, type DeliveryContext } from './fact-check';
import { isGradingSentence } from './grading';
import { sayAfterAckReason, sayFiguresOf } from './say-after-ack';

export type GateContext = {
  allowedTexts: string[];
  verified: VerifiedFigure[];
  alreadyProbed: Set<string>;
  flaggedThisTurn: boolean;
  flagged?: number[];              // figures a check flagged wrong this turn
  misquoteFigures?: number[];      // figures code found misquoted in this message (Phase 1 `misquoteFlat`): a doubt of one stands
  closed?: number[];               // figures of a checker flag past Rule 14: not asked about again
  closedInputs?: { figure: number; unit: string }[];   // misread inputs corrected or left for the report (E7): not probed again
  converted?: number[];            // figures a conversion closed (own-quantity.ts): never negated ("not 38")
  candidateFigures?: number[];     // the figures the candidate derived (math-talk.ts)
  openItems: OpenRequestItem[];
  phase: Phase;
  acknowledged?: boolean;  // voice already spoke a backchannel this turn
  ackText?: string;        // …and its words: the model saying them again doubles them (repeatsAck)
  voice?: boolean;         // the turn is spoken, acknowledged or not
  metaAsked?: boolean;     // the candidate asked how they're assessed (a report hand-off may answer it)
  candidateMessage?: string; // the message this turn answers (the growth probe reads its claim)
  checkerLine?: string;    // this turn's checker line, if the model is to say it (never dropped after an ack)
  sayFigures?: number[];   // the case's and the candidate's figures: a "say" sentence with one is never dropped (say-after-ack.ts)
  // The truth check (fact-check.ts F1): the case's facts, what has been
  // revealed (ids), and the figures of misquotes still standing.
  facts?: { fb: FactBase; revealed: Set<string>; echoes: Echo[]; correcting?: Echo[]; delivery?: DeliveryContext;
    // Items code hands over in this turn's data line (releases, restates, the exhibit's covers): the model must not refuse them (Task 39).
    releasedNow?: Set<string> };
};

// A short sentence whose every word is in the filler just said ("Take your
// time." after "Take your time."; "Take a moment." after "Sure, take a moment.").
// After the stuck filler ("Take your time.", "Sure, take a moment."), which
// grants the pause, a short sentence that only grants it again ("Of course.",
// "No problem.", "Of course, take your time.") is the same acknowledgment twice
// (session 9a2c19eb t4, 19 Oct).
const STUCK_ACK = /\btake (?:your time|a moment)\b/i;
const GRANT_WORDS = new Set(['of', 'course', 'no', 'problem', 'worries', 'sure', 'absolutely', 'certainly', 'okay', 'ok', 'yes', 'yeah', 'go', 'ahead',
  'take', 'your', 'time', 'a', 'moment', 'all', 'the', 'you', 'need']);

export function repeatsAck(sentence: string, ack: string): boolean {
  const words = (t: string) => t.toLowerCase().replace(/[‘’]/g, "'").match(/[a-z']+/g) ?? [];
  const mine = words(sentence);
  const theirs = new Set(words(ack));
  if (mine.length === 0 || sentence.trim().endsWith('?')) return false;
  if (mine.length <= 5 && mine.every(w => theirs.has(w))) return true;
  return STUCK_ACK.test(ack) && mine.length <= 8 && mine.every(w => GRANT_WORDS.has(w) || theirs.has(w));
}

// "not 38", "isn't 38%", "rather than 38", "instead of about 38" — a figure negated.
const NEGATED_FIGURE = /\b(?:not|isn't|is not|aren't|are not|wasn't|was not|rather than|instead of)\s+(?:about\s+|roughly\s+|around\s+|~\s*)?(?:the\s+|your\s+)?\$?(\d+(?:\.\d+)?)/gi;
export function negatesFigure(sentence: string, figures: readonly number[]): boolean {
  if (figures.length === 0) return false;
  return [...normalizeNumberWords(sentence).matchAll(NEGATED_FIGURE)].some(m => figures.some(f => Math.abs(parseFloat(m[1]) - f) < 1e-9));
}

// A code-written question's opening sentence that repeats the filler ("Take
// your time. The question on the table: …" after "Take your time."): dropped.
export function dropAckOpening(question: string, ack: string | undefined): string {
  const [first, ...rest] = question.trim().split(/(?<=[.!?])\s+/);
  return ack && rest.length > 0 && repeatsAck(first, ack) ? rest.join(' ') : question;
}

// A say sentence that is nothing but an acknowledgment ("Understood.") —
// doubled when the voice layer already said "Got it." (spike, Tyler t4).
const ACK_WORD = '(?:okay|ok|understood|got it|mm-?hm+|i see|i follow|right|sure|alright|thanks)';
// A say sentence that is only acknowledgment words ("Understood.", "Okay, got
// it.") or opens with one before a comment ("Understood, that fills the
// gaps." — demo, 7 Oct) — on an acknowledged turn the voice already said it.
const BARE_ACK = new RegExp(`^${ACK_WORD}(?:[,.!]\\s*${ACK_WORD})*[.!]?$|^${ACK_WORD},\\s`, 'i');
export function isBareAcknowledgment(sentence: string): boolean {
  return BARE_ACK.test(sentence.trim());
}

// 4.10's review fix (item 8): a correction code writes on this turn — a misquote's, said right after the model's
// "say", or the checker's line. A rotated acknowledgment in front of one reads as assent and then contradiction
// ("Mm-hm. Starter value is about $1,400, not $1,205."), which is why "Right." was left out of the pool in the
// first place; on such a turn the model's own opening word stands (phrasing.ts rotateOpeningAck, from here and
// from Settle). It lives here rather than in plan-turn.ts to keep plan-turn, and so db/client, out of the module
// graph of every test that reads this file's say-level helpers.
export function turnCorrects(state: Pick<ModelState, 'misquote' | 'checkerLine' | 'stageCheckerLine' | 'recMathProbe'>): boolean {
  const corrects = (action: string) => action === 'correct' || action === 'restate';   // math-checker-live.ts correctsNow
  return state.misquote !== null
    || (state.checkerLine !== null && corrects(state.checkerLine.action))
    || state.stageCheckerLine !== null
    || (state.recMathProbe !== null && state.recMathProbe.action === 'correct');
}

// The model's own words declining, deferring or announcing data — code
// speaks those lines; a model that writes them doubles or contradicts them
// (batch 9: Devon t14 "…is available, so I'll give you that"). Claims about
// delivery too (batch 18 v2, Destiny t31: "Those are being sent now." — they
// weren't, and no code line says so). Redelivery claims too (v3 recheck,
// Destiny: "Here they are again." with nothing after it) — on an explicit
// re-ask code restates the data itself ("As I mentioned: …").
// Not "isn't in the case": the question may set aside a claim the candidate
// invented ("…which I haven't said and which isn't in the case" — batch 21 Omar t16).
const REFUSAL_TALK = /\b(?:i don'?t have|we don'?t have|(?:isn'?t|aren'?t|is not|are not|not) (?:something|anything|data|information) (?:i|we) (?:have|hold)|(?:isn'?t|aren'?t|is not|are not) available)\b/i;
// Refusals in any wording count (batch 21 Raj t14: "Elasticity and competitor
// pricing aren't something I have in this case." then code's own "I don't have …").
export const DATA_TALK = /\b(i don'?t have|we don'?t have|that'?s not in the information|(?:isn'?t|aren'?t|is not|are not|not) (?:something|anything|data|information) (?:i|we) (?:have|hold)|(?:isn'?t|aren'?t|is not|are not) (?:available|part of (?:this|the) case|in (?:this|the) case)|i'?ll come back to|come back to (that|it)|(is|are) available|i'?ll (give|share|show) you|let me (give|share|show|pull)|being sent|on (its|their) way|(come|came|coming) through|in front of you|i'?ve (sent|shared)|(sending|pasting) (them|those|it|that)|here (they|it|that|those) (are|is)|(let me|i'?ll) (repeat|restate|re-?share)|(in|on) my (last|previous|earlier) message|(they'?re|they are|it'?s|it is) on the table)\b/i;

// Code's own data lines in any of their variants (phrasing.ts; Lorenzo, 18 Oct):
// the model hears them in the transcript and may say one in its "say" — data
// talk, as the original wording is. The lead-ins and deferrals by their fixed words.
const CODE_LINE_TALK = new RegExp([
  String.raw`\b(?:we'?ll|i'?ll) (?:get|come back) to\b[^.?!]{0,80}\b(?:shortly|in a bit|a little later|in a moment|later)\b`,
  poolPattern('defer', 'wont_get_to', 'wont_get_to_that', 'gate_defer', 'offer', 'unmapped_defer', 'restate', 'restate_exhibit', 'earlier').source,
].join('|'), 'i');

// A statement in the question that hands something over ("Here's the cost
// structure over time.", "Take a look at this exhibit.") — code already
// announced the exhibit or data (batch 13: Daniel t10, Jordan t14, Fiona t8).
// Withheld only when another sentence of the question is left (Settle).
const HANDOVER_OPENER = /^(here'?s|here is|take a look|have a look|i'?ll put up|let me (show|bring|put|pull))\b/i;
// A claim that something is being handed over now (v4.10): only true when the
// turn delivers it.
const DELIVERY_CLAIM = /\b(?:here (?:they|it|that|those|these) (?:are|is)|being sent|on (?:its|their) way|i'?ve (?:sent|shared|put)|(?:sending|pasting|sharing) (?:them|those|it|that|the)|(?:let me|i'?ll) (?:repeat|restate|re-?share|resend))\b/i;
export function isDeliveryClaim(sentence: string, exhibitOnScreen = false): boolean {
  if (exhibitOnScreen && /\bexhibit\b/i.test(sentence)) return false;   // "this exhibit" may be the one already showing
  return DELIVERY_CLAIM.test(sentence) || isHandoverAnnouncement(sentence) || (/^(?:take a look|let me (?:show|bring|put|pull))\b/i.test(sentence.trim()) && !sentence.includes(':'));
}

export function isHandoverAnnouncement(sentence: string): boolean {
  const s = sentence.trim();
  return !s.endsWith('?') && !s.includes(':') && HANDOVER_OPENER.test(s);
}

// Why a sentence of the model's own words must not be spoken, or null.
// `inQuestion`: the sentence is (part of) the question field — a question
// there is expected; in "say" it is not.
export function vetoReason(sentence: string, g: GateContext, opts: { inQuestion?: boolean; previous?: string } = {}): string | null {
  // The filler the voice just said, again in the model's words — in "say" or
  // the question (session 9ccf0836 T30: "Take your time. Take your time. …").
  if (g.ackText && (g.acknowledged || g.voice) && repeatsAck(sentence, g.ackText)) return 'double_ack';
  if (stripFabricatedTurn(sentence).fabricated !== null) return 'fabricated_turn';
  if (stripMetaLeak(sentence).strippedSentences.length > 0) return 'meta_leak';
  if (rewriteSystemLanguage(sentence).rewrites.length > 0) return 'system_language';
  if (stripCopiedCheckIn(sentence).stripped) return 'copied_check_in';
  if (enforceNumericProvenance(sentence, g.allowedTexts).blocked) return 'provenance';
  // A figure, direction or driver claim the case data contradicts, or a
  // standing misquote repeated as fact ("the 19-point COGS increase"): the
  // provenance check passes these when the number was said by anyone.
  if (g.facts && (findFalseFacts(sentence, g.facts.fb, g.facts.revealed).length > 0 || findEchoes(sentence, g.facts.echoes, g.facts.fb).length > 0
    || findEchoes(sentence, g.facts.correcting ?? [], g.facts.fb, { strict: true }).length > 0)) return 'false_fact';
  // A refusal or deferral of an item code releases in this same turn
  // ("I have no ramp assumption to give you yet." before the ramp line; Lorenzo,
  // 20 Oct, batch 34 Larkspur Tyler t21): false, so withheld (Task 39).
  if (g.facts?.releasedNow?.size && refusedItemIds(sentence, g.facts.fb).some(id => g.facts!.releasedNow!.has(id))) return 'refuses_released';
  // A refusal of data the case holds, in the model's own words (code's data line answers asks).
  if (g.facts && findFalseRefusals(sentence, g.facts.fb, g.facts.revealed, { covers: true }).length > 0) return 'false_refusal';
  // The question agrees with what code delivered (fact checks F4): "with the
  // other-input price change in hand" when only the bean figures went out, "the
  // exhibit" before any was shown, "with those figures" when none were given.
  // Settle only — it knows this turn's data line.
  if (opts.inQuestion && g.facts?.delivery && findUndeliveredClaims(sentence, g.facts.fb, g.facts.delivery).length > 0) return 'undelivered_claim';
  // A figure a conversion closed, negated in the model's words — "…20.5% price
  // rise, not 38%." beside code's conversion line (Lorenzo, 17 Oct, gap 2): the
  // "not X" code withheld, said by the model. Code then says its line itself.
  if (negatesFigure(sentence, g.converted ?? [])) return 'negates_converted';
  // Doubt on the candidate's math only with a flag behind it (probe-guard.ts):
  // on a verified figure "probe_guard", on an unverified one "unsupported_challenge".
  const challenge = challengeVerdict(sentence, {
    verified: g.verified, alreadyProbed: g.alreadyProbed, flaggedThisTurn: g.flaggedThisTurn, flagged: g.flagged, closed: g.closed, closedInputs: g.closedInputs, candidateFigures: g.candidateFigures,
    misquoteFigures: g.misquoteFigures,
  }, new Set(), opts.previous);
  if (challenge && !('explainKey' in challenge)) return challenge.test === 'unsupported_challenge' ? 'unsupported_challenge' : 'probe_guard';
  if (withholdAssumptionChallenges(sentence, g.openItems).withheld.length > 0) return 'assumption_guard';
  // "…the margin problem, or cost that grew with revenue?" only of a dollar or growth-rate claim (growth-probe.ts; Lorenzo, 15 Oct).
  if (growthProbeOnRatio(sentence, opts.previous, g.candidateMessage ?? '')) return 'growth_probe_on_ratio';
  // …and only of a claim the checker flagged (the gate; Lorenzo, 16 Oct).
  if (growthProbeUnchecked(sentence, opts.previous, g.flagged ?? [])) return 'growth_probe_unchecked';
  if ((hasCloseCue(sentence) || isClosingTurn(sentence)) && !(g.metaAsked && isReportAnswer(sentence))) return 'close_cue';
  // Rule 1: no verdict on their work, in "say" or the question (grading.ts).
  if (isGradingSentence(sentence)) return 'grading';
  // Data lines come between "say" and the question, so only "say" can double
  // them; a probe question about data ("what would be available to test
  // that?") is the interviewer's job.
  if (!opts.inQuestion && (DATA_TALK.test(sentence) || CODE_LINE_TALK.test(sentence) || handoffSentences(sentence).length > 0 || promisesExhibit(sentence))) return 'data_talk';
  // …and a refusal statement in the question doubles code's own refusal on a
  // turn whose data line refuses (Settle only — it knows the data line).
  if (opts.inQuestion && g.facts?.delivery?.refusedNow && !sentence.trim().endsWith('?') && REFUSAL_TALK.test(sentence)) return 'data_talk';
  if (['BRAINSTORM', 'RECOMMENDATION', 'WRAP'].includes(g.phase) && suppliesRecommendation(sentence)) return 'synthesis';
  if (!opts.inQuestion && sentence.trim().endsWith('?')) return 'question_in_say';
  // On a voice turn (acknowledged or not): no acknowledgment and no echo of
  // their point without a figure (say-after-ack.ts; Lorenzo's voice test, 17 Oct).
  if (!opts.inQuestion && (g.acknowledged || g.voice)) return sayAfterAckReason(sentence, { candidateMessage: g.candidateMessage, checkerLine: g.checkerLine, figures: g.sayFigures });
  return null;
}

// The gate context for this turn; `extraRevealed` adds values released this turn.
export function gateContext(plan: ModelPlan, extraRevealed: string[] = [], extraRevealedIds: string[] = []): GateContext {
  const { ctx, state } = plan;
  const revealed = [...Object.values(revealedValues(state.ledger)), ...extraRevealed];
  const revealedIds = new Set([...Object.keys(revealedValues(state.ledger)), ...extraRevealedIds]);
  return {
    allowedTexts: [
      state.caseData.prompt,
      ...state.turnRows.filter(t => t.role === 'candidate').map(t => t.text),
      ctx.candidateText,
      ...state.derivedValueTexts,
      ...revealed,
      ...changeFigures(revealed),
    ],
    verified: [...state.verifiedNow, ...state.verifiedPrev],
    alreadyProbed: state.explainProbedBefore,
    flaggedThisTurn: state.recomputeFlags.length > 0,
    flagged: state.flaggedFigures,
    closed: state.closedFigures,
    closedInputs: state.closedInputs,
    misquoteFigures: state.misquoteFigures,
    converted: state.convertedFigures,
    candidateFigures: state.candidateFigures,
    openItems: state.openDataRequests.map(r => ({ ledgerItemId: r.ledgerItemId, label: r.label })),
    phase: ctx.currentPhase,
    acknowledged: Boolean(ctx.acknowledged),
    ...(ctx.acknowledged ? { ackText: ctx.acknowledged } : {}),
    voice: Boolean(ctx.voice),
    // Only on a turn the case continues past (model turns are never the close).
    metaAsked: state.kind === 'model' && asksAboutAssessment(ctx.candidateText),
    candidateMessage: ctx.candidateText,
    ...(state.checkerLine ? { checkerLine: state.checkerLine.line } : {}),
    sayFigures: sayFiguresOf([state.caseData.prompt, ...revealed, ...state.derivedValueTexts], state.candidateFigures),
    facts: {
      fb: state.factBase, revealed: revealedIds, echoes: state.factEchoes,
      // The figures of the items code corrects this turn: unsayable, probe or not.
      correcting: state.misquote ? state.factEchoes.filter(e => e.items.some(i => state.misquote!.items.includes(i))) : [],
    },
  };
}

// Timing, comparable with batches before streaming: modelDoneAt is when the
// model's last event arrived; distressWaitMs is how long the verdict
// outlasted the model (0 when it was in first).
type StreamTiming = { modelDoneAt: number; distressWaitMs: number };

export type StreamOutcome =
  | ({ kind: 'distress'; verdict: DistressVerdict } & StreamTiming)
  | ({ kind: 'conduct'; verdict: ConductModelVerdict } & StreamTiming)   // a C3 by the model layer: the session ends (v4.10)
  | ({
    kind: 'done';
    turn: ModelTurn;
    validation: TurnValidation | null;
    delivered: string[];              // spoken text delivered, in order
    deliveredRevealIds: string[];
    undeliveredRevealIds: string[];   // the sink rejected their segment (D3)
    firstSegmentMs: number | null;    // stream start → first delivered segment
    bufferSwitch: string | null;      // why delivery stopped, if it did
  } & StreamTiming);

type Pending = { kind: 'sentence'; text: string } | { kind: 'data_line' };

// Rule 17: a C3 by the model layer ends the session (conduct-model.ts).
export function conductEnds(c: ConductModelVerdict | null): boolean {
  return c?.label === 'C3';
}

// The declarations code needs for the data line; "say" may close before or
// after them (say-first schema; a model that keeps the old order still works).
const DECLARATIONS = ['requests', 'exhibit', 'rescue_item'] as const;

export async function streamTurnSegments(
  events: AsyncIterable<TurnEvent>,
  plan: ModelPlan,
  sink: SegmentSink,
  opts: { isDelivered: { value: boolean }; timer?: TurnTimer; onUsage?: OnUsage },
): Promise<StreamOutcome> {
  const mark = (name: string) => opts.timer?.mark(name);
  const { state } = plan;
  const start = Date.now();
  // The screens (D1): the distress check and the conduct model layer. Nothing
  // is delivered before both are in; either can end the draft.
  let verdict: DistressVerdict | null | undefined; // undefined: not in yet
  let conduct: ConductModelVerdict | null = null;
  let verdictAtMs: number | null = null;
  const verdictPromise = Promise.all([state.distress, state.conductCheck]).then(([d, c]) => { conduct = c; verdict = d; verdictAtMs = Date.now(); return d; });
  const stops = () => isDistressVerdict(verdict ?? null) || conductEnds(conduct);

  const g = gateContext(plan);
  let bufferSwitch: string | null = state.buffered ? `plan:${state.bufferReason ?? 'buffered'}` : null;
  let fields: Pick<ModelTurn, 'requests' | 'exhibit' | 'rescueItem'> = { requests: [], exhibit: null, rescueItem: null };
  let queue: Pending[] = [];
  const delivered: string[] = [];
  const deliveredRevealIds: string[] = [];
  const undeliveredRevealIds: string[] = [];
  const spokenKeys = new Set<string>();
  let firstSegmentMs: number | null = null;
  let turn: ModelTurn = NEUTRAL_TURN;
  let validation: TurnValidation | null = null;
  let modelDoneAt: number | null = null;
  let closed = new Set<string>();
  let dataLineQueued = false;
  // Guard B (7 Oct): on an explicit ask, say waits for the declarations so a
  // regeneration (interviewer.ts) can still happen with nothing delivered.
  const holdForRequests = state.requestCues.length > 0;
  // A say sentence that refuses or defers an item waits until every declaration
  // has closed (what this turn releases, the exhibit handed over and its covers),
  // and the say sentences after it wait behind it, in order — the next ordinary
  // sentence never flushes it early (final review M1, 20 Oct).
  let heldRefusal = false;
  let firstSentenceSeen = false;
  const sayRaw: string[] = [];
  const ackOn = switchOn(plan.state.caseData, 'ackRotation');
  // 4.10's review fix: no rotated acknowledgment in front of a correction code writes (stream-turn.ts turnCorrects).
  const correcting = turnCorrects(state);
  const refusalShaped = (text: string) => g.facts !== undefined && refusedItemIds(text, g.facts.fb).length > 0;
  const judgeable = () => closed.has('requests') && (!heldRefusal || DECLARATIONS.every(k => closed.has(k)));

  const send = async (kind: SegmentKind, text: string, revealIds: string[], exhibitId?: string) => {
    try {
      await sink({ text, revealIds, exhibitId, kind });
    } catch {
      undeliveredRevealIds.push(...revealIds);
      bufferSwitch ??= 'sink_rejected';
      return;
    }
    opts.isDelivered.value = true;
    firstSegmentMs ??= Date.now() - start;
    if (text) delivered.push(text);
    deliveredRevealIds.push(...revealIds);
  };

  const handle = async (p: Pending) => {
    if (bufferSwitch) return;
    if (p.kind === 'sentence') {
      const key = p.text.toLowerCase().replace(/\s+/g, ' ');
      if (spokenKeys.has(key)) { bufferSwitch = 'duplicate'; return; }
      spokenKeys.add(key);
      // A sentence that refuses or defers an item is judged against what this
      // turn's data line releases: the requests have closed by now (it was held).
      // The checked decisions, the data line's own (round 5 Task 45: the small-model
      // check's verdict can release an item; cached on the plan, shared with Settle).
      // Every turn with such a sentence, declared requests or not: the message's own asks count (Task 50).
      let gate = g;
      if (g.facts && refusedItemIds(p.text, g.facts.fb).length > 0) {
        await (opts.timer ? opts.timer.time('pt_judge', pressureTestOutcomeNow(plan)) : pressureTestOutcomeNow(plan));
        const d = await turnDataChecked(plan, withAsks(fields, await messageAsks(plan, fields.requests, opts.onUsage)), opts.onUsage);
        gate = { ...g, facts: { ...g.facts, releasedNow: new Set([...d.releases.map(r => r.id), ...d.restates.map(r => r.id), ...(d.exhibit?.covers ?? [])]) } };
      }
      const reason = vetoReason(p.text, gate);
      // With "say" written before the declarations, the model sometimes
      // answers the requests there ("I don't have X, Y or Z"); the data line
      // says it properly, so that sentence alone is dropped (Settle drops it
      // too) and streaming goes on — so does a verdict on their work, a
      // doubled acknowledgment and an echo after the voice's acknowledgment.
      // Any other veto stops delivery.
      if (reason === 'data_talk' || reason === 'refuses_released' || reason === 'double_ack' || reason === 'echo_after_ack' || reason === 'grading') return;
      if (reason) { bufferSwitch = reason; return; }
      await send('say', p.text, []);
      return;
    }
    // "say" and the declarations closed: code's data line — once the
    // pressure test's verdict for this turn is in (the gate depends on it).
    await (opts.timer ? opts.timer.time('pt_judge', pressureTestOutcomeNow(plan)) : pressureTestOutcomeNow(plan));
    // The message's asks the model left out, as Settle adds them (round 5 Tasks 48, 50).
    // The model's raw say (Phase 2 S2's evidence), as Settle reads it: the sentences as the model wrote them.
    const d = await turnDataChecked(plan, withAsks(fields, await messageAsks(plan, fields.requests, opts.onUsage)), opts.onUsage, { modelSay: sayRaw.join(' ') });
    // The same connecting words Settle renders: the same seed and the session's recent uses (phrasing.ts).
    const lines = renderDataLines(d, `${plan.ctx.sessionId}:${plan.ctx.nextTurnIndex}`, plan.ctx.flags.phraseUses as PhraseUses | undefined);
    if (lines.length > 0 || d.exhibit) {
      await send('data', lines.filter(Boolean).join(' '), d.releases.map(r => r.id), d.exhibit?.id);
      mark('data_line_delivered');
    }
  };
  const flushQueue = async () => {
    const q = queue;
    queue = [];
    for (const p of q) await handle(p);
  };

  for await (const e of events) {
    if (e.type === 'restart') {
      // A regeneration happens only while nothing was delivered: drop the draft.
      queue = [];
      sayRaw.length = 0;
      spokenKeys.clear();
      fields = { requests: [], exhibit: null, rescueItem: null };
      closed = new Set();
      dataLineQueued = false;
      heldRefusal = false;
      firstSentenceSeen = false;
      continue;
    }
    if (e.type === 'done') { turn = e.turn; validation = e.validation; modelDoneAt = Date.now(); mark('model_done'); break; }
    if (e.type === 'sentence') mark('model_first_sentence');
    else mark(`model_${e.key}_closed`);
    let p: Pending | null = null;
    // 4.10 (`ackRotation`): the say's opening acknowledgment through the pool rotation (phrasing.ts rotateOpeningAck;
    // Settle renders the same words from the same seed and uses).
    if (e.type === 'sentence') p = { kind: 'sentence', text: !firstSentenceSeen && ackOn ? rotateOpeningAck(e.text, plan.ctx.flags.phraseUses as PhraseUses | undefined, `${plan.ctx.sessionId}:${plan.ctx.nextTurnIndex}`, { correcting }) : e.text };
    if (e.type === 'sentence') { firstSentenceSeen = true; sayRaw.push(e.text); }
    else if (e.key === 'requests') fields = { ...fields, requests: toRequests(e.value) };
    else if (e.key === 'exhibit') fields = { ...fields, exhibit: typeof e.value === 'string' ? e.value : null };
    else if (e.key === 'rescue_item') fields = { ...fields, rescueItem: typeof e.value === 'string' ? e.value : null };
    if (e.type === 'field') closed.add(e.key);
    // Guard B: held say sentences go out once the requests have closed (a
    // regeneration before then drops them with the draft) — every declaration,
    // when a refusal-shaped sentence is among them.
    if (e.type === 'field' && (DECLARATIONS as readonly string[]).includes(e.key) && judgeable() && verdict !== undefined && !stops()) await flushQueue();
    if (!p && !dataLineQueued && closed.has('say') && DECLARATIONS.every(k => closed.has(k))) {
      dataLineQueued = true;
      p = { kind: 'data_line' };
    }
    if (!p) continue;
    // …and so is a sentence that refuses or defers an item, whatever the cue: a release for it may be declared (Task 39).
    if (p.kind === 'sentence' && !closed.has('requests') && refusalShaped(p.text)) heldRefusal = true;
    if (verdict === undefined) { queue.push(p); mark('held_for_distress'); continue; } // D1: hold until the verdict
    if (p.kind === 'sentence' && !judgeable() && (holdForRequests || heldRefusal)) { queue.push(p); mark('held_for_requests'); continue; }
    if (stops()) continue;
    await flushQueue();
    await handle(p);
  }

  const doneAt = modelDoneAt ?? Date.now();
  const v = verdict === undefined ? await verdictPromise : verdict;
  const timing: StreamTiming = { modelDoneAt: doneAt, distressWaitMs: Math.max(0, (verdictAtMs ?? Date.now()) - doneAt) };
  const c = conduct as ConductModelVerdict | null;
  if (c && conductEnds(c)) return { kind: 'conduct', verdict: c, ...timing };
  if (isDistressVerdict(v)) return { kind: 'distress', verdict: v, ...timing };
  await flushQueue();
  return { kind: 'done', turn, validation, delivered, deliveredRevealIds, undeliveredRevealIds, firstSegmentMs, bufferSwitch, ...timing };
}
