// M0 voice spike, Phase A: the cascade's latency without a browser
// (technical PRD §8, build step 7). Replays a recorded candidate's lines as
// speech — synthesized once in a second voice and cached — streamed into
// Deepgram in real time; on end of turn, Deepgram's own transcript goes to the
// real orchestrator (runTurn), whose segments are spoken by Cartesia. Times
// speech end → end-of-turn → first segment → first audio for every turn.
// No scoring (no Opus cost).
//
//   npx tsx --env-file=<.env.local> scripts/voice-latency.ts [--stt=flux|nova] [--run=batch-13-oct-06/26] [--limit=N]
//
// Flux: --eot=0.7 --eager=0.5 --eot-timeout=5000. Nova: --nova-close=utterance --utterance-end-ms=1000.
//
// Needs DEEPGRAM_API_KEY, CARTESIA_API_KEY, ANTHROPIC_API_KEY and the
// database env. Optional: CARTESIA_VOICE_ID (interviewer),
// CARTESIA_CANDIDATE_VOICE_ID.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { startSession } from '@/lib/orchestrator/start-session';
import { runTurn } from '@/lib/orchestrator/session-runner';
import { runPostTurnBackground } from '@/lib/orchestrator/post-turn';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { DeepgramFluxSTT, DeepgramNovaSTT } from '@/lib/voice/deepgram';
import { CartesiaTTS, cartesiaClient, defaultVoiceId } from '@/lib/voice/cartesia';
import { speakingSink, turnLatency, type TurnLatency } from '@/lib/voice/speak';
import { silence, speechEndSec, streamRealtime } from '@/lib/voice/pcm';
import type { STTProvider, TurnSignal } from '@/lib/voice/types';

const flag = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const STT_KIND = flag('stt') ?? 'flux';
const RUN = flag('run') ?? 'batch-13-oct-06/26';
const LIMIT = Number(flag('limit') ?? 0) || Infinity;

const MIC_RATE = 16000;    // candidate audio into STT
const TTS_RATE = 24000;    // interviewer audio out of TTS
const LEAD_SILENCE_SEC = 0.3;
const MAX_TRAIL_SEC = 4;   // stop feeding silence this long after speech if no end-of-turn
const CACHE = '.voice-cache';
const OUT_DIR = 'Case Interview Runs/voice-spike';

// ---- the recorded candidate ----

function candidateLines(): string[] {
  const [batch, prefix] = RUN.split('/');
  const dir = path.join('Case Interview Runs/test runs', batch);
  const sub = readdirSync(dir).find(d => d.startsWith(prefix));
  if (!sub) throw new Error(`no run ${RUN}`);
  const file = readdirSync(path.join(dir, sub)).find(f => f.endsWith('.json'))!;
  const run = JSON.parse(readFileSync(path.join(dir, sub, file), 'utf8')) as { turns: { role: string; text: string; turnIndex: number }[] };
  return run.turns.filter(t => t.role === 'candidate').sort((a, b) => a.turnIndex - b.turnIndex).map(t => t.text);
}

// Each candidate line spoken once, in a voice other than the interviewer's.
async function fixture(text: string, voiceId: string): Promise<Uint8Array> {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${createHash('sha1').update(`${voiceId}|${MIC_RATE}|${text}`).digest('hex')}.pcm`);
  if (existsSync(file)) return new Uint8Array(readFileSync(file));
  const tts = new CartesiaTTS(voiceId);
  const utt = await tts.open({ encoding: 'pcm_s16le', sampleRate: MIC_RATE });
  const parts: Uint8Array[] = [];
  utt.onAudio(pcm => parts.push(pcm));
  await utt.push(text);
  await utt.end();
  tts.close();
  const pcm = Buffer.concat(parts);
  writeFileSync(file, pcm);
  return new Uint8Array(pcm);
}

async function candidateVoiceId(interviewer: string): Promise<string> {
  if (process.env.CARTESIA_CANDIDATE_VOICE_ID) return process.env.CARTESIA_CANDIDATE_VOICE_ID;
  const client = cartesiaClient();
  for await (const v of client.voices.list({ limit: 50 } as never)) {
    const voice = v as { id: string; language?: string };
    if (voice.id !== interviewer && (!voice.language || voice.language === 'en')) return voice.id;
  }
  return interviewer;
}

// ---- one turn ----

type TurnRecord = {
  turn: number; candidateChars: number; sttTranscript: string; interviewerText: string;
  interruptions: number; eagerSignals: number; resumed: number; latency: TurnLatency;
};

type Heard = {
  speechEndMs: number;
  final: TurnSignal | null;      // the first end-of-turn at or after speech end
  eager: TurnSignal | null;      // the eager signal that preceded it, not resumed
  transcript: string;            // every finalized piece of the answer
  interruptions: number;         // end-of-turn signals while still speaking
  eagerSignals: number; resumed: number;
};

// Streams the whole answer, as a candidate who keeps talking would. An
// end-of-turn before speech actually ends is an interruption (a live
// interviewer would have cut in); the turn's real end is the first one after.
async function speakTurnIn(stt: STTProvider, audio: Uint8Array): Promise<Heard> {
  const session = await stt.open({ encoding: 'pcm_s16le', sampleRate: MIC_RATE });
  const speech = Buffer.concat([silence(LEAD_SILENCE_SEC, MIC_RATE), audio]);
  const start = Date.now();
  const speechEndMs = start + (LEAD_SILENCE_SEC + speechEndSec(audio, MIC_RATE)) * 1000;
  const pieces: string[] = [];
  let final: TurnSignal | null = null;
  let eager: TurnSignal | null = null;
  let interruptions = 0, eagerSignals = 0, resumed = 0;
  let gotFinal: () => void = () => {};
  const finalP = new Promise<void>(r => { gotFinal = r; });
  session.onSignal(sig => {
    if (final) return;
    if (sig.kind === 'eager') { eager = sig; eagerSignals++; return; }
    if (sig.kind === 'resumed') { eager = null; resumed++; return; }
    if (sig.transcript) pieces.push(sig.transcript);
    if (sig.atMs < speechEndMs) { interruptions++; eager = null; return; }
    final = sig;
    gotFinal();
  });
  await streamRealtime(new Uint8Array(speech), MIC_RATE, f => session.push(f));
  const trail = (async () => {
    const quiet = silence(0.02, MIC_RATE);
    const until = Date.now() + MAX_TRAIL_SEC * 1000;
    while (!final && Date.now() < until) {
      session.push(quiet);
      await new Promise(r => setTimeout(r, 20));
    }
  })();
  await Promise.race([finalP, trail]);
  await trail;
  await session.close();
  return { speechEndMs, final, eager, transcript: pieces.join(' '), interruptions, eagerSignals, resumed };
}

async function main() {
  const num = (k: string) => (flag(k) !== undefined ? Number(flag(k)) : undefined);
  const stt: STTProvider = STT_KIND === 'nova'
    ? new DeepgramNovaSTT({ closeOn: flag('nova-close') === 'utterance' ? 'utterance_end' : 'speech_final', utteranceEndMs: num('utterance-end-ms') })
    : new DeepgramFluxSTT({ eotThreshold: num('eot'), eagerEotThreshold: num('eager') ?? 0.5, eotTimeoutMs: num('eot-timeout') });
  const lines = candidateLines().slice(0, LIMIT);
  const interviewerVoice = await defaultVoiceId();
  const candidateVoice = await candidateVoiceId(interviewerVoice);
  console.log(`[voice] stt=${stt.name} run=${RUN} turns=${lines.length} voices interviewer=${interviewerVoice} candidate=${candidateVoice}`);

  const audio: Uint8Array[] = [];
  for (const l of lines) audio.push(await fixture(l, candidateVoice));
  console.log(`[voice] fixtures ready (${audio.map(a => (a.length / 2 / MIC_RATE).toFixed(1)).join('s, ')}s)`);

  const owner = await db.query.sessions.findFirst({ orderBy: [desc(sessions.startedAt)] });
  if (!owner) throw new Error('No existing session to borrow a user id from.');
  const { sessionId } = await startSession(owner.userId, 'prof-001');
  const tts = new CartesiaTTS(interviewerVoice);
  await tts.connect();   // pre-warmed, as a live agent would be

  const records: TurnRecord[] = [];
  const background: Promise<unknown>[] = [];
  let phase: Phase = 'INTRO';
  for (let i = 0; i < lines.length; i++) {
    const heard = await speakTurnIn(stt, audio[i]);
    if (!heard.final) { console.warn(`[voice] turn ${i + 1}: no end-of-turn within ${MAX_TRAIL_SEC}s — skipped`); continue; }
    const final = heard.final as TurnSignal;
    const transcript = heard.transcript || final.transcript;

    const utt = await tts.open({ encoding: 'pcm_s16le', sampleRate: TTS_RATE });
    let firstSegmentMs: number | null = null;
    let firstAudioMs: number | null = null;
    utt.onAudio((_pcm, at) => { firstAudioMs ??= at; });
    const phaseBefore = phase;
    const result = await runTurn(sessionId, transcript, {
      onSegment: speakingSink(utt, () => { firstSegmentMs ??= Date.now(); }),
      defer: task => { background.push(task()); },
    });
    await utt.end();
    phase = result.phase;
    background.push(runPostTurnBackground({ sessionId, userId: owner.userId, caseId: 'prof-001', phase: phaseBefore, result }));

    const latency = turnLatency({ speechEndMs: heard.speechEndMs, eagerMs: (heard.eager as TurnSignal | null)?.atMs ?? null, finalMs: final.atMs, firstSegmentMs, firstAudioMs });
    records.push({
      turn: i + 1, candidateChars: lines[i].length, sttTranscript: transcript, interviewerText: result.interviewerText,
      interruptions: heard.interruptions, eagerSignals: heard.eagerSignals, resumed: heard.resumed, latency,
    });
    console.log(`[voice] t${i + 1} interruptions=${heard.interruptions} endpoint=${latency.endpointMs}ms eagerLead=${latency.eagerLeadMs ?? '-'}ms turn=${latency.turnMs ?? '-'}ms tts=${latency.ttsMs ?? '-'}ms TOTAL=${latency.totalMs ?? '-'}ms`);
    if (result.ended) break;
  }
  tts.close();
  await Promise.allSettled(background);

  const med = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };
  const p90 = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null).sort((a, b) => a - b);
    return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.9))] : null;
  };
  const summary = Object.fromEntries((['endpointMs', 'eagerLeadMs', 'turnMs', 'ttsMs', 'totalMs'] as const)
    .map(k => [k, { median: med(records.map(r => r.latency[k])), p90: p90(records.map(r => r.latency[k])) }]));
  console.log('\n[voice] summary (ms):', JSON.stringify(summary));
  console.log(`[voice] interruptions (end-of-turn while still speaking): ${records.reduce((n, r) => n + r.interruptions, 0)} across ${records.length} turns`);
  console.log(`[voice] gate ≤1500ms median total: ${summary.totalMs.median != null && summary.totalMs.median <= 1500 ? 'PASS' : 'FAIL'}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${stt.name}.json`);
  writeFileSync(out, JSON.stringify({ stt: stt.name, run: RUN, sessionId, summary, records }, null, 2));
  console.log(`[voice] wrote ${out}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
