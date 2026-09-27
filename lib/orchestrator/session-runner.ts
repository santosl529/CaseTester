import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, exhibitsShown, sessionEvents } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import {
  classifyDataRequests, formatOpenRequestsHint, planForcedReleases, composeForcedReleaseTurn, dropTrailingQuestions,
} from './data-requests';
import { logDataRequestClassification } from './data-request-log';
import { summarizeDataRequests } from '@/lib/scoring/data-coverage';
import { getCaseById } from '@/lib/cases/loader';
import {
  createLedger, canReveal, reveal, resolveItemId, revealedValues, unrevealedItems,
  resolveItemFromText, promisesReveal, markExhibitReveals,
} from './data-ledger';
import { auditTurn, auditTurnStyle, stripMetaLeak, stripFabricatedTurn } from './audit';
import { auditNumericProvenance, changeFigures } from './numeric-provenance';
import { checkRecomputeForTurn, formatRecomputeHint } from './recompute';
import { detectNestedPercentConversion, formatUnitCheckHint } from './unit-check';
import { resolveExhibit, promisesExhibit } from './exhibits';
import { resolvePhaseBudgets, resolveTimeWarningMs, isUnderTimePressure } from './pacing';
import { canEndCase, formatCoverageSteer, type CoverageScores } from '@/lib/scoring/coverage';
import { evaluateStall, recordSilenceStall, rungName, INITIAL_STALL_STATE, type StallState } from './stall';
import {
  evaluateSilence, resumeOnCandidateTurn, effectiveElapsedMs, checkInText, pauseText, INITIAL_SILENCE_STATE, type SilenceAction, type SilenceState,
} from './silence';
import { classifyConduct, isPauseAccepted } from './conduct';
import { logEvent } from '@/lib/analytics';
import { nextPhase, TOTAL_CASE_MS, type Phase } from './state-machine';
import { inferPhaseRepair } from './phase-repair';
import { resolveSpokenClose } from './spoken-close';
import { runInterviewerTurn } from '@/lib/agent/interviewer';
import { AnthropicInterviewerModel } from '@/lib/agent/models/anthropic';
import {
  TIME_WARNING_SCRIPTS, CLOSE_SCRIPTS, REVEAL_REFUSAL_SCRIPTS, EXHIBIT_REFUSAL_SCRIPTS, FORCED_RELEASE_LEADINS,
  pickScript, alreadySignaledTimeOrRec, hasCloseCue,
  CONDUCT_WARNING, CONDUCT_TERMINATION, CONDUCT_REDIRECT, DISTRESS_OFFER, DISTRESS_CLOSE, SILENCE_PAUSE_EXPIRED,
} from '@/lib/agent/prompts/scripts';

const model = new AnthropicInterviewerModel();

export type ExhibitDisplay = {
  id: string;
  title: string;
  chartType: string;
  data: Record<string, unknown>[];
};

export type TurnResult = {
  interviewerText: string;
  exhibit?: ExhibitDisplay;
  phase: Phase;
  ended: boolean;
  auditPassed: boolean;
  // Set when the session ended WITHOUT producing a score (conduct termination
  // or C5-accepted abandonment). The client must not trigger scoring.
  scoringSuppressed?: boolean;
  // Set when this turn's exchange was already classified for data requests
  // synchronously (recommendation-ask turns) — the turn route's background
  // pass must skip it, or the rows would be logged twice.
  dataRequestsClassified?: boolean;
};

type ConductFlags = { warnings?: number; distressOffered?: boolean; category?: string };

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

export async function runTurn(sessionId: string, candidateText: string): Promise<TurnResult> {
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const currentPhase = session.phase as Phase;

  // Rule 18: post-termination (and post-abandonment/-completion) messages get
  // no response — do not re-invoke the model or mutate a finished session.
  if (session.status !== 'active') {
    return {
      interviewerText: '',
      phase: currentPhase,
      ended: true,
      auditPassed: true,
      scoringSuppressed: session.status !== 'completed',
    };
  }

  const caseData = getCaseById(session.caseId);
  const turnRows = await db.query.sessionTurns.findMany({
    where: eq(sessionTurns.sessionId, sessionId),
    orderBy: (t, { asc }) => [asc(t.turnIndex)],
  });
  const flags = session.flagsJsonb as Record<string, unknown>;
  const conduct = (flags.conduct as ConductFlags | undefined) ?? {};
  const now = Date.now();
  const nextTurnIndex = turnRows.length;

  // Any candidate message ends a silence (Rules 16/19): clear the check-in and
  // close an open technical pause, banking it so it is excluded from case time.
  // Set on flags before any branch below spreads flags into its update.
  const resumed = resumeOnCandidateTurn((flags.silence as SilenceState | undefined) ?? INITIAL_SILENCE_STATE, now);
  flags.silence = resumed.state;
  if (resumed.resumedAfterMs !== null) {
    await logSessionEvent(sessionId, 'intervention', 'session_resumed', nextTurnIndex, currentPhase, { pausedMs: resumed.resumedAfterMs });
    await logEvent('session_resumed', { pausedMs: resumed.resumedAfterMs, phase: currentPhase }, { sessionId, userId: session.userId });
  }

  // Helper: persist the candidate turn + a scripted interviewer turn, no model call.
  const persistScriptedPair = async (interviewerText: string) => {
    await db.insert(sessionTurns).values([
      { sessionId, turnIndex: nextTurnIndex, role: 'candidate', text: candidateText, timestampMs: now },
      { sessionId, turnIndex: nextTurnIndex + 1, role: 'interviewer', text: interviewerText, timestampMs: Date.now() },
    ]);
  };

  // ── C5 pause offer: this candidate turn is a reply to a pending offer ──────
  if (conduct.distressOffered) {
    if (isPauseAccepted(candidateText)) {
      await persistScriptedPair(DISTRESS_CLOSE);
      await logSessionEvent(sessionId, 'conduct', 'C5_accept', nextTurnIndex, currentPhase, { reason: 'distress_pause_accepted' });
      await logEvent('case_abandoned', { reason: 'distress_pause_accepted', phase: currentPhase },
        { sessionId, userId: session.userId });
      await db.update(sessions).set({
        status: 'abandoned', // Rule 19: excluded from scoring, NOT failed/incomplete
        completedAt: new Date(),
        flagsJsonb: { ...flags, conduct: { ...conduct, distressOffered: false } },
      }).where(eq(sessions.id, sessionId));
      return { interviewerText: DISTRESS_CLOSE, phase: currentPhase, ended: true, auditPassed: true, scoringSuppressed: true };
    }
    // Declined — clear the offer and fall through to normal processing.
    conduct.distressOffered = false;
  }

  // ── Conduct pre-check (Rule 17) — intercepts before any case rule ─────────
  const assessment = classifyConduct(candidateText, conduct.warnings ?? 0);

  if (assessment.action === 'terminate') {
    await persistScriptedPair(CONDUCT_TERMINATION);
    await logSessionEvent(sessionId, 'conduct', assessment.category, nextTurnIndex, currentPhase, { reason: assessment.reason });
    await logEvent('case_abandoned', { reason: assessment.reason, category: assessment.category, phase: currentPhase },
      { sessionId, userId: session.userId });
    await db.update(sessions).set({
      status: 'terminated', // Rule 18: no score, no debrief
      completedAt: new Date(),
      flagsJsonb: { ...flags, conduct: { ...conduct, category: assessment.category } },
    }).where(eq(sessions.id, sessionId));
    return { interviewerText: CONDUCT_TERMINATION, phase: currentPhase, ended: true, auditPassed: true, scoringSuppressed: true };
  }

  if (assessment.action === 'warn') {
    await persistScriptedPair(CONDUCT_WARNING);
    await logSessionEvent(sessionId, 'conduct', assessment.category, nextTurnIndex, currentPhase, { reason: assessment.reason });
    await db.update(sessions).set({
      flagsJsonb: { ...flags, conduct: { ...conduct, warnings: (conduct.warnings ?? 0) + 1 } },
    }).where(eq(sessions.id, sessionId));
    return { interviewerText: CONDUCT_WARNING, phase: currentPhase, ended: false, auditPassed: true };
  }

  if (assessment.action === 'redirect') {
    await persistScriptedPair(CONDUCT_REDIRECT);
    await logSessionEvent(sessionId, 'conduct', assessment.category, nextTurnIndex, currentPhase, { reason: assessment.reason, text: candidateText });
    await db.update(sessions).set({
      flagsJsonb: { ...flags, conduct },
    }).where(eq(sessions.id, sessionId));
    return { interviewerText: CONDUCT_REDIRECT, phase: currentPhase, ended: false, auditPassed: true };
  }

  if (assessment.action === 'offer_pause') {
    await persistScriptedPair(DISTRESS_OFFER);
    await logSessionEvent(sessionId, 'conduct', assessment.category, nextTurnIndex, currentPhase, { reason: assessment.reason });
    await db.update(sessions).set({
      flagsJsonb: { ...flags, conduct: { ...conduct, distressOffered: true } },
    }).where(eq(sessions.id, sessionId));
    return { interviewerText: DISTRESS_OFFER, phase: currentPhase, ended: false, auditPassed: true };
  }
  // assessment.action === 'ignore' (none / C1): proceed with the normal case turn.

  const revealedRows = await db.query.revealedData.findMany({
    where: eq(revealedData.sessionId, sessionId),
  });

  // Reconstruct ledger state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ledger = createLedger(caseData.dataLedger as any);
  for (const r of revealedRows) {
    try { reveal(ledger, r.ledgerItemId); } catch { /* ignore */ }
  }

  // Rule 11 deferral tracking: ledger data the candidate asked for (logged by
  // earlier turns' background classifier) that is still unreleased. Lags a
  // turn, which is fine for deferrals; the same-turn case is handled at the
  // recommendation ask below.
  const catalog = caseData.dataLedger.map(d => ({ id: d.id, label: d.label }));
  const dataRequestRows = (await db.query.sessionEvents.findMany({
    where: and(eq(sessionEvents.sessionId, sessionId), eq(sessionEvents.category, 'data_request')),
  })).map(r => ({ subtype: r.subtype, turnIndex: r.turnIndex, payloadJsonb: r.payloadJsonb }));
  const openDataRequestsHint = formatOpenRequestsHint(
    summarizeDataRequests(dataRequestRows, catalog, Object.keys(revealedValues(ledger))).requestedUnanswered,
  );

  const elapsedMs = effectiveElapsedMs(session.startedAt.getTime(), now, resumed.state);
  const timeUp = elapsedMs >= TOTAL_CASE_MS;

  // Coverage-gated end (background coverage agent, updated via after() a turn
  // behind). The interviewer may only wrap once every dimension has enough
  // evidence to score — or time is up. Also drives the steer toward undertested
  // areas so the interviewer spends the reclaimed time productively.
  const coverage = (session.coverageJsonb as CoverageScores | null) ?? null;
  const mayEnd = canEndCase({ coverage, elapsedMs, totalMs: TOTAL_CASE_MS, timeUp });
  const coverageSteer = formatCoverageSteer(coverage);

  const phaseBudgetsMs = resolvePhaseBudgets(caseData, TOTAL_CASE_MS);
  const timeWarningMs = resolveTimeWarningMs(caseData);
  const warningThresholdMs = TOTAL_CASE_MS - timeWarningMs;
  const shouldFireTimeWarning = !flags.timeWarningFired && !timeUp && elapsedMs >= warningThresholdMs;

  // Rule 2/14 deterministic recompute backstop (from THIS candidate message).
  const recomputeFlags = checkRecomputeForTurn(candidateText, caseData.mathSteps);
  const recomputeHint = formatRecomputeHint(recomputeFlags);
  const derivedValueTexts = recomputeFlags.map(f => String(f.expected));

  // Rule 2/14: risky nested-percentage conversion in this candidate message →
  // tell the interviewer to probe the units (unit-check.ts).
  const unitCheckHint = detectNestedPercentConversion(candidateText) ? formatUnitCheckHint() : undefined;

  // Rule 13 stall ladder: evaluate BEFORE the model turn so a triggered rung's
  // guidance goes into this turn's prompt.
  const priorStall = (flags.stall as StallState | undefined) ?? INITIAL_STALL_STATE;
  const stallDecision = evaluateStall(candidateText, currentPhase, priorStall);

  const history = turnRows.map(t => ({
    role: (t.role === 'candidate' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: t.text,
  }));

  console.log('[runner] phase:', currentPhase, 'stall rung:', stallDecision.intervene ? stallDecision.rung : 'none');
  // PRD §13: per-turn latency + token usage. The correction loop can make
  // multiple API calls per turn — onUsage fires per call, so sum here.
  const turnUsage = { model: '', inputTokens: 0, outputTokens: 0, apiCalls: 0 };
  const modelCallStart = Date.now();
  const actions = await runInterviewerTurn({
    model,
    candidateText,
    history,
    phase: currentPhase,
    onUsage: u => {
      turnUsage.model = u.model;
      turnUsage.inputTokens += u.inputTokens;
      turnUsage.outputTokens += u.outputTokens;
      turnUsage.apiCalls += 1;
    },
    promptCtx: {
      casePrompt: caseData.prompt,
      currentPhase,
      revealedValues: revealedValues(ledger),
      unrevealedItems: unrevealedItems(ledger),
      exhibits: caseData.exhibits.map(e => ({ id: e.id, title: e.title })),
      advancedLastTurn: Boolean(flags.advancedLastTurn),
      elapsedMs,
      totalMs: TOTAL_CASE_MS,
      phaseBudgetsMs,
      recomputeHint,
      unitCheckHint,
      stallGuidance: stallDecision.guidance,
      coverageSteer,
      mayEnd,
      openDataRequestsHint,
    },
  });
  const modelLatencyMs = Date.now() - modelCallStart;

  // Execute actions
  let spokenText = '';
  let exhibit: ExhibitDisplay | undefined;
  let nextPhaseValue: Phase = currentPhase;
  let ended = false;
  let fabricatedStripped = false;
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
      spokenText += cleaned + ' ';
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
  if (fabricatedStripped) {
    // Nothing real left: a neutral acknowledgment (Rule 1) beats a blank turn.
    if (!spokenText && !ended) spokenText = 'Go on.';
    await logEvent('fabricated_turn_stripped', { phase: currentPhase }, { sessionId, userId: session.userId });
  }

  // Strip any internal planning that leaked into the spoken turn (Rule 1/5).
  // The prompt forbids it; this is the backstop so a model slip like "The
  // candidate has anchored on pricing lag. Let me pressure it once..." never
  // reaches the candidate.
  const metaLeak = stripMetaLeak(spokenText);
  if (metaLeak.strippedSentences.length > 0) {
    console.warn('[runner] stripped meta-leak from interviewer turn:', JSON.stringify(metaLeak.strippedSentences));
    spokenText = metaLeak.cleaned;
  }

  // Rule 12: the words and the state must agree. A close spoken without
  // end_case ends the case if it may end, else is withdrawn (spoken-close.ts).
  const spokenClose = resolveSpokenClose({ spokenText, ended, mayEnd });
  if (spokenClose.action !== 'none') {
    console.warn(`[runner] spoken close without end_case — ${spokenClose.action}`);
    await logEvent('spoken_close_resolved', { action: spokenClose.action, phase: currentPhase }, { sessionId, userId: session.userId });
    ended = spokenClose.ended;
    spokenText = spokenClose.spokenText;
  }

  // Rule 10 / never-promise-without-delivering: if the interviewer's words
  // promise an exhibit but the tool call didn't deliver one, recover it — from
  // an exhibit named in the spoken text, or the sole exhibit if the case has
  // exactly one. Prevents the "here's exhibit A" → "it didn't come through" gap.
  // Skipped on the closing turn: a live run's final debrief mentioned "the
  // exhibit" in retrospective feedback, which isn't a delivery promise, and a
  // case that's ending has no business surfacing new exhibits anyway.
  if (!exhibit && !ended && promisesExhibit(spokenText)) {
    const recovered = resolveExhibit(caseData.exhibits, spokenText)
      ?? (caseData.exhibits.length === 1 ? caseData.exhibits[0] : undefined);
    if (recovered) {
      exhibit = { id: recovered.id, title: recovered.title, chartType: recovered.chartType, data: recovered.data as Record<string, unknown>[] };
      console.warn('[runner] recovered promised-but-undelivered exhibit:', recovered.id);
    } else {
      spokenText = `${spokenText} ${pickScript(EXHIBIT_REFUSAL_SCRIPTS, sessionId)}`;
      console.warn('[runner] interviewer promised an exhibit but none could be delivered — injected refusal');
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
  if (newReveals.length === 0 && !ended && promisesReveal(spokenText)) {
    const recoveredId = resolveItemFromText(ledger, spokenText);
    if (recoveredId) {
      const value = reveal(ledger, recoveredId);
      newReveals.push(recoveredId);
      spokenText = `${spokenText} ${value}`;
      console.warn('[runner] recovered promised-but-undelivered reveal_data:', recoveredId);
    } else {
      spokenText = `${spokenText} ${pickScript(REVEAL_REFUSAL_SCRIPTS, sessionId)}`;
      console.warn('[runner] interviewer promised data with no ledger match — injected refusal');
    }
  }

  if (timeUp) {
    console.log('[runner] time up at', elapsedMs, 'ms — forcing end_case');
    ended = true;
  }

  // Rule 11 + the "time warning + open data request" worked conflict
  // resolution (docs/interviewer-behavior.md v4.1): before ANY recommendation
  // ask goes out — the scripted T−30s warning or the model asking on its own —
  // release open ledger requests first, in the same turn. This candidate
  // message is classified synchronously here because run 4's ignored price
  // request was in the very message the warning answered, which the lagging
  // background log can't see yet. One Haiku call, only on ask turns.
  const warningDue = shouldFireTimeWarning && !ended;
  const modelAsked = !ended && alreadySignaledTimeOrRec(spokenText);
  const forcedReleaseValues: string[] = [];
  let dataRequestsClassified = false;
  if (warningDue || modelAsked) {
    const revealedNow = new Set(Object.keys(revealedValues(ledger)));
    const current = await classifyDataRequests({
      candidateText,
      interviewerText: spokenText,
      catalog,
      onUsage: u => { void logEvent('llm_usage', { ...u }, { sessionId, userId: session.userId }); },
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
    if (forcedIds.length > 0) {
      console.warn('[runner] force-released open data requests before the recommendation ask:', JSON.stringify(forcedIds));
      await logEvent('data_force_released', { itemIds: forcedIds, trigger: warningDue ? 'time_warning' : 'model_ask', phase: currentPhase },
        { sessionId, userId: session.userId });
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
  } else if (forcedReleaseValues.length > 0) {
    spokenText = composeForcedReleaseTurn({ spokenText, releaseValues: forcedReleaseValues, leadIn: forcedLeadIn, isAskSentence: alreadySignaledTimeOrRec });
  }

  // Rule 12: every ending turn carries a close — the script alone if nothing
  // was spoken, appended if the turn said something else but never closed
  // (live run eca39ec7 ended on a bare correction after time-up).
  const usedCloseFallback = ended && spokenText === '';
  if (usedCloseFallback) {
    spokenText = pickScript(CLOSE_SCRIPTS, sessionId);
  } else if (ended && !hasCloseCue(spokenText)) {
    spokenText = `${spokenText} ${pickScript(CLOSE_SCRIPTS, sessionId)}`;
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
      await logEvent('phase_repair', { ...repair }, { sessionId, userId: session.userId });
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
  const auditResult = auditTurn(spokenText, revealedValues(ledger), allowedTexts.join(' '));
  const styleResult = auditTurnStyle(spokenText, {
    lengthExempt: newReveals.length > 0 || exhibit !== undefined || stallDecision.rung === 3,
  });
  if (!styleResult.passed) console.warn('[runner] style audit failed:', JSON.stringify(styleResult));
  if (styleResult.flags.length > 0) console.warn('[runner] style QA flag (soft):', JSON.stringify(styleResult.flags));

  const provenanceResult = auditNumericProvenance(
    spokenText,
    [...revealedTexts, ...allowedTexts],
    { exempt: timeWarningFiredThisTurn || usedCloseFallback },
  );
  const blockedFindings = provenanceResult.findings.filter(f => f.action === 'block');
  if (blockedFindings.length > 0) console.warn('[runner] numeric provenance blocked:', JSON.stringify(blockedFindings));

  // Persist turns
  await db.insert(sessionTurns).values([
    { sessionId, turnIndex: nextTurnIndex, role: 'candidate', text: candidateText, timestampMs: now },
    { sessionId, turnIndex: nextTurnIndex + 1, role: 'interviewer', text: spokenText, timestampMs: Date.now(), latencyMs: modelLatencyMs },
  ]);

  // PRD §13: per-turn latency + token usage (feeds $/completed-case, computed
  // at analysis time from tokens — pricing lives out-of-band).
  await logEvent('turn_latency', { turnIndex: nextTurnIndex + 1, latencyMs: modelLatencyMs, phase: currentPhase },
    { sessionId, userId: session.userId });
  if (turnUsage.apiCalls > 0) {
    await logEvent('llm_usage', { component: 'interviewer', ...turnUsage }, { sessionId, userId: session.userId });
  }

  for (const itemId of newReveals) {
    await db.insert(revealedData).values({ sessionId, ledgerItemId: itemId, revealedAtMs: now });
    await logEvent('data_revealed', { itemId, phase: currentPhase }, { sessionId, userId: session.userId });
  }
  for (const itemId of exhibitReveals) {
    await db.insert(revealedData).values({ sessionId, ledgerItemId: itemId, revealedAtMs: now });
    await logEvent('data_revealed', { itemId, phase: currentPhase, via: 'exhibit' }, { sessionId, userId: session.userId });
  }
  if (exhibit) {
    await db.insert(exhibitsShown).values({ sessionId, exhibitId: exhibit.id, shownAtMs: now });
    await logEvent('exhibit_shown', { exhibitId: exhibit.id, phase: currentPhase }, { sessionId, userId: session.userId });
  }

  // Rule 13: log the assist event (scoring input — "assisted ≠ covered").
  if (stallDecision.intervene && stallDecision.rung) {
    await logSessionEvent(sessionId, 'intervention', rungName(stallDecision.rung), nextTurnIndex, currentPhase, {
      level: stallDecision.rung,
    });
  }
  if (stallDecision.synthesisUnresolved) {
    await logSessionEvent(sessionId, 'intervention', 'synthesis_unresolved', nextTurnIndex, currentPhase, {});
  }

  // Rule 15: record when the interview entered load-shedding, once, so the
  // judge can attribute thin later-stage coverage to time pressure rather than
  // to the candidate (deterministic coverageCaveat feed).
  const underTimePressure = isUnderTimePressure(elapsedMs, TOTAL_CASE_MS);
  const loadShedLoggedThisTurn = underTimePressure && !flags.loadShedLogged;
  if (loadShedLoggedThisTurn) {
    await logSessionEvent(sessionId, 'intervention', 'load_shed', nextTurnIndex, currentPhase, {
      elapsedMs, remainingMs: TOTAL_CASE_MS - elapsedMs,
    });
  }

  const advancedThisTurn = nextPhaseValue !== currentPhase;
  if (advancedThisTurn) {
    await logEvent('phase_transition', { from: currentPhase, to: nextPhaseValue }, { sessionId, userId: session.userId });
  }
  if (ended) {
    await logEvent('case_complete', { phase: currentPhase, elapsedMs }, { sessionId, userId: session.userId });
  }
  await db.update(sessions)
    .set({
      phase: ended ? 'SCORING' : nextPhaseValue,
      status: ended ? 'completed' : 'active',
      completedAt: ended ? new Date() : undefined,
      phaseStartedAt: advancedThisTurn ? new Date() : undefined,
      flagsJsonb: {
        ...flags,
        conduct,
        stall: stallDecision.state,
        advancedLastTurn: advancedThisTurn,
        timeWarningFired: Boolean(flags.timeWarningFired) || timeWarningFiredThisTurn,
        loadShedLogged: Boolean(flags.loadShedLogged) || loadShedLoggedThisTurn,
      },
    })
    .where(eq(sessions.id, sessionId));

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
