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
import { eq } from 'drizzle-orm';
import { logDataRequestClassification } from './data-request-log';
import { reveal, revealedValues, markExhibitReveals } from './data-ledger';
import { auditTurn, auditTurnStyle } from './audit';
import { changeFigures } from './numeric-provenance';
import { withholdProbesOnVerified } from './probe-guard';
import { checkTimeframes } from './timeframe-check';
import { checkHintDelivered } from './hint-check';

import { probeIntents, pickFallbackQuestion, reaskProbe, CODE_PROBES, EARLY_PHASES, type PressureTestState } from './pressure-test';
import { requestSentences } from './request-signal';
import { isUnderTimePressure } from './pacing';
import { rungName, classifyRungDelivery, revertUndeliveredRung } from './stall';
import { logEvent } from '@/lib/analytics';
import { TOTAL_CASE_MS, type Phase } from './state-machine';
import { toCheckEventRows } from './check-log';
import { pickScript } from '@/lib/agent/prompts/scripts';
import { BLOCKED_CLOSE_PROBES } from './spoken-close';
import { renderDataLines, decisionRows } from './data-decisions';
import { derivePhase, type TurnMove } from './progress';
import { turnData, pressureTestSatisfiedNow } from './turn-data';
import { vetoReason, gateContext, isHandoverAnnouncement } from './stream-turn';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { TurnValidation } from '@/lib/agent/models/interface';
import type { ModelPlan } from './plan-turn';
import type { ExhibitDisplay, PendingEvent, ScriptedPlan, TurnCtx, TurnResult } from './turn-types';

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
export async function commitScripted(plan: ScriptedPlan): Promise<TurnResult> {
  if (plan.noPersist) return plan.result;
  const { ctx } = plan;
  await db.insert(sessionTurns).values([
    { sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex, role: 'candidate', text: ctx.candidateText, timestampMs: ctx.now },
    { sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex + 1, role: 'interviewer', text: heardText(ctx, plan.interviewerText), timestampMs: Date.now() },
  ]);
  const checkRows = toCheckEventRows(ctx.checks, { sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex, phase: ctx.currentPhase });
  if (checkRows.length > 0) await db.insert(sessionEvents).values(checkRows);
  if (ctx.events.length > 0) await db.insert(sessionEvents).values(pendingEventRows(ctx, ctx.events));
  if (Object.keys(plan.sessionUpdate).length > 0) {
    await db.update(sessions).set(plan.sessionUpdate).where(eq(sessions.id, ctx.sessionId));
  }
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

export type TurnUsage = { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; apiCalls: number };

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
  timer?: TurnTimer;                // per-step timing (turn-timer.ts)
};

export type Settled = {
  result: TurnResult;
  spokenText: string;      // the composed turn
  tail: string;            // the part not yet delivered
  prefixMismatch: boolean;
  newReveals: string[];
  exhibitId?: string;
  persist: (latency: { firstSegmentMs: number | null; streamed: boolean }) => Promise<void>;
};

const CODE_WRITTEN = new Set(['close', 'grace_ask', 'time_warning', 'rung1']);
const ASKS_RECOMMENDATION = new Set(['rec_ask', 'grace_ask', 'time_warning']);

export async function settleTurn(plan: ModelPlan, out: ModelOutcome): Promise<Settled> {
  const { ctx, state } = plan;
  const { sessionId, userId, candidateText, now, nextTurnIndex, currentPhase, flags, conduct, checks, later, turnStartMs } = ctx;
  const { caseData, ledger, elapsedMs, recomputeFlags, recomputeAttempts, verifiedNow, verifiedPrev, explainProbedBefore,
    unitCheckHint, priorStall, stallDecision, kind } = state;
  const { turn, modelCallStart, modelLatencyMs, distressWaitMs, turnUsage } = out;
  const seed = `${sessionId}:${nextTurnIndex}`;
  const codeWritten = CODE_WRITTEN.has(kind);
  const ended = kind === 'close';

  // Data: the same decisions Stream delivered from (the pressure test's
  // verdict for this turn first — the gate depends on it).
  const satisfiedNow = await pressureTestSatisfiedNow(plan);
  const decisions = turnData(plan, turn);
  const dataLines = renderDataLines(decisions, seed);
  const g = gateContext(plan, decisions.releases.map(r => r.value));

  // The model's words, vetoed sentence by sentence (never rewritten).
  const withheld: { sentence: string; reason: string; field: 'say' | 'question' }[] = [];
  const keep = (text: string, field: 'say' | 'question') => {
    let kept = sentencesOf(text).filter(s => {
      const reason = vetoReason(s, g, { inQuestion: field === 'question' });
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
  const questionFallback = !codeWritten && kind !== 'rec_ask' && !question;
  if (questionFallback) question = 'Go on.';

  // Pressure test (spec 2026-10-07-pressure-test-and-request-guards): code
  // owns the state and the bounded fallbacks — a duplicate probe is replaced
  // (one re-ask while awaiting, then plain questions), and a test the model
  // never asks while requested data is held is asked by code, once.
  const ptPrev = state.pressureTest;
  const pt: PressureTestState = { ...ptPrev };
  let ptAction: string | null = null;
  const early = EARLY_PHASES.includes(currentPhase);
  const isProbe = (q: string) => probeIntents(q).length > 0 && (early || turn.move === 'pressure_test');
  if (!codeWritten && kind !== 'rec_ask') {
    if (ptPrev.state !== 'not_asked' && isProbe(question) && satisfiedNow) {
      question = pickFallbackQuestion({ figuresDelivered: decisions.releases.length > 0, seed, last: state.lastQuestion ?? null });
      ptAction = 'replaced_duplicate';
    } else if (ptPrev.state === 'awaiting' && isProbe(question)) {
      if (pt.reasks < 1) { question = reaskProbe(ptPrev.intents); pt.reasks += 1; ptAction = 'reask'; }
      else { question = pickFallbackQuestion({ figuresDelivered: decisions.releases.length > 0, seed, last: state.lastQuestion ?? null }); ptAction = 'replaced_duplicate'; }
    } else if (ptPrev.state === 'not_asked') {
      pt.gatedTurns = decisions.gatedIds.length > 0 ? ptPrev.gatedTurns + 1 : 0;
      if (!isProbe(question) && pt.gatedTurns >= 2 && !pt.codeAsked) {
        question = pickScript([...CODE_PROBES], seed);
        pt.codeAsked = true;
        ptAction = 'code_asked';
      }
    }
  }
  if (pt.state === 'not_asked' && probeIntents(question).length > 0 && (early || ptAction === 'code_asked')) {
    Object.assign(pt, { state: 'awaiting', askedAt: nextTurnIndex + 1, probe: question, intents: probeIntents(question) });
  } else if (pt.state === 'awaiting' && satisfiedNow) {
    Object.assign(pt, { state: 'satisfied', satisfiedAt: nextTurnIndex });
  }
  checks.record('pressure_test', ptAction !== null || pt.state !== ptPrev.state, ptAction ?? `state ${ptPrev.state} → ${pt.state}`,
    { from: ptPrev.state, to: pt.state, action: ptAction, gated: decisions.gatedIds, verdict: await state.probeVerdict });
  if (state.requestCues.length > 0) {
    ctx.events.push({ category: 'request_signal', subtype: 'explicit_ask', payload: { cues: state.requestCues, sentences: requestSentences(candidateText), resolvedIds: [] } });
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
  if (decisions.exhibit) {
    const found = caseData.exhibits.find(e => e.id === decisions.exhibit!.id)!;
    exhibit = { id: found.id, title: found.title, chartType: found.chartType, data: found.data as Record<string, unknown>[] };
    exhibitReveals = markExhibitReveals(ledger, found);
  }
  checks.record('data_decisions', decisions.requests.length > 0 || decisions.exhibit !== null || decisions.releases.length > 0,
    'data decided by code', {
      releases: decisions.releases.map(r => r.id), exhibit: decisions.exhibit?.id ?? null,
      refusals: decisions.refusals, defers: decisions.defers, offers: decisions.offers,
    });

  // Phase and stages (progress.ts).
  const releasedReleaseWhen = [...newReveals, ...exhibitReveals]
    .map(id => ledger.items.find(i => i.id === id)?.releaseWhen as Phase | undefined)
    .filter((p): p is Phase => p !== undefined);
  const nextPhaseValue = derivePhase(currentPhase, {
    move: codeWritten || kind === 'rec_ask' ? undefined : turn.move,
    releasedReleaseWhen, exhibitShown: exhibit !== undefined,
    recAsk: ASKS_RECOMMENDATION.has(kind), close: ended,
  });
  const turnMove: TurnMove | undefined = ASKS_RECOMMENDATION.has(kind) ? 'code_rec_ask' : codeWritten ? undefined : turn.move;
  const moves = { ...state.moves, ...(turnMove ? { [nextTurnIndex + 1]: turnMove } : {}) };
  const lastQuestion = ended || questionFallback ? state.lastQuestion : question;

  // Explain probes the turn asked (recorded so each figure gets at most one).
  const probe = withholdProbesOnVerified(spokenText, {
    verified: [...verifiedNow, ...verifiedPrev], alreadyProbed: explainProbedBefore,
    flaggedThisTurn: recomputeFlags.length > 0 || unitCheckHint !== undefined,
  });

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

  const persist = async (latency: { firstSegmentMs: number | null; streamed: boolean }) => {
    const persistStartMs = Date.now();
    out.timer?.mark('persist_start');
    const underTimePressure = isUnderTimePressure(elapsedMs, TOTAL_CASE_MS);
    const loadShedLoggedThisTurn = underTimePressure && !flags.loadShedLogged;
    const advancedThisTurn = nextPhaseValue !== currentPhase && !ended;
    const revealedRowsNew = [...newReveals, ...exhibitReveals].map(itemId => ({ sessionId, ledgerItemId: itemId, revealedAtMs: now }));
    await Promise.all([
      db.insert(sessionTurns).values([
        { sessionId, turnIndex: nextTurnIndex, role: 'candidate', text: candidateText, timestampMs: now },
        { sessionId, turnIndex: nextTurnIndex + 1, role: 'interviewer', text: heardText(ctx, spokenText), timestampMs: Date.now(), latencyMs: modelLatencyMs },
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
          requests: decisionRows(decisions),
          candidateTurnIndex: nextTurnIndex, interviewerTurnIndex: nextTurnIndex + 1,
          revealedIds: new Set(Object.keys(revealedValues(ledger))),
        }).then(() => undefined)
        : Promise.resolve(),
      revealedRowsNew.length > 0 ? db.insert(revealedData).values(revealedRowsNew) : Promise.resolve(),
      exhibit ? db.insert(exhibitsShown).values({ sessionId, exhibitId: exhibit.id, shownAtMs: now }) : Promise.resolve(),
      // Rule 13: log the assist event (scoring input — "assisted ≠ covered") —
      // only a delivered rung is an assist; an undelivered decision is logged
      // apart and never reaches the judge (v4.5).
      stallDecision.intervene && stallDecision.rung
        ? logSessionEvent(sessionId, 'intervention', rungDeliverySpan ? rungName(stallDecision.rung) : 'rung_not_delivered', nextTurnIndex, currentPhase, {
          level: stallDecision.rung, firedOn: stallDecision.firedOn ?? [], span: rungDeliverySpan,
        })
        : Promise.resolve(),
      stallDecision.synthesisUnresolved
        ? logSessionEvent(sessionId, 'intervention', 'synthesis_unresolved', nextTurnIndex, currentPhase, {})
        : Promise.resolve(),
      // Rule 15: record when the interview entered load-shedding, once.
      loadShedLoggedThisTurn
        ? logSessionEvent(sessionId, 'intervention', 'load_shed', nextTurnIndex, currentPhase, { elapsedMs, remainingMs: TOTAL_CASE_MS - elapsedMs })
        : Promise.resolve(),
      kind === 'grace_ask' ? logSessionEvent(sessionId, 'intervention', 'grace_ask', nextTurnIndex, currentPhase, { elapsedMs }) : Promise.resolve(),
      db.update(sessions)
        .set({
          phase: nextPhaseValue,
          status: ended ? 'completed' : 'active',
          completedAt: ended ? new Date() : undefined,
          phaseStartedAt: advancedThisTurn ? new Date() : undefined,
          flagsJsonb: {
            ...flags,
            conduct,
            stall: stallState,
            advancedLastTurn: advancedThisTurn,
            timeWarningFired: Boolean(flags.timeWarningFired) || kind === 'time_warning',
            graceAskFired: Boolean(flags.graceAskFired) || kind === 'grace_ask',
            recomputeAttempts,
            lastVerified: verifiedNow,
            explainProbed: [...explainProbedBefore, ...probe.explainProbed],
            loadShedLogged: Boolean(flags.loadShedLogged) || loadShedLoggedThisTurn,
            moves,
            lastQuestion,
            pressureTest: pt,
          },
        })
        .where(eq(sessions.id, sessionId)),
    ]);

    // PRD §13: token usage and product analytics, after the response.
    if (turnUsage.apiCalls > 0) later(() => logEvent('llm_usage', { component: 'interviewer', ...turnUsage }, { sessionId, userId }));
    for (const itemId of newReveals) later(() => logEvent('data_revealed', { itemId, phase: currentPhase }, { sessionId, userId }));
    for (const itemId of exhibitReveals) later(() => logEvent('data_revealed', { itemId, phase: currentPhase, via: 'exhibit' }, { sessionId, userId }));
    if (exhibit) {
      const exhibitId = exhibit.id;
      later(() => logEvent('exhibit_shown', { exhibitId, phase: currentPhase }, { sessionId, userId }));
    }
    if (advancedThisTurn) later(() => logEvent('phase_transition', { from: currentPhase, to: nextPhaseValue }, { sessionId, userId }));
    if (ended) later(() => logEvent('case_complete', { phase: currentPhase, elapsedMs }, { sessionId, userId }));

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
  };

  return {
    result: {
      interviewerText: heardText(ctx, spokenText),
      exhibit,
      phase: nextPhaseValue,
      ended,
      auditPassed: auditResult.passed,
      dataRequestsClassified: requestsClassified,
    },
    spokenText, tail, prefixMismatch: mismatch, newReveals, exhibitId: exhibit?.id, persist,
  };
}
