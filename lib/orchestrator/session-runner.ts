import { TurnTimer } from './turn-timer';
import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, exhibitsShown, sessionEvents } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { recordSilenceStall, INITIAL_STALL_STATE, type StallState } from './stall';
import {
  evaluateSilence, checkInText, pauseText, INITIAL_SILENCE_STATE, type SilenceAction, type SilenceState,
} from './silence';
import { isDistressVerdict, type DistressVerdict } from './distress';
import { classifyDataRequests, type DetectedDataRequest } from './data-requests';
import { logEvent, inDraftScope } from '@/lib/analytics';
import type { Phase } from './state-machine';
import { streamInterviewerTurn } from '@/lib/agent/interviewer';
import { createInterviewerModel } from '@/lib/agent/models/factory';
import { SILENCE_PAUSE_EXPIRED, CLOSE_SCRIPTS, GRACE_ASK_SCRIPTS, TIME_WARNING_SCRIPTS, pickScript } from '@/lib/agent/prompts/scripts';
import { planTurn, scriptedOffer, type ModelPlan, type TurnReads } from './plan-turn';
import { planFingerprint, type DraftGate } from './speculation';
import { promptContextFor } from './prompt-context';
import { streamTurnSegments } from './stream-turn';
import { settleTurn, commitScripted, logSessionEvent, type TurnUsage, type ModelOutcome } from './settle-turn';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { isUsefulSegment, type ConductFlags, type ScriptedPlan, type SegmentSink, type TurnResult } from './turn-types';

// The turn coordinator (specs 2026-10-05-streaming-turn, 2026-10-06
// plan-owns-decisions): reads → Plan (plan-turn.ts, which also decides the
// turn kind) → the model's streamed turn or a code-written one → Settle
// (settle-turn.ts) → one commit. runSilence is separate.

export type { ExhibitDisplay, TurnResult } from './turn-types';

const model = createInterviewerModel();

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
  // Where the interviewer's turn is delivered as it streams (voice: TTS).
  // Resolves when a segment was delivered, rejects when it was not (D3).
  // Text mode passes none: the TurnResult carries the whole turn.
  onSegment?: SegmentSink;
  // Voice: a backchannel ("Mm-hm.") already spoken at end-of-turn
  // (lib/voice/acknowledge.ts). The model is told not to acknowledge again,
  // and the saved interviewer line starts with it.
  acknowledged?: string;
  // Speculative draft (speculative-turn.ts): every delivery and write waits on
  // the gate; cancelled, they throw DraftCancelled and deferred work is dropped.
  gate?: DraftGate;
  // The plan's fingerprint (speculation.ts), as soon as Plan has run.
  onPlanFingerprint?: (fingerprint: string) => void;
};

export async function runTurn(sessionId: string, candidateText: string, opts: RunTurnOptions = {}): Promise<TurnResult> {
  const deferred: (() => Promise<void>)[] = [];
  const { gate } = opts;
  try {
    const run = () => runTurnBody(sessionId, candidateText, task => { deferred.push(task); }, opts);
    return await (gate ? inDraftScope(gate.id, run) : run());
  } finally {
    // A draft that was never accepted leaves nothing behind.
    if (!gate || gate.accepted) {
      if (opts.defer) for (const task of deferred) opts.defer(task);
      else await Promise.allSettled(deferred.map(task => task()));
    }
  }
}

// The five rows a turn reads, all by session id.
async function readTurn(sessionId: string): Promise<TurnReads> {
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
  return { session, turnRows, exhibitRows, revealedRows, dataRequestEventRows };
}

// The fingerprint a turn on this text would plan now — no classifier call,
// nothing written. A speculative draft is accepted only if it still matches.
export async function planFingerprintNow(sessionId: string, candidateText: string, acknowledged?: string): Promise<string> {
  const now = Date.now();
  return planFingerprint(planTurn(await readTurn(sessionId), candidateText, {
    sessionId, now, turnStartMs: now, later: () => {}, acknowledged, classify: false,
  }));
}

async function runTurnBody(
  sessionId: string, candidateText: string, later: (task: () => Promise<void>) => void, opts: RunTurnOptions,
): Promise<TurnResult> {
  const { acknowledged, gate } = opts;
  // A draft's segments wait for acceptance: a resolved buffer is not delivery.
  const sink: SegmentSink | undefined = opts.onSegment && gate
    ? async seg => { await gate.wait(); await opts.onSegment!(seg); }
    : opts.onSegment;
  const commit = async (p: ScriptedPlan) => { await gate?.wait(); return commitScripted(p); };
  // Full-turn timing (latency plan step 1): the model call alone was ~1.9s of
  // a ~2.2s turn in batches 7–8, but the writes after the interviewer row were
  // never timed.
  const turnStartMs = Date.now();
  const timer = new TurnTimer(turnStartMs);
  // Every read this turn needs takes only the session id: issued together.
  const reads = await readTurn(sessionId);
  timer.mark('reads_done');

  // Plan (plan-turn.ts): everything decided before the model call, no writes.
  const plan = planTurn(reads, candidateText, {
    sessionId, now: Date.now(), turnStartMs, later, acknowledged,
  });
  timer.mark('plan_done');
  opts.onPlanFingerprint?.(planFingerprint(plan));
  if (plan.kind === 'scripted') {
    if (sink && plan.interviewerText) await sink({ text: plan.interviewerText, revealIds: [], kind: 'scripted' }).catch(() => {});
    return commit(plan);
  }

  const { ctx, state } = plan;
  const { currentPhase, checks, userId } = ctx;
  const { stallDecision } = state;
  // The check Plan started beside the model call: when it resolved.
  timer.watch('distress_verdict', state.distress);

  console.log('[runner] phase:', currentPhase, 'kind:', state.kind, 'stall rung:', stallDecision.intervene ? stallDecision.rung : 'none');
  // PRD §13: per-turn latency + token usage. A regeneration makes two API
  // calls — onUsage fires per call, so sum here.
  const turnUsage: TurnUsage = { model: '', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
  // Delivery (D3): the caller's sink, wrapped to time the first segment and
  // the first useful one (past "say"), and note an exhibit already on screen.
  let firstSegmentAt: number | null = null;
  let exhibitDelivered = false;
  const deliver: SegmentSink = async seg => {
    await (sink ?? (async () => {}))(seg);
    firstSegmentAt ??= Date.now();
    timer.mark('first_delivered');
    if (isUsefulSegment(seg)) timer.mark('first_useful_delivered');
    if (seg.exhibitId) exhibitDelivered = true;
  };
  const recordDistress = (distress: DistressVerdict | null) => {
    if (state.repliedToDistressOffer) checks.skip('conduct_model', 'reply to a declined pause offer');
    else if (distress === null) checks.skip('conduct_model', 'classifier failed — regex floor stands');
    else checks.record('conduct_model', isDistressVerdict(distress), `C5 by model: ${distress.label}`, { ...distress });
  };
  const offerPause = async (verdict: DistressVerdict) => {
    console.warn('[runner] C5 by the model layer — turn discarded:', JSON.stringify(verdict));
    if (turnUsage.apiCalls > 0) {
      later(() => logEvent('llm_usage', { component: 'interviewer', ...turnUsage, discarded: true }, { sessionId, userId }));
    }
    const offer = scriptedOffer(plan, verdict.label === 'risk_to_self', { reason: verdict.reason, label: verdict.label, layer: 'model' });
    await deliver({ text: offer.interviewerText, revealIds: [], kind: 'scripted' }).catch(() => {});
    return commit(offer);
  };

  let out: ModelOutcome;
  let streamedCount = 0;
  let deliveredRevealIds = new Set<string>();
  const modelCallStart = Date.now();

  if (CODE_WRITTEN_KINDS.has(state.kind)) {
    // Close, grace ask, time warning, rung 1 (plan-turn.ts): written by code.
    // The message's data requests are answered first, from the synchronous
    // classification (today's ask-turn behaviour); the distress gate still
    // applies.
    const [distress, detected] = await timer.time('code_written_checks', Promise.all([
      state.distress,
      classifyDataRequests({
        candidateText, interviewerText: null, catalog: state.catalog,
        onUsage: u => { void logEvent('llm_usage', { ...u }, { sessionId, userId }); },
      }),
    ]));
    recordDistress(distress);
    if (isDistressVerdict(distress)) return offerPause(distress);
    out = {
      turn: codeWrittenTurn(plan, detected), validation: null, modelCallStart, modelLatencyMs: 0,
      distressWaitMs: 0, turnUsage, delivered: [], undeliveredRevealIds: [], requestsClassified: detected !== null,
    };
  } else {
    const isDelivered = { value: false };
    const events = streamInterviewerTurn({
      model,
      candidateText,
      history: state.history,
      phase: currentPhase,
      canRegenerate: () => !isDelivered.value,
      onMark: name => timer.mark(name),
      requireRequests: state.requestCues.length > 0,
      onRequestGuard: r => (state.requestGuardRegenerated = r.regenerated, checks.record('request_guard', r.regenerated,
        'explicit ask, no request declared — turn written again', { cues: state.requestCues })),
      onValidation: v => {
        checks.record('model_turn_validation', v.unknownIds.length > 0 || v.retried || v.unparsed || v.emptyTurn || v.refused,
          v.retried ? 'model reply regenerated' : 'model reply unusable', { ...v });
      },
      onUsage: u => {
        turnUsage.model = u.model;
        turnUsage.inputTokens += u.inputTokens;
        turnUsage.outputTokens += u.outputTokens;
        turnUsage.cacheReadTokens += u.cacheReadTokens ?? 0;
        turnUsage.cacheWriteTokens += u.cacheWriteTokens ?? 0;
        turnUsage.apiCalls += 1;
      },
      promptCtx: promptContextFor(plan),
    });
    // Stream (stream-turn.ts): segments go out as they pass, after the
    // distress verdict; the rest of the turn is Settle's.
    const streamed = await streamTurnSegments(events, plan, deliver, { isDelivered, timer });
    // Interviewer latency is the model call alone (the whole stream); the wait
    // on the distress verdict past it is logged apart (batch 4 conflated them).
    const modelLatencyMs = streamed.modelDoneAt - modelCallStart;
    recordDistress(await state.distress);
    if (streamed.kind === 'distress') return offerPause(streamed.verdict);
    checks.record('stream_buffer_switch', streamed.bufferSwitch !== null,
      `streaming stopped: ${streamed.bufferSwitch}`, { reason: streamed.bufferSwitch, delivered: streamed.delivered.length });
    if (streamed.bufferSwitch) console.log('[runner] streaming stopped:', streamed.bufferSwitch);
    streamedCount = streamed.delivered.length;
    deliveredRevealIds = new Set(streamed.deliveredRevealIds);
    out = {
      turn: streamed.turn, validation: streamed.validation, modelCallStart, modelLatencyMs, distressWaitMs: streamed.distressWaitMs,
      turnUsage, delivered: streamed.delivered, undeliveredRevealIds: [...streamed.undeliveredRevealIds],
    };
  }

  // Settle (settle-turn.ts): compose, book, commit; only the text after what
  // was already delivered goes out.
  timer.mark('settle_start');
  const settled = await settleTurn(plan, { ...out, timer });
  timer.mark('settle_composed');
  const tailReveals = settled.newReveals.filter(id => !deliveredRevealIds.has(id));
  const tailExhibit = !exhibitDelivered ? settled.exhibitId : undefined;
  if (settled.tail || tailReveals.length > 0 || tailExhibit) {
    try {
      await deliver({ text: settled.tail, revealIds: tailReveals, exhibitId: tailExhibit, kind: 'tail' });
      timer.mark('tail_delivered');
    } catch {
      out.undeliveredRevealIds?.push(...tailReveals); // D3: not delivered, not booked
    }
  }
  await gate?.wait();
  await settled.persist({
    firstSegmentMs: firstSegmentAt === null ? null : firstSegmentAt - ctx.turnStartMs,
    streamed: streamedCount > 0,
  });
  return settled.result;
}

const CODE_WRITTEN_KINDS = new Set(['close', 'grace_ask', 'time_warning', 'rung1']);

// A code-written turn as a turn of the interviewer's shape: the message's data
// requests (answered by Settle's data line) and the scripted line.
function codeWrittenTurn(plan: ModelPlan, detected: DetectedDataRequest[] | null): ModelTurn {
  const { ctx, state } = plan;
  const seed = `${ctx.sessionId}:${ctx.nextTurnIndex}`;
  const requests = (detected ?? [])
    .filter(r => r.explicit) // a code-written turn answers asks, it doesn't offer
    .map(r => ({ what: r.what, itemIds: r.ledgerItemIds, explicit: true, respond: 'release' as const }));
  const question = state.kind === 'close' ? pickScript(CLOSE_SCRIPTS, seed)
    : state.kind === 'grace_ask' ? pickScript(GRACE_ASK_SCRIPTS, seed)
      : state.kind === 'time_warning' ? pickScript(TIME_WARNING_SCRIPTS, seed)
        : `Take your time. The question on the table is ${restate(state.lastQuestion ?? '')}`;
  return { move: 'other', requests, exhibit: null, rescueItem: null, say: '', question };
}

// "Which line moved most?" → "which line moved most?" (and no doubled lead-in).
function restate(q: string): string {
  const core = q.trim().replace(/^(?:take your time\.\s*)?the question on the table(?: is|:)\s*/i, '');
  return core.charAt(0).toLowerCase() + core.slice(1);
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

  const storedQuestion = typeof flags.lastQuestion === 'string' ? flags.lastQuestion : null;
  const interviewerText = decision.action === 'check_in' ? checkInText(lastInterviewer, storedQuestion) : pauseText(decision.state.pauseLimitMs ?? 0);

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
