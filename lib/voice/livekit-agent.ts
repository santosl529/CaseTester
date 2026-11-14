// One voice interview (spec 2026-10-08-voice-phase-b §4): the job the token
// route dispatches with {sessionId}. It joins the session's room, feeds the
// owner's mic to Flux and the speech-end tracker, publishes the interviewer
// track, and runs the VoiceTurnController until the case ends, the candidate
// leaves, the time limit hits, or a budget refuses. Voice lifecycle (5 Nov): whatever ends the job — the case ending,
// End (the room deleted under us), the candidate leaving or never arriving — stops STT and TTS, leaves, deletes the
// room, cancels the dispatch and releases the session's dispatch claim (agent-lifecycle.ts, room-lifecycle.ts). Haiku 5.5 interviews here
// (INTERVIEWER_PROVIDER, set by `npm run voice:agent`); background checks are
// the production mix.
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { defineAgent, type JobContext } from '@livekit/agents';
import {
  AudioSource, AudioStream, LocalAudioTrack, RoomEvent, TrackKind, TrackPublishOptions, TrackSource,
  type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication,
} from '@livekit/rtc-node';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessionEvents, sessions, sessionTurns } from '@/db/schema';
import { VOICE_CHECK_IN } from '@/lib/orchestrator/voice-check-in';
import { runTurn } from '@/lib/orchestrator/session-runner';
import { runPostTurnBackground } from '@/lib/orchestrator/post-turn';
import { getCaseById } from '@/lib/cases/loader';
import type { ExhibitDisplay } from '@/lib/orchestrator/turn-types';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { DeepgramFluxSTT } from './deepgram';
import { keytermsIfEnabled } from './keyterms';
import { CartesiaTTS, defaultVoiceId } from './cartesia';
import { FakeTTS } from './fake-tts';
import { FILLER_DELAY_MS, fillerRateFrom, FILLER_GAP_MS, FILLER_TAIL_MS } from './acknowledge';
import { loadAcks } from './ack-audio';
import { Playout } from './playout';
import { SpeechEndTracker } from './pcm';
import { RunCharCap, ttsRunCap, TURN_TTS_RESERVE } from './tts-budget';
import { installSessionBudget } from './session-budget';
import { openTtsLedger } from './tts-ledger-store';
import { TTS_CAP_CLOSING, VoiceTurnController } from './turn-controller';
import { endByCandidate } from '@/lib/orchestrator/session-end';
import { DATA_TOPIC, parseClientMessage, type ServerMessage } from './protocol';
import { summarize, type TurnRecord } from './records';
import { SessionLines } from './session-lines';
import { dbLineWriter } from './session-lines-db';
import { LiveKitSink } from './livekit-media';
import { SessionRecorder, pruneRecordings } from './recorder';
import { findCandidateTrack, pickCandidateTrack, realClock } from './room-rules';
import { AgentLifecycle, shouldJoin, type FinishReason } from './agent-lifecycle';
import { pumpMic } from './mic-pump';
import { closeVoiceRoom, roomAdminFromEnv } from './room-lifecycle';
import { releaseVoiceDispatch } from './dispatch-claim';
import { voiceRoomName } from './capacity';
import type { SttEvent, TTSProvider } from './types';

const OUT_RATE = 24000;   // Cartesia out
const IN_RATE = 16000;    // Flux in
const num = (k: string, d: number) => Number(process.env[k] ?? d);
// When this module finished loading: with the process start, how long a job
// process takes to load the agent — what each pre-warmed replacement costs the
// container while a job runs (session b406165f, 19 Oct).
const MODULE_LOADED_AT = Date.now();
const PROCESS_STARTED_AT = Math.round(Date.now() - process.uptime() * 1000);

export default defineAgent({
  entry: async (ctx: JobContext) => {
    // Job start, step by step (19 Oct): what runs before the opener can play.
    const t0 = Date.now();
    const jobStart: Record<string, number> = {};
    const mark = (k: string) => { jobStart[k] = Date.now() - t0; };
    const load1AtEntry = os.loadavg()[0];
    // The event loop's delay, per turn (agentTiming).
    const loop = monitorEventLoopDelay({ resolution: 10 });
    loop.enable();
    const agentTiming = () => {
      const ms = (ns: number) => Math.round(ns / 1e5) / 10;
      const r = { loopDelayMaxMs: ms(loop.max), loopDelayP99Ms: ms(loop.percentile(99)), loopDelayMeanMs: ms(loop.mean), load1: Math.round(os.loadavg()[0] * 100) / 100 };
      loop.reset();
      return r;
    };
    const { sessionId } = JSON.parse(ctx.job.metadata || '{}') as { sessionId?: string };
    const admin = roomAdminFromEnv();
    // The room is freed whatever ends the job: the dispatch cancelled, the room deleted, the claim released.
    const freeRoom = async () => {
      if (!sessionId) return;
      await closeVoiceRoom(admin, voiceRoomName(sessionId), m => console.warn(m));
      await releaseVoiceDispatch(sessionId).catch(e => console.warn('[voice-agent] dispatch claim not released', e));
    };
    const session = sessionId ? await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) }) : undefined;
    mark('session_read');
    // A late-arriving agent never joins a session that is over (End during the cold start).
    if (!shouldJoin(session)) {
      console.warn('[voice-agent] no active session for', sessionId, '— not joining');
      await freeRoom();
      ctx.shutdown('session_over');
      return;
    }
    if (!session) return;   // (narrowing; shouldJoin checked it)
    await ctx.connect();
    mark('room_connected');
    const room = ctx.room;
    // Ended while we connected: leave at once.
    const recheck = await db.query.sessions.findFirst({ where: eq(sessions.id, session.id), columns: { status: true } });
    if (!shouldJoin(recheck)) {
      console.warn('[voice-agent] session ended while connecting — leaving');
      await freeRoom();
      ctx.shutdown('session_over');
      return;
    }

    // Whatever ends the job, once (agent-lifecycle.ts). Wired before the slow setup: a candidate who leaves while
    // we set up, or never arrives, ends the job too. `finish` (below) copes with a job only partly set up.
    let finishImpl: ((why: FinishReason) => Promise<void>) | null = null;
    let finishWanted: FinishReason | null = null;
    const life = new AgentLifecycle({
      candidate: session.userId,
      setTimer: (f, ms) => setTimeout(f, ms), clearTimer: h => clearTimeout(h as ReturnType<typeof setTimeout>),
      candidateWaitMs: num('VOICE_CANDIDATE_WAIT_MS', 20_000),
      rejoinGraceMs: num('VOICE_REJOIN_GRACE_MS', 15_000),
      // Away: nothing plays into an empty room (the live turn is cut, as when the browser can't play audio); back:
      // the page's `ready` resumes listening (controller.ready), on the same session and the same agent.
      onAway: () => { console.log('[voice-agent] candidate dropped out; waiting for them to rejoin'); dropMic(); pauseForAway(); },
      onBack: () => { console.log('[voice-agent] candidate rejoined; resuming'); },
      onFinish: why => {
        console.log(`[voice-agent] finishing: ${why}`);
        if (finishImpl) void finishImpl(why); else finishWanted = why;
      },
    });
    room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => life.left(p.identity));
    room.on(RoomEvent.Disconnected, () => life.roomClosed());
    room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => life.joined(p.identity));
    life.connected([...room.remoteParticipants.values()].map(p => p.identity));
    // Set once the controller exists (below); before that there is nothing playing to pause.
    let pauseForAway: () => void = () => {};
    // The old mic track goes with the candidate: its loop stops, so the rejoined page's new track is picked up.
    let dropMic: () => void = () => {};
    // Resources opened so far, closed by `finish` (and by setup itself if the job ended while it ran).
    const open: { stt?: { close(): Promise<void> }; tts?: CartesiaTTS; mic: (() => void)[] } = { mic: [] };
    const abandon = async (): Promise<boolean> => {
      if (!life.over) return false;
      for (const stop of open.mic) stop();
      await open.stt?.close().catch(() => {});
      open.tts?.close();
      await freeRoom();
      ctx.shutdown(life.why ?? 'ended');
      return true;
    };

    // Budgets first: nothing paid starts without them (spec §9). The LLM cap is
    // this session's (LLM_BUDGET_USD, default $1.00; session-budget.ts).
    installSessionBudget();
    const runCap = ttsRunCap(process.env);
    const fake = runCap === null;
    const caseData = getCaseById(session.caseId);

    // Opt-in session recording for turn-taking review (VOICE_RECORD=1): mic,
    // interviewer audio and events, local under .voice-cache/recordings.
    const rec = process.env.VOICE_RECORD === '1' ? new SessionRecorder(Date.now(), { candidateRate: IN_RATE, interviewerRate: OUT_RATE }) : null;

    // The owner's mic → Flux + the speech-end tracker, wired before anything
    // slow: the browser's track can be subscribed while the rest is set up,
    // and a missed TrackSubscribed meant nothing was ever transcribed (smoke, 8 Oct).
    const vad = new SpeechEndTracker();
    // How often a thinking filler plays (acknowledge.ts; tuned by ear with VOICE_FILLER_LONG_WORDS / VOICE_FILLER_MAX_RUN).
    const fillerRate = fillerRateFrom(process.env);
    console.log(`[voice-agent] filler rate: always after ${fillerRate.longWords}+ words or a data ask; short replies while under ${fillerRate.maxRun} in a row`);
    const keyterms = keytermsIfEnabled(caseData);
    console.log(`[voice-agent] stt keyterms: ${keyterms ? `on (${keyterms.length})` : 'off'}`);
    const stt = await new DeepgramFluxSTT({ eotThreshold: 0.7, eagerEotThreshold: 0.5, keyterms }).open({ encoding: 'pcm_s16le', sampleRate: IN_RATE });
    open.stt = stt;
    mark('stt_open');
    if (await abandon()) return;
    let onStt: (s: SttEvent) => void = () => {};   // the controller, once it exists
    stt.onSignal(sig => {
      rec?.event('stt', sig.kind === 'resumed' ? { kind: sig.kind } : { kind: sig.kind, transcript: sig.transcript, ...(sig.kind === 'speech' ? { words: sig.words } : {}) });
      onStt(sig);
    });
    let micSid: string | null = null;
    // A frame a sink can't take costs that frame only; a Deepgram reconnect no longer ends listening (mic-pump.ts).
    const listen = (t: RemoteTrack, sid: string) => {
      micSid = sid;
      const reader = new AudioStream(t, { sampleRate: IN_RATE, numChannels: 1 }).getReader();
      const pump = pumpMic(reader as never, {
        vad: (data, now) => vad.push(data, now),
        record: rec ? (data, now) => rec.candidate(data, now) : undefined,
        stt: pcm => stt.push(pcm),
      });
      open.mic.push(pump.stop);
      void pump.done.then(st => { console.log(`[voice-agent] mic loop ended (${st.ended}; ${st.frames} frames, ${st.sinkErrors} not delivered)`); if (micSid === sid) micSid = null; });
    };
    dropMic = () => { for (const stop of open.mic.splice(0)) stop(); micSid = null; };
    room.on(RoomEvent.TrackSubscribed, (t: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (t.kind !== TrackKind.KIND_AUDIO || !pub.sid || pub.sid === micSid || !pickCandidateTrack(session.userId, micSid, p.identity, pub.sid)) return;
      listen(t, pub.sid);
    });
    const already = findCandidateTrack(room.remoteParticipants.values(), session.userId, k => k === TrackKind.KIND_AUDIO);
    if (already?.track && already.sid && micSid === null) listen(already.track as RemoteTrack, already.sid);
    const enc = new TextEncoder();
    const send = (m: ServerMessage) => {
      void room.localParticipant?.publishData(enc.encode(JSON.stringify(m)), { reliable: true, topic: DATA_TOPIC }).catch(() => {});
    };

    // The interviewer's track and its playout clock.
    const source = new AudioSource(OUT_RATE, 1);
    const track = LocalAudioTrack.createAudioTrack('interviewer', source);
    await room.localParticipant!.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
    mark('track_published');
    const playout = new Playout(new LiveKitSink(source, OUT_RATE), realClock, OUT_RATE,
      rec ? { frame: (f, at) => rec.interviewer(f, at), cut: at => rec.interviewerCut(at) } : {});

    // TTS: Cartesia (run cap + monthly ledger) or the free tone.
    const voice = fake ? 'tone' : await defaultVoiceId();
    const tts: TTSProvider = fake ? new FakeTTS() : new CartesiaTTS(voice);
    if (tts instanceof CartesiaTTS) { open.tts = tts; await tts.connect(); }
    mark('tts_connected');
    if (await abandon()) return;
    const ledger = await openTtsLedger();   // the month's row in voice_tts_usage, shared by every job
    mark('ledger_open');
    const run = runCap === null ? null : new RunCharCap(runCap);
    // The session's cap keeps the closing line's characters back: when it runs
    // out the interviewer says so (TTS_CAP_CLOSING) instead of going silent.
    const closingReserve = TTS_CAP_CLOSING.length;
    const ttsAllow = (n: number) => fake || (run!.left - n >= closingReserve && run!.take(n) && ledger.take(n));
    const ttsAllowClosing = (n: number) => fake || (run!.take(n) && ledger.take(n));
    // Shipped clips first; the hosted worker synthesizes none (VOICE_ACK_SYNTH=0).
    const missingClips: string[] = [];
    const acks = await loadAcks(tts, voice, ttsAllow, { sampleRate: OUT_RATE, gapMs: num('VOICE_FILLER_GAP_MS', FILLER_GAP_MS), tailMs: num('VOICE_FILLER_TAIL_MS', FILLER_TAIL_MS),
      synthesize: process.env.VOICE_ACK_SYNTH !== '0', onMissing: t => missingClips.push(t) });
    mark('acks_loaded');
    if (await abandon()) return;
    if (missingClips.length) console.warn(`[voice-agent] ${missingClips.length} acknowledgment clip(s) not shipped for ${tts.name} ${voice}, left out: ${missingClips.join(' | ')} — render with scripts/voice-render-acks.ts`);

    // Timing records (spec §7): voice_session_lines, and the local jsonl when
    // VOICE_RECORDS_DIR is set (scripts/voice-export.ts rebuilds it from the rows).
    const lines = new SessionLines(dbLineWriter(session.id), { sessionId: session.id, dir: process.env.VOICE_RECORDS_DIR || null });
    const records: TurnRecord[] = [];
    const record = (r: TurnRecord) => {
      records.push(r);
      lines.add(r);
      console.log(`[voice] t${r.turnSeq} firstSound=${r.firstSoundMs}ms firstUseful=${r.firstUsefulMs}ms endpoint=${r.endpointMs}ms queue=${r.queueWaitMs}ms waits=${JSON.stringify(r.waits)}${r.interrupted ? ' CUT' : ''}${r.cancelled ? ' CANCELLED' : ''}`);
    };

    // Turns through the real orchestrator; post-turn passes as the turn route runs them.
    const background: Promise<unknown>[] = [];
    let phase = session.phase as Phase;
    const exhibits = new Map<string, ExhibitDisplay>(caseData.exhibits.map(e =>
      [e.id, { id: e.id, title: e.title, chartType: e.chartType, data: e.data as Record<string, unknown>[], ...(e.notes ? { notes: e.notes } : {}) }]));
    const controller = new VoiceTurnController({
      now: () => Date.now(), clock: realClock, playout, tts, format: { encoding: 'pcm_s16le', sampleRate: OUT_RATE },
      runTurn: (text, o) => runTurn(session.id, text, { ...o, voice: true, defer: task => { background.push(task().catch(() => {})); } }),
      afterTurn: result => {
        const before = phase;
        phase = result.phase;
        background.push(runPostTurnBackground({ sessionId: session.id, userId: session.userId, caseId: session.caseId, phase: before, result }));
      },
      ackPcm: ack => acks.get(ack) ?? null,
      exhibitById: id => exhibits.get(id) ?? null,
      send, record, speechEndAt: () => vad.lastVoicedAt,
      ttsAllow, ttsAllowClosing, canStartTurn: () => fake || (ledger.canStartTurn() && run!.left >= TURN_TTS_RESERVE + closingReserve),
      // Ended for the cap as the End button ends it: completed with a report when assessable.
      endEarly: async () => ({ scoringSuppressed: !(await endByCandidate(session.id, session.userId, 'voice_tts_cap')).report }),
      // The silence check-in (Lorenzo, 18 Oct): 90s by default; 0 = off.
      checkInMs: num('VOICE_CHECKIN_MS', 90_000),
      checkInOpenerMs: num('VOICE_CHECKIN_OPENER_MS', 180_000),   // the first silence, after the case prompt
      // The check-in heard goes to the model's history as no turn (voice-check-in.ts).
      note: l => {
        lines.add(l);
        console.log('[voice] note', JSON.stringify(l));
        if (l.opener) lines.release();   // the opener has ended: the jobStart line goes now
        const ci = (l as { checkIn?: { heardText?: string; startedAtMs?: number | null; silentMs?: number } }).checkIn;
        if (ci?.heardText) {
          void db.insert(sessionEvents).values({
            sessionId: session.id, category: VOICE_CHECK_IN.category, subtype: VOICE_CHECK_IN.subtype, turnIndex: null, phase,
            payloadJsonb: { text: ci.heardText, atMs: ci.startedAtMs ?? Date.now(), silentMs: ci.silentMs },
          }).catch(e => console.error('[voice] check-in event not written', e));
        }
      },
      bargeMinWords: num('VOICE_BARGE_MIN_WORDS', 2), sessionSeed: session.id, fillerDelayMs: num('VOICE_FILLER_DELAY_MS', FILLER_DELAY_MS), fillerRate,
      trace: rec ? (type, data) => rec.event(type, data) : undefined,
      agentTiming,
      // The case is over (the closing line has played): leave instead of listening on.
      onEnded: () => life.caseEnded(),
    });

    onStt = sig => controller.onStt(sig);
    pauseForAway = () => controller.audioBlocked();
    if (life.candidateAway) pauseForAway();

    // The browser's back-channel: ready / audio_blocked / exhibit_shown / timing / health / setup.
    const turnRows = await db.query.sessionTurns.findMany({ where: eq(sessionTurns.sessionId, session.id), orderBy: [asc(sessionTurns.turnIndex)] });
    const opening = turnRows.filter(r => r.role === 'interviewer').at(-1)?.text ?? '';
    mark('turns_read');
    let readyAt: number | null = null;
    const dec = new TextDecoder();
    room.on(RoomEvent.DataReceived, (payload: Uint8Array, p?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== DATA_TOPIC || p?.identity !== session.userId) return;
      const m = parseClientMessage(dec.decode(payload));
      if (!m) return;
      if (m.type === 'ready') {
        if (readyAt === null) { readyAt = Date.now() - t0; lines.add({ ready: { atMs: readyAt } }); }   // the opener can start now
        void controller.ready(opening);
      }
      else if (m.type === 'audio_blocked') controller.audioBlocked();
      else if (m.type === 'exhibit_shown') controller.exhibitShown(m.turnSeq, m.exhibitId);
      else if (m.type === 'fillers') controller.setFillers(m.on);
      else if (m.type === 'timing') {
        const r = records.find(x => x.turnSeq === m.turnSeq);
        if (r) r.clientFirstSoundMs = m.clientFirstSoundMs;
        lines.add({ turnSeq: m.turnSeq, clientFirstSoundMs: m.clientFirstSoundMs });
      } else if (m.type === 'health') {
        // The page's health line (19 Oct, lib/voice/health.ts).
        lines.add({ turnSeq: m.turnSeq, health: { longestFrameGapMs: m.longestFrameGapMs, longTaskMs: m.longTaskMs, audioElements: m.audioElements, audioContextState: m.audioContextState } });
      } else if (m.type === 'setup') {
        // The page's setup timings, once (19 Oct, lib/voice/setup-timing.ts).
        lines.add({ setup: { spans: m.spans, helloAtMs: m.helloAtMs, setupDoneAtMs: m.setupDoneAtMs, readyAtMs: m.readyAtMs,
          playingAtMs: m.playingAtMs, playingFallbackAtMs: m.playingFallbackAtMs, longTasks: m.longTasks } });
      }
    });

    // The end, whatever the reason (agent-lifecycle.ts): STT and TTS stop, records flush, the room is freed.
    const finish = async (why: FinishReason) => {
      clearTimeout(limit);
      loop.disable();
      controller.close();
      for (const stop of open.mic) stop();
      await stt.close().catch(() => {});
      await controller.idle().catch(() => {});
      await Promise.allSettled(background);
      if (tts instanceof CartesiaTTS) tts.close();
      await ledger.flush();
      lines.release();   // the jobStart line, when the opener never ended
      await lines.flush();
      const summary = { why, ...summarize(records), ttsCharsThisRun: run?.used ?? 0, ttsCharsThisMonth: ledger.used, ...(ledger.writeErrors ? { ttsLedgerWriteErrors: ledger.writeErrors } : {}),
        ...(lines.writeErrors ? { recordWriteErrors: lines.writeErrors } : {}) };
      lines.add({ summary });
      await lines.flush();
      if (rec) {
        // Nothing older than 30 days is kept (lib/voice/recorder.ts pruneRecordings).
        const pruned = pruneRecordings('.voice-cache/recordings', Date.now());
        if (pruned.length) console.log('[voice] recordings older than 30 days deleted:', pruned.length);
        const dir = path.join('.voice-cache/recordings', `${session.id}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`);
        rec.flush(dir);
        console.log('[voice] recording saved:', dir, '— review with: npx tsx scripts/voice-review.ts', dir);
      }
      console.log('[voice] session summary', JSON.stringify(summary));
      await freeRoom();
      ctx.shutdown(why);
    };
    const limit = setTimeout(() => {
      send({ type: 'ended', reason: 'time_limit', scoringSuppressed: true });
      life.finish('time_limit');
    }, num('VOICE_MAX_SESSION_MIN', 25) * 60_000);
    finishImpl = finish;
    if (finishWanted) { void finish(finishWanted); return; }
    // Listening now: announce it, so a `ready` the browser sent before we
    // joined is sent again (and again if the owner joins after us).
    send({ type: 'hello' });
    mark('hello');
    const start = { marksMs: jobStart, moduleLoadMs: MODULE_LOADED_AT - PROCESS_STARTED_AT, processAgeMs: t0 - PROCESS_STARTED_AT,
      load1AtEntry: Math.round(load1AtEntry * 100) / 100, cpus: os.availableParallelism() };
    // Written after the opener ends, not now: no record write while it streams (agent-timing proposal 3, Lorenzo 19 Oct).
    lines.hold({ jobStart: start });
    console.log('[voice] job start', JSON.stringify(start));
    room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      if (p.identity === session.userId) send({ type: 'hello' });
    });
  },
});
