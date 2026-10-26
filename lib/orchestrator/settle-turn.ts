// The Settle stage (specs 2026-10-05-streaming-turn §4.4, 2026-10-06
// plan-owns-decisions §8). The turn is composed, never repaired: the model's
// "say" and "question" with any vetoed sentence withheld (vetoReason — the
// same rules Stream applied), code's data line between them, then the prefix
// lock (only what follows the already-delivered speech goes out) and one
// commit. Code-written turns (close, grace ask, time warning, rung 1) arrive
// here as a turn whose words are code's own and are not vetoed.
import type { CloseHoldMemory } from './close-hold';
import type { TurnTimer } from './turn-timer';
import type { OnUsage } from '@/lib/llm-usage';
import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, exhibitsShown, sessionEvents } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { logDataRequestClassification } from './data-request-log';
import type { DetectedDataRequest } from './data-requests';
import { reveal, revealedValues, markExhibitReveals, nextExhibitOnly } from './data-ledger';
import { auditTurn, auditTurnStyle } from './audit';
import { changeFigures } from './numeric-provenance';
import { withholdMathChallenges, challengeVerdict } from './probe-guard';
import { classifyMathTalk } from './math-talk';
import { checkTimeframes } from './timeframe-check';
import { checkHintDelivered } from './hint-check';

import { probeIntents, pickFallbackQuestion, reaskProbe, narrowProbe, refersToFigures, codeProbe, EARLY_PHASES, waiverLead, WHERE_TO_START, type PressureTestState } from './pressure-test';
import { requestSentences } from './request-signal';
import { isUnderTimePressure } from './pacing';
import { rungName, classifyRungDelivery, revertUndeliveredRung } from './stall';
import { logEvent } from '@/lib/analytics';
import { caseTotalMs, type Phase } from './state-machine';
import { toCheckEventRows } from './check-log';
import { line, phrase, recordPhraseUses, rotateOpeningAck, type PhraseUses } from './phrasing';
import { shadowAskDecision } from './ask-decision';
import { switchOn } from '@/lib/cases/engine-switches';
import { dataLinePools } from '@/lib/cases/loader';
import { dataLineVariantsOn } from '@/lib/cases/data-line-variants';
import { asksForConclusion, analysisAskLine } from './spoken-close';
import { updateStages, stageQuestions, type StageKey, type StageRecord } from './stage-evidence';
import { renderDataLineParts, decisionRows, nextReadyExhibit, itemBackedDefers } from './data-decisions';
import { brainstormAsks, brainstormAskLine, asksOwnBrainstorm } from './brainstorm';
import { applyHeard, heardRequestRows, unheardQuestionPressureTest } from './heard';
import { derivePhase, type TurnMove } from './progress';
import { turnDataChecked, pressureTestOutcomeNow, wrapUpTurn, messageAsks, probeTurn, withAsks, mustReachItems, openDeferrals, resolveDeferrals, tracksDeferrals, modelDeferrals } from './turn-data';
import { isGradingSentence, gradingRemainder } from './grading';
import { settlePendingData } from './pending-data';
import { lineHeard, correctsNow, restatedBy, lineKey, type CorrectedRoot } from './math-checker-live';
import { vetoReason, gateContext, isHandoverAnnouncement, isDeliveryClaim, dropAckOpening, turnCorrects } from './stream-turn';
import type { ModelTurn, Move } from '@/lib/agent/models/turn-schema';
import type { TurnValidation } from '@/lib/agent/models/interface';
import type { ModelPlan } from './plan-turn';
import { figureAsWritten } from './recompute';
import { askIntents, advanceLine, type AskIntent } from './ask-intent';
import type { ExhibitDisplay, HeardReport, PendingEvent, ScriptedPlan, TurnCtx, TurnResult } from './turn-types';

export async function logSessionEvent(
  sessionId: string,
  category: 'intervention' | 'conduct' | 'request_signal',
  subtype: string,
  turnIndex: number,
  phase: Phase,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(sessionEvents).values({ sessionId, category, subtype, turnIndex, phase, payloadJsonb: payload });
}

// Session events decided during the turn (plan-turn.ts PendingEvent), as rows.
export function pendingEventRows(ctx: TurnCtx, events: PendingEvent[]) {
  return events.map(e => ({
    sessionId: ctx.sessionId, category: e.category, subtype: e.subtype,
    turnIndex: ctx.nextTurnIndex, phase: ctx.currentPhase, payloadJsonb: e.payload,
  }));
}

// What the candidate heard: a voice acknowledgment spoken at end-of-turn, then
// the turn. Saved and returned as one interviewer line; never re-sent. An
// acknowledgment the heard report says didn't play (a late skip, 18 Oct) is
// left out: a filler never appears as said unless it was.
export function heardText(ctx: { acknowledged?: string }, text: string, heard?: HeardReport | null): string {
  const ack = heard?.ackHeard === false ? undefined : ctx.acknowledged;
  return ack ? [ack, text].map(s => s.trim()).filter(Boolean).join(' ') : text;
}

// A scripted turn (no model call): the candidate turn and the scripted reply,
// this turn's check decisions, its events, then the session update — the
// order the early-return paths wrote them in before the Plan stage.
// Voice (spec 2026-10-08-voice-phase-b §5.6): the saved line is what was
// heard; a `required` line's state change stands only if the line was heard
// in full, a `decided` one's regardless; a session ended meanwhile (End) is
// not touched.
export async function commitScripted(plan: ScriptedPlan, heard: HeardReport | null = null): Promise<TurnResult> {
  if (plan.noPersist) return plan.result;
  const { ctx } = plan;
  const spoken = heard ? heard.segments.map(s => s.text.slice(0, s.heardChars).trim()).filter(Boolean).join(' ') : plan.interviewerText;
  const scripted = heard?.segments.filter(s => s.kind === 'scripted') ?? [];
  const lineHeard = !heard || (scripted.length > 0 && scripted.every(s => s.heardChars >= s.text.trim().length));
  const applies = lineHeard || plan.delivery === 'decided';
  if (heard && !lineHeard) {
    ctx.checks.record('scripted_not_delivered', true,
      applies ? 'cut before the end — decided, so it stands' : 'cut before the end — not counted', {
        delivery: plan.delivery ?? 'required', line: plan.interviewerText, heard: spoken,
      });
  }
  // A session ended meanwhile (End) is not touched (v4.10: text too).
  const live = (await db.query.sessions.findFirst({ where: eq(sessions.id, ctx.sessionId) }))?.status === 'active';
  if (!live) return { ...plan.result, interviewerText: '', ended: true, scoringSuppressed: true };
  const saved = heardText(ctx, spoken, heard);
  await db.insert(sessionTurns).values([
    { sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex, role: 'candidate', text: ctx.heardText ?? ctx.candidateText, timestampMs: ctx.now },
    ...(saved ? [{ sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex + 1, role: 'interviewer' as const, text: saved, timestampMs: Date.now() }] : []),
  ]);
  const checkRows = toCheckEventRows(ctx.checks, { sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex, phase: ctx.currentPhase });
  if (checkRows.length > 0) await db.insert(sessionEvents).values(checkRows);
  if (ctx.events.length > 0) await db.insert(sessionEvents).values(pendingEventRows(ctx, ctx.events));
  if (applies && Object.keys(plan.sessionUpdate).length > 0) {
    await db.update(sessions).set(plan.sessionUpdate).where(and(eq(sessions.id, ctx.sessionId), eq(sessions.status, 'active')));
  }
  if (heard) return { ...plan.result, interviewerText: saved, ended: applies && plan.result.ended };
  return ctx.acknowledged ? { ...plan.result, interviewerText: heardText(ctx, plan.result.interviewerText) } : plan.result;
}

// The prefix lock: the composed text is the turn; the candidate already
// received `delivered`, so only what follows is sent. A composed text that no
// longer starts with what was delivered sends its not-yet-delivered sentences
// (check stream_prefix_mismatch).
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const sentencesOf = (s: string) => norm(s).split(/(?<=[.!?])\s+/).filter(Boolean);

export function tailAfterDelivered(finalText: string, delivered: string[]): { tail: string; mismatch: boolean } {
  const final = norm(finalText);
  const prefix = norm(delivered.join(' '));
  if (!prefix) return { tail: final, mismatch: false };
  if (final === prefix) return { tail: '', mismatch: false };
  if (final.startsWith(prefix + ' ')) return { tail: final.slice(prefix.length + 1), mismatch: false };
  const done = new Set(delivered.flatMap(sentencesOf));
  return { tail: sentencesOf(final).filter(x => !done.has(x)).join(' '), mismatch: true };
}

// model: requested; actualModels: what the API answered from, per call
// (response.model) — logged so an evaluation can prove which model ran.
export type TurnUsage = { model: string; actualModels: string[]; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; apiCalls: number };

export type ModelOutcome = {
  turn: ModelTurn;
  validation: TurnValidation | null;
  modelCallStart: number;
  modelLatencyMs: number;
  distressWaitMs: number;
  turnUsage: TurnUsage;
  delivered: string[];              // speech already delivered, in order; [] when nothing streamed
  undeliveredRevealIds?: string[];  // reveals whose segment was not delivered (D3): never booked
  requestsClassified?: boolean;     // false: a code-written turn whose request classification failed
  // Code-written turns: data_request rows logged beside the decisions' own —
  // detections no asking sentence covered, as passing mentions (session-runner.ts).
  extraRequestRows?: DetectedDataRequest[];
  timer?: TurnTimer;                // per-step timing (turn-timer.ts)
};

export type Settled = {
  result: TurnResult;
  spokenText: string;      // the composed turn
  tail: string;            // the part not yet delivered
  prefixMismatch: boolean;
  newReveals: string[];
  exhibitId?: string;
  // Voice: `heard` (spec 2026-10-08-voice-phase-b §5) decides what is booked,
  // saved and changed; the result returned is the turn as heard.
  persist: (latency: { firstSegmentMs: number | null; streamed: boolean }, heard?: HeardReport | null) => Promise<TurnResult>;
};

const CODE_WRITTEN = new Set(['close', 'grace_ask', 'time_warning', 'rung1', 'stage_exhibit', 'stage_brainstorm', 'stage_analysis', 'rec_revision', 'rec_math_probe', 'close_wait']);
// Code's own stage asks, recorded as moves it is sure of.
const STAGE_MOVE: Partial<Record<string, Move>> = { stage_exhibit: 'exhibit', stage_brainstorm: 'brainstorm', stage_analysis: 'analysis', rec_revision: 'recommendation', rec_math_probe: 'recommendation' };

// A figure the candidate gave as a result in this message ("= 53.8", "is
// about 1.6%", "so 38%") — not an input or an index base ("index this to 100").
function statedAsResult(candidateText: string, figure: number): boolean {
  const n = String(figure).replace('.', '\\.');
  return new RegExp(`(?:=|≈|\\bis|\\bare|\\bgives|\\babout|\\broughly|\\bthat'?s|\\bso|\\bcomes to)\\s+(?:about\\s+|roughly\\s+|around\\s+|~)?\\$?${n}(?![\\d])`, 'i').test(candidateText);
}

const ASKS_RECOMMENDATION = new Set(['rec_ask', 'grace_ask', 'time_warning']);
// A must-reach item said after other data lines at a point only Settle sees (round 6 Task 72, fix round 2).
export const MUST_REACH_LEAD_EXHIBIT = 'One more thing before the exhibit:';
export const MUST_REACH_LEAD_REC = 'Before your recommendation:';

export async function settleTurn(plan: ModelPlan, out: ModelOutcome): Promise<Settled> {
  const { ctx, state } = plan;
  const { sessionId, userId, candidateText, now, nextTurnIndex, currentPhase, flags, conduct, checks, later, turnStartMs } = ctx;
  const { caseData, ledger, elapsedMs, recomputeFlags, recomputeAttempts, verifiedNow, verifiedPrev, explainProbedBefore,
    candidateFigures, priorStall, stallDecision, kind } = state;
  const TOTAL_CASE_MS = caseTotalMs(caseData);  // this case's clock
  const { turn, modelCallStart, modelLatencyMs, distressWaitMs, turnUsage } = out;
  const seed = `${sessionId}:${nextTurnIndex}`;
  const codeWritten = CODE_WRITTEN.has(kind);
  const ended = kind === 'close';

  // Data: the same decisions Stream delivered from (the pressure test's
  // verdict for this turn first — the gate depends on it).
  const { satisfied: satisfiedNow, waiving, nothingMissing } = await (out.timer ? out.timer.time('pt_judge_settle', pressureTestOutcomeNow(plan)) : pressureTestOutcomeNow(plan));
  const onUsage: OnUsage = u => { void logEvent('llm_usage', { ...u }, { sessionId: plan.ctx.sessionId, userId: plan.ctx.userId }); };
  // A model turn answers the asks the model left out (round 5 Tasks 48 and 50,
  // turn-data.ts messageAsks): they join its requests; on a probe turn the data
  // line goes before the probe.
  const asked = await messageAsks(plan, turn.requests, onUsage);
  if (asked && asked.sentences.length > 0) {
    checks.record(probeTurn(plan) ? 'probe_turn_requests' : 'uncovered_asks', asked.fresh.length > 0, 'the message\'s asks no explicit declaration covers are answered', {
      sentences: asked.sentences, open: asked.open, classified: asked.waited ? asked.detected !== null : null, ...(asked.timedOut ? { timedOut: true } : {}),
      answered: asked.fresh.map(r => r.what), covered: asked.covered.map(r => r.what), dropped: asked.dropped.map(r => r.what),
      // Row 11's call (round 6 Task 76 (c)): the cue, the classifier's own latency and the turn's wait (capped at 1.5 s).
      ...(asked.cue ? { cue: asked.cue, waitMs: asked.waited ? asked.waitMs ?? null : 0, latencyMs: asked.latencyMs ?? null } : {}),
    });
  }
  // A model release the message never named, checked by the classifier on the message (Task 51).
  // latencyMs is the classifier's own time — null when it hadn't answered (a timeout: waitMs ≈ 1500), not "no call".
  if (asked?.release) {
    const r = asked.release;
    checks.record('release_checked', r.withdrawn.length > 0, 'a model release the message never named, and no detection maps: withdrawn, the message\'s asks answered on their own', {
      checked: r.checked.map(c => ({ what: c.what, id: c.id })), confirmed: r.confirmed, withdrawn: r.withdrawn.map(c => c.id),
      classified: r.classified, ...(asked.timedOut ? { timedOut: true } : {}), latencyMs: r.latencyMs, waitMs: r.waitMs,
    });
  }
  const decisions = await turnDataChecked(plan, withAsks(turn, asked), onUsage);
  const phraseUses = flags.phraseUses as PhraseUses | undefined;
  const dataParts = renderDataLineParts(decisions, seed, phraseUses);
  let dataLines = dataParts.map(p => p.text);
  const gBase = gateContext(plan, decisions.releases.map(r => r.value), [...decisions.releases.map(r => r.id), ...(decisions.exhibit?.covers ?? []), ...decisions.restates.map(r => r.id)]);
  // What this turn's data line hands over, for the question's delivery claims.
  const g = gBase.facts ? { ...gBase, facts: { ...gBase.facts, delivery: {
    revealed: gBase.facts.revealed, exhibitShown: state.shownExhibitIds.size > 0 || decisions.exhibit !== null,
    deliveredNow: decisions.releases.length > 0 || decisions.exhibit !== null || decisions.restates.length > 0 || decisions.correction != null,
    deliveredPrev: false, refusedNow: decisions.refusals.length > 0,
    deferredNow: itemBackedDefers(decisions).length + decisions.gateDefers.length + decisions.offers.length > 0,
  }, releasedNow: new Set([...decisions.releases.map(r => r.id), ...decisions.restates.map(r => r.id), ...(decisions.exhibit?.covers ?? [])]) } } : gBase;

  // The model's words, vetoed sentence by sentence (never rewritten).
  const withheld: { sentence: string; reason: string; field: 'say' | 'question' }[] = [];
  const keep = (text: string, field: 'say' | 'question') => {
    // A verdict that only sets up a challenge in the question keeps the
    // challenge ("Your aggregate closes the gap, but your 37.5% was applied…"
    // → "Your 37.5% was applied…"); any other verdict is withheld below.
    const all = sentencesOf(text).map(s => {
      const rest = field === 'question' && isGradingSentence(s) ? gradingRemainder(s) : null;
      if (rest) withheld.push({ sentence: s, reason: 'grading', field });
      return rest ?? s;
    });
    let kept = all.filter((s, i) => {
      const reason = vetoReason(s, g, { inQuestion: field === 'question', previous: all[i - 1] });
      if (reason) withheld.push({ sentence: s, reason, field });
      return reason === null;
    });
    // A handover announcement in the question goes when the question has
    // something else to say (isHandoverAnnouncement).
    if (field === 'question' && kept.some(s => !isHandoverAnnouncement(s))) {
      kept = kept.filter(s => {
        if (!isHandoverAnnouncement(s)) return true;
        withheld.push({ sentence: s, reason: 'handover_in_question', field });
        return false;
      });
    }
    return kept.join(' ');
  };
  // 4.10 (`ackRotation`): the model's opening acknowledgment through the pool rotation, as Stream said it — and, by
  // its review fix, never in front of a correction code writes (stream-turn.ts turnCorrects).
  const ackOn = switchOn(state.caseData, 'ackRotation');
  const say = codeWritten ? turn.say : keep(ackOn ? rotateOpeningAck(turn.say, phraseUses, seed, { correcting: turnCorrects(state) }) : turn.say, 'say');
  // Whether this message answered the last question (a fallback must not ask it again).
  const lastAnswered = stallDecision.classification.kind === 'analysis';
  // A code-written question opening with the filler the voice just said ("Take
  // your time. The question on the table: …" after "Take your time.") drops
  // that opening; the model's words are vetted above (vetoReason).
  let question = codeWritten ? dropAckOpening(turn.question, ctx.acknowledged) : keep(turn.question, 'question');
  if (kind === 'rec_ask') question = line(state.recAskLate ? 'late_rec_ask' : 'rec_ask', phraseUses, seed);
  // The model's own words in the question, as the turn goes on — emptied
  // wherever code replaces the question, kept when code only appends. The
  // pressure test is asked by the model's words or code's own probe, never by
  // a code-written fallback (Lorenzo, 13 Oct: "Which part of the problem would
  // you dig into first?" counted as the probe — batch 20 Destiny t16 replay).
  let modelQuestion = codeWritten || kind === 'rec_ask' ? '' : question;
  // A math challenge withheld from the question takes its setup with it
  // ("One thing to check: you said 16 divided by 18 is 1.6%." — batch 18 v3,
  // Maya t24, left without its question): what remains must still be a
  // question, else a neutral one replaces it — a request for the working on
  // the figure when that is still allowed, otherwise a plain next question.
  const challengeCtx = {
    verified: [...verifiedNow, ...verifiedPrev], alreadyProbed: explainProbedBefore, flaggedThisTurn: recomputeFlags.length > 0,
    flagged: state.flaggedFigures, closed: state.closedFigures, closedInputs: state.closedInputs, candidateFigures,
    misquoteFigures: state.misquoteFigures,
  };
  const mathWithheld = withheld.filter(w => w.field === 'question' && (w.reason === 'probe_guard' || w.reason === 'unsupported_challenge'));
  let challengeReplacement: string | null = null;
  if (!codeWritten && kind !== 'rec_ask' && mathWithheld.length > 0) {
    const figs = [...candidateFigures, ...challengeCtx.verified.map(v => v.value)];
    const rest = sentencesOf(question).filter(x => x.endsWith('?') || !(/:\s*$/.test(x) || classifyMathTalk(x, figs).figures.length > 0));
    // What stays must still ask something that isn't about the challenged math.
    if (rest.some(x => x.endsWith('?') && classifyMathTalk(x, figs).kind === 'none')) {
      question = rest.join(' ');
      modelQuestion = question;
    } else {
      const verdicts = mathWithheld.map(w => challengeVerdict(w.sentence, challengeCtx));
      // Phase 1 task 5 (`probeGuardMethod`; Lorenzo, 26 Oct: "ask about method ('Walk me through how you got there'),
      // never name a figure that code verified as correct"): the replacement asks for the method and names no figure
      // at all — where `got_to` puts the candidate's own figure back to them, and a figure code verified as correct is
      // exactly what the guard withheld the challenge over (b35q Marisol t24, b38 Larkspur Tyler t14). The words come
      // from the `probe_method` pool, like code's other lines, his first.
      // Not where the withheld doubt was about a figure the case has closed — an error past Rule 14, or working they
      // already showed: a question with no referent lands on their last claim, and those two are never asked about
      // again (Lorenzo, 13 and 20 Oct). There the plain fallback still stands in.
      const methodOn = switchOn(state.caseData, 'probeGuardMethod')
        && !verdicts.some(v => v !== null && !('explainKey' in v) && (v.test === 'closed_to_report' || v.test === 'explain_work_shown'));
      // …and not on a turn that hands over data or an exhibit: there the phase fallback already asks about what just
      // went out ("Where do those numbers point you?"), which beats a question about the working of the message
      // before it. The figure never comes back either way — `got_to` is out under the switch.
      const dataNow = decisions.releases.length > 0 || decisions.exhibit !== null;
      const about = verdicts.find(v => v && !('explainKey' in v) && v.figure !== undefined
        && statedAsResult(candidateText, v.figure)) as { figure?: number } | undefined;
      const figureText = about?.figure !== undefined ? figureAsWritten(candidateText, about.figure) : null;
      const explain = methodOn
        ? (dataNow ? null : line('probe_method', phraseUses, seed))
        : figureText ? phrase('got_to', figureText, phraseUses, seed) : null;
      const verdict = explain ? challengeVerdict(explain, challengeCtx) : null;
      const allowed = explain !== null && (verdict === null || 'explainKey' in verdict);
      question = allowed && explain ? explain : pickFallbackQuestion({ uses: phraseUses, figuresDelivered: decisions.releases.length > 0 || decisions.exhibit !== null, seed, last: state.lastQuestion ?? null, lastAnswered, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) });
      modelQuestion = '';
      challengeReplacement = question;
    }
  }
  checks.record('math_challenge', mathWithheld.length > 0, 'a doubt on the candidate\'s math without a flag was withheld', {
    withheld: mathWithheld.map(w => ({ sentence: w.sentence, reason: w.reason })), replacement: challengeReplacement,
  });
  for (const w of withheld.filter(x => x.reason === 'probe_guard' || x.reason === 'unsupported_challenge')) {
    // Prevented, not delivered: logged apart from the interviewer errors scoring marks (interviewer-errors.ts).
    ctx.events.push({ category: 'intervention', subtype: w.reason === 'probe_guard' ? 'challenge_on_verified_blocked' : 'unsupported_challenge_blocked', payload: { sentence: w.sentence, field: w.field } });
  }
  // A question withheld for a false fact — or for closing the case mid-case
  // (Jasmine 35897f4a t18 "That's all I have on the case.") — is replaced by one that fits the phase
  // (after whatever statement of the question is left: "Per-unit costs aren't
  // something I have directly." still needs a question after it).
  if (!codeWritten && kind !== 'rec_ask' && !question.trim().endsWith('?') && withheld.some(w => w.field === 'question' && (w.reason === 'false_fact' || w.reason === 'undelivered_claim' || w.reason === 'false_refusal' || w.reason === 'refuses_released' || w.reason === 'close_cue'
      // A withheld growth probe (growth-probe.ts) leaves an ask when "Walk me through it." stays.
      || ((w.reason === 'growth_probe_on_ratio' || w.reason === 'growth_probe_unchecked') && !/\b(?:walk|talk) me through\b|\btell me\b/i.test(question))))) {
    const fallback = pickFallbackQuestion({ uses: phraseUses, figuresDelivered: decisions.releases.length > 0 || decisions.exhibit !== null, seed, last: state.lastQuestion ?? null, lastAnswered, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) });
    modelQuestion = question;
    question = question ? `${question} ${fallback}` : fallback;
  }
  const questionFallback = !codeWritten && kind !== 'rec_ask' && !question;
  if (questionFallback) { question = 'Go on.'; modelQuestion = ''; }

  // A model question about figures the candidate hasn't received is replaced
  // (v3, batch 18 v2: Destiny heard "Which of these cost lines moved the
  // most?" eleven times with no figures delivered).
  const figuresOut = decisions.releases.length > 0 || decisions.exhibit !== null || decisions.restates.length > 0;
  // No delivery claim without a delivery (v4.10): "Here they are again",
  // "Here's the cost breakdown", "being sent now" in the question, on a turn
  // that hands nothing over, is withheld ("say" withholds them always — code's
  // data line speaks for a delivery).
  if (!codeWritten && kind !== 'rec_ask' && !figuresOut) {
    const kept = sentencesOf(question).filter(x => {
      if (!isDeliveryClaim(x, state.shownExhibitIds.size > 0)) return true;
      withheld.push({ sentence: x, reason: 'undelivered_claim', field: 'question' });
      return false;
    });
    if (kept.length !== sentencesOf(question).length) {
      question = kept.some(x => x.endsWith('?')) ? kept.join(' ') : pickFallbackQuestion({ uses: phraseUses, figuresDelivered: false, seed, last: state.lastQuestion ?? null, lastAnswered, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) });
      modelQuestion = kept.some(x => x.endsWith('?')) && modelQuestion ? question : '';
    }
  }
  // Only item-backed deferrals hold the model's figure question: the check's item-less
  // named deferrals hold no data (Lorenzo, 19 Oct, round-3 ruling 3; batch 31 Sofia t10's
  // math probe was withheld), and "We won't get to" lines are not counted either —
  // on a wrap-up turn every deferral is one, the gate's included (round-3 ruling 4).
  const heldThisTurn = (decisions.gatedIds.length > 0 && !wrapUpTurn(plan)) || itemBackedDefers(decisions).length > 0 || decisions.gateDefers.length > 0;
  if (!codeWritten && kind !== 'rec_ask' && !figuresOut && refersToFigures(question)
    && (heldThisTurn || Object.keys(revealedValues(ledger)).length === 0)) {
    withheld.push({ sentence: question, reason: 'undelivered_figures', field: 'question' });
    question = pickFallbackQuestion({ uses: phraseUses, figuresDelivered: false, seed, last: state.lastQuestion ?? null, lastAnswered, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) });
    modelQuestion = '';
  }

  // Pressure test (spec 2026-10-07-pressure-test-and-request-guards): code
  // owns the state and the bounded fallbacks. v3 (batch 18, 10 Oct): while
  // the probe is open, every reply counts — reply 1 gets one re-ask, reply 2
  // a narrowed probe, reply 3 a spoken waiver that releases what is held
  // (PT_REPLY_LIMIT); a duplicate probe after the test is closed is
  // replaced; a test the model never asks while requested data is held is
  // asked by code, once, and with no structure ever given the hold ends too.
  const ptPrev = state.pressureTest;
  const pt: PressureTestState = { ...ptPrev };
  let ptAction: string | null = null;
  const early = EARLY_PHASES.includes(currentPhase);
  const isProbe = (q: string) => probeIntents(q).length > 0 && (early || turn.move === 'pressure_test');
  // A waiver: the probe went unanswered, whatever the reply was.
  const waiverQuestion = (lead: string) => `${lead} ${pickFallbackQuestion({ uses: phraseUses, figuresDelivered: figuresOut, seed, last: state.lastQuestion ?? null, lastAnswered: false, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) })}`;
  // Every reply while the probe is open counts, code-written turns included
  // (stall rung 1, the recommendation ask, the time warning); only a model
  // turn can carry a ladder step or the waiver (pressureTestOutcomeNow).
  if (ptPrev.state === 'awaiting' && !satisfiedNow && kind !== 'close') {
    pt.awaitingReplies = (ptPrev.awaitingReplies ?? 0) + 1;
  }
  if (!codeWritten && kind !== 'rec_ask') {
    if (ptPrev.state === 'awaiting' && nothingMissing) {
      // "Nothing is missing" answers the what's-missing ask (Lorenzo, 19 Oct):
      // no re-ask, no narrowed probe toward a gap; code asks which branch first,
      // once, unless the model already asks where to start. Any gap against the
      // case key goes in the report (scoring is told), not into more probing.
      const ownStart = WHERE_TO_START.test(modelQuestion) && !probeIntents(modelQuestion).includes('mece');
      const picked = WHERE_TO_START.test(candidateText);   // they said where they'd start already
      if (picked) {
        if (probeIntents(modelQuestion).includes('mece')) {
          question = pickFallbackQuestion({ uses: phraseUses, figuresDelivered: figuresOut, seed, last: state.lastQuestion ?? null, lastAnswered: true, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) });
          modelQuestion = '';
        }
      } else if (!ownStart) {
        const ask = line('ask_branch', phraseUses, seed);
        question = ask.charAt(0).toUpperCase() + ask.slice(1); modelQuestion = '';
      }
      ptAction = 'nothing_missing';
      ctx.events.push({ category: 'intervention', subtype: 'pressure_test_nothing_missing', payload: {
        probe: ptPrev.probe ?? null, askedAt: ptPrev.askedAt ?? null, replyTurn: nextTurnIndex, reply: candidateText, branchAsked: !ownStart && !picked,
      } });
    } else if (ptPrev.state === 'awaiting' && !satisfiedNow) {
      if (waiving) {
        question = waiverQuestion(waiverLead('awaiting', phraseUses, seed)); modelQuestion = '';
        ptAction = 'waived';
      } else if (pt.awaitingReplies === 1) {
        question = reaskProbe(ptPrev.intents, decisions.gatedIds.length > 0, lastAnswered, phraseUses, seed); modelQuestion = '';
        pt.reasks += 1;
        pt.followUps = [...(ptPrev.followUps ?? []), question];
        ptAction = 'reask';
      } else {
        question = narrowProbe(ptPrev.intents, phraseUses, seed); modelQuestion = '';
        pt.followUps = [...(ptPrev.followUps ?? []), question];
        ptAction = 'narrowed';
      }
    } else if (ptPrev.state !== 'not_asked' && isProbe(modelQuestion) && (satisfiedNow || ptPrev.state === 'waived')) {
      question = pickFallbackQuestion({ uses: phraseUses, figuresDelivered: figuresOut, seed, last: state.lastQuestion ?? null, lastAnswered, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) });
      modelQuestion = '';
      ptAction = 'replaced_duplicate';
    } else if (ptPrev.state === 'not_asked') {
      pt.gatedTurns = decisions.gatedIds.length > 0 ? ptPrev.gatedTurns + 1 : 0;
      if (waiving) {
        question = waiverQuestion(waiverLead('not_asked', phraseUses, seed)); modelQuestion = '';
        ptAction = 'waived';
      } else if (!isProbe(modelQuestion) && pt.gatedTurns >= 2) {
        // The probe tests a structure; with none on the table, ask for it first (once).
        // No verdict (timeout, error) is not "no structure": code asks nothing this
        // turn, spends no fallback, and the check runs again next turn.
        const verdict = pt.structureGiven ? null : await (out.timer ? out.timer.time('structure_judge', state.structureVerdict) : state.structureVerdict);
        pt.structureGiven = pt.structureGiven || Boolean(verdict?.given);
        if (!pt.structureGiven && verdict === null) {
          ptAction = 'structure_unknown';
        } else if (pt.structureGiven && !pt.codeAsked) {
          question = codeProbe(phraseUses, seed); modelQuestion = '';
          pt.codeAsked = true;
          ptAction = 'code_asked';
        } else if (!pt.structureGiven && !pt.structureAsked) {
          question = line('structure_ask', phraseUses, seed); modelQuestion = '';
          pt.structureAsked = true;
          ptAction = 'code_asked_structure';
        }
      }
    }
  }
  if (ptAction === 'waived') {
    // Not satisfaction: administered and unanswered (Rule 13 assisted vs covered).
    Object.assign(pt, { state: 'waived', waivedAt: nextTurnIndex + 1 });
    // What scoring is told (lib/scoring/assists.ts summarizePressureTest): whether
    // the probe was delivered, its questions and the replies, and the closure.
    const probeDelivered = ptPrev.state === 'awaiting';
    const replyTurns = probeDelivered
      ? [...state.turnRows.filter(t => t.role === 'candidate' && t.turnIndex > (ptPrev.askedAt ?? -1)).map(t => t.turnIndex), nextTurnIndex]
      : [];
    ctx.events.push({ category: 'intervention', subtype: 'pressure_test_waived', payload: {
      from: ptPrev.state, probeDelivered, probe: ptPrev.probe ?? null, askedAt: ptPrev.askedAt ?? null, followUps: ptPrev.followUps ?? [],
      structureAsked: ptPrev.structureAsked, replies: pt.awaitingReplies ?? 0, replyTurns, gatedTurns: pt.gatedTurns,
      waivedAt: nextTurnIndex + 1, released: decisions.releases.map(r => r.id),
    } });
  } else if (pt.state === 'awaiting' && satisfiedNow) {
    Object.assign(pt, { state: 'satisfied', satisfiedAt: nextTurnIndex });
  }
  if (state.requestCues.length > 0) {
    ctx.events.push({ category: 'request_signal', subtype: 'explicit_ask', payload: { cues: state.requestCues, sentences: requestSentences(candidateText), resolvedIds: [] } });
  }
  // Rule 9 v4.10: the model's own recommendation ask waits while the exhibit
  // or the brainstorm is still owed (as code's own ask already does) — code
  // administers the stage instead, once. Not under time pressure. Fact guards
  // Phase 5: any call for the conclusion (a lever choice too — batch 20 R06,
  // R23), and first the case's core analysis (code's one line back to it).
  let stageAsked: StageKey | undefined = kind === 'stage_exhibit' ? 'exhibit' : kind === 'stage_brainstorm' ? 'brainstorm' : kind === 'stage_analysis' ? 'analysis' : undefined;
  let heldForExhibit: (typeof caseData.exhibits)[number] | undefined;
  // A required exhibit still owed holds the model's early ask first (13 Oct):
  // it is handed over (or, if an exhibit goes out this turn, asked about) —
  // once the pressure test is closed, else the exhibit would be held.
  const requiredOwed = state.requiredExhibit ? caseData.exhibits.find(e => e.id === state.requiredExhibit) : undefined;
  const gateClosedNow = satisfiedNow || waiving || ptPrev.state === 'waived';
  if (!codeWritten && kind === 'model' && requiredOwed && gateClosedNow && asksForConclusion(question)) {
    withheld.push({ sentence: question, reason: 'recommendation_held_for_stage', field: 'question' });
    if (decisions.exhibit) question = line('stage_exhibit_q', phraseUses, seed);
    else { heldForExhibit = requiredOwed; question = `${phrase('exhibit', requiredOwed.title, phraseUses, seed)} ${line('stage_exhibit_q', phraseUses, seed)}`; }
    modelQuestion = '';
    stageAsked = 'exhibit';
  } else if (!codeWritten && kind === 'model' && state.analysisOwed && caseData.analysisCore && asksForConclusion(question)) {
    withheld.push({ sentence: question, reason: 'recommendation_held_for_stage', field: 'question' });
    question = analysisAskLine(caseData.analysisCore.ask, state.recommendationInPlay);
    modelQuestion = '';
    stageAsked = 'analysis';
  } else if (!codeWritten && kind === 'model' && state.owedStage && state.ptClosed && !isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) && asksForConclusion(question)) {
    const asked = question;
    if (state.owedStage === 'brainstorm') {
      question = brainstormAskLine(caseData, phraseUses, seed);
      modelQuestion = '';
      stageAsked = 'brainstorm';
    } else if (!decisions.exhibit) {
      heldForExhibit = nextReadyExhibit(caseData.exhibits, state.shownExhibitIds, ledger, state.stagesOut);
      if (heldForExhibit) {
        question = `${phrase('exhibit', heldForExhibit.title, phraseUses, seed)} ${line('stage_exhibit_q', phraseUses, seed)}`;
        modelQuestion = '';
        stageAsked = 'exhibit';
      }
    }
    if (stageAsked) withheld.push({ sentence: asked, reason: 'recommendation_held_for_stage', field: 'question' });
  }
  // A brainstorm that waits on exhibits (Lorenzo, 13 Oct; Larkspur's assumes
  // Exhibit 3's new-routes plan — Tyler t15, Omar t11, Marcus t19, Fiona t19
  // asked it earlier): the model's brainstorm before it is due — its
  // brainstorm move, or the case's own ask in any move — is held. Code hands
  // over the next ready exhibit instead; with an exhibit already going out, a
  // question about the figures. Never under time pressure (it is due then).
  if (!codeWritten && kind === 'model' && !stageAsked && state.brainstormDue === false
    && (turn.move === 'brainstorm' || asksOwnBrainstorm(question, brainstormAsks(caseData)))) {
    withheld.push({ sentence: question, reason: 'brainstorm_held_for_exhibit', field: 'question' });
    const next = decisions.exhibit ? undefined : nextReadyExhibit(caseData.exhibits, state.shownExhibitIds, ledger, state.stagesOut);
    if (next) {
      heldForExhibit = next;
      question = `${phrase('exhibit', next.title, phraseUses, seed)} ${line('stage_exhibit_q', phraseUses, seed)}`;
      stageAsked = 'exhibit';
    } else {
      question = pickFallbackQuestion({ uses: phraseUses, figuresDelivered: decisions.releases.length > 0 || decisions.exhibit !== null, seed, last: state.lastQuestion ?? null, lastAnswered, phase: currentPhase });
    }
    modelQuestion = '';
  }
  // Code's line back to the analysis on a turn whose own data line completes
  // it (140fb90d replay: the other-input change released with "Let's hold the
  // recommendation…") asks about the figures instead.
  if (kind === 'stage_analysis' && caseData.analysisCore) {
    const core = caseData.analysisCore;
    const out = new Set([...Object.keys(revealedValues(ledger)), ...decisions.releases.map(r => r.id), ...(decisions.exhibit?.covers ?? [])]);
    if (core.items.filter(id => out.has(id)).length >= (core.minItems ?? core.items.length)) {
      question = pickFallbackQuestion({ uses: phraseUses, figuresDelivered: true, seed, last: state.lastQuestion ?? null, lastAnswered, phase: currentPhase });
      modelQuestion = '';
    }
  }
  // Under time pressure a required exhibit still owed is not a hold: it goes
  // out with the recommendation ask, the candidate's to use (13 Oct).
  const pressureEx = state.pressureExhibit ? caseData.exhibits.find(e => e.id === state.pressureExhibit) : undefined;
  if (pressureEx && !ended && !decisions.exhibit && !heldForExhibit
    && (ASKS_RECOMMENDATION.has(kind) || (kind === 'model' && asksForConclusion(question)))) {
    heldForExhibit = pressureEx;
    question = `${phrase('exhibit', pressureEx.title, phraseUses, seed)} ${question}`;
  }
  // Code's brainstorm line on a turn whose own data line hands over data
  // (batch 21 D8, Fiona t14: the decisive other-input figure, then "What other
  // levers could the client pull here?") asks about the figures; the
  // brainstorm, not yet administered, comes next turn. Not under time pressure
  // (round 5 Task 49, A2; the hold before Exhibit 3's rule, Lorenzo 13 Oct):
  // there the brainstorm ask follows the data line in the same turn, so a
  // time-up can't lose it.
  let stageWaited = false;
  if (kind === 'stage_brainstorm' && !(state.timeUp || isUnderTimePressure(elapsedMs, TOTAL_CASE_MS))
    && (decisions.releases.length > 0 || decisions.exhibit !== null)) {
    question = pickFallbackQuestion({ uses: phraseUses, figuresDelivered: true, seed, last: state.lastQuestion ?? null, lastAnswered, phase: currentPhase });
    stageAsked = undefined;
    stageWaited = true;
  }
  // The checker's line counts as delivered only if it is heard (Lorenzo, 15
  // Oct; batch 26 Jasmine 074b0534 t31: its probe was logged "used" and the
  // model asked for the recommendation instead): a model question that leaves
  // it out — or paraphrases it past the vetting — gives way to code's line (a
  // correction goes before the question; "say" has already been spoken). A
  // pressure-test step or a stage code administers keeps the question; the
  // line then waits (below).
  // A due stage question in the model's words wins over a checker probe
  // (Lorenzo, 15 Oct; batch 26 Jordan 6bd9edf3 t19 lost its risk question to
  // "Walk me through that calculation."): the question stays, and the probe is
  // held back to the next turn. Due: at or past the stage's deadline or after
  // the time warning; the risk once the recommendation is in (Plan's stagesDue).
  // A correction is no probe: it still goes first, before the stage question.
  // A correction riding on a deadline's stage turn (Lorenzo, 19 Oct, R7): code
  // wrote it into a code-written turn's "say"; before code's recommendation ask
  // it goes ahead of the question (the model's "say" is already spoken). Heard,
  // booked, undone if not heard — as on a model turn.
  const checkerLine = (!codeWritten && kind === 'model') || state.stageCheckerLine ? state.checkerLine : null;
  let checkerLineBy: 'model' | 'code' | null = null;
  let heldForStage: StageKey | undefined;
  const codeTookQuestion = ['waived', 'reask', 'narrowed', 'code_asked', 'code_asked_structure'].includes(ptAction ?? '') || stageAsked !== undefined || heldForExhibit !== undefined;
  // Code's own correction before code's recommendation ask the same way (the model may have said it from its hint).
  if (kind === 'rec_ask') for (const l of [...state.stageCodeLines].reverse()) if (!lineHeard(`${say} ${question}`, l)) question = `${l} ${question}`;
  if (checkerLine && state.stageCheckerLine) {
    const saidByModel = !codeWritten && lineHeard(`${say} ${question}`, checkerLine.line, checkerLine.quote);
    if (!codeWritten && !saidByModel) question = [checkerLine.line, question].filter(Boolean).join(' ');
    checkerLineBy = saidByModel ? 'model' : 'code';
  } else if (checkerLine && !codeTookQuestion) {
    const asked = modelQuestion ? stageQuestions(modelQuestion, {
      move: turn.move, recOnTable: state.stages.recommendationAsked || state.recommendationReceived,
      brainstormAsks: brainstormAsks(caseData), brainstormDue: state.brainstormDue,
    }) : null;
    const dueAsked = asked ? (['risk', 'recommendation', 'brainstorm'] as const).find(k => asked[k] && state.stagesDue[k]) : undefined;
    if (lineHeard(`${say} ${question}`, checkerLine.line, checkerLine.quote)) checkerLineBy = 'model';
    else if (dueAsked && !correctsNow(checkerLine) && !checkerLine.wasHeld) heldForStage = dueAsked;
    else {
      // A correction goes before the question; so does a line held back once already, before a due stage question it no longer waits for.
      const before = correctsNow(checkerLine) || (dueAsked !== undefined && checkerLine.wasHeld);
      question = before ? [checkerLine.line, question].filter(Boolean).join(' ') : checkerLine.line;
      if (!before) modelQuestion = '';
      checkerLineBy = 'code';
    }
  }

  checks.record('stage_hold', Boolean(stageAsked), stageAsked ? `owed stage administered by code: ${stageAsked}`
    : stageWaited ? 'data went out this turn — the brainstorm waits a turn' : 'no stage owed this turn', { owed: state.owedStage ?? null, kind });

  // The question plays after the data line: on a turn that delivered data it
  // must not treat it as still to come ("Once you have those figures…",
  // "Before we get into the data:", "…on their way") — whoever wrote it, the
  // model or code's own probe (pending-data.ts). Wording that names data still
  // held this turn is true and stays.
  if (!ended) {
    const exhibitTitle = decisions.exhibit ? [decisions.exhibit.title] : [];
    const pending = settlePendingData(question, {
      deliveredThisTurn: figuresOut,
      heldWhats: [...decisions.defers, ...decisions.gateDefers, ...decisions.offers],
      releasedTexts: [
        ...decisions.releases.flatMap(r => [r.value, caseData.dataLedger.find(i => i.id === r.id)?.label ?? '']),
        ...decisions.restates.map(r => r.value), ...exhibitTitle,
      ],
    });
    if (pending.changes.length > 0) {
      const before = question;
      question = pending.question ?? pickFallbackQuestion({ uses: phraseUses, figuresDelivered: true, seed, last: state.lastQuestion ?? null, lastAnswered, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) });
      // A rewrite keeps the model's words (less the pending-data clause); a replacement is code's.
      modelQuestion = pending.question && modelQuestion ? pending.question : '';
      for (const c of pending.changes) if (c.to === null) withheld.push({ sentence: c.from, reason: 'pending_data', field: 'question' });
      // The probe on record is what was said.
      if (pt.probe === before) pt.probe = question;
      if (pt.followUps?.at(-1) === before) pt.followUps = [...pt.followUps.slice(0, -1), question];
    }
    checks.record('pending_data', pending.changes.length > 0, 'question rewritten: the data was delivered this turn', { changes: pending.changes });
  }

  // Fact guards Phase 5 (batch 20 R17, R07): after two asks of one intent
  // with nothing given, the third moves the case on instead of rewording it.
  const askHistory = (flags.askIntents as { tags: AskIntent[]; given: boolean }[] | undefined) ?? [];
  let askTags = askIntents(question);
  if (!ended && (kind === 'model' || kind === 'rung1') && !figuresOut && askHistory.length >= 2) {
    const [a, b] = askHistory.slice(-2);
    const looping = askTags.filter(t => !a.given && !b.given && a.tags.includes(t) && b.tags.includes(t));
    if (looping.length > 0) {
      withheld.push({ sentence: question, reason: 'loop', field: 'question' });
      question = advanceLine(looping, phraseUses, seed);
      modelQuestion = '';
      askTags = askIntents(question);
    }
  }

  // The probe is asked by the line as delivered: the model's own words, or
  // code's own probe — never a code-written fallback.
  const probeText = ptAction === 'code_asked' ? question : modelQuestion;
  if (pt.state === 'not_asked' && probeIntents(probeText).length > 0 && (early || ptAction === 'code_asked')) {
    Object.assign(pt, { state: 'awaiting', askedAt: nextTurnIndex + 1, probe: question, intents: probeIntents(probeText), awaitingReplies: 0, followUps: [] });
  }
  checks.record('pressure_test', ptAction !== null || pt.state !== ptPrev.state, ptAction ?? `state ${ptPrev.state} → ${pt.state}`,
    { from: ptPrev.state, to: pt.state, action: ptAction, gated: decisions.gatedIds, verdict: await state.probeVerdict });

  checks.record('vetoes', withheld.length > 0, 'sentences of the model\'s own withheld', { withheld });
  if (withheld.length > 0) console.warn('[runner] withheld:', JSON.stringify(withheld));

  // Must-reach items due at a point only Settle sees (round 6 Task 72; turn-data.ts mustReachItems): the exhibit code
  // hands over in the question (a held handover — b36 Larkspur Jasmine bbf78ab8 t10: her brainstorm was held for
  // Exhibit 3), or the model's question as stage-evidence.ts reads it — the recommendation ask. Released at the end of
  // the data line, so ahead of that exhibit and that question; the line streamed already is untouched (the prefix lock).
  if (!ended) {
    const recAskedNow = kind === 'model' && Boolean(question) && stageQuestions(question, {
      move: modelQuestion ? turn.move : undefined, recOnTable: state.stages.recommendationAsked || state.recommendationReceived,
      brainstormAsks: brainstormAsks(caseData), brainstormDue: state.brainstormDue,
    }).recommendation;
    const late = mustReachItems(plan, { exhibit: heldForExhibit?.id ?? null, recommendation: recAskedNow }, decisions);
    if (late.length > 0) {
      const parts = renderDataLineParts({ releases: late, restates: [], exhibit: null, refusals: [], defers: [], gateDefers: [], unmatchedDefers: [], offers: [], requests: [] }, seed, phraseUses);
      // Not first in the line (fix round 2, controller ruling, 21 Oct; b36 Larkspur Jasmine: it followed "On what you
      // asked about earlier: …"): a short lead, so it doesn't read as part of what the candidate asked.
      if (dataParts.length > 0) parts[0] = { ...parts[0], text: `${late[0].mustReach === 'recommendation' ? MUST_REACH_LEAD_REC : MUST_REACH_LEAD_EXHIBIT} ${parts[0].text}` };
      dataParts.push(...parts);
      dataLines = dataParts.map(p => p.text);
      decisions.releases = [...decisions.releases, ...late];
    }
  }
  // Phase 2 S1 (`askDecisionShadow`; design §2): the one data decision, logged beside today's — never spoken. After the
  // late must-reach lines, so what Settle volunteers at a point only it sees is in today's decisions too.
  if (switchOn(state.caseData, 'askDecisionShadow')) {
    try {
      const shadow = await shadowAskDecision({ plan, model: turn.requests, detections: codeWritten ? out.extraRequestRows ?? null : asked?.detected ?? null,
        modelWords: codeWritten ? [] : [turn.say, turn.question], old: decisions });
      checks.record('ask_decision_shadow', shadow.asks.length > 0, 'the one data decision (Phase 2 S1), in shadow: per sub-ask, beside today\'s paths', shadow);
    } catch (e) {
      checks.record('ask_decision_shadow', false, `shadow failed: ${(e as Error).message}`, {});
    }
  }
  // The must-reach items this turn volunteers (round 6 Task 72; Lorenzo, 21 Oct: "The report should note when an item
  // was volunteered"): logged; never volunteered again (flags.mustReach, whether heard or not); the `volunteered`
  // event for each one the candidate got (persist, below) — the judge doesn't credit them for asking it.
  const volunteered = decisions.releases.filter(r => r.mustReach !== undefined);
  if (volunteered.length > 0) {
    checks.act('must_reach', 'a must-reach item the candidate never asked for, released at its point', { items: volunteered.map(r => ({ item: r.id, before: r.mustReach })) });
    flags.mustReach = [...((flags.mustReach as string[] | undefined) ?? []), ...volunteered.map(r => r.id)];
  }

  // Phase 1 4.7 (review F7): a promise the model made on a wrap-up turn can never be followed, so the same turn says
  // "We won't get to <ask> today." for it — hollow by construction otherwise (b38 Larkspur Marcus 316baba1 t24). Not on
  // the close itself, which already says the case is over.
  const wrapPromises = !codeWritten && !ended ? modelDeferrals(plan, decisions, turn.requests, [say, question], { wrapUp: true }) : [];
  if (wrapPromises.length > 0) {
    const whats = wrapPromises.map(x => x.what);
    dataParts.push(...renderDataLineParts({ releases: [], restates: [], exhibit: null, refusals: [], defers: [], gateDefers: [], unmatchedDefers: [], offers: [], requests: [], wontGetToNamed: whats }, seed, phraseUses));
    dataLines = dataParts.map(p => p.text);
    decisions.wontGetTo = [...(decisions.wontGetTo ?? []), ...whats];
    checks.act('model_deferral', 'the model promised to check or come back on a wrap-up turn: said "We won\'t get to … today." in the same breath', { asks: wrapPromises, wrapUp: true });
  }

  const spokenText = [say, ...dataLines, question].map(s => s.trim()).filter(Boolean).join(' ');

  // Still not heard (a pressure-test step or another of code's lines took the
  // question, or a due stage question held it back): the booking is undone and
  // the flag stays pending for a later turn — a held-back one for the next.
  const checkerHeard = checkerLine ? lineHeard(spokenText, checkerLine.line, checkerLine.quote) : null;
  if (checkerLine && !checkerHeard) {
    if (checkerLine.undo.attempt === undefined) delete recomputeAttempts[checkerLine.key];
    else recomputeAttempts[checkerLine.key] = checkerLine.undo.attempt;
    flags.mathChecker = { ...checkerLine.undo.mathChecker, ...(heldForStage && !checkerLine.stepRoot ? { held: checkerLine.id } : {}) };
    // The step check's input question not heard (round 6 Task 72): not asked — it may go on a later turn, within its wait.
    if (checkerLine.stepRoot) flags.stepRootAsked = ((flags.stepRootAsked as string[] | undefined) ?? []).filter(st => st !== checkerLine.stepRoot);
    if (checkerLine.undo.step) {
      const steps = { ...(flags.stepProbes as Record<string, number> | undefined) };
      steps[checkerLine.undo.step] = Math.max(0, (steps[checkerLine.undo.step] ?? 1) - 1);
      flags.stepProbes = steps;
    }
    // …and the input it was counted for (E7): that turn is no probe of it.
    if (checkerLine.undo.input) {
      const { key, turn } = checkerLine.undo.input;
      const inputs = { ...(flags.inputProbes as Record<string, number[]> | undefined) };
      inputs[key] = (inputs[key] ?? []).filter(t => t !== turn);
      flags.inputProbes = inputs;
    }
    for (const e of ctx.events) {
      // …and the flags it corrected word for word (by: its id) — not corrected after all.
      if (e.category === 'math_checker' && e.subtype === 'flag' && ((e.payload as { id?: string }).id === checkerLine.id || (e.payload as { by?: string }).by === checkerLine.id)) {
        e.payload = { ...e.payload, outcome: 'undelivered', reason: heldForStage
          ? `held back: the ${heldForStage} question is due and keeps the question; the line goes out next turn`
          : 'chosen, not said: another line took the question' };
      }
    }
  }
  checks.record('checker_line', checkerLine !== null && (checkerLineBy === 'code' || !checkerHeard),
    !checkerLine ? 'no checker line this turn' : heldForStage ? `a due ${heldForStage} question keeps the question — the line is held back to the next turn`
      : !checkerHeard ? 'checker line not heard — booking undone, the flag stays pending'
      : checkerLineBy === 'code' ? 'the model left the checker line out — code said it' : 'the model said the checker line',
    checkerLine ? { id: checkerLine.id, action: checkerLine.action, line: checkerLine.line, by: checkerLineBy, heard: checkerHeard, ...(heldForStage ? { heldFor: heldForStage } : {}) } : {});

  // Book what was delivered (D3), and the exhibit with the items it displays.
  const undelivered = new Set(out.undeliveredRevealIds ?? []);
  const newReveals: string[] = [];
  for (const r of decisions.releases) {
    if (undelivered.has(r.id)) continue;
    reveal(ledger, r.id);
    newReveals.push(r.id);
  }
  let exhibit: ExhibitDisplay | undefined;
  let exhibitReveals: string[] = [];
  const exhibitId = decisions.exhibit?.id ?? heldForExhibit?.id;
  if (exhibitId) {
    const found = caseData.exhibits.find(e => e.id === exhibitId)!;
    exhibit = { id: found.id, title: found.title, chartType: found.chartType, data: found.data as Record<string, unknown>[], ...(found.notes ? { notes: found.notes } : {}) };
    exhibitReveals = markExhibitReveals(ledger, found);
  }
  // Deferrals that resolve (round 6 Task 76 (a); Lorenzo, 21 Oct, round 6 rulings, 4: "The deferral must resolve through
  // the E5 stop sequence (delivered, or "We won't get to that"), never left hollow"; turn-data.ts resolveDeferrals):
  // code's item-less named deferrals on a tagged case stay open in flags.openDeferrals until delivered or said "We won't
  // get to …" on the first wrap-up turn — each resolved once, logged; whether heard or not, as flags.mustReach.
  if (tracksDeferrals(plan)) {
    // Booked deliveries only (fix round 1, the review's minor): the reveals booked, the lines restated, the exhibit shown.
    // Phase 1 4.7 (turn-data.ts modelDeferrals): the model's own "I'll check what we have" opens a tracked deferral too.
    const modelSaid = codeWritten ? [] : modelDeferrals(plan, decisions, turn.requests, [say, question]);
    if (modelSaid.length > 0) checks.act('model_deferral', 'the model promised to check or come back to an ask this turn doesn\'t answer: tracked until delivered or "We won\'t get to …"', { asks: modelSaid });
    const tracked = resolveDeferrals(openDeferrals(plan), modelSaid.length > 0 ? { ...decisions, deferralsOpened: [...(decisions.deferralsOpened ?? []), ...modelSaid] } : decisions, nextTurnIndex + 1, [...newReveals, ...decisions.restates.map(r => r.id), ...exhibitReveals]);
    for (const r of tracked.resolved) checks.act('deferral_resolved', r.how === 'delivered' ? 'a tracked deferral delivered: nothing more said'
      : r.how === 'wont_get_to' ? 'a tracked deferral said "We won\'t get to …" on the first wrap-up turn' : 'a tracked deferral\'s ask refused since: closed', r);
    if (tracked.open.length > 0 || flags.openDeferrals !== undefined) flags.openDeferrals = tracked.open;
  }
  // Rule 6 option 4: the correction went out in the data line — booked once
  // per item, logged for scoring with what the candidate said.
  const correctedItems = decisions.correction ? decisions.correction.items ?? [decisions.correction.item] : [];
  const misquoteCorrectedSaved = [...state.misquotesCorrected, ...correctedItems];
  if (decisions.correction && state.misquote) {
    for (const m of state.misquote.all) {
      ctx.events.push({ category: 'intervention', subtype: 'misquote_corrected', payload: { item: m.item, cited: m.cited, sentence: m.sentence, correction: decisions.correction.text } });
    }
  }
  checks.record('data_decisions', decisions.requests.length > 0 || decisions.exhibit !== null || decisions.releases.length > 0,
    'data decided by code', {
      releases: decisions.releases.map(r => r.id), exhibit: decisions.exhibit?.id ?? null,
      refusals: decisions.refusals, defers: decisions.defers, offers: decisions.offers,
      ...(decisions.wontGetTo?.length ? { wontGetTo: decisions.wontGetTo } : {}),
      ...(decisions.wontGetToNamed?.length ? { wontGetToNamed: decisions.wontGetToNamed } : {}),
    });

  // Phase and stages (progress.ts).
  const releaseWhenOf = (ids: string[]) => ids
    .map(id => ledger.items.find(i => i.id === id)?.releaseWhen as Phase | undefined)
    .filter((p): p is Phase => p !== undefined);
  // What the question does: code's own stage ask (by kind, or held in place of
  // the model's recommendation ask), else the model's declared move.
  // A question code replaced keeps no "recommendation" label (batch 29 Jordan
  // ea27d1f6 t11: the checker line took the model's recommendation ask, the
  // label stayed, and t13 was read as the reply to a recommendation ask).
  const declaredMove: Move | undefined = (stageAsked ? STAGE_MOVE[`stage_${stageAsked}`] : undefined)
    ?? (codeWritten || kind === 'rec_ask' || (turn.move === 'recommendation' && !modelQuestion) ? undefined : turn.move);
  const nextPhaseValue = derivePhase(currentPhase, {
    move: declaredMove,
    releasedReleaseWhen: releaseWhenOf([...newReveals, ...exhibitReveals]), exhibitShown: exhibit !== undefined,
    recAsk: ASKS_RECOMMENDATION.has(kind), close: ended,
  });
  const turnMove: TurnMove | undefined = ASKS_RECOMMENDATION.has(kind) ? 'code_rec_ask' : declaredMove;
  const moves = { ...state.moves, ...(turnMove ? { [nextTurnIndex + 1]: turnMove } : {}) };
  const lastQuestion = ended || questionFallback ? state.lastQuestion : question;

  // Explain probes the turn asked (recorded so each figure gets at most one).
  const probe = withholdMathChallenges(spokenText, challengeCtx);

  // Audits (log only) on the composed turn.
  const revealedTexts = Object.values(revealedValues(ledger));
  const allowedTexts = [
    caseData.prompt, ...changeFigures(revealedTexts), ...state.turnRows.filter(t => t.role === 'candidate').map(t => t.text),
    candidateText, ...state.derivedValueTexts,
  ];
  const auditResult = auditTurn(spokenText, revealedValues(ledger), allowedTexts.join(' '));
  const timeframeMismatches = checkTimeframes(spokenText, caseData.dataLedger.filter(d => ledger.revealed.has(d.id)));
  checks.record('timeframe', timeframeMismatches.length > 0, 'cross-period arithmetic (log only)', { mismatches: timeframeMismatches });

  const styleResult = auditTurnStyle(spokenText, {
    lengthExempt: newReveals.length > 0 || exhibit !== undefined || stallDecision.rung === 3 || codeWritten,
  });
  checks.record('style', !styleResult.passed || styleResult.flags.length > 0, 'style audit flagged (log only)', { ...styleResult });

  // Rule 13 v4.5: a rung counts only when the sent turn carries it.
  let stallState = stallDecision.state;
  let rungDeliverySpan: string | null = null;
  if (stallDecision.intervene && stallDecision.rung) {
    if (kind === 'rung1') {
      rungDeliverySpan = question;
    } else {
      const delivery = classifyRungDelivery(stallDecision.rung, spokenText, {
        dataReleased: newReveals.length + exhibitReveals.length > 0,
        exhibitShown: exhibit !== undefined,
        replacedByScript: codeWritten,
      });
      rungDeliverySpan = delivery?.span ?? null;
      // Round-3 fix 6: a delivery that rests only on "the turn asked a
      // question" is confirmed by a small model check; it fails open.
      if (delivery?.basis === 'question') {
        const hintCheck = checkHintDelivered({
          rung: stallDecision.rung, candidateText, interviewerText: spokenText,
          onUsage: u => { void logEvent('llm_usage', { ...u }, { sessionId, userId }); },
        });
        const verdict = await (out.timer ? out.timer.time('hint_check', hintCheck) : hintCheck);
        checks.record('hint_check', verdict !== null && !verdict.hint, 'model check: the question was not a hint', { verdict, span: delivery.span });
        if (verdict && !verdict.hint) rungDeliverySpan = null;
      }
    }
    if (rungDeliverySpan === null) stallState = revertUndeliveredRung(stallState, priorStall);
    checks.act('rung_delivery', rungDeliverySpan ? 'rung delivered' : 'rung not delivered — not an assist; ladder not advanced', {
      rung: stallDecision.rung, span: rungDeliverySpan,
    });
  } else {
    checks.skip('rung_delivery', 'no rung decided this turn');
  }

  // The prefix lock.
  const { tail, mismatch } = tailAfterDelivered(spokenText, out.delivered);
  if (out.delivered.length === 0) checks.skip('stream_prefix_mismatch', 'nothing delivered before settle');
  else checks.record('stream_prefix_mismatch', mismatch, 'composed turn differs from delivered speech — undelivered sentences sent', { delivered: out.delivered });

  const requestsClassified = out.requestsClassified ?? true;

  const result: TurnResult = {
    interviewerText: heardText(ctx, spokenText),
    exhibit,
    phase: nextPhaseValue,
    ended,
    auditPassed: auditResult.passed,
    dataRequestsClassified: requestsClassified,
  };

  const persist = async (latency: { firstSegmentMs: number | null; streamed: boolean }, heard: HeardReport | null = null): Promise<TurnResult> => {
    const persistStartMs = Date.now();
    out.timer?.mark('persist_start');
    // Voice (spec 2026-10-08-voice-phase-b §5.3–5.4): book, save and change
    // only what the candidate got. Without a report every value below is the
    // composed one (text mode unchanged).
    const h = applyHeard(heard, { spokenText, question, newReveals, dataParts, exhibitId: exhibit?.id });
    const qHeard = h.questionHeard;
    const bookedReveals = h.bookedReveals;
    for (const v of volunteered) if (bookedReveals.includes(v.id)) ctx.events.push({ category: 'intervention', subtype: 'volunteered', payload: { item: v.id, before: v.mustReach } });
    const exhibitSaved = h.exhibitBooked ? exhibit : undefined;
    const exhibitRevealsSaved = exhibitSaved ? exhibitReveals : [];
    const endedSaved = ended && qHeard;
    const turnMoveSaved = qHeard ? turnMove : undefined;
    const movesSaved = heard ? { ...state.moves, ...(turnMoveSaved ? { [nextTurnIndex + 1]: turnMoveSaved } : {}) } : moves;
    const phaseSaved = heard ? derivePhase(currentPhase, {
      move: qHeard ? declaredMove : undefined,
      releasedReleaseWhen: releaseWhenOf([...bookedReveals, ...exhibitRevealsSaved]), exhibitShown: exhibitSaved !== undefined,
      recAsk: ASKS_RECOMMENDATION.has(kind) && qHeard, close: endedSaved,
    }) : nextPhaseValue;
    const lastQuestionSaved = qHeard ? lastQuestion : state.lastQuestion;
    const ptSaved = qHeard ? pt : unheardQuestionPressureTest(ptPrev, pt);
    let stallSaved = stallState;
    let rungSpanSaved = rungDeliverySpan;
    if (rungSpanSaved && !h.heardContains(rungSpanSaved)) {
      rungSpanSaved = null;
      stallSaved = revertUndeliveredRung(stallState, priorStall);
    }
    const probeSaved = heard ? withholdMathChallenges(h.savedText, challengeCtx) : probe;
    const unbooked = new Set([...h.droppedReveals, ...(exhibitSaved ? [] : exhibitReveals)]);
    const revealedIdsSaved = new Set(Object.keys(revealedValues(ledger)).filter(id => !unbooked.has(id)));
    if (heard) {
      const held = [
        !qHeard && question ? 'question' : null, ended && !endedSaved ? 'close' : null,
        rungDeliverySpan && !rungSpanSaved ? 'rung' : null, exhibit && !exhibitSaved ? 'exhibit' : null,
      ].filter(Boolean);
      checks.record('voice_heard', heard.interrupted || held.length > 0 || h.droppedReveals.length > 0,
        'only what the candidate got is booked and changed', {
          interrupted: heard.interrupted, droppedReveals: h.droppedReveals, held,
          playback: heard.segments.map(x => ({ kind: x.kind, playback: x.playback, heardChars: x.heardChars, exhibitShown: x.exhibitShown })),
        });
    }
    // A session ended elsewhere while this turn ran (End, voice §5.8; v4.10:
    // text too) is not revived and gets nothing of this turn: a stale result is
    // dropped whole. The status is read again here, and the update itself only
    // applies to an active row.
    const live = (await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) }))?.status === 'active';
    if (!live) {
      checks.act('stale_turn', 'the session ended while this turn ran — nothing written');
      console.warn('[runner] stale turn dropped: session no longer active', sessionId);
      return { ...result, interviewerText: '', exhibit: undefined, ended: true, scoringSuppressed: true };
    }
    const savedLine = heardText(ctx, h.savedText, heard);
    const underTimePressure = isUnderTimePressure(elapsedMs, TOTAL_CASE_MS);
    const loadShedLoggedThisTurn = underTimePressure && !flags.loadShedLogged;
    const advancedThisTurn = phaseSaved !== currentPhase && !endedSaved;
    const revealedRowsNew = [...bookedReveals, ...exhibitRevealsSaved].map(itemId => ({ sessionId, ledgerItemId: itemId, revealedAtMs: now }));
    // Items revealed only by an exhibit (flags.exhibitOnly): one said again, or released, has been said and reads as said from here on.
    const exhibitOnlySaved = nextExhibitOnly((flags.exhibitOnly as string[] | undefined) ?? [], exhibitRevealsSaved, [...bookedReveals, ...decisions.restates.map(r => r.id)]);
    // What happened this turn, stage by stage (stage-evidence.ts) — from what
    // the candidate got, never from the move label.
    const stageAskedSaved = qHeard ? stageAsked : undefined;
    const stagesSaved: StageRecord = updateStages(flags.stageEvidence as StageRecord | undefined, {
      turnIndex: nextTurnIndex + 1, candidateText, question: qHeard ? question : '', exhibitShown: exhibitSaved !== undefined,
      released: bookedReveals.length + exhibitRevealsSaved.length > 0, recAsked: ASKS_RECOMMENDATION.has(kind) && qHeard,
      recommendationDelivered: stallSaved.recommendationDelivered, pressureTest: ptSaved, candidateFigures: state.candidateFigures.length,
      codeAsked: stageAskedSaved, ended: endedSaved && state.timeUp ? 'time_up' : null, brainstormAsks: brainstormAsks(caseData), brainstormDue: state.brainstormDue, move: turnMoveSaved,
    });
    const stagesEnforcedSaved = stageAskedSaved ? { ...state.stagesEnforced, [stageAskedSaved]: true } : state.stagesEnforced;
    // The close hold's memory (close-hold.ts; Lorenzo, 16 Oct): the follow-up
    // asked, and the final answers' figures probed — code's hold, or the
    // checker's line heard on a model turn.
    const holdPrev = (flags.closeHold as CloseHoldMemory | undefined) ?? {};
    const holdFrom = state.closeHoldPlan.from;
    // A root's line counts there when a claim riding on it is a final answer (Lorenzo, 19 Oct, round-2 ruling 4): keyed by the root.
    const finalLineHeard = checkerLine !== null && checkerHeard === true && holdFrom !== null && (Number(checkerLine.id.split(':')[0]) >= holdFrom || checkerLine.final === true);
    const probedNow = [...(kind === 'rec_math_probe' && qHeard && state.closeHoldPlan.probeKey ? [state.closeHoldPlan.probeKey] : []), ...(finalLineHeard ? [checkerLine.key] : [])];
    const closeHoldSaved: CloseHoldMemory = {
      ...(holdPrev.waits?.length || (kind === 'close_wait' && qHeard) ? { waits: [...(holdPrev.waits ?? []), ...(kind === 'close_wait' && qHeard ? [nextTurnIndex] : [])] } : {}),
      ...(holdPrev.probeTurns?.length || (kind === 'rec_math_probe' && qHeard) ? { probeTurns: [...(holdPrev.probeTurns ?? []), ...(kind === 'rec_math_probe' && qHeard ? [nextTurnIndex] : [])] } : {}),
      ...(probedNow.length || holdPrev.probed?.length ? { probed: [...(holdPrev.probed ?? []), ...probedNow.filter(k => !holdPrev.probed?.some(p => p.key === k)).map(key => ({ key, at: nextTurnIndex }))] } : {}),
    };
    // The 13 Oct re-correction heard is a correction's second saying (Lorenzo, 19 Oct, round-3 ruling 2; b29 Jordan
    // t20): its key, and every key whose line it said word for word, are restated — no restatement after it.
    const recMath = kind === 'rec_math_probe' ? state.recMathProbe : null;
    const reCorrected = recMath && 'closed' in recMath && recMath.action === 'correct' ? recMath.closed : null;
    // Its line counted once more too (per line: the controller's ruling on Task 19's concern 1).
    const memory = flags.mathChecker as { restated?: string[]; corrected?: Record<string, CorrectedRoot>; said?: Record<string, number> } | undefined;
    const reSaid = reCorrected?.correction && h.heardContains(reCorrected.correction) ? reCorrected.correction : null;
    const restatedNow = reSaid && reCorrected ? restatedBy(reCorrected.key, reSaid, memory?.corrected) : [];
    const mathCheckerSaved = reSaid ? { mathChecker: { ...memory, restated: [...new Set([...(memory?.restated ?? []), ...restatedNow])],
      said: { ...memory?.said, [lineKey(reSaid)]: (memory?.said?.[lineKey(reSaid)] ?? 0) + 1 } } } : {};
    // KF-4 (v4.10): when the gate closes this turn, the unmapped asks it held
    // are put to the interviewer next turn — once; then they lapse (logged).
    const closed = (st: string | undefined) => st === 'satisfied' || st === 'waived';
    const heldUnmapped = !closed(ptPrev.state) && closed(ptSaved.state)
      ? [...new Set(state.dataRequestRows
        .filter(r => r.subtype === 'defer' && ((r.payloadJsonb as { ledgerItemIds?: string[] }).ledgerItemIds ?? []).length === 0
          // Not one the candidate heard "We won't get to … today." for (round-3 ruling 4).
          && (r.payloadJsonb as { wontGetTo?: boolean }).wontGetTo !== true)
        .map(r => (r.payloadJsonb as { what?: string }).what ?? '').filter(Boolean))]
      : [];
    const unmappedToResolveSaved = heldUnmapped.length > 0 ? heldUnmapped : [];
    await Promise.all([
      db.insert(sessionTurns).values([
        { sessionId, turnIndex: nextTurnIndex, role: 'candidate', text: ctx.heardText ?? candidateText, timestampMs: now },
        { sessionId, turnIndex: nextTurnIndex + 1, role: 'interviewer', text: savedLine, timestampMs: Date.now(), latencyMs: modelLatencyMs },
      ]),
      (async () => {
        const rows = toCheckEventRows(checks, { sessionId, turnIndex: nextTurnIndex, phase: currentPhase });
        if (rows.length > 0) await db.insert(sessionEvents).values(rows);
      })(),
      // Events the Plan stage decided (session_resumed, recompute_flag, C4/C2).
      ctx.events.length > 0 ? db.insert(sessionEvents).values(pendingEventRows(ctx, ctx.events)) : Promise.resolve(),
      // Rule 11 rows: the decisions themselves (spec §9), plus the marker.
      requestsClassified
        ? logDataRequestClassification({
          sessionId, phase: currentPhase,
          requests: [...heardRequestRows(decisionRows(decisions), h), ...(out.extraRequestRows ?? [])],
          candidateTurnIndex: nextTurnIndex, interviewerTurnIndex: nextTurnIndex + 1,
          revealedIds: revealedIdsSaved,
        }).then(() => undefined)
        : Promise.resolve(),
      revealedRowsNew.length > 0 ? db.insert(revealedData).values(revealedRowsNew) : Promise.resolve(),
      exhibitSaved ? db.insert(exhibitsShown).values({ sessionId, exhibitId: exhibitSaved.id, shownAtMs: now }) : Promise.resolve(),
      // Rule 13: log the assist event (scoring input — "assisted ≠ covered") —
      // only a delivered rung is an assist; an undelivered decision is logged
      // apart and never reaches the judge (v4.5).
      stallDecision.intervene && stallDecision.rung
        ? logSessionEvent(sessionId, 'intervention', rungSpanSaved ? rungName(stallDecision.rung) : 'rung_not_delivered', nextTurnIndex, currentPhase, {
          level: stallDecision.rung, firedOn: stallDecision.firedOn ?? [], span: rungSpanSaved,
        })
        : Promise.resolve(),
      stallDecision.synthesisUnresolved
        ? logSessionEvent(sessionId, 'intervention', 'synthesis_unresolved', nextTurnIndex, currentPhase, {})
        : Promise.resolve(),
      // Rule 15: record when the interview entered load-shedding, once.
      loadShedLoggedThisTurn
        ? logSessionEvent(sessionId, 'intervention', 'load_shed', nextTurnIndex, currentPhase, { elapsedMs, remainingMs: TOTAL_CASE_MS - elapsedMs })
        : Promise.resolve(),
      kind === 'grace_ask' && qHeard ? logSessionEvent(sessionId, 'intervention', 'grace_ask', nextTurnIndex, currentPhase, { elapsedMs }) : Promise.resolve(),
      db.update(sessions)
        .set({
          phase: phaseSaved,
          status: endedSaved ? 'completed' : 'active',
          completedAt: endedSaved ? new Date() : undefined,
          phaseStartedAt: advancedThisTurn ? new Date() : undefined,
          flagsJsonb: {
            ...flags,
            conduct,
            stall: stallSaved,
            advancedLastTurn: advancedThisTurn,
            timeWarningFired: Boolean(flags.timeWarningFired) || (kind === 'time_warning' && qHeard),
            // The clock at this message: the next turn reads the candidate's pace from it (time warning).
            lastMessageElapsedMs: elapsedMs,
            graceAskFired: Boolean(flags.graceAskFired) || (kind === 'grace_ask' && qHeard),
            recRevisionAsked: Boolean(flags.recRevisionAsked) || (kind === 'rec_revision' && qHeard),
            recMathProbed: Boolean(flags.recMathProbed) || (kind === 'rec_math_probe' && !state.heldCloseHold && !state.closeHoldPlan.hold && qHeard),
            // The close hold for a line a due stage held back: once an interview (Lorenzo, 15 Oct).
            heldCloseHold: Boolean(flags.heldCloseHold) || (kind === 'rec_math_probe' && state.heldCloseHold && qHeard),
            ...(Object.keys(closeHoldSaved).length ? { closeHold: closeHoldSaved } : {}),
            ...mathCheckerSaved,
            exhibitOnly: exhibitOnlySaved,
            recomputeAttempts,
            // The connecting words heard this turn (phrasing.ts): no variant again within its pool's last 3.
            phraseUses: recordPhraseUses(savedLine, phraseUses, dataLineVariantsOn() ? dataLinePools() : undefined, { ack: switchOn(state.caseData, 'ackRotation') }),
            lastVerified: verifiedNow,
            flaggedFigures: state.flaggedFigures,
            explainProbed: [...explainProbedBefore, ...probeSaved.explainProbed],
            loadShedLogged: Boolean(flags.loadShedLogged) || loadShedLoggedThisTurn,
            moves: movesSaved,
            lastQuestion: lastQuestionSaved,
            askIntents: qHeard ? [...askHistory, { tags: askTags, given: figuresOut }].slice(-2) : askHistory,
            pressureTest: ptSaved,
            stageEvidence: stagesSaved,
            stagesEnforced: stagesEnforcedSaved,
            unmappedToResolve: unmappedToResolveSaved,
            misquoteCorrected: misquoteCorrectedSaved,
            // Misquoted figures still standing: closed when code corrects the item.
            factEchoes: state.factEchoes.filter(e => !e.items.some(i => correctedItems.includes(i))).slice(-12),
          },
        })
        .where(and(eq(sessions.id, sessionId), eq(sessions.status, 'active'))),
    ]);

    // PRD §13: token usage and product analytics, after the response.
    if (turnUsage.apiCalls > 0) later(() => logEvent('llm_usage', { component: 'interviewer', ...turnUsage }, { sessionId, userId }));
    for (const itemId of bookedReveals) later(() => logEvent('data_revealed', { itemId, phase: currentPhase }, { sessionId, userId }));
    for (const itemId of exhibitRevealsSaved) later(() => logEvent('data_revealed', { itemId, phase: currentPhase, via: 'exhibit' }, { sessionId, userId }));
    if (exhibitSaved) {
      const exhibitId = exhibitSaved.id;
      later(() => logEvent('exhibit_shown', { exhibitId, phase: currentPhase }, { sessionId, userId }));
    }
    if (advancedThisTurn) later(() => logEvent('phase_transition', { from: currentPhase, to: phaseSaved }, { sessionId, userId }));
    if (endedSaved) later(() => logEvent('case_complete', { phase: currentPhase, elapsedMs }, { sessionId, userId }));

    // PRD §13: per-turn latency. latencyMs stays the model call (comparable with
    // earlier batches); the rest splits the turn around it.
    const turnEndMs = Date.now();
    out.timer?.mark('persist_end');
    const steps = out.timer?.marks;
    if (out.timer) console.log('[timing]', out.timer.ordered().map(([k, v]) => `${k}=${v}`).join(' '));
    later(() => logEvent('turn_latency', {
      turnIndex: nextTurnIndex + 1, latencyMs: modelLatencyMs, distressWaitMs, apiCalls: turnUsage.apiCalls,
      totalMs: turnEndMs - turnStartMs, preModelMs: modelCallStart - turnStartMs,
      postModelMs: persistStartMs - modelCallStart - modelLatencyMs, persistMs: turnEndMs - persistStartMs,
      phase: currentPhase, kind, firstSegmentMs: latency.firstSegmentMs, streamed: latency.streamed, steps,
    }, { sessionId, userId }));
    return heard ? { ...result, interviewerText: savedLine, exhibit: exhibitSaved, phase: phaseSaved, ended: endedSaved } : result;
  };

  return {
    result,
    spokenText, tail, prefixMismatch: mismatch, newReveals, exhibitId: exhibit?.id, persist,
  };
}
