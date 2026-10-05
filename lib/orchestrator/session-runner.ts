import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, exhibitsShown, sessionEvents } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { revealedValues, unrevealedItems } from './data-ledger';
import { recordSilenceStall, INITIAL_STALL_STATE, type StallState } from './stall';
import {
  evaluateSilence, checkInText, pauseText, INITIAL_SILENCE_STATE, type SilenceAction, type SilenceState,
} from './silence';
import { isDistressVerdict } from './distress';
import { logEvent } from '@/lib/analytics';
import { TOTAL_CASE_MS, type Phase } from './state-machine';
import { runInterviewerTurn } from '@/lib/agent/interviewer';
import { AnthropicInterviewerModel } from '@/lib/agent/models/anthropic';
import { SILENCE_PAUSE_EXPIRED } from '@/lib/agent/prompts/scripts';
import { planTurn, scriptedOffer } from './plan-turn';
import { settleTurn, commitScripted, logSessionEvent, type TurnUsage } from './settle-turn';
import type { ConductFlags, TurnResult } from './turn-types';

// The turn coordinator (spec 2026-10-05-streaming-turn): reads → Plan
// (plan-turn.ts) → model → Settle (settle-turn.ts). runSilence is separate.

export type { ExhibitDisplay, TurnResult } from './turn-types';

const model = new AnthropicInterviewerModel();

export type SilenceResult = {
  action: SilenceAction;
  interviewerText: string; // '' when nothing is said
  phase: Phase;
  ended: boolean;
  scoringSuppressed?: boolean; // set when an expired pause abandoned the session
};

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
  const { currentPhase, flags, checks, userId } = ctx;
  const { caseData, ledger, stallDecision } = state;

  console.log('[runner] phase:', currentPhase, 'stall rung:', stallDecision.intervene ? stallDecision.rung : 'none');
  // PRD §13: per-turn latency + token usage. The correction loop can make
  // multiple API calls per turn — onUsage fires per call, so sum here.
  const turnUsage: TurnUsage = { model: '', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
  const modelCallStart = Date.now();
  const actions = await runInterviewerTurn({
    model,
    candidateText,
    history: state.history,
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
      exhibits: caseData.exhibits.map(e => ({ id: e.id, title: e.title, shown: state.shownExhibitIds.has(e.id) })),
      advancedLastTurn: Boolean(flags.advancedLastTurn),
      elapsedMs: state.elapsedMs,
      totalMs: TOTAL_CASE_MS,
      phaseBudgetsMs: state.phaseBudgetsMs,
      recomputeHint: [state.recomputeHint, state.verifiedHint].filter(Boolean).join('\n\n') || undefined,
      unitCheckHint: state.unitCheckHint,
      stallGuidance: stallDecision.guidance,
      coverageSteer: state.coverageSteer,
      mayEnd: state.mayEnd,
      openDataRequestsHint: state.openDataRequestsHint,
      conductRedirectHint: state.conductRedirectHint,
    },
  });
  // Interviewer latency is the model call alone; the wait on the parallel
  // distress check is logged apart (batch 4 conflated them).
  const modelLatencyMs = Date.now() - modelCallStart;
  const distress = await state.distress;
  const distressWaitMs = Date.now() - modelCallStart - modelLatencyMs;
  if (state.repliedToDistressOffer) checks.skip('conduct_model', 'reply to a declined pause offer');
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

  // Settle (settle-turn.ts): today's post-model pipeline, then one commit.
  const settled = await settleTurn(plan, { actions, modelCallStart, modelLatencyMs, distressWaitMs, turnUsage, delivered: [] });
  await settled.persist({ firstSegmentMs: null, streamed: false });
  return settled.result;
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
