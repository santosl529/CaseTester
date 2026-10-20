import { closeWaitLine } from './close-hold';
import { TurnTimer } from './turn-timer';
import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, exhibitsShown, sessionEvents } from '@/db/schema';
import { and, eq, inArray, or } from 'drizzle-orm';
import { recordSilenceStall, INITIAL_STALL_STATE, type StallState } from './stall';
import {
  evaluateSilence, checkInText, pauseText, restateOnTable, INITIAL_SILENCE_STATE, type SilenceAction, type SilenceState,
} from './silence';
import { isDistressVerdict, type DistressVerdict } from './distress';
import { classifyDataRequests, type DetectedDataRequest } from './data-requests';
import { addressedAskSentences, matchAskDetections } from './request-signal';
import { logEvent, inDraftScope } from '@/lib/analytics';
import type { Phase } from './state-machine';
import { streamInterviewerTurn } from '@/lib/agent/interviewer';
import { createInterviewerModel } from '@/lib/agent/models/factory';
import { SILENCE_PAUSE_EXPIRED, closeLine } from '@/lib/agent/prompts/scripts';
import { planTurn, scriptedOffer, scriptedOfferFor, terminationPlanFor, type ModelPlan, type TurnReads } from './plan-turn';
import { conductEnds } from './stream-turn';
import type { ConductModelVerdict } from './conduct-model';
import { planFingerprint, type DraftGate } from './speculation';
import { promptContextFor } from './prompt-context';
import { startProbeAsks } from './turn-data';
import { TurnRecorder, type TurnRecord, type TurnStateBefore } from './turn-record';
import { revealedValues, canReveal } from './data-ledger';
import { nextReadyExhibit } from './data-decisions';
import { brainstormAskLine } from './brainstorm';
import { analysisAskLine } from './spoken-close';
import { streamTurnSegments } from './stream-turn';
import { settleTurn, commitScripted, logSessionEvent, type TurnUsage, type ModelOutcome } from './settle-turn';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { recMathLine } from './recompute';
import { MATH_CHECKER_CATEGORY, type CheckerJob, type CheckerJobResult } from './math-checker-live';
import { VOICE_CHECK_IN } from './voice-check-in';
import { line, phrase, recordPhraseUses, PHRASE_POOLS, type PhraseUses } from './phrasing';
import {
  isUsefulSegment, isCancelledTurn, TurnCancelled,
  type ConductFlags, type HeardReport, type ScriptedPlan, type SegmentSink, type TurnCtx, type TurnResult,
} from './turn-types';

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
  // Evaluation runs (spec 2026-10-09 §2.1): one TurnRecord per turn, after
  // Settle. Production passes none. A throwing callback is logged and ignored.
  onTurnRecord?: (record: TurnRecord) => void;
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
  // Voice: the turn is spoken. The model's "say" loses acknowledgments and
  // echoes without a figure on every voice turn (say-after-ack.ts, 17 Oct).
  voice?: boolean;
  // Speculative draft (speculative-turn.ts): every delivery and write waits on
  // the gate; cancelled, they throw DraftCancelled and deferred work is dropped.
  gate?: DraftGate;
  // The plan's fingerprint (speculation.ts), as soon as Plan has run.
  onPlanFingerprint?: (fingerprint: string) => void;
  // Voice: what the candidate actually got of this turn (spec
  // 2026-10-08-voice-phase-b §5). Called once everything is handed to
  // onSegment and before anything is written — scripted turns too; resolves
  // when playback ended or was cut. A report with nothing heard cancels the
  // turn (TurnCancelled, nothing written). Text mode passes none.
  heard?: () => Promise<HeardReport>;
  // Voice: the turn's TurnTimer marks, just before runTurn returns or throws
  // TurnCancelled (the voice layer's per-turn timing record).
  onTiming?: (marks: Record<string, number>) => void;
};

export async function runTurn(sessionId: string, candidateText: string, opts: RunTurnOptions = {}): Promise<TurnResult> {
  const deferred: (() => Promise<void>)[] = [];
  // Already running (the math checker): never awaited by the turn.
  const background: { job: CheckerJob; phase: Phase }[] = [];
  const { gate } = opts;
  let cancelled = false;
  try {
    const run = () => runTurnBody(sessionId, candidateText, task => { deferred.push(task); }, opts, (job, p) => { background.push({ job, phase: p }); });
    return await (gate ? inDraftScope(gate.id, run) : run());
  } catch (e) {
    if (e instanceof TurnCancelled) cancelled = true;
    throw e;
  } finally {
    // A draft that was never accepted, or a voice turn nobody heard, leaves nothing behind.
    const accepted = !cancelled && (!gate || gate.accepted);
    if (accepted) {
      // The math checker's row is written when its verdict lands — handed to
      // defer (after the response), or left running; the turn never awaits it.
      for (const { job, phase: p } of background) {
        const write = () => job.result.then(r => logCheckerRow(sessionId, job.candidateTurnIndex, p, r));
        if (opts.defer) opts.defer(write);
        else void write().catch(e => console.warn('[runner] math checker row failed (ignored):', e instanceof Error ? e.message : e));
      }
      if (opts.defer) for (const task of deferred) opts.defer(task);
      else await Promise.allSettled(deferred.map(task => task()));
    } else {
      for (const { job } of background) job.abort();
    }
  }
}

// The rows a turn reads, all by session id.
async function readTurn(sessionId: string): Promise<TurnReads> {
  const [session, turnRows, exhibitRows, revealedRows, eventRows] = await Promise.all([
    db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) }),
    db.query.sessionTurns.findMany({
      where: eq(sessionTurns.sessionId, sessionId),
      orderBy: (t, { asc }) => [asc(t.turnIndex)],
    }),
    db.query.exhibitsShown.findMany({ where: eq(exhibitsShown.sessionId, sessionId) }),
    db.query.revealedData.findMany({ where: eq(revealedData.sessionId, sessionId) }),
    // Rule 11's data-request rows, the math checker's verdicts and the voice check-ins.
    db.query.sessionEvents.findMany({
      where: and(eq(sessionEvents.sessionId, sessionId), or(
        inArray(sessionEvents.category, ['data_request', MATH_CHECKER_CATEGORY]),
        and(eq(sessionEvents.category, VOICE_CHECK_IN.category), eq(sessionEvents.subtype, VOICE_CHECK_IN.subtype)),
      )),
    }),
  ]);
  return {
    session, turnRows, exhibitRows, revealedRows,
    dataRequestEventRows: eventRows.filter(r => r.category === 'data_request'),
    checkerEventRows: eventRows.filter(r => r.category === MATH_CHECKER_CATEGORY),
    checkInEventRows: eventRows.filter(r => r.category === VOICE_CHECK_IN.category && r.subtype === VOICE_CHECK_IN.subtype),
  };
}

// The fingerprint a turn on this text would plan now — no classifier call,
// nothing written. A speculative draft is accepted only if it still matches.
export async function planFingerprintNow(sessionId: string, candidateText: string, acknowledged?: string): Promise<string> {
  const now = Date.now();
  return planFingerprint(planTurn(await readTurn(sessionId), candidateText, {
    sessionId, now, turnStartMs: now, later: () => {}, acknowledged, classify: false,
  }));
}

function stateBeforeOf(plan: ModelPlan): TurnStateBefore {
  const { ctx, state } = plan;
  return {
    phase: ctx.currentPhase,
    elapsedMs: state.elapsedMs,
    kind: state.kind,
    promptContext: promptContextFor(plan),
    revealedIds: Object.keys(revealedValues(state.ledger)),
    shownExhibitIds: [...state.shownExhibitIds],
    openDataRequests: state.openDataRequests.map(o => ({ ledgerItemId: o.ledgerItemId, what: o.what })),
    pressureTest: state.pressureTest,
    stallRung: state.stallDecision.intervene ? (state.stallDecision.rung ?? null) : null,
    verifiedFigures: [...state.verifiedNow],
    recomputeFlags: [...state.recomputeFlags],
    requestCues: [...state.requestCues],
  };
}

// A recorder failure never breaks or alters a turn; the record notes the
// stage it lost, so the evaluation reads it as incomplete evidence (follow-up
// 9 Oct). Only called when a recorder is attached.
const safe = (rec: TurnRecorder, stage: string, f: () => void) => {
  try { f(); } catch (e) {
    try {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[runner] turn recorder failed at ${stage} (ignored):`, message);
      rec.noteError(stage, message);
    } catch { /* nothing on the failure path may break a turn */ }
  }
};

async function runTurnBody(
  sessionId: string, candidateText: string, later: (task: () => Promise<void>) => void, opts: RunTurnOptions,
  background: (job: CheckerJob, phase: Phase) => void = () => {},
): Promise<TurnResult> {
  const { acknowledged, voice, gate } = opts;
  // A draft's segments wait for acceptance: a resolved buffer is not delivery.
  const sink: SegmentSink | undefined = opts.onSegment && gate
    ? async seg => { await gate.wait(); await opts.onSegment!(seg); }
    : opts.onSegment;
  const commit = async (p: ScriptedPlan, report: HeardReport | null) => { await gate?.wait(); return commitScripted(p, report); };
  // Voice (§5.2): what was heard, once everything is handed over. Nothing
  // heard cancels the turn — except a decided scripted line, which stands.
  const hear = async (scripted?: ScriptedPlan): Promise<HeardReport | null> => {
    const report = opts.heard ? await opts.heard() : null;
    timer.mark('heard_resolved');
    if (report && isCancelledTurn(report) && scripted?.delivery !== 'decided') {
      opts.onTiming?.({ ...timer.marks });
      throw new TurnCancelled();
    }
    return report;
  };
  const done = (value: TurnResult): TurnResult => {
    opts.onTiming?.({ ...timer.marks });
    if (rec && recordCtx) {
      try {
        opts.onTurnRecord!(rec.finish({
          sessionId, turnIndex: recordCtx.nextTurnIndex, candidateText, checks: recordCtx.checks.entries,
          savedLine: value.interviewerText, phaseAfter: value.phase, ended: value.ended, timing: { ...timer.marks },
        }));
      } catch (e) {
        console.warn('[runner] onTurnRecord failed (ignored):', e instanceof Error ? e.message : e);
      }
    }
    return value;
  };
  // Full-turn timing (latency plan step 1): the model call alone was ~1.9s of
  // a ~2.2s turn in batches 7–8, but the writes after the interviewer row were
  // never timed.
  const turnStartMs = Date.now();
  const timer = new TurnTimer(turnStartMs);
  const rec = opts.onTurnRecord ? new TurnRecorder(turnStartMs) : null;
  let recordCtx: TurnCtx | null = null;
  // Every read this turn needs takes only the session id: issued together.
  const reads = await readTurn(sessionId);
  timer.mark('reads_done');

  // Plan (plan-turn.ts): everything decided before the model call, no writes.
  const phaseNow = (reads.session?.phase ?? 'INTRO') as Phase;
  const plan = planTurn(reads, candidateText, {
    sessionId, now: Date.now(), turnStartMs, later, acknowledged, voice, background: job => background(job, phaseNow),
  });
  timer.mark('plan_done');
  opts.onPlanFingerprint?.(planFingerprint(plan));
  recordCtx = plan.ctx;
  if (rec) {
    safe(rec, 'state', () => rec.setState(plan.kind === 'scripted'
      ? { phase: plan.ctx.currentPhase, elapsedMs: null, kind: 'scripted', promptContext: null, revealedIds: [], shownExhibitIds: [],
          openDataRequests: [], pressureTest: null, stallRung: null, verifiedFigures: [], recomputeFlags: [], requestCues: [] }
      : stateBeforeOf(plan)));
  }
  if (plan.kind === 'scripted') {
    if (!plan.interviewerText) return done(await commit(plan, null)); // inactive session: nothing said
    // An exit turn (Rule 18A): a distress verdict on the message takes
    // precedence — the C5 offer includes stopping.
    let scripted: ScriptedPlan = plan;
    const conductVerdict = plan.conductCheck ? await timer.time('conduct_verdict', plan.conductCheck) : null;
    if (plan.conductCheck) plan.ctx.checks.record('conduct_backstop', conductEnds(conductVerdict), conductVerdict ? `conduct by model: ${conductVerdict.label}` : 'no verdict', { ...(conductVerdict ?? {}) });
    if (conductVerdict && conductEnds(conductVerdict)) {
      plan.ctx.events.length = 0;
      scripted = terminationPlanFor(plan.ctx, 'C3', { reason: conductVerdict.reason, layer: 'model' });
    } else if (plan.distressCheck) {
      const verdict = await timer.time('distress_verdict', plan.distressCheck);
      plan.ctx.checks.record('conduct_model', isDistressVerdict(verdict), verdict ? `C5 by model: ${verdict.label}` : 'no verdict', { ...(verdict ?? {}) });
      if (isDistressVerdict(verdict)) {
        // The exit's own events go: the offer is what happened.
        plan.ctx.events.length = 0;
        plan.ctx.checks.record('exit_superseded', true, 'distress on the exit message — the C5 offer instead');
        scripted = scriptedOfferFor(plan.ctx, verdict.label === 'risk_to_self', { reason: verdict.reason, label: verdict.label, layer: 'model', onExit: true });
      }
    }
    if (sink) await sink({ text: scripted.interviewerText, revealIds: [], kind: 'scripted' }).catch(() => {});
    if (rec) safe(rec, 'segment', () => rec.segment({ text: scripted.interviewerText, revealIds: [], kind: 'scripted' }));
    return done(await commit(scripted, await hear(scripted)));
  }

  const { ctx, state } = plan;
  const { currentPhase, checks, userId } = ctx;
  const { stallDecision } = state;
  // The check Plan started beside the model call: when it resolved.
  timer.watch('distress_verdict', state.distress);

  console.log('[runner] phase:', currentPhase, 'kind:', state.kind, 'stall rung:', stallDecision.intervene ? stallDecision.rung : 'none');
  // PRD §13: per-turn latency + token usage. A regeneration makes two API
  // calls — onUsage fires per call, so sum here.
  const turnUsage: TurnUsage = { model: '', actualModels: [], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
  // Delivery (D3): the caller's sink, wrapped to time the first segment and
  // the first useful one (past "say"), and note an exhibit already on screen.
  let firstSegmentAt: number | null = null;
  let exhibitDelivered = false;
  const deliver: SegmentSink = async seg => {
    await (sink ?? (async () => {}))(seg);
    if (rec) safe(rec, 'segment', () => rec.segment(seg));
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
  // Rule 17 model layer (v4.10): a C3 the word lists missed, or an ambiguous
  // stem confirmed, ends the session; the draft is discarded undelivered.
  const recordConduct = (c: ConductModelVerdict | null) => {
    checks.record('conduct_backstop', conductEnds(c), c ? `conduct by model: ${c.label}` : (state.conductConfirm ? 'no verdict — the ambiguous stem is not enough to end a session' : 'no verdict — the word lists stand'),
      { ...(c ?? {}), confirm: state.conductConfirm?.reason ?? null });
  };
  const terminate = async (c: ConductModelVerdict) => {
    console.warn('[runner] C3 by the model layer — session ends:', JSON.stringify(c));
    if (turnUsage.apiCalls > 0) later(() => logEvent('llm_usage', { component: 'interviewer', ...turnUsage, discarded: true }, { sessionId, userId }));
    const end = terminationPlanFor(plan.ctx, 'C3', { reason: c.reason, layer: 'model', confirm: state.conductConfirm?.reason ?? null });
    await deliver({ text: end.interviewerText, revealIds: [], kind: 'scripted' }).catch(() => {});
    return done(await commit(end, await hear(end)));
  };
  const offerPause = async (verdict: DistressVerdict) => {
    console.warn('[runner] C5 by the model layer — turn discarded:', JSON.stringify(verdict));
    if (turnUsage.apiCalls > 0) {
      later(() => logEvent('llm_usage', { component: 'interviewer', ...turnUsage, discarded: true }, { sessionId, userId }));
    }
    const offer = scriptedOffer(plan, verdict.label === 'risk_to_self', { reason: verdict.reason, label: verdict.label, layer: 'model' });
    await deliver({ text: offer.interviewerText, revealIds: [], kind: 'scripted' }).catch(() => {});
    return done(await commit(offer, await hear(offer)));
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
    const [distress, detected, conduct] = await timer.time('code_written_checks', Promise.all([
      state.distress,
      classifyDataRequests({
        candidateText, interviewerText: null, catalog: state.catalog,
        onUsage: u => { void logEvent('llm_usage', { ...u }, { sessionId, userId }); },
      }),
      state.conductCheck,
    ]));
    recordConduct(conduct);
    if (conduct && conductEnds(conduct)) return terminate(conduct);
    recordDistress(distress);
    if (isDistressVerdict(distress)) return offerPause(distress);
    // Only asks addressed to the interviewer are answered here (smoke run
    // 9 Oct, b5ebdd96 t22: a final answer listing what would change the
    // recommendation was classified as three asks, and the goodbye released
    // two figures and refused two items). A detection is answered when an
    // asking sentence of the message covers it (request-signal.ts); the rest
    // are dropped and kept in a check. Dropped ones are not logged as asks
    // (the classified marker still goes in, so neither the background pass
    // nor scoring's backfill re-reads the exchange); when the case goes on,
    // they are logged as passing mentions so the classifier's record stays.
    // A held item asked about in a question is answered too (codeWrittenAsks).
    const { sentences: askSentences, kept, dropped } = codeWrittenAsks(plan, detected);
    if (detected !== null) {
      checks.record('code_written_requests', dropped.length > 0, 'detected requests no asking sentence covers — not answered', {
        sentences: askSentences, answered: kept.map(r => r.what), dropped: dropped.map(r => r.what),
      });
    }
    out = {
      turn: codeWrittenTurn(plan, detected === null ? null : kept), validation: null, modelCallStart, modelLatencyMs: 0,
      distressWaitMs: 0, turnUsage, delivered: [], undeliveredRevealIds: [], requestsClassified: detected !== null,
      extraRequestRows: state.kind === 'close' ? [] : dropped.map(r => ({ what: r.what, ledgerItemIds: r.ledgerItemIds, response: 'none' as const, explicit: false })),
    };
  } else {
    // A probe turn's asks (round 5 Task 48, turn-data.ts): classified beside the model call.
    void startProbeAsks(plan, u => { void logEvent('llm_usage', { ...u }, { sessionId, userId }); });
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
      onRequest: rec ? r => safe(rec, 'request', () => rec.request(r.attempt, r.model, r.body)) : undefined,
      onRawOutput: rec ? r => safe(rec, 'output', () => rec.output(r.attempt, r.text)) : undefined,
      onUsage: u => {
        if (rec) safe(rec, 'usage', () => rec.usage(u));
        turnUsage.model = u.model;
        if (u.actualModel) turnUsage.actualModels.push(u.actualModel);
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
    const streamed = await streamTurnSegments(events, plan, deliver, { isDelivered, timer, onUsage: u => { void logEvent('llm_usage', { ...u }, { sessionId, userId }); } });
    // Interviewer latency is the model call alone (the whole stream); the wait
    // on the distress verdict past it is logged apart (batch 4 conflated them).
    const modelLatencyMs = streamed.modelDoneAt - modelCallStart;
    recordConduct(await state.conductCheck);
    if (streamed.kind === 'conduct') return terminate(streamed.verdict);
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

  if (rec) safe(rec, 'model_turn', () => rec.setModelTurn(out.turn, out.validation));

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
  const report = await hear();
  await gate?.wait();
  return done(await settled.persist({
    firstSegmentMs: firstSegmentAt === null ? null : firstSegmentAt - ctx.turnStartMs,
    streamed: streamedCount > 0,
  }, report));
}

const CODE_WRITTEN_KINDS = new Set(['close', 'grace_ask', 'time_warning', 'rung1', 'stage_exhibit', 'stage_brainstorm', 'stage_analysis', 'rec_revision', 'rec_math_probe', 'close_wait']);
// After code corrects a misquote in the recommendation: one chance to revise it.
export const REC_REVISION_QUESTIONS = PHRASE_POOLS.rec_revision;
// After code corrects the candidate's own math in the recommendation (Rule 14
// past its probe): the correction is theirs, so no "corrected figure" talk.
export const REC_MATH_REVISION_QUESTIONS = PHRASE_POOLS.rec_math_revision;
// …and with no recommendation received yet, nothing about "your recommendation" (batch 29 Jordan ea27d1f6 t13).
export const ANALYSIS_REVISION_QUESTIONS = PHRASE_POOLS.analysis_revision;


// The message's asks a code-written turn answers (kept) and the rest (dropped):
// a detection an addressed asking sentence covers, or — before the goodbye — one
// whose item is held and a question of the message names (round 5 Task 49,
// request-signal.ts). At the close (and its hold) the final message's own
// questions are often the candidate thinking aloud (Jordan 15ad9d8e t25: "Did a
// competitor promote into those markets?"), and an answer comes too late to use:
// only addressed asks are answered there, as before.
export function codeWrittenAsks(plan: ModelPlan, detected: DetectedDataRequest[] | null): { sentences: string[]; kept: DetectedDataRequest[]; dropped: DetectedDataRequest[] } {
  const { ctx, state } = plan;
  const sentences = addressedAskSentences(ctx.candidateText, ctx.currentPhase, { closing: state.kind === 'close' });
  const goodbye = state.kind === 'close' || state.kind === 'close_wait';
  const { kept, dropped } = matchAskDetections(sentences, (detected ?? []).filter(r => r.explicit),
    goodbye ? undefined : { text: ctx.candidateText, isHeld: id => canReveal(state.ledger, id) });
  return { sentences, kept, dropped };
}

// A code-written turn as a turn of the interviewer's shape: the message's data
// requests (answered by Settle's data line) and the scripted line.
export function codeWrittenTurn(plan: ModelPlan, detected: DetectedDataRequest[] | null): ModelTurn {
  const { ctx, state } = plan;
  const seed = `${ctx.sessionId}:${ctx.nextTurnIndex}`;
  const recMath = state.kind === 'rec_math_probe' ? state.recMathProbe : null;
  // The math checker's flag in place of the close: its vetted line, said by code.
  // The wrap-up lead's connecting words vary (phrasing.ts); the probe's own words don't.
  const wrapUp = (x: string) => phrase('wrap_up', x, ctx.flags.phraseUses as PhraseUses | undefined, seed);
  const gotTo = (fig: string) => phrase('probe_got_to', fig, ctx.flags.phraseUses as PhraseUses | undefined, seed);
  const recLine = (action: 'probe' | 'correct') => !recMath ? ''
    : 'checker' in recMath ? (action === 'probe' ? wrapUp(lowerFirst(recMath.checker.line)) : recMath.checker.line)
      : 'closed' in recMath ? (action === 'probe' || !recMath.closed.correction ? wrapUp(lowerFirst(gotTo(recMath.closed.said))) : recMath.closed.correction)
        : recMathLine(recMath.flag, action, wrapUp, gotTo);
  const requests = (detected ?? [])
    .filter(r => r.explicit) // a code-written turn answers asks, it doesn't offer
    .map(r => ({ what: r.what, itemIds: r.ledgerItemIds, explicit: true, respond: 'release' as const }));
  const uses = ctx.flags.phraseUses as PhraseUses | undefined;
  const question = state.kind === 'close' ? closeLine(state.closeReason, seed, uses)
    : state.kind === 'grace_ask' ? line('grace_ask', uses, seed)
      : state.kind === 'time_warning' ? line('time_warning', uses, seed)
        : state.kind === 'stage_brainstorm' ? brainstormAskLine(state.caseData, uses, seed)
          : state.kind === 'stage_exhibit' ? line('stage_exhibit_q', uses, seed)
          : state.kind === 'stage_analysis' && state.caseData.analysisCore ? analysisAskLine(state.caseData.analysisCore.ask, state.recommendationInPlay)
            : state.kind === 'rec_revision' ? line(state.recommendationReceived ? 'rec_revision' : 'analysis_revision', uses, seed)
              : state.kind === 'close_wait' ? closeWaitLine(state.lastQuestion ?? '', seed, uses)
              : recMath?.action === 'correct' ? line(state.recommendationReceived ? 'rec_math_revision' : 'analysis_revision', uses, seed)
              : recMath ? recLine('probe')
            : phrase('stall_lead', restateOnTable(state.lastQuestion ?? ''), uses, seed);
  // The owed exhibit is handed over by code's own data line ("Here's an exhibit: …").
  const exhibit = state.kind === 'stage_exhibit' ? state.requiredExhibit ?? nextReadyExhibit(state.caseData.exhibits, state.shownExhibitIds, state.ledger, state.stagesOut)?.id ?? null : null;
  // Rule 14 past its probe: the figure, flat, before the revision question.
  // A correction riding on an overdue stage turn (Lorenzo, 19 Oct, R7) — the
  // checker's or code's own: first, then the data line or exhibit and the stage question.
  const say = recMath?.action === 'correct' ? recLine('correct') : [state.stageCheckerLine?.line, ...state.stageCodeLines].filter(Boolean).join(' ');
  return { move: 'other', requests, exhibit, rescueItem: null, say, question };
}


// "You said …" → "you said …" after a lead-in (an acronym or a number stays).
function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

// The math checker's result as a session event (math-checker-live.ts): the
// verdict for the next turns to read, or the error — logged, no effect.
// Every timeout and error is logged (Lorenzo, 13 Oct: the 30 s timeout).
async function logCheckerRow(sessionId: string, candidateTurnIndex: number, phase: Phase, r: CheckerJobResult): Promise<void> {
  if (r.subtype === 'error') console.warn(`[math-checker] ${r.payload.timedOut ? 'timeout' : 'error'} on message ${candidateTurnIndex} after ${r.payload.latencyMs}ms (no effect on any turn): ${r.payload.error}`);
  await db.insert(sessionEvents).values({ sessionId, category: MATH_CHECKER_CATEGORY, subtype: r.subtype, turnIndex: candidateTurnIndex, phase, payloadJsonb: r.payload });
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
  const silenceUses = flags.phraseUses as PhraseUses | undefined;
  const silenceSeed = `${sessionId}:${nextTurnIndex}`;
  const interviewerText = decision.action === 'check_in' ? checkInText(lastInterviewer, storedQuestion, silenceUses, silenceSeed) : pauseText(decision.state.pauseLimitMs ?? 0, silenceUses, silenceSeed);

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
      // The scripted line's version, for the last-3 rule (it doesn't pass through Settle).
      phraseUses: recordPhraseUses(interviewerText, silenceUses),
      // Rule 13: silence past tolerance is one no-progress turn (check-in only).
      stall: decision.action === 'check_in' ? recordSilenceStall(priorStall) : priorStall,
    },
  }).where(eq(sessions.id, sessionId));

  return { action: decision.action, interviewerText, phase, ended: false };
}
