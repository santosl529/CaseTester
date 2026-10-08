// One voice interview (spec 2026-10-08-voice-phase-b §4): the job the token
// route dispatches with {sessionId}. It joins the session's room, feeds the
// owner's mic to Flux and the speech-end tracker, publishes the interviewer
// track, and runs the VoiceTurnController until the case ends, the candidate
// leaves, the time limit hits, or a budget refuses. Haiku 5.5 interviews here
// (INTERVIEWER_PROVIDER, set by `npm run voice:agent`); background checks are
// the production mix.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
import { requireRunBudget } from '@/lib/llm-budget';
import type { ExhibitDisplay } from '@/lib/orchestrator/turn-types';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { DeepgramFluxSTT } from './deepgram';
import { CartesiaTTS, defaultVoiceId } from './cartesia';
import { FakeTTS } from './fake-tts';
import { ACKS } from './acknowledge';
import { Playout } from './playout';
import { SpeechEndTracker } from './pcm';
import { TtsCharBudget, RunCharCap, monthlyLedgerFile, ttsRunCap } from './tts-budget';
import { VoiceTurnController } from './turn-controller';
import { DATA_TOPIC, parseClientMessage, type ServerMessage } from './protocol';
import { summarize, type TurnRecord } from './records';
import { LiveKitSink } from './livekit-media';
import { pickCandidateTrack, realClock } from './room-rules';
import type { TTSProvider } from './types';

const OUT_RATE = 24000;   // Cartesia out
const IN_RATE = 16000;    // Flux in
const num = (k: string, d: number) => Number(process.env[k] ?? d);

// The acknowledgments, synthesized once per TTS + voice and cached on disk.
async function loadAcks(tts: TTSProvider, voice: string, take: (n: number) => boolean): Promise<Map<string, Uint8Array>> {
  const acks = new Map<string, Uint8Array>();
  for (const ack of ACKS) {
    const file = path.join('.voice-cache/acks', `${tts.name}-${voice}-${createHash('sha1').update(ack).digest('hex').slice(0, 10)}.pcm`);
    if (existsSync(file)) { acks.set(ack, new Uint8Array(readFileSync(file))); continue; }
    if (!take(ack.length)) break;
    const utt = await tts.open({ encoding: 'pcm_s16le', sampleRate: OUT_RATE });
    const parts: Uint8Array[] = [];
    utt.onAudio(p => parts.push(p));
    await utt.push(ack);
    await utt.end();
    const pcm = Buffer.concat(parts);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, pcm);
    acks.set(ack, new Uint8Array(pcm));
  }
  return acks;
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const { sessionId } = JSON.parse(ctx.job.metadata || '{}') as { sessionId?: string };
    const session = sessionId ? await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) }) : undefined;
    if (!session || session.status !== 'active') {
      console.warn('[voice-agent] no active session for', sessionId);
      ctx.shutdown('no active session');
      return;
    }
    // Budgets first: nothing paid starts without them (spec §9).
    requireRunBudget('voice-agent');
    const runCap = ttsRunCap(process.env);
    const fake = runCap === null;
    const caseData = getCaseById(session.caseId);

    await ctx.connect();
    const room = ctx.room;
    const enc = new TextEncoder();
    const send = (m: ServerMessage) => {
      void room.localParticipant?.publishData(enc.encode(JSON.stringify(m)), { reliable: true, topic: DATA_TOPIC }).catch(() => {});
    };

    // The interviewer's track and its playout clock.
    const source = new AudioSource(OUT_RATE, 1);
    const track = LocalAudioTrack.createAudioTrack('interviewer', source);
    await room.localParticipant!.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
    const playout = new Playout(new LiveKitSink(source, OUT_RATE), realClock, OUT_RATE);

    // TTS: Cartesia (run cap + monthly ledger) or the free tone.
    const voice = fake ? 'tone' : await defaultVoiceId();
    const tts: TTSProvider = fake ? new FakeTTS() : new CartesiaTTS(voice);
    if (tts instanceof CartesiaTTS) await tts.connect();
    const ledger = new TtsCharBudget(monthlyLedgerFile(), num('VOICE_TTS_CHAR_CAP', 90_000));
    const run = runCap === null ? null : new RunCharCap(runCap);
    const ttsAllow = (n: number) => fake || (run!.take(n) && ledger.take(n));
    const acks = await loadAcks(tts, voice, ttsAllow);

    // Timing records (spec §7).
    const recFile = path.join('Case Interview Runs/voice-live', new Date().toISOString().slice(0, 10), `${session.id}.jsonl`);
    mkdirSync(path.dirname(recFile), { recursive: true });
    const records: TurnRecord[] = [];
    const record = (r: TurnRecord) => {
      records.push(r);
      appendFileSync(recFile, JSON.stringify(r) + '\n');
      console.log(`[voice] t${r.turnSeq} firstSound=${r.firstSoundMs}ms firstUseful=${r.firstUsefulMs}ms endpoint=${r.endpointMs}ms queue=${r.queueWaitMs}ms waits=${JSON.stringify(r.waits)}${r.interrupted ? ' CUT' : ''}${r.cancelled ? ' CANCELLED' : ''}`);
    };

    // Turns through the real orchestrator; post-turn passes as the turn route runs them.
    const background: Promise<unknown>[] = [];
    let phase = session.phase as Phase;
    const vad = new SpeechEndTracker();
    const exhibits = new Map<string, ExhibitDisplay>(caseData.exhibits.map(e =>
      [e.id, { id: e.id, title: e.title, chartType: e.chartType, data: e.data as Record<string, unknown>[] }]));
    const controller = new VoiceTurnController({
      now: () => Date.now(), clock: realClock, playout, tts, format: { encoding: 'pcm_s16le', sampleRate: OUT_RATE },
      runTurn: (text, o) => runTurn(session.id, text, { ...o, defer: task => { background.push(task().catch(() => {})); } }),
      afterTurn: result => {
        const before = phase;
        phase = result.phase;
        background.push(runPostTurnBackground({ sessionId: session.id, userId: session.userId, caseId: session.caseId, phase: before, result }));
      },
      ackPcm: ack => acks.get(ack) ?? null,
      exhibitById: id => exhibits.get(id) ?? null,
      send, record, speechEndAt: () => vad.lastVoicedAt,
      ttsAllow, canStartTurn: () => fake || ledger.canStartTurn(),
      bargeMinWords: num('VOICE_BARGE_MIN_WORDS', 2), sessionSeed: session.id,
    });

    // The owner's mic → Flux + the speech-end tracker.
    const stt = await new DeepgramFluxSTT({ eotThreshold: 0.7, eagerEotThreshold: 0.5 }).open({ encoding: 'pcm_s16le', sampleRate: IN_RATE });
    stt.onSignal(s => controller.onStt(s));
    let micSid: string | null = null;
    room.on(RoomEvent.TrackSubscribed, (t: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (t.kind !== TrackKind.KIND_AUDIO || !pub.sid || !pickCandidateTrack(session.userId, micSid, p.identity, pub.sid)) return;
      micSid = pub.sid;
      void (async () => {
        const reader = new AudioStream(t, { sampleRate: IN_RATE, numChannels: 1 }).getReader();
        for (;;) {
          const { value: frame, done } = await reader.read();
          if (done || !frame) break;
          vad.push(frame.data, Date.now());
          stt.push(new Uint8Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength));
        }
      })();
    });

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
      else if (m.type === 'timing') {
        const r = records.find(x => x.turnSeq === m.turnSeq);
        if (r) r.clientFirstSoundMs = m.clientFirstSoundMs;
        appendFileSync(recFile, JSON.stringify({ turnSeq: m.turnSeq, clientFirstSoundMs: m.clientFirstSoundMs }) + '\n');
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
      const summary = { why, ...summarize(records), ttsCharsThisRun: run?.used ?? 0, ttsCharsThisMonth: ledger.used };
      appendFileSync(recFile, JSON.stringify({ summary }) + '\n');
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
