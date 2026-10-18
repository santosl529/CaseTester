// One voice interview (spec 2026-10-08-voice-phase-b §4): the job the token
// route dispatches with {sessionId}. It joins the session's room, feeds the
// owner's mic to Flux and the speech-end tracker, publishes the interviewer
// track, and runs the VoiceTurnController until the case ends, the candidate
// leaves, the time limit hits, or a budget refuses. Haiku 5.5 interviews here
// (INTERVIEWER_PROVIDER, set by `npm run voice:agent`); background checks are
// the production mix.
import path from 'node:path';
import { defineAgent, type JobContext } from '@livekit/agents';
import {
  AudioSource, AudioStream, LocalAudioTrack, RoomEvent, TrackKind, TrackPublishOptions, TrackSource,
  type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication,
} from '@livekit/rtc-node';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions, sessionTurns } from '@/db/schema';
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
import { SessionRecorder } from './recorder';
import { findCandidateTrack, pickCandidateTrack, realClock } from './room-rules';
import type { SttEvent, TTSProvider } from './types';

const OUT_RATE = 24000;   // Cartesia out
const IN_RATE = 16000;    // Flux in
const num = (k: string, d: number) => Number(process.env[k] ?? d);

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const { sessionId } = JSON.parse(ctx.job.metadata || '{}') as { sessionId?: string };
    const session = sessionId ? await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) }) : undefined;
    if (!session || session.status !== 'active') {
      console.warn('[voice-agent] no active session for', sessionId);
      ctx.shutdown('no active session');
      return;
    }
    // Budgets first: nothing paid starts without them (spec §9). The LLM cap is
    // this session's (LLM_BUDGET_USD, default $1.00; session-budget.ts).
    installSessionBudget();
    const runCap = ttsRunCap(process.env);
    const fake = runCap === null;
    const caseData = getCaseById(session.caseId);

    // Opt-in session recording for turn-taking review (VOICE_RECORD=1): mic,
    // interviewer audio and events, local under .voice-cache/recordings.
    const rec = process.env.VOICE_RECORD === '1' ? new SessionRecorder(Date.now(), { candidateRate: IN_RATE, interviewerRate: OUT_RATE }) : null;
    await ctx.connect();
    const room = ctx.room;

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
    let onStt: (s: SttEvent) => void = () => {};   // the controller, once it exists
    stt.onSignal(sig => {
      rec?.event('stt', sig.kind === 'resumed' ? { kind: sig.kind } : { kind: sig.kind, transcript: sig.transcript, ...(sig.kind === 'speech' ? { words: sig.words } : {}) });
      onStt(sig);
    });
    let micSid: string | null = null;
    const listen = (t: RemoteTrack, sid: string) => {
      micSid = sid;
      void (async () => {
        const reader = new AudioStream(t, { sampleRate: IN_RATE, numChannels: 1 }).getReader();
        for (;;) {
          const { value: frame, done } = await reader.read();
          if (done || !frame) break;
          const now = Date.now();
          vad.push(frame.data, now);
          rec?.candidate(frame.data, now);
          stt.push(new Uint8Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength));
        }
      })();
    };
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
    const playout = new Playout(new LiveKitSink(source, OUT_RATE), realClock, OUT_RATE,
      rec ? { frame: (f, at) => rec.interviewer(f, at), cut: at => rec.interviewerCut(at) } : {});

    // TTS: Cartesia (run cap + monthly ledger) or the free tone.
    const voice = fake ? 'tone' : await defaultVoiceId();
    const tts: TTSProvider = fake ? new FakeTTS() : new CartesiaTTS(voice);
    if (tts instanceof CartesiaTTS) await tts.connect();
    const ledger = await openTtsLedger();   // the month's row in voice_tts_usage, shared by every job
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
      bargeMinWords: num('VOICE_BARGE_MIN_WORDS', 2), sessionSeed: session.id, fillerDelayMs: num('VOICE_FILLER_DELAY_MS', FILLER_DELAY_MS), fillerRate,
      trace: rec ? (type, data) => rec.event(type, data) : undefined,
    });

    onStt = sig => controller.onStt(sig);

    // The browser's back-channel: ready / audio_blocked / exhibit_shown / timing.
    const turnRows = await db.query.sessionTurns.findMany({ where: eq(sessionTurns.sessionId, session.id), orderBy: [asc(sessionTurns.turnIndex)] });
    const opening = turnRows.filter(r => r.role === 'interviewer').at(-1)?.text ?? '';
    const dec = new TextDecoder();
    room.on(RoomEvent.DataReceived, (payload: Uint8Array, p?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== DATA_TOPIC || p?.identity !== session.userId) return;
      const m = parseClientMessage(dec.decode(payload));
      if (!m) return;
      if (m.type === 'ready') void controller.ready(opening);
      else if (m.type === 'audio_blocked') controller.audioBlocked();
      else if (m.type === 'exhibit_shown') controller.exhibitShown(m.turnSeq, m.exhibitId);
      else if (m.type === 'fillers') controller.setFillers(m.on);
      else if (m.type === 'timing') {
        const r = records.find(x => x.turnSeq === m.turnSeq);
        if (r) r.clientFirstSoundMs = m.clientFirstSoundMs;
        lines.add({ turnSeq: m.turnSeq, clientFirstSoundMs: m.clientFirstSoundMs });
      }
    });

    // The end: the candidate leaves, or the time limit.
    let finished = false;
    const finish = async (why: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(limit);
      controller.close();
      await stt.close().catch(() => {});
      await controller.idle().catch(() => {});
      await Promise.allSettled(background);
      if (tts instanceof CartesiaTTS) tts.close();
      await ledger.flush();
      await lines.flush();
      const summary = { why, ...summarize(records), ttsCharsThisRun: run?.used ?? 0, ttsCharsThisMonth: ledger.used, ...(ledger.writeErrors ? { ttsLedgerWriteErrors: ledger.writeErrors } : {}),
        ...(lines.writeErrors ? { recordWriteErrors: lines.writeErrors } : {}) };
      lines.add({ summary });
      await lines.flush();
      if (rec) {
        const dir = path.join('.voice-cache/recordings', `${session.id}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`);
        rec.flush(dir);
        console.log('[voice] recording saved:', dir, '— review with: npx tsx scripts/voice-review.ts', dir);
      }
      console.log('[voice] session summary', JSON.stringify(summary));
      ctx.shutdown(why);
    };
    const limit = setTimeout(() => {
      send({ type: 'ended', reason: 'time_limit', scoringSuppressed: true });
      void finish('time_limit');
    }, num('VOICE_MAX_SESSION_MIN', 25) * 60_000);
    room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      if (p.identity === session.userId) void finish('candidate_left');
    });
    // Listening now: announce it, so a `ready` the browser sent before we
    // joined is sent again (and again if the owner joins after us).
    send({ type: 'hello' });
    room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      if (p.identity === session.userId) send({ type: 'hello' });
    });
  },
});
