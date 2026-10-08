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

import { probeIntents, pickFallbackQuestion, reaskProbe, CODE_PROBES, CODE_STRUCTURE_ASKS, EARLY_PHASES, type PressureTestState } from './pressure-test';
import { requestSentences } from './request-signal';
import { isUnderTimePressure } from './pacing';
import { rungName, classifyRungDelivery, revertUndeliveredRung } from './stall';
import { logEvent } from '@/lib/analytics';
import { TOTAL_CASE_MS, type Phase } from './state-machine';
import { toCheckEventRows } from './check-log';
import { pickScript } from '@/lib/agent/prompts/scripts';
import { BLOCKED_CLOSE_PROBES } from './spoken-close';
import { renderDataLineParts, decisionRows } from './data-decisions';
import { applyHeard, heardRequestRows, unheardQuestionPressureTest } from './heard';
import { derivePhase, type TurnMove } from './progress';
import { turnData, pressureTestSatisfiedNow } from './turn-data';
import { vetoReason, gateContext, isHandoverAnnouncement } from './stream-turn';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
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
  const live = heard ? (await db.query.sessions.findFirst({ where: eq(sessions.id, ctx.sessionId) }))?.status === 'active' : true;
  const saved = heardText(ctx, spoken);
  await db.insert(sessionTurns).values([
    { sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex, role: 'candidate', text: ctx.candidateText, timestampMs: ctx.now },
    ...(saved ? [{ sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex + 1, role: 'interviewer' as const, text: saved, timestampMs: Date.now() }] : []),
  ]);
  const checkRows = toCheckEventRows(ctx.checks, { sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex, phase: ctx.currentPhase });
  if (checkRows.length > 0) await db.insert(sessionEvents).values(checkRows);
  if (ctx.events.length > 0) await db.insert(sessionEvents).values(pendingEventRows(ctx, ctx.events));
  if (applies && live && Object.keys(plan.sessionUpdate).length > 0) {
    await db.update(sessions).set(plan.sessionUpdate).where(eq(sessions.id, ctx.sessionId));
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
  // Voice: `heard` (spec 2026-10-08-voice-phase-b §5) decides what is booked,
  // saved and changed; the result returned is the turn as heard.
  persist: (latency: { firstSegmentMs: number | null; streamed: boolean }, heard?: HeardReport | null) => Promise<TurnResult>;
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
  const satisfiedNow = await (out.timer ? out.timer.time('pt_judge_settle', pressureTestSatisfiedNow(plan)) : pressureTestSatisfiedNow(plan));
  const decisions = turnData(plan, turn);
  const dataParts = renderDataLineParts(decisions, seed);
  const dataLines = dataParts.map(p => p.text);
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
      if (!isProbe(question) && pt.gatedTurns >= 2) {
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
  const releaseWhenOf = (ids: string[]) => ids
    .map(id => ledger.items.find(i => i.id === id)?.releaseWhen as Phase | undefined)
    .filter((p): p is Phase => p !== undefined);
  const nextPhaseValue = derivePhase(currentPhase, {
    move: codeWritten || kind === 'rec_ask' ? undefined : turn.move,
    releasedReleaseWhen: releaseWhenOf([...newReveals, ...exhibitReveals]), exhibitShown: exhibit !== undefined,
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
      move: codeWritten || kind === 'rec_ask' || !qHeard ? undefined : turn.move,
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
    const probeSaved = heard ? withholdProbesOnVerified(h.savedText, {
      verified: [...verifiedNow, ...verifiedPrev], alreadyProbed: explainProbedBefore,
      flaggedThisTurn: recomputeFlags.length > 0 || unitCheckHint !== undefined,
    }) : probe;
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
    // A session ended elsewhere while this turn played (End) is not revived (§5.8).
    const live = heard ? (await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) }))?.status === 'active' : true;
    const savedLine = heardText(ctx, h.savedText);
    const underTimePressure = isUnderTimePressure(elapsedMs, TOTAL_CASE_MS);
    const loadShedLoggedThisTurn = underTimePressure && !flags.loadShedLogged;
    const advancedThisTurn = phaseSaved !== currentPhase && !endedSaved;
    const revealedRowsNew = [...bookedReveals, ...exhibitRevealsSaved].map(itemId => ({ sessionId, ledgerItemId: itemId, revealedAtMs: now }));
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
          requests: heardRequestRows(decisionRows(decisions), h),
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
      !live ? Promise.resolve() : db.update(sessions)
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
            explainProbed: [...explainProbedBefore, ...probeSaved.explainProbed],
            loadShedLogged: Boolean(flags.loadShedLogged) || loadShedLoggedThisTurn,
            moves: movesSaved,
            lastQuestion: lastQuestionSaved,
            pressureTest: ptSaved,
          },
        })
        .where(eq(sessions.id, sessionId)),
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
