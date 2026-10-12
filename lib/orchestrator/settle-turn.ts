// The Settle stage (specs 2026-10-05-streaming-turn §4.4, 2026-10-06
// plan-owns-decisions §8). The turn is composed, never repaired: the model's
// "say" and "question" with any vetoed sentence withheld (vetoReason — the
// same rules Stream applied), code's data line between them, then the prefix
// lock (only what follows the already-delivered speech goes out) and one
// commit. Code-written turns (close, grace ask, time warning, rung 1) arrive
// here as a turn whose words are code's own and are not vetoed.
import type { TurnTimer } from './turn-timer';
import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, exhibitsShown, sessionEvents } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { logDataRequestClassification } from './data-request-log';
import type { DetectedDataRequest } from './data-requests';
import { reveal, revealedValues, markExhibitReveals } from './data-ledger';
import { auditTurn, auditTurnStyle } from './audit';
import { changeFigures } from './numeric-provenance';
import { withholdMathChallenges, challengeVerdict } from './probe-guard';
import { classifyMathTalk } from './math-talk';
import { checkTimeframes } from './timeframe-check';
import { checkHintDelivered } from './hint-check';

import { probeIntents, pickFallbackQuestion, reaskProbe, narrowProbe, refersToFigures, CODE_PROBES, CODE_STRUCTURE_ASKS, EARLY_PHASES, WAIVER_LEAD, type PressureTestState } from './pressure-test';
import { requestSentences } from './request-signal';
import { isUnderTimePressure } from './pacing';
import { rungName, classifyRungDelivery, revertUndeliveredRung } from './stall';
import { logEvent } from '@/lib/analytics';
import { TOTAL_CASE_MS, type Phase } from './state-machine';
import { toCheckEventRows } from './check-log';
import { pickScript, STAGE_EXHIBIT_QUESTIONS } from '@/lib/agent/prompts/scripts';
import { BLOCKED_CLOSE_PROBES, asksRecommendationAsk } from './spoken-close';
import { updateStages, type StageKey, type StageRecord } from './stage-evidence';
import { renderDataLineParts, decisionRows } from './data-decisions';
import { applyHeard, heardRequestRows, unheardQuestionPressureTest } from './heard';
import { derivePhase, type TurnMove } from './progress';
import { turnData, pressureTestOutcomeNow } from './turn-data';
import { isGradingSentence, gradingRemainder } from './grading';
import { settlePendingData } from './pending-data';
import { vetoReason, gateContext, isHandoverAnnouncement, isDeliveryClaim } from './stream-turn';
import type { ModelTurn, Move } from '@/lib/agent/models/turn-schema';
import type { TurnValidation } from '@/lib/agent/models/interface';
import type { ModelPlan } from './plan-turn';
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
// the turn. Saved and returned as one interviewer line; never re-sent.
export function heardText(ctx: { acknowledged?: string }, text: string): string {
  return ctx.acknowledged ? [ctx.acknowledged, text].map(s => s.trim()).filter(Boolean).join(' ') : text;
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
  const saved = heardText(ctx, spoken);
  await db.insert(sessionTurns).values([
    { sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex, role: 'candidate', text: ctx.candidateText, timestampMs: ctx.now },
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

const CODE_WRITTEN = new Set(['close', 'grace_ask', 'time_warning', 'rung1', 'stage_exhibit', 'stage_brainstorm']);
// Code's own stage asks, recorded as moves it is sure of.
const STAGE_MOVE: Partial<Record<string, Move>> = { stage_exhibit: 'exhibit', stage_brainstorm: 'brainstorm' };

// A figure the candidate gave as a result in this message ("= 53.8", "is
// about 1.6%", "so 38%") — not an input or an index base ("index this to 100").
function statedAsResult(candidateText: string, figure: number): boolean {
  const n = String(figure).replace('.', '\\.');
  return new RegExp(`(?:=|≈|\\bis|\\bare|\\bgives|\\babout|\\broughly|\\bthat'?s|\\bso|\\bcomes to)\\s+(?:about\\s+|roughly\\s+|around\\s+|~)?\\$?${n}(?![\\d])`, 'i').test(candidateText);
}

// The figure as the candidate wrote it ("1.6%", "43.3 points"), for a neutral
// request for the working.
function figureAsWritten(candidateText: string, figure: number): string {
  const n = String(figure).replace('.', '\\.');
  const m = new RegExp(`(?<![\\d.])${n}(?:\\s?%|\\s+(?:percentage\\s+)?points?|\\s+percent)?`, 'i').exec(candidateText);
  return m ? m[0] : String(figure);
}
const ASKS_RECOMMENDATION = new Set(['rec_ask', 'grace_ask', 'time_warning']);

export async function settleTurn(plan: ModelPlan, out: ModelOutcome): Promise<Settled> {
  const { ctx, state } = plan;
  const { sessionId, userId, candidateText, now, nextTurnIndex, currentPhase, flags, conduct, checks, later, turnStartMs } = ctx;
  const { caseData, ledger, elapsedMs, recomputeFlags, recomputeAttempts, verifiedNow, verifiedPrev, explainProbedBefore,
    candidateFigures, priorStall, stallDecision, kind } = state;
  const { turn, modelCallStart, modelLatencyMs, distressWaitMs, turnUsage } = out;
  const seed = `${sessionId}:${nextTurnIndex}`;
  const codeWritten = CODE_WRITTEN.has(kind);
  const ended = kind === 'close';

  // Data: the same decisions Stream delivered from (the pressure test's
  // verdict for this turn first — the gate depends on it).
  const { satisfied: satisfiedNow, waiving } = await (out.timer ? out.timer.time('pt_judge_settle', pressureTestOutcomeNow(plan)) : pressureTestOutcomeNow(plan));
  const decisions = turnData(plan, turn);
  const dataParts = renderDataLineParts(decisions, seed);
  const dataLines = dataParts.map(p => p.text);
  const g = gateContext(plan, decisions.releases.map(r => r.value));

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
  const say = codeWritten ? turn.say : keep(turn.say, 'say');
  let question = codeWritten ? turn.question : keep(turn.question, 'question');
  if (kind === 'rec_ask') question = pickScript([...BLOCKED_CLOSE_PROBES.recommendation], seed);
  // A math challenge withheld from the question takes its setup with it
  // ("One thing to check: you said 16 divided by 18 is 1.6%." — batch 18 v3,
  // Maya t24, left without its question): what remains must still be a
  // question, else a neutral one replaces it — a request for the working on
  // the figure when that is still allowed, otherwise a plain next question.
  const challengeCtx = {
    verified: [...verifiedNow, ...verifiedPrev], alreadyProbed: explainProbedBefore, flaggedThisTurn: recomputeFlags.length > 0,
    flagged: state.flaggedFigures, candidateFigures,
  };
  const mathWithheld = withheld.filter(w => w.field === 'question' && (w.reason === 'probe_guard' || w.reason === 'unsupported_challenge'));
  let challengeReplacement: string | null = null;
  if (!codeWritten && kind !== 'rec_ask' && mathWithheld.length > 0) {
    const figs = [...candidateFigures, ...challengeCtx.verified.map(v => v.value)];
    const rest = sentencesOf(question).filter(x => x.endsWith('?') || !(/:\s*$/.test(x) || classifyMathTalk(x, figs).figures.length > 0));
    // What stays must still ask something that isn't about the challenged math.
    if (rest.some(x => x.endsWith('?') && classifyMathTalk(x, figs).kind === 'none')) {
      question = rest.join(' ');
    } else {
      const about = mathWithheld.map(w => challengeVerdict(w.sentence, challengeCtx)).find(v => v && !('explainKey' in v) && v.figure !== undefined
        && statedAsResult(candidateText, v.figure)) as { figure?: number } | undefined;
      const figureText = about?.figure !== undefined ? figureAsWritten(candidateText, about.figure) : null;
      const explain = figureText ? `How did you get to ${figureText}?` : null;
      const verdict = explain ? challengeVerdict(explain, challengeCtx) : null;
      const allowed = explain !== null && (verdict === null || 'explainKey' in verdict);
      question = allowed && explain ? explain : pickFallbackQuestion({ figuresDelivered: decisions.releases.length > 0 || decisions.exhibit !== null, seed, last: state.lastQuestion ?? null, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) });
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
  const questionFallback = !codeWritten && kind !== 'rec_ask' && !question;
  if (questionFallback) question = 'Go on.';

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
      question = kept.some(x => x.endsWith('?')) ? kept.join(' ') : pickFallbackQuestion({ figuresDelivered: false, seed, last: state.lastQuestion ?? null, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) });
    }
  }
  const heldThisTurn = decisions.gatedIds.length > 0 || decisions.defers.length > 0 || decisions.gateDefers.length > 0;
  if (!codeWritten && kind !== 'rec_ask' && !figuresOut && refersToFigures(question)
    && (heldThisTurn || Object.keys(revealedValues(ledger)).length === 0)) {
    withheld.push({ sentence: question, reason: 'undelivered_figures', field: 'question' });
    question = pickFallbackQuestion({ figuresDelivered: false, seed, last: state.lastQuestion ?? null, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) });
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
  const waiverQuestion = (lead: string) => `${lead} ${pickFallbackQuestion({ figuresDelivered: figuresOut, seed, last: state.lastQuestion ?? null, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) })}`;
  // Every reply while the probe is open counts, code-written turns included
  // (stall rung 1, the recommendation ask, the time warning); only a model
  // turn can carry a ladder step or the waiver (pressureTestOutcomeNow).
  if (ptPrev.state === 'awaiting' && !satisfiedNow && kind !== 'close') {
    pt.awaitingReplies = (ptPrev.awaitingReplies ?? 0) + 1;
  }
  if (!codeWritten && kind !== 'rec_ask') {
    if (ptPrev.state === 'awaiting' && !satisfiedNow) {
      if (waiving) {
        question = waiverQuestion(WAIVER_LEAD.awaiting);
        ptAction = 'waived';
      } else if (pt.awaitingReplies === 1) {
        question = reaskProbe(ptPrev.intents, decisions.gatedIds.length > 0);
        pt.reasks += 1;
        pt.followUps = [...(ptPrev.followUps ?? []), question];
        ptAction = 'reask';
      } else {
        question = narrowProbe(ptPrev.intents);
        pt.followUps = [...(ptPrev.followUps ?? []), question];
        ptAction = 'narrowed';
      }
    } else if (ptPrev.state !== 'not_asked' && isProbe(question) && (satisfiedNow || ptPrev.state === 'waived')) {
      question = pickFallbackQuestion({ figuresDelivered: figuresOut, seed, last: state.lastQuestion ?? null, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) });
      ptAction = 'replaced_duplicate';
    } else if (ptPrev.state === 'not_asked') {
      pt.gatedTurns = decisions.gatedIds.length > 0 ? ptPrev.gatedTurns + 1 : 0;
      if (waiving) {
        question = waiverQuestion(WAIVER_LEAD.not_asked);
        ptAction = 'waived';
      } else if (!isProbe(question) && pt.gatedTurns >= 2) {
        // The probe tests a structure; with none on the table, ask for it first (once).
        // No verdict (timeout, error) is not "no structure": code asks nothing this
        // turn, spends no fallback, and the check runs again next turn.
        const verdict = pt.structureGiven ? null : await (out.timer ? out.timer.time('structure_judge', state.structureVerdict) : state.structureVerdict);
        pt.structureGiven = pt.structureGiven || Boolean(verdict?.given);
        if (!pt.structureGiven && verdict === null) {
          ptAction = 'structure_unknown';
        } else if (pt.structureGiven && !pt.codeAsked) {
          question = pickScript([...CODE_PROBES], seed);
          pt.codeAsked = true;
          ptAction = 'code_asked';
        } else if (!pt.structureGiven && !pt.structureAsked) {
          question = pickScript([...CODE_STRUCTURE_ASKS], seed);
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
  } else if (pt.state === 'not_asked' && probeIntents(question).length > 0 && (early || ptAction === 'code_asked')) {
    Object.assign(pt, { state: 'awaiting', askedAt: nextTurnIndex + 1, probe: question, intents: probeIntents(question), awaitingReplies: 0, followUps: [] });
  } else if (pt.state === 'awaiting' && satisfiedNow) {
    Object.assign(pt, { state: 'satisfied', satisfiedAt: nextTurnIndex });
  }
  checks.record('pressure_test', ptAction !== null || pt.state !== ptPrev.state, ptAction ?? `state ${ptPrev.state} → ${pt.state}`,
    { from: ptPrev.state, to: pt.state, action: ptAction, gated: decisions.gatedIds, verdict: await state.probeVerdict });
  if (state.requestCues.length > 0) {
    ctx.events.push({ category: 'request_signal', subtype: 'explicit_ask', payload: { cues: state.requestCues, sentences: requestSentences(candidateText), resolvedIds: [] } });
  }
  // Rule 9 v4.10: the model's own recommendation ask waits while the exhibit
  // or the brainstorm is still owed (as code's own ask already does) — code
  // administers the stage instead, once. Not under time pressure.
  let stageAsked: StageKey | undefined = kind === 'stage_exhibit' ? 'exhibit' : kind === 'stage_brainstorm' ? 'brainstorm' : undefined;
  let heldForExhibit: (typeof caseData.exhibits)[number] | undefined;
  if (!codeWritten && kind === 'model' && state.owedStage && state.ptClosed && !isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) && asksRecommendationAsk(question)) {
    const asked = question;
    if (state.owedStage === 'brainstorm') {
      question = pickScript([...BLOCKED_CLOSE_PROBES.brainstorm], seed);
      stageAsked = 'brainstorm';
    } else if (!decisions.exhibit) {
      heldForExhibit = caseData.exhibits.find(e => !state.shownExhibitIds.has(e.id));
      if (heldForExhibit) {
        question = `Here's an exhibit: ${heldForExhibit.title}. ${pickScript(STAGE_EXHIBIT_QUESTIONS, seed)}`;
        stageAsked = 'exhibit';
      }
    }
    if (stageAsked) withheld.push({ sentence: asked, reason: 'recommendation_held_for_stage', field: 'question' });
  }
  checks.record('stage_hold', Boolean(stageAsked), stageAsked ? `owed stage administered by code: ${stageAsked}` : 'no stage owed this turn', { owed: state.owedStage ?? null, kind });

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
      question = pending.question ?? pickFallbackQuestion({ figuresDelivered: true, seed, last: state.lastQuestion ?? null, phase: currentPhase, timePressure: isUnderTimePressure(elapsedMs, TOTAL_CASE_MS) });
      for (const c of pending.changes) if (c.to === null) withheld.push({ sentence: c.from, reason: 'pending_data', field: 'question' });
      // The probe on record is what was said.
      if (pt.probe === before) pt.probe = question;
      if (pt.followUps?.at(-1) === before) pt.followUps = [...pt.followUps.slice(0, -1), question];
    }
    checks.record('pending_data', pending.changes.length > 0, 'question rewritten: the data was delivered this turn', { changes: pending.changes });
  }

  checks.record('vetoes', withheld.length > 0, 'sentences of the model\'s own withheld', { withheld });
  if (withheld.length > 0) console.warn('[runner] withheld:', JSON.stringify(withheld));

  const spokenText = [say, ...dataLines, question].map(s => s.trim()).filter(Boolean).join(' ');

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
    exhibit = { id: found.id, title: found.title, chartType: found.chartType, data: found.data as Record<string, unknown>[] };
    exhibitReveals = markExhibitReveals(ledger, found);
  }
  // Rule 6 option 4: the correction went out in the data line — booked once
  // per item, logged for scoring with what the candidate said.
  const misquoteCorrectedSaved = decisions.correction && state.misquote
    ? [...state.misquotesCorrected, decisions.correction.item]
    : [...state.misquotesCorrected];
  if (decisions.correction && state.misquote) {
    ctx.events.push({ category: 'intervention', subtype: 'misquote_corrected', payload: { item: state.misquote.item, cited: state.misquote.cited, sentence: state.misquote.sentence, correction: decisions.correction.text } });
  }
  checks.record('data_decisions', decisions.requests.length > 0 || decisions.exhibit !== null || decisions.releases.length > 0,
    'data decided by code', {
      releases: decisions.releases.map(r => r.id), exhibit: decisions.exhibit?.id ?? null,
      refusals: decisions.refusals, defers: decisions.defers, offers: decisions.offers,
    });

  // Phase and stages (progress.ts).
  const releaseWhenOf = (ids: string[]) => ids
    .map(id => ledger.items.find(i => i.id === id)?.releaseWhen as Phase | undefined)
    .filter((p): p is Phase => p !== undefined);
  // What the question does: code's own stage ask (by kind, or held in place of
  // the model's recommendation ask), else the model's declared move.
  const declaredMove: Move | undefined = (stageAsked ? STAGE_MOVE[`stage_${stageAsked}`] : undefined)
    ?? (codeWritten || kind === 'rec_ask' ? undefined : turn.move);
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
    const savedLine = heardText(ctx, h.savedText);
    const underTimePressure = isUnderTimePressure(elapsedMs, TOTAL_CASE_MS);
    const loadShedLoggedThisTurn = underTimePressure && !flags.loadShedLogged;
    const advancedThisTurn = phaseSaved !== currentPhase && !endedSaved;
    const revealedRowsNew = [...bookedReveals, ...exhibitRevealsSaved].map(itemId => ({ sessionId, ledgerItemId: itemId, revealedAtMs: now }));
    // What happened this turn, stage by stage (stage-evidence.ts) — from what
    // the candidate got, never from the move label.
    const stageAskedSaved = qHeard ? stageAsked : undefined;
    const stagesSaved: StageRecord = updateStages(flags.stageEvidence as StageRecord | undefined, {
      turnIndex: nextTurnIndex + 1, candidateText, question: qHeard ? question : '', exhibitShown: exhibitSaved !== undefined,
      released: bookedReveals.length + exhibitRevealsSaved.length > 0, recAsked: ASKS_RECOMMENDATION.has(kind) && qHeard,
      recommendationDelivered: stallSaved.recommendationDelivered, pressureTest: ptSaved, candidateFigures: state.candidateFigures.length,
      codeAsked: stageAskedSaved, ended: endedSaved && state.timeUp ? 'time_up' : null,
    });
    const stagesEnforcedSaved = stageAskedSaved ? { ...state.stagesEnforced, [stageAskedSaved]: true } : state.stagesEnforced;
    // KF-4 (v4.10): when the gate closes this turn, the unmapped asks it held
    // are put to the interviewer next turn — once; then they lapse (logged).
    const closed = (st: string | undefined) => st === 'satisfied' || st === 'waived';
    const heldUnmapped = !closed(ptPrev.state) && closed(ptSaved.state)
      ? [...new Set(state.dataRequestRows
        .filter(r => r.subtype === 'defer' && ((r.payloadJsonb as { ledgerItemIds?: string[] }).ledgerItemIds ?? []).length === 0)
        .map(r => (r.payloadJsonb as { what?: string }).what ?? '').filter(Boolean))]
      : [];
    const unmappedToResolveSaved = heldUnmapped.length > 0 ? heldUnmapped : [];
    await Promise.all([
      db.insert(sessionTurns).values([
        { sessionId, turnIndex: nextTurnIndex, role: 'candidate', text: candidateText, timestampMs: now },
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
            graceAskFired: Boolean(flags.graceAskFired) || (kind === 'grace_ask' && qHeard),
            recomputeAttempts,
            lastVerified: verifiedNow,
            flaggedFigures: state.flaggedFigures,
            explainProbed: [...explainProbedBefore, ...probeSaved.explainProbed],
            loadShedLogged: Boolean(flags.loadShedLogged) || loadShedLoggedThisTurn,
            moves: movesSaved,
            lastQuestion: lastQuestionSaved,
            pressureTest: ptSaved,
            stageEvidence: stagesSaved,
            stagesEnforced: stagesEnforcedSaved,
            unmappedToResolve: unmappedToResolveSaved,
            misquoteCorrected: misquoteCorrectedSaved,
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
