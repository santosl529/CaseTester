import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, exhibitsShown, sessionEvents } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import {
  classifyDataRequests, planForcedReleases, composeForcedReleaseTurn, dropTrailingQuestions,
  planSameTurnResolution, insertBeforeTrailingQuestions, planStaleReleases, acceptedOffer,
} from './data-requests';
import { logDataRequestClassification } from './data-request-log';
import { summarizeDataRequests } from '@/lib/scoring/data-coverage';
import {
  canReveal, reveal, resolveItemId, revealedValues, unrevealedItems,
  resolveItemFromText, resolveItemsFromText, handoffSentences, markExhibitReveals,
} from './data-ledger';
import { auditTurn, auditTurnStyle, stripMetaLeak, stripFabricatedTurn, rewriteSystemLanguage, stripCopiedCheckIn } from './audit';
import { enforceNumericProvenance, changeFigures } from './numeric-provenance';
import { withholdProbesOnVerified } from './probe-guard';
import { withholdAssumptionChallenges } from './assumption-guard';
import { checkTimeframes } from './timeframe-check';
import { checkHintDelivered } from './hint-check';
import { resolveExhibit, promisesExhibit } from './exhibits';
import { suppliesRecommendation, SYNTHESIS_NARROW_SCRIPTS } from './synthesis-guard';
import { isUnderTimePressure, shouldGraceAsk } from './pacing';
import { recordSilenceStall, rungName, classifyRungDelivery, revertUndeliveredRung, INITIAL_STALL_STATE, type StallState } from './stall';
import {
  evaluateSilence, checkInText, pauseText, INITIAL_SILENCE_STATE, type SilenceAction, type SilenceState,
} from './silence';
import { isDistressVerdict } from './distress';
import { logEvent } from '@/lib/analytics';
import { nextPhase, PHASES, TOTAL_CASE_MS, type Phase } from './state-machine';
import { inferPhaseRepair } from './phase-repair';
import { resolveSpokenClose } from './spoken-close';
import { toCheckEventRows } from './check-log';
import { runInterviewerTurn } from '@/lib/agent/interviewer';
import { AnthropicInterviewerModel } from '@/lib/agent/models/anthropic';
import {
  TIME_WARNING_SCRIPTS, GRACE_ASK_SCRIPTS, CLOSE_SCRIPTS, REVEAL_REFUSAL_SCRIPTS, EXHIBIT_REFUSAL_SCRIPTS, FORCED_RELEASE_LEADINS, STALE_RELEASE_LEADINS,
  SAME_TURN_RELEASE_LEADINS, SAME_TURN_DEFER_SCRIPTS, SAME_TURN_OFFER_SCRIPTS, SAME_TURN_NOT_YET_SCRIPTS, NOT_IN_CASE_REFUSAL_SCRIPTS,
  pickScript, wordlessExhibitLine, wordlessRevealLine, alreadySignaledTimeOrRec, asksForRecommendation, SILENCE_PAUSE_EXPIRED,
} from '@/lib/agent/prompts/scripts';
import { planTurn, scriptedOffer } from './plan-turn';
import type { ConductFlags, ExhibitDisplay, PendingEvent, ScriptedPlan, TurnCtx, TurnResult } from './turn-types';

export type { ExhibitDisplay, TurnResult } from './turn-types';

const model = new AnthropicInterviewerModel();

export type SilenceResult = {
  action: SilenceAction;
  interviewerText: string; // '' when nothing is said
  phase: Phase;
  ended: boolean;
  scoringSuppressed?: boolean; // set when an expired pause abandoned the session
};

async function logSessionEvent(
  sessionId: string,
  category: 'intervention' | 'conduct',
  subtype: string,
  turnIndex: number,
  phase: Phase,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(sessionEvents).values({ sessionId, category, subtype, turnIndex, phase, payloadJsonb: payload });
}

export type RunTurnOptions = {
  // Where analytics writes go (latency plan step 2): the turn route hands them
  // to after(), the live-run harness to its background list. Nothing in a turn
  // or in scoring reads analytics. Without it they are awaited before return.
  defer?: (task: () => Promise<void>) => void;
};

export async function runTurn(sessionId: string, candidateText: string, opts: RunTurnOptions = {}): Promise<TurnResult> {
  const deferred: (() => Promise<void>)[] = [];
  try {
    return await runTurnBody(sessionId, candidateText, task => { deferred.push(task); });
  } finally {
    if (opts.defer) for (const task of deferred) opts.defer(task);
    else await Promise.allSettled(deferred.map(task => task()));
  }
}

// Session events decided during the turn (plan-turn.ts PendingEvent), as rows.
function pendingEventRows(ctx: TurnCtx, events: PendingEvent[]) {
  return events.map(e => ({
    sessionId: ctx.sessionId, category: e.category, subtype: e.subtype,
    turnIndex: ctx.nextTurnIndex, phase: ctx.currentPhase, payloadJsonb: e.payload,
  }));
}

// A scripted turn (no model call): the candidate turn and the scripted reply,
// this turn's check decisions, its events, then the session update — the
// order the early-return paths wrote them in before the Plan stage.
async function commitScripted(plan: ScriptedPlan): Promise<TurnResult> {
  if (plan.noPersist) return plan.result;
  const { ctx } = plan;
  await db.insert(sessionTurns).values([
    { sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex, role: 'candidate', text: ctx.candidateText, timestampMs: ctx.now },
    { sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex + 1, role: 'interviewer', text: plan.interviewerText, timestampMs: Date.now() },
  ]);
  const checkRows = toCheckEventRows(ctx.checks, { sessionId: ctx.sessionId, turnIndex: ctx.nextTurnIndex, phase: ctx.currentPhase });
  if (checkRows.length > 0) await db.insert(sessionEvents).values(checkRows);
  if (ctx.events.length > 0) await db.insert(sessionEvents).values(pendingEventRows(ctx, ctx.events));
  if (Object.keys(plan.sessionUpdate).length > 0) {
    await db.update(sessions).set(plan.sessionUpdate).where(eq(sessions.id, ctx.sessionId));
  }
  return plan.result;
}

async function runTurnBody(sessionId: string, candidateText: string, later: (task: () => Promise<void>) => void): Promise<TurnResult> {
  // Full-turn timing (latency plan step 1): the model call alone was ~1.9s of
  // a ~2.2s turn in batches 7–8, but the writes after the interviewer row were
  // never timed.
  const turnStartMs = Date.now();
  // Every read this turn needs takes only the session id: issue them together
  // (they ran one after another).
  const [session, turnRows, exhibitRows, revealedRows, dataRequestEventRows] = await Promise.all([
    db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) }),
    db.query.sessionTurns.findMany({
      where: eq(sessionTurns.sessionId, sessionId),
      orderBy: (t, { asc }) => [asc(t.turnIndex)],
    }),
    db.query.exhibitsShown.findMany({ where: eq(exhibitsShown.sessionId, sessionId) }),
    db.query.revealedData.findMany({ where: eq(revealedData.sessionId, sessionId) }),
    db.query.sessionEvents.findMany({
      where: and(eq(sessionEvents.sessionId, sessionId), eq(sessionEvents.category, 'data_request')),
    }),
  ]);

  // Plan (plan-turn.ts): everything decided before the model call, no writes.
  const plan = planTurn({ session, turnRows, exhibitRows, revealedRows, dataRequestEventRows }, candidateText, {
    sessionId, now: Date.now(), turnStartMs, later,
  });
  if (plan.kind === 'scripted') return commitScripted(plan);

  const { ctx, state } = plan;
  const { now, nextTurnIndex, currentPhase, flags, conduct, checks } = ctx;
  const {
    caseData, repliedToDistressOffer, shownExhibitIds, ledger, catalog, dataRequestRows, openDataRequests,
    openDataRequestsHint, elapsedMs, timeUp, coverage, phaseBudgetsMs, shouldFireTimeWarning,
    recomputeFlags, recomputeAttempts, recomputeHint, derivedValueTexts, verifiedNow, verifiedPrev,
    explainProbedBefore, verifiedHint, unitCheckHint, priorStall, stallDecision, recommendationReceived,
    stages, mayEnd, coverageSteer, conductRedirectHint, history,
  } = state;
  const distressPromise = state.distress;
  const detectedRequestsPromise = state.detectedRequests;
  const writeChecks = async () => {
    const rows = toCheckEventRows(checks, { sessionId, turnIndex: nextTurnIndex, phase: currentPhase });
    if (rows.length > 0) await db.insert(sessionEvents).values(rows);
  };
  const userId = ctx.userId;

  console.log('[runner] phase:', currentPhase, 'stall rung:', stallDecision.intervene ? stallDecision.rung : 'none');
  // PRD §13: per-turn latency + token usage. The correction loop can make
  // multiple API calls per turn — onUsage fires per call, so sum here.
  const turnUsage = { model: '', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
  const modelCallStart = Date.now();
  const actions = await runInterviewerTurn({
    model,
    candidateText,
    history,
    phase: currentPhase,
    onValidation: v => {
      checks.record('action_validation', v.report.dropped.length > 0 || v.retried || v.unparsed,
        v.retried ? 'model reply regenerated' : 'model actions dropped', {
          dropped: v.report.dropped.map(d => ({ type: d.action.type, reason: d.reason })),
          invalidIds: v.report.invalidIds, retried: v.retried, unparsed: v.unparsed, refused: v.refused,
        });
    },
    onUsage: u => {
      turnUsage.model = u.model;
      turnUsage.inputTokens += u.inputTokens;
      turnUsage.outputTokens += u.outputTokens;
      turnUsage.cacheReadTokens += u.cacheReadTokens ?? 0;
      turnUsage.cacheWriteTokens += u.cacheWriteTokens ?? 0;
      turnUsage.apiCalls += 1;
    },
    promptCtx: {
      casePrompt: caseData.prompt,
      currentPhase,
      revealedValues: revealedValues(ledger),
      unrevealedItems: unrevealedItems(ledger),
      exhibits: caseData.exhibits.map(e => ({ id: e.id, title: e.title, shown: shownExhibitIds.has(e.id) })),
      advancedLastTurn: Boolean(flags.advancedLastTurn),
      elapsedMs,
      totalMs: TOTAL_CASE_MS,
      phaseBudgetsMs,
      recomputeHint: [recomputeHint, verifiedHint].filter(Boolean).join('\n\n') || undefined,
      unitCheckHint,
      stallGuidance: stallDecision.guidance,
      coverageSteer,
      mayEnd,
      openDataRequestsHint,
      conductRedirectHint,
    },
  });
  // Interviewer latency is the model call alone; the wait on the parallel
  // distress check is logged apart (batch 4 conflated them).
  const modelLatencyMs = Date.now() - modelCallStart;
  const distress = await distressPromise;
  const distressWaitMs = Date.now() - modelCallStart - modelLatencyMs;
  if (repliedToDistressOffer) checks.skip('conduct_model', 'reply to a declined pause offer');
  else if (distress === null) checks.skip('conduct_model', 'classifier failed — regex floor stands');
  else checks.record('conduct_model', isDistressVerdict(distress), `C5 by model: ${distress.label}`, { ...distress });
  if (isDistressVerdict(distress)) {
    console.warn('[runner] C5 by the model layer — draft discarded:', JSON.stringify(distress));
    // The discarded draft still cost an interviewer call ($/case, PRD §13).
    if (turnUsage.apiCalls > 0) {
      later(() => logEvent('llm_usage', { component: 'interviewer', ...turnUsage, discarded: true }, { sessionId, userId }));
    }
    return commitScripted(scriptedOffer(plan, distress.label === 'risk_to_self', { reason: distress.reason, label: distress.label, layer: 'model' }));
  }

  // Execute actions
  let spokenText = '';
  let exhibit: ExhibitDisplay | undefined;
  let nextPhaseValue: Phase = currentPhase;
  let ended = false;
  let endCaseBlocked = false;
  let fabricatedStripped = false;
  const metaStripped: string[] = [];
  let modelWords = '';
  const newReveals: string[] = [];

  for (const action of actions) {
    if (action.type === 'speak') {
      // A line opening as another speaker means the model kept writing past its
      // own turn and authored the candidate's side (live run 58cb8061). Cut it
      // per speak action — before any revealed value is appended — so it is
      // never spoken, persisted, scored, or read by the coverage agent.
      const { cleaned, fabricated } = stripFabricatedTurn(action.text);
      if (fabricated !== null) {
        console.warn('[runner] stripped fabricated speaker continuation:', JSON.stringify(fabricated));
        fabricatedStripped = true;
      }
      // Strip internal planning from the model's own words (Rule 1/5) — here,
      // per speak action, so revealed values appended below never pass through
      // the strip and an all-narration reveal turn leaves just the value
      // (batch 5: "I'll release the cost-structure data now." was spoken).
      const meta = stripMetaLeak(cleaned);
      metaStripped.push(...meta.strippedSentences);
      if (meta.cleaned) { spokenText += meta.cleaned + ' '; modelWords += meta.cleaned + ' '; }
    } else if (action.type === 'reveal_data') {
      const itemId = resolveItemId(ledger, action.itemId);
      if (itemId && canReveal(ledger, itemId)) {
        const value = reveal(ledger, itemId);
        newReveals.push(itemId);
        spokenText += `${value} `;
      } else if (!itemId) {
        console.warn('[runner] reveal_data could not resolve', JSON.stringify(action.itemId));
      }
    } else if (action.type === 'show_exhibit') {
      const found = resolveExhibit(caseData.exhibits, action.exhibitId);
      if (found) {
        exhibit = { id: found.id, title: found.title, chartType: found.chartType, data: found.data as Record<string, unknown>[] };
      } else {
        console.warn('[runner] show_exhibit could not resolve', JSON.stringify(action.exhibitId));
      }
    } else if (action.type === 'advance_phase') {
      // Rule 8: state accuracy over pacing — always booked; advancedLastTurn
      // gates the visible behavior shift via the prompt, not the bookkeeping.
      nextPhaseValue = nextPhase(currentPhase) ?? currentPhase;
    } else if (action.type === 'end_case') {
      // Coverage gate: don't let the interviewer wrap early while dimensions are
      // still untested. Time-up (inside mayEnd) always allows it.
      if (mayEnd) {
        ended = true;
      } else {
        endCaseBlocked = true;
        console.warn('[runner] suppressed early end_case — coverage incomplete:', JSON.stringify(coverage));
      }
    }
  }

  // Deterministic exit from INTRO. It exists only for the opening exchange; a
  // live session got stuck in INTRO the entire case because the model never
  // called advance_phase, so all phase-dependent logic ran on INTRO. Once the
  // candidate has taken a turn, INTRO is done — advance it ourselves if the
  // model didn't. (INTRO → CLARIFY is always correct after the first exchange.)
  if (currentPhase === 'INTRO' && nextPhaseValue === 'INTRO' && !ended) {
    nextPhaseValue = nextPhase('INTRO') ?? 'INTRO';
    console.log('[runner] auto-advanced INTRO → CLARIFY (model did not advance)');
  }

  spokenText = spokenText.trim();
  checks.record('fabricated_turn', fabricatedStripped, 'model wrote past its turn — continuation cut');
  if (fabricatedStripped) {
    // Nothing real left: a neutral acknowledgment (Rule 1) beats a blank turn.
    if (!spokenText && !ended) spokenText = 'Go on.';
    later(() => logEvent('fabricated_turn_stripped', { phase: currentPhase }, { sessionId, userId }));
  }

  // Internal planning stripped above (Rule 1/5) — the backstop so a model slip
  // like "The candidate has anchored on pricing lag. Let me pressure it
  // once..." never reaches the candidate.
  checks.record('meta_leak', metaStripped.length > 0, 'internal planning stripped', { sentences: metaStripped });
  if (metaStripped.length > 0) {
    console.warn('[runner] stripped meta-leak from interviewer turn:', JSON.stringify(metaStripped));
  }
  // Rule 13 synthesis cap: never supply the recommendation (synthesis-guard.ts).
  // Checked on the model's own words; values it revealed this turn stay.
  const inSynthesis = ['RECOMMENDATION', 'WRAP'].includes(currentPhase) || ['RECOMMENDATION', 'WRAP'].includes(nextPhaseValue);
  const supplied = inSynthesis && !recommendationReceived && !ended && suppliesRecommendation(modelWords);
  checks.record('synthesis_guard', supplied, 'interviewer supplied the recommendation — replaced with a narrowing question', {
    text: supplied ? modelWords.trim() : null,
  });
  if (supplied) {
    console.warn('[runner] interviewer supplied the recommendation — replaced:', JSON.stringify(modelWords.trim()));
    const revealedNowById = revealedValues(ledger);
    spokenText = [...newReveals.map(id => revealedNowById[id]), pickScript(SYNTHESIS_NARROW_SCRIPTS, `${sessionId}:${nextTurnIndex}`)].join(' ');
    later(() => logEvent('synthesis_supply_blocked', { phase: currentPhase, text: modelWords.trim() }, { sessionId, userId }));
  }

  // An exhibit turn left wordless gets a scripted hand-over; any other empty
  // turn falls to the blank-turn guard.
  const exhibitLine = wordlessExhibitLine({ spokenText, exhibitShown: exhibit !== undefined, ended, seed: sessionId });
  checks.record('wordless_exhibit', exhibitLine !== null, 'exhibit shown with no words — scripted hand-over');
  if (exhibitLine) spokenText = exhibitLine;
  // Data released with no words of the model's own: hand the floor back.
  const revealLine = wordlessRevealLine({ modelWords, revealedCount: newReveals.length, exhibitShown: exhibit !== undefined, ended, seed: `${sessionId}:${nextTurnIndex}` });
  checks.record('wordless_reveal', revealLine !== null, 'data released with no words — scripted hand-back');
  if (revealLine) spokenText = `${spokenText} ${revealLine}`;

  const copiedCheckIn = stripCopiedCheckIn(spokenText);
  checks.record('copied_check_in', copiedCheckIn.stripped, 'model-written check-in removed');
  if (copiedCheckIn.stripped) spokenText = copiedCheckIn.text || 'Go on.';

  const systemLanguage = rewriteSystemLanguage(spokenText);
  checks.record('system_language', systemLanguage.rewrites.length > 0, 'system vocabulary rewritten', { rewrites: systemLanguage.rewrites });
  spokenText = systemLanguage.text;

  // Rule 12: the words and the state must agree. A close spoken without
  // end_case ends the case if it may end, else is withdrawn (spoken-close.ts).
  const spokenClose = resolveSpokenClose({ spokenText, ended, mayEnd, endBlocked: endCaseBlocked, stages, seed: `${sessionId}:${nextTurnIndex}` });
  checks.record('spoken_close', spokenClose.action !== 'none', `closing turn without a confirmed end — ${spokenClose.action}`, {
    mayEnd, probe: spokenClose.probe ?? null, endCaseBlocked,
  });
  if (spokenClose.action !== 'none') {
    console.warn(`[runner] closing turn without a confirmed end — ${spokenClose.action}${spokenClose.probe ? ` (${spokenClose.probe} probe)` : ''}`);
    later(() => logEvent('spoken_close_resolved', { action: spokenClose.action, probe: spokenClose.probe ?? null, phase: currentPhase, coverage },
      { sessionId, userId }));
    ended = spokenClose.ended;
    if (spokenClose.action === 'replaced') {
      // The whole turn goes; values it revealed stay — they are booked (Rule 10).
      const revealedNowById = revealedValues(ledger);
      spokenText = [...newReveals.map(id => revealedNowById[id]), spokenClose.spokenText].join(' ');
    }
  }

  // Rule 10 / never-promise-without-delivering: if the interviewer's words
  // promise an exhibit but the tool call didn't deliver one, recover it — from
  // an exhibit named in the spoken text, or the sole exhibit if the case has
  // exactly one. Prevents the "here's exhibit A" → "it didn't come through" gap.
  // Skipped on the closing turn: a live run's final debrief mentioned "the
  // exhibit" in retrospective feedback, which isn't a delivery promise, and a
  // case that's ending has no business surfacing new exhibits anyway.
  const exhibitPromised = !exhibit && !ended && promisesExhibit(spokenText);
  if (!exhibitPromised) checks.pass('exhibit_promise');
  if (exhibitPromised) {
    const recovered = resolveExhibit(caseData.exhibits, spokenText)
      ?? (caseData.exhibits.length === 1 ? caseData.exhibits[0] : undefined);
    if (recovered) {
      exhibit = { id: recovered.id, title: recovered.title, chartType: recovered.chartType, data: recovered.data as Record<string, unknown>[] };
      console.warn('[runner] recovered promised-but-undelivered exhibit:', recovered.id);
      checks.act('exhibit_promise', 'promised exhibit recovered', { exhibitId: recovered.id });
    } else {
      spokenText = `${spokenText} ${pickScript(EXHIBIT_REFUSAL_SCRIPTS, sessionId)}`;
      console.warn('[runner] interviewer promised an exhibit but none could be delivered — injected refusal');
      checks.act('exhibit_promise', 'promised exhibit unresolvable — refusal injected');
    }
  }

  // An exhibit that displays ledger figures releases them (case config
  // `coversLedgerItems`). Marked here — after both exhibit paths above and
  // before the Rule 11 force-release below — so the ledger, the open-request
  // hints, the provenance audit, and scoring all agree the candidate has them.
  // Kept apart from newReveals: nothing is appended to speech, and these must
  // not trip the reveal-driven length exemption or promise recovery.
  const exhibitReveals = exhibit
    ? markExhibitReveals(ledger, caseData.exhibits.find(e => e.id === exhibit!.id) ?? {})
    : [];

  // Rule 11 backstop: if the interviewer's words promise a data delivery but
  // no reveal_data call landed this turn, recover it — from a ledger item
  // named in the spoken text, or, if nothing in the ledger matches what was
  // asked for, inject an explicit refusal instead of leaving the promise
  // dangling. Unlike the exhibit recovery above, there is no "sole candidate"
  // fallback: guessing the wrong ledger item would itself be a data leak
  // (data-ledger.ts has the full rationale). Skipped on the closing turn for
  // the same reason as the exhibit recovery.
  // Round-3 fix 2: every fact a handoff names is delivered in the same turn —
  // not just one (Tobias 7fb4372f: "the bean price change and the other-input
  // change" delivered the first only). Facts already released this turn are
  // skipped; a handoff naming nothing deliverable, on a turn that delivered
  // nothing, falls back to the single open request or a scripted refusal.
  const handoffs = ended ? [] : handoffSentences(spokenText);
  if (handoffs.length === 0) {
    checks.pass('data_promise');
  } else {
    const named = [...new Set(handoffs.flatMap(h => resolveItemsFromText(ledger, h)))].filter(id => canReveal(ledger, id));
    if (named.length > 0) {
      const values = named.map(id => { newReveals.push(id); return reveal(ledger, id); });
      spokenText = insertBeforeTrailingQuestions(spokenText, values.join(' '));
      console.warn('[runner] delivered announced facts:', JSON.stringify(named));
      checks.act('data_promise', 'announced facts delivered', { itemIds: named });
    } else if (newReveals.length === 0) {
      // Named in no ledger label: the single open ledger request is what was
      // promised (v4.3: Maya c230fe12 was refused her open deferral instead).
      const openIds = [...new Set(openDataRequests.map(r => r.ledgerItemId))].filter(id => canReveal(ledger, id));
      const recoveredId = resolveItemFromText(ledger, spokenText) ?? (openIds.length === 1 ? openIds[0] : null);
      if (recoveredId) {
        const value = reveal(ledger, recoveredId);
        newReveals.push(recoveredId);
        spokenText = insertBeforeTrailingQuestions(spokenText, value);
        console.warn('[runner] recovered promised-but-undelivered reveal_data:', recoveredId);
        checks.act('data_promise', 'promised data recovered', { itemId: recoveredId });
      } else {
        spokenText = `${spokenText} ${pickScript(REVEAL_REFUSAL_SCRIPTS, sessionId)}`;
        console.warn('[runner] interviewer promised data with no ledger match — injected refusal');
        checks.act('data_promise', 'promised data unresolvable — refusal injected');
      }
    } else {
      checks.pass('data_promise', { note: 'handoff names only facts delivered this turn' });
    }
  }

  if (timeUp) {
    console.log('[runner] time up at', elapsedMs, 'ms — forcing end_case');
    ended = true;
  }

  // Rule 12 grace ask (v4.3): if time ran out before any recommendation ask
  // reached the candidate, this turn asks instead of closing, and the next
  // candidate message ends the case. The ask then flows through the Rule 11
  // force-release below like any other ask, so open requests land first.
  const graceAskFiredThisTurn = shouldGraceAsk({
    timeUp,
    graceAskFired: Boolean(flags.graceAskFired),
    recommendationAsked: turnRows.some(t => t.role === 'interviewer' && asksForRecommendation(t.text)),
    recommendationDelivered: recommendationReceived,
  });
  checks.record('grace_ask', graceAskFiredThisTurn, 'time up with no recommendation ask — grace ask instead of close');
  if (graceAskFiredThisTurn) {
    console.warn('[runner] time up with no recommendation ask — grace ask instead of close');
    ended = false;
    // The model wrote a close; replace it, but keep any values it revealed
    // this turn — they are booked as revealed and must be delivered (Rule 10).
    const revealedNowById = revealedValues(ledger);
    spokenText = [...newReveals.map(id => revealedNowById[id]), pickScript(GRACE_ASK_SCRIPTS, sessionId)].join(' ');
    await logSessionEvent(sessionId, 'intervention', 'grace_ask', nextTurnIndex, currentPhase, { elapsedMs });
  }

  // Rule 11 + the "time warning + open data request" worked conflict
  // resolution (docs/interviewer-behavior.md v4.1): before ANY recommendation
  // ask goes out — the scripted T−30s warning or the model asking on its own —
  // release open ledger requests first, in the same turn. This candidate
  // message is classified synchronously here because run 4's ignored price
  // request was in the very message the warning answered, which the lagging
  // background log can't see yet. One Haiku call, only on ask turns.
  // v4.6: the recommendation ask fires once — after a received recommendation
  // the scripted warning is skipped (Maya 19:23 was asked again).
  const warningDue = shouldFireTimeWarning && !ended && !recommendationReceived;
  if (shouldFireTimeWarning && !ended && recommendationReceived) checks.skip('time_warning', 'recommendation already received');
  const modelAsked = !ended && alreadySignaledTimeOrRec(spokenText);

  // Rule 11 same-turn resolution (v4.4): a request in this message for held
  // data that the draft ignored is released if the case has reached the item's
  // stage, else deferred out loud — before the turn is sent, so the candidate
  // never has to ask twice. Recommendation-ask turns skip this: the forced
  // release below resolves every open request there.
  // Round-3 fix 4: a request in the candidate's final message is answered
  // before the goodbye (Camila cf375283 asked for store figures and got only
  // the close). The case is over, so stage gating no longer applies.
  let finalReleaseCount = 0;
  if (ended) {
    const detected = await detectedRequestsPromise;
    const ids = [...new Set((detected ?? []).filter(r => r.explicit).flatMap(r => r.ledgerItemIds))].filter(id => canReveal(ledger, id)).slice(0, 2);
    for (const id of ids) { reveal(ledger, id); newReveals.push(id); }
    finalReleaseCount = ids.length;
    checks.record('final_message_release', ids.length > 0, 'request in the final message answered before the goodbye', {
      itemIds: ids, classifierFailed: detected === null,
    });
  }
  // An offer from last turn ("There's data on that if you'd like to see it.")
  // answered with a yes: release what was offered, unless the draft did.
  const accepted = ended ? [] : acceptedOffer({
    candidateText,
    offeredIds: (flags.pendingOffer as string[] | undefined) ?? [],
    revealedIds: new Set(Object.keys(revealedValues(ledger))),
  }).filter(id => canReveal(ledger, id));
  checks.record('offer_accepted', accepted.length > 0, 'offered data released on a yes', { itemIds: accepted });
  if (accepted.length > 0) {
    const values = accepted.map(id => { newReveals.push(id); return reveal(ledger, id); });
    spokenText = insertBeforeTrailingQuestions(spokenText, values.join(' '));
  }
  let offeredThisTurn: string[] = [];

  if (ended || warningDue || modelAsked) {
    checks.skip('same_turn_resolution', ended ? 'closing turn' : 'recommendation-ask turn (forced release handles it)');
  } else {
    const detected = await detectedRequestsPromise;
    if (detected === null) checks.skip('same_turn_resolution', 'request classifier failed');
    else if (detected.length === 0) checks.pass('same_turn_resolution', { detected: 0 });
    if (detected && detected.length > 0) {
      const phase = PHASES.indexOf(nextPhaseValue) > PHASES.indexOf(currentPhase) ? nextPhaseValue : currentPhase;
      const plan = planSameTurnResolution({
        requests: detected,
        revealedIds: new Set(Object.keys(revealedValues(ledger))),
        phase,
        releaseWhenById: new Map(caseData.dataLedger.map(d => [d.id, d.releaseWhen as Phase])),
        spokenText,
      });
      const values = plan.releaseIds.filter(id => canReveal(ledger, id)).map(id => {
        newReveals.push(id);
        return reveal(ledger, id);
      });
      offeredThisTurn = plan.offerIds;
      const parts = [
        ...(values.length > 0 ? [pickScript(SAME_TURN_RELEASE_LEADINS, sessionId), ...values] : []),
        ...(plan.defer ? [pickScript(SAME_TURN_DEFER_SCRIPTS, sessionId)] : []),
        ...(plan.refuseNotInCase ? [pickScript(NOT_IN_CASE_REFUSAL_SCRIPTS, sessionId)] : []),
        ...(plan.offerIds.length > 0 ? [pickScript(SAME_TURN_OFFER_SCRIPTS, sessionId)] : []),
        ...(plan.notYet ? [pickScript(SAME_TURN_NOT_YET_SCRIPTS, sessionId)] : []),
      ];
      checks.record('same_turn_resolution', parts.length > 0, 'ignored request resolved before send', {
        detected: detected.map(r => ({ ids: r.ledgerItemIds, explicit: r.explicit })), released: plan.releaseIds, deferred: plan.defer,
        offered: plan.offerIds, notYet: plan.notYet, refusedNotInCase: plan.refuseNotInCase,
      });
      if (parts.length > 0) {
        spokenText = insertBeforeTrailingQuestions(spokenText, parts.join(' '));
        console.warn('[runner] same-turn data request resolution:', JSON.stringify({
          released: plan.releaseIds, deferred: plan.defer, offered: plan.offerIds, notYet: plan.notYet, refusedNotInCase: plan.refuseNotInCase, phase,
        }));
        later(() => logEvent('data_same_turn_resolved', { itemIds: plan.releaseIds, deferred: plan.defer, phase: currentPhase },
          { sessionId, userId }));
      }
    }

    // Layer 3, deterministic (round-3 fix): a request from an earlier turn
    // still unreleased once its stage is reached is released by the code, not
    // left to the reminder (Ben 9 → 17 in batch 3).
    const phaseNow = PHASES.indexOf(nextPhaseValue) > PHASES.indexOf(currentPhase) ? nextPhaseValue : currentPhase;
    const stale = planStaleReleases({
      open: openDataRequests,
      revealedIds: new Set(Object.keys(revealedValues(ledger))),
      phase: phaseNow,
      releaseWhenById: new Map(caseData.dataLedger.map(d => [d.id, d.releaseWhen as Phase])),
      currentTurnIndex: nextTurnIndex,
    }).filter(id => canReveal(ledger, id));
    checks.record('stale_release', stale.length > 0, 'earlier request released by the code', { itemIds: stale });
    if (stale.length > 0) {
      const values = stale.map(id => { newReveals.push(id); return reveal(ledger, id); });
      spokenText = insertBeforeTrailingQuestions(spokenText, [pickScript(STALE_RELEASE_LEADINS, sessionId), ...values].join(' '));
      console.warn('[runner] released earlier open requests:', JSON.stringify(stale));
    }
  }

  const forcedReleaseValues: string[] = [];
  let dataRequestsClassified = false;
  if (!(warningDue || modelAsked)) checks.skip('forced_release', 'not a recommendation-ask turn');
  if (warningDue || modelAsked) {
    const revealedNow = new Set(Object.keys(revealedValues(ledger)));
    const current = await classifyDataRequests({
      candidateText,
      interviewerText: spokenText,
      catalog,
      onUsage: u => { void logEvent('llm_usage', { ...u }, { sessionId, userId }); },
    });
    let currentRows: typeof dataRequestRows = [];
    if (current !== null) {
      dataRequestsClassified = true;
      const events = await logDataRequestClassification({
        sessionId, phase: currentPhase, requests: current,
        candidateTurnIndex: nextTurnIndex, interviewerTurnIndex: nextTurnIndex + 1, revealedIds: revealedNow,
      });
      currentRows = events.map(e => ({ subtype: e.subtype, turnIndex: e.turnIndex, payloadJsonb: e.payload }));
    }
    const gaps = summarizeDataRequests([...dataRequestRows, ...currentRows], catalog, [...revealedNow]).requestedUnanswered;
    const forcedIds: string[] = [];
    for (const itemId of planForcedReleases(gaps, revealedNow, { currentTurnIndex: nextTurnIndex })) {
      if (!canReveal(ledger, itemId)) continue;
      forcedReleaseValues.push(reveal(ledger, itemId));
      newReveals.push(itemId);
      forcedIds.push(itemId);
    }
    checks.record('forced_release', forcedIds.length > 0, 'open requests released before the ask', { itemIds: forcedIds });
    if (forcedIds.length > 0) {
      console.warn('[runner] force-released open data requests before the recommendation ask:', JSON.stringify(forcedIds));
      later(() => logEvent('data_force_released', { itemIds: forcedIds, trigger: warningDue ? 'time_warning' : 'model_ask', phase: currentPhase },
        { sessionId, userId }));
    }
  }
  const forcedLeadIn = pickScript(FORCED_RELEASE_LEADINS, sessionId);

  // Rule 12: deterministic T−30s time warning, orchestrator-emitted — but only
  // as a BACKSTOP. If the model already warned or asked for the recommendation
  // this turn, appending the script just stutters ("We're nearly out of time..."
  // + "We're near time..."), so suppress the append and mark it handled. Any
  // forced release above lands before the ask either way.
  let timeWarningFiredThisTurn = false;
  if (warningDue) {
    spokenText = modelAsked
      ? composeForcedReleaseTurn({ spokenText, releaseValues: forcedReleaseValues, leadIn: forcedLeadIn, isAskSentence: alreadySignaledTimeOrRec })
      : composeForcedReleaseTurn({
        // The scripted ask supersedes any question the model ended on.
        spokenText: dropTrailingQuestions(spokenText),
        releaseValues: forcedReleaseValues,
        leadIn: forcedLeadIn,
        warningLine: pickScript(TIME_WARNING_SCRIPTS, sessionId),
      });
    timeWarningFiredThisTurn = true;
    checks.act('time_warning', modelAsked ? 'model already asked — script suppressed' : 'scripted warning appended');
  } else if (forcedReleaseValues.length > 0) {
    spokenText = composeForcedReleaseTurn({ spokenText, releaseValues: forcedReleaseValues, leadIn: forcedLeadIn, isAskSentence: alreadySignaledTimeOrRec });
  }

  if (!timeWarningFiredThisTurn) checks.pass('time_warning');

  // Rule 11 v4.5: never challenge an assumption about data the candidate
  // asked for and did not receive (Maya c6076209, 11:30: "that's the one
  // thing you assumed"). The challenge is withheld; an item still unreleased
  // is released at its stage, or deferred out loud, in its place.
  if (ended) {
    checks.skip('assumption_guard', 'closing turn');
  } else {
    const assumption = withholdAssumptionChallenges(spokenText, openDataRequests.map(r => ({ ledgerItemId: r.ledgerItemId, label: r.label })));
    if (assumption.withheld.length > 0) {
      const releaseWhenById = new Map(caseData.dataLedger.map(d => [d.id, d.releaseWhen as Phase]));
      const phaseNow = PHASES.indexOf(nextPhaseValue) > PHASES.indexOf(currentPhase) ? nextPhaseValue : currentPhase;
      const pending = [...new Set(assumption.withheld.map(w => w.ledgerItemId))].filter(id => canReveal(ledger, id));
      const releasable = pending.filter(id => PHASES.indexOf(phaseNow) >= PHASES.indexOf(releaseWhenById.get(id) ?? 'SCORING'));
      const values = releasable.map(id => { newReveals.push(id); return reveal(ledger, id); });
      const parts = [
        ...(values.length > 0 ? [pickScript(SAME_TURN_RELEASE_LEADINS, sessionId), ...values] : []),
        ...(pending.length > releasable.length ? [pickScript(SAME_TURN_DEFER_SCRIPTS, sessionId)] : []),
      ];
      spokenText = parts.length > 0 ? insertBeforeTrailingQuestions(assumption.text, parts.join(' ')) : (assumption.text || 'Go on.');
      console.warn('[runner] withheld assumption challenge on requested data:', JSON.stringify(assumption.withheld));
    }
    checks.record('assumption_guard', assumption.withheld.length > 0, 'challenge on requested-but-unreceived data withheld', {
      withheld: assumption.withheld,
    });
  }

  // Rule 12 v4.6: one goodbye, a single neutral line. An ending turn is the
  // scripted close (plus any values revealed this turn — they are booked,
  // Rule 10); the model's own sign-off is dropped, since it is where praise
  // and a second goodbye crept in (Maya 19:23: "is exactly the synthesis").
  const usedCloseFallback = ended;
  if (ended) {
    const revealedNowById = revealedValues(ledger);
    spokenText = [
      ...(finalReleaseCount > 0 ? [pickScript(SAME_TURN_RELEASE_LEADINS, sessionId)] : []),
      ...newReveals.map(id => revealedNowById[id]),
      pickScript(CLOSE_SCRIPTS, sessionId),
    ].join(' ');
  }

  // Rule 8 silent phase repair (lib/orchestrator/phase-repair.ts): raise the
  // phase to what this turn visibly did — reveals by any path (including
  // exhibit coverage and forced releases), an exhibit, a brainstorm question,
  // a recommendation ask. The model's advance_phase alone left both
  // 2026-09-14 live runs in STRUCTURE for the whole case. A repair counts as an
  // advance below, so advancedLastTurn still gates the visible behavior shift.
  if (!ended) {
    const releaseWhenById = new Map(caseData.dataLedger.map(d => [d.id, d.releaseWhen as Phase]));
    const repair = inferPhaseRepair(nextPhaseValue, {
      revealedReleaseWhen: [...newReveals, ...exhibitReveals]
        .map(id => releaseWhenById.get(id))
        .filter((p): p is Phase => p !== undefined),
      exhibitShown: exhibit !== undefined,
      interviewerText: spokenText,
    });
    if (repair) {
      console.log('[runner] phase repair:', JSON.stringify(repair));
      nextPhaseValue = repair.to;
      later(() => logEvent('phase_repair', { ...repair }, { sessionId, userId }));
    }
  }

  // Post-turn audits. Three valid provenances (Rule 6): revealed ledger values,
  // candidate-attributed figures, orchestrator-derived (recompute) values.
  // Candidate figures come from EVERY candidate turn, not only this one; the
  // case prompt (shown to the candidate verbatim) counts as revealed; and the
  // change inside a single released value ("58% … up from 42%" → 16) counts as
  // derived. Live run eca39ec7 blocked "the 16-point compression" for lack of
  // all three.
  const revealedTexts = Object.values(revealedValues(ledger));
  const priorCandidateTexts = turnRows.filter(t => t.role === 'candidate').map(t => t.text);
  const allowedTexts = [
    caseData.prompt, ...changeFigures(revealedTexts), ...priorCandidateTexts, candidateText, ...derivedValueTexts,
  ];
  // Rule 6 / FR-4: a block-tier figure is withheld, not just logged (v4.3) —
  // enforced before the other audits so they see what is actually spoken.
  const provenance = enforceNumericProvenance(
    spokenText,
    [...revealedTexts, ...allowedTexts],
    { exempt: timeWarningFiredThisTurn || usedCloseFallback },
  );
  checks.record('provenance', provenance.blocked, 'block-tier figure withheld', { findings: provenance.findings.filter(f => f.action !== 'pass') });
  if (provenance.blocked) {
    console.warn('[runner] numeric provenance blocked — withheld:', JSON.stringify(provenance.findings));
    spokenText = provenance.text;
    later(() => logEvent('provenance_blocked', { findings: provenance.findings, phase: currentPhase }, { sessionId, userId }));
  }

  // Rule 6 v4.6: figures from different periods combined in one calculation
  // (Derek 6:08: 25% two years ago × 58% today). LOG-ONLY until a batch
  // measures the false-positive rate; the prompt carries the rule.
  const revealedIdsNow = new Set(Object.keys(revealedValues(ledger)));
  const timeframeMismatches = checkTimeframes(spokenText, caseData.dataLedger.filter(d => revealedIdsNow.has(d.id)));
  checks.record('timeframe', timeframeMismatches.length > 0, 'cross-period arithmetic (log only)', { mismatches: timeframeMismatches });
  if (timeframeMismatches.length > 0) console.warn('[runner] timeframe mismatch (log only):', JSON.stringify(timeframeMismatches));

  // Rule 2 v4.5: no doubt probe on a verified figure; no explain probe where
  // the work was shown or already asked once. Withheld like provenance.
  const probeGuard = withholdProbesOnVerified(spokenText, {
    verified: [...verifiedNow, ...verifiedPrev],
    alreadyProbed: explainProbedBefore,
    // A unit-check firing counts as a flag (batch 5: Derek's real "25 points
    // of revenue" error lost its "Points of what?" to a verified figure
    // elsewhere in the same message).
    flaggedThisTurn: recomputeFlags.length > 0 || unitCheckHint !== undefined,
  });
  checks.record('probe_guard', probeGuard.withheld.length > 0, 'probe on a verified figure withheld', { withheld: probeGuard.withheld });
  if (probeGuard.withheld.length > 0) {
    console.warn('[runner] withheld probes on verified figures:', JSON.stringify(probeGuard.withheld));
    spokenText = probeGuard.text;
  }

  const auditResult = auditTurn(spokenText, revealedValues(ledger), allowedTexts.join(' '));
  const styleResult = auditTurnStyle(spokenText, {
    lengthExempt: newReveals.length > 0 || exhibit !== undefined || stallDecision.rung === 3,
  });
  checks.record('style', !styleResult.passed || styleResult.flags.length > 0, 'style audit flagged (log only)', { ...styleResult });
  if (!styleResult.passed) console.warn('[runner] style audit failed:', JSON.stringify(styleResult));
  if (styleResult.flags.length > 0) console.warn('[runner] style QA flag (soft):', JSON.stringify(styleResult.flags));

  // Rule 13 v4.5: a rung counts only when the sent turn carries it. Decided on
  // the final text, before persistence, so the ladder state and the assist
  // log reflect what the candidate actually received.
  let stallState = stallDecision.state;
  let rungDeliverySpan: string | null = null;
  if (stallDecision.intervene && stallDecision.rung) {
    const delivery = classifyRungDelivery(stallDecision.rung, spokenText, {
      dataReleased: newReveals.length + exhibitReveals.length > 0,
      exhibitShown: exhibit !== undefined,
      replacedByScript: spokenClose.action === 'replaced' || graceAskFiredThisTurn,
    });
    rungDeliverySpan = delivery?.span ?? null;
    // Round-3 fix 6: a delivery that rests only on "the turn asked a
    // question" is confirmed by a small model check; it fails open.
    if (delivery?.basis === 'question') {
      const verdict = await checkHintDelivered({
        rung: stallDecision.rung, candidateText, interviewerText: spokenText,
        onUsage: u => { void logEvent('llm_usage', { ...u }, { sessionId, userId }); },
      });
      checks.record('hint_check', verdict !== null && !verdict.hint, 'model check: the question was not a hint', { verdict, span: delivery.span });
      if (verdict && !verdict.hint) rungDeliverySpan = null;
    }
    if (rungDeliverySpan === null) stallState = revertUndeliveredRung(stallState, priorStall);
    checks.act('rung_delivery', rungDeliverySpan ? 'rung delivered' : 'rung not delivered — not an assist; ladder not advanced', {
      rung: stallDecision.rung, span: rungDeliverySpan,
    });
  } else {
    checks.skip('rung_delivery', 'no rung decided this turn');
  }

  // Never send a blank turn mid-case (batch 5: two runs crashed on one). A
  // neutral acknowledgment (Rule 1) keeps the floor with the candidate.
  if (!ended && !spokenText.trim()) {
    checks.act('empty_turn', 'blank interviewer turn replaced');
    console.warn('[runner] blank interviewer turn — neutral acknowledgment sent');
    spokenText = 'Go on.';
  }

  const persistStartMs = Date.now();
  // Persist. These are independent writes the next turn and scoring read, so
  // they are awaited, but together (they ran one after another).
  const underTimePressure = isUnderTimePressure(elapsedMs, TOTAL_CASE_MS);
  const loadShedLoggedThisTurn = underTimePressure && !flags.loadShedLogged;
  const advancedThisTurn = nextPhaseValue !== currentPhase;
  const revealedRowsNew = [
    ...newReveals.map(itemId => ({ sessionId, ledgerItemId: itemId, revealedAtMs: now })),
    ...exhibitReveals.map(itemId => ({ sessionId, ledgerItemId: itemId, revealedAtMs: now })),
  ];
  await Promise.all([
    db.insert(sessionTurns).values([
      { sessionId, turnIndex: nextTurnIndex, role: 'candidate', text: candidateText, timestampMs: now },
      { sessionId, turnIndex: nextTurnIndex + 1, role: 'interviewer', text: spokenText, timestampMs: Date.now(), latencyMs: modelLatencyMs },
    ]),
    writeChecks(),
    // Events the Plan stage decided (session_resumed, recompute_flag, C4/C2).
    ctx.events.length > 0 ? db.insert(sessionEvents).values(pendingEventRows(ctx, ctx.events)) : Promise.resolve(),
    revealedRowsNew.length > 0 ? db.insert(revealedData).values(revealedRowsNew) : Promise.resolve(),
    exhibit ? db.insert(exhibitsShown).values({ sessionId, exhibitId: exhibit.id, shownAtMs: now }) : Promise.resolve(),
    // Rule 13: log the assist event (scoring input — "assisted ≠ covered") —
    // only a delivered rung is an assist; an undelivered decision is logged
    // apart and never reaches the judge (v4.5).
    stallDecision.intervene && stallDecision.rung
      ? logSessionEvent(sessionId, 'intervention', rungDeliverySpan ? rungName(stallDecision.rung) : 'rung_not_delivered', nextTurnIndex, currentPhase, {
        level: stallDecision.rung,
        firedOn: stallDecision.firedOn ?? [],
        span: rungDeliverySpan,
      })
      : Promise.resolve(),
    stallDecision.synthesisUnresolved
      ? logSessionEvent(sessionId, 'intervention', 'synthesis_unresolved', nextTurnIndex, currentPhase, {})
      : Promise.resolve(),
    // Rule 15: record when the interview entered load-shedding, once, so the
    // judge can attribute thin later-stage coverage to time pressure rather than
    // to the candidate (deterministic coverageCaveat feed).
    loadShedLoggedThisTurn
      ? logSessionEvent(sessionId, 'intervention', 'load_shed', nextTurnIndex, currentPhase, {
        elapsedMs, remainingMs: TOTAL_CASE_MS - elapsedMs,
      })
      : Promise.resolve(),
    db.update(sessions)
      .set({
        phase: ended ? 'SCORING' : nextPhaseValue,
        status: ended ? 'completed' : 'active',
        completedAt: ended ? new Date() : undefined,
        phaseStartedAt: advancedThisTurn ? new Date() : undefined,
        flagsJsonb: {
          ...flags,
          conduct,
          stall: stallState,
          advancedLastTurn: advancedThisTurn,
          timeWarningFired: Boolean(flags.timeWarningFired) || timeWarningFiredThisTurn,
          graceAskFired: Boolean(flags.graceAskFired) || graceAskFiredThisTurn,
          recomputeAttempts,
          lastVerified: verifiedNow,
          explainProbed: [...explainProbedBefore, ...probeGuard.explainProbed],
          loadShedLogged: Boolean(flags.loadShedLogged) || loadShedLoggedThisTurn,
          pendingOffer: offeredThisTurn,
        },
      })
      .where(eq(sessions.id, sessionId)),
  ]);

  // PRD §13: token usage (feeds $/completed-case, computed at analysis time
  // from tokens — pricing lives out-of-band) and product analytics, after the
  // response.
  if (turnUsage.apiCalls > 0) {
    later(() => logEvent('llm_usage', { component: 'interviewer', ...turnUsage }, { sessionId, userId }));
  }
  for (const itemId of newReveals) {
    later(() => logEvent('data_revealed', { itemId, phase: currentPhase }, { sessionId, userId }));
  }
  for (const itemId of exhibitReveals) {
    later(() => logEvent('data_revealed', { itemId, phase: currentPhase, via: 'exhibit' }, { sessionId, userId }));
  }
  if (exhibit) {
    const exhibitId = exhibit.id;
    later(() => logEvent('exhibit_shown', { exhibitId, phase: currentPhase }, { sessionId, userId }));
  }
  if (advancedThisTurn) {
    later(() => logEvent('phase_transition', { from: currentPhase, to: nextPhaseValue }, { sessionId, userId }));
  }
  if (ended) {
    later(() => logEvent('case_complete', { phase: currentPhase, elapsedMs }, { sessionId, userId }));
  }

  // PRD §13: per-turn latency. latencyMs stays the model call (comparable with
  // earlier batches); the rest splits the turn around it.
  const turnEndMs = Date.now();
  later(() => logEvent('turn_latency', {
    turnIndex: nextTurnIndex + 1,
    latencyMs: modelLatencyMs,
    distressWaitMs,
    apiCalls: turnUsage.apiCalls,
    totalMs: turnEndMs - turnStartMs,
    preModelMs: modelCallStart - turnStartMs,
    postModelMs: persistStartMs - modelCallStart - modelLatencyMs,
    persistMs: turnEndMs - persistStartMs,
    phase: currentPhase,
  }, { sessionId, userId }));

  return {
    interviewerText: spokenText,
    exhibit,
    phase: ended ? 'SCORING' : nextPhaseValue,
    ended,
    auditPassed: auditResult.passed,
    dataRequestsClassified,
  };
}

// Text-mode silence (lib/orchestrator/silence.ts): the channel reports that the
// candidate has been silent `silentMs` since the interviewer's last turn. No
// candidate turn is persisted and no model is called — the check-in and the
// pause line are scripted. Idempotent per silence: repeated ticks are no-ops.
export async function runSilence(sessionId: string, silentMs: number): Promise<SilenceResult> {
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  const phase = session.phase as Phase;
  if (session.status !== 'active') return { action: 'none', interviewerText: '', phase, ended: true };

  const flags = session.flagsJsonb as Record<string, unknown>;
  const conduct = (flags.conduct as ConductFlags | undefined) ?? {};
  // A pending C5 offer is waiting on the candidate; don't talk over it.
  if (conduct.distressOffered) return { action: 'none', interviewerText: '', phase, ended: false };

  const now = Date.now();
  const turnRows = await db.query.sessionTurns.findMany({
    where: eq(sessionTurns.sessionId, sessionId),
    orderBy: (t, { asc }) => [asc(t.turnIndex)],
  });
  const lastTurnMs = turnRows.at(-1)?.timestampMs ?? session.startedAt.getTime();
  const decision = evaluateSilence(silentMs, now, (flags.silence as SilenceState | undefined) ?? INITIAL_SILENCE_STATE, lastTurnMs);
  if (decision.action === 'none') return { action: 'none', interviewerText: '', phase, ended: false };

  const nextTurnIndex = turnRows.length;
  const lastInterviewer = turnRows.filter(t => t.role === 'interviewer').at(-1)?.text ?? null;

  const priorStall = (flags.stall as StallState | undefined) ?? INITIAL_STALL_STATE;

  if (decision.action === 'expire') {
    // Rule 19: a pause that is never resumed is abandoned — excluded, not failed.
    await db.insert(sessionTurns).values({ sessionId, turnIndex: nextTurnIndex, role: 'interviewer', text: SILENCE_PAUSE_EXPIRED, timestampMs: now });
    await logSessionEvent(sessionId, 'intervention', 'technical_pause_expired', nextTurnIndex, phase, { silentMs });
    await logEvent('case_abandoned', { reason: 'silence_pause_expired', phase }, { sessionId, userId: session.userId });
    await db.update(sessions).set({
      status: 'abandoned',
      completedAt: new Date(),
      flagsJsonb: { ...flags, silence: decision.state },
    }).where(eq(sessions.id, sessionId));
    return { action: 'expire', interviewerText: SILENCE_PAUSE_EXPIRED, phase, ended: true, scoringSuppressed: true };
  }

  const interviewerText = decision.action === 'check_in' ? checkInText(lastInterviewer) : pauseText(decision.state.pauseLimitMs ?? 0);

  await db.insert(sessionTurns).values({ sessionId, turnIndex: nextTurnIndex, role: 'interviewer', text: interviewerText, timestampMs: now });
  // Not an assist: lib/scoring/assists.ts only counts ladder rungs.
  await logSessionEvent(sessionId, 'intervention', decision.action === 'check_in' ? 'silence_check_in' : 'technical_pause', nextTurnIndex, phase, {
    silentMs, silenceStartedAtMs: decision.state.silenceStartedAtMs, pauseLimitMs: decision.state.pauseLimitMs,
  });
  if (decision.action === 'pause') {
    await logEvent('session_paused', { reason: 'silence', silentMs, pauseLimitMs: decision.state.pauseLimitMs, phase }, { sessionId, userId: session.userId });
  }
  await db.update(sessions).set({
    flagsJsonb: {
      ...flags,
      silence: decision.state,
      // Rule 13: silence past tolerance is one no-progress turn (check-in only).
      stall: decision.action === 'check_in' ? recordSilenceStall(priorStall) : priorStall,
    },
  }).where(eq(sessions.id, sessionId));

  return { action: decision.action, interviewerText, phase, ended: false };
}
