// Voice load test (Lorenzo, 14 Nov: "up max concurrent users to 5"): N voice interviews at once against the HOSTED
// agent in production's LiveKit project, the way the browser reaches it — a session row, one claimed dispatch, a
// participant in the session's room publishing a microphone. The candidate is a recorded run's lines spoken by
// macOS `say` (free; cached in .voice-cache), answered whenever the interviewer finishes speaking.
//
// Measures per session: dispatch → agent joined ("hello"), the agent's own per-turn latency lines (first sound,
// first useful), speech end → interviewer speaking (from here), stalls, errors and how it ended; and the agent's
// CPU / memory / replicas from `lk agent status` every 10 s. It bypasses the token route, so VOICE_MAX_CONCURRENT
// does not apply: this measures what the agent and the vendors carry, not the site's cap.
//
// Paid (Claude for the interviewer, Deepgram, Cartesia, LiveKit minutes): about $0.04 of Claude per candidate turn
// (batch 40's ledger), so --n=5 --turns=10 ≈ $2–3 in all. Without --confirm it prints the plan and exits.
// Sessions belong to SCRIPT_USER_ID and are set to 'abandoned' at the end (no report, no scoring).
//
//   npx tsx --env-file=.env.local scripts/voice-load.ts [--n=5] [--turns=10] [--confirm]
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { AccessToken } from 'livekit-server-sdk';
import { AudioFrame, AudioSource, LocalAudioTrack, Room, RoomEvent, TrackPublishOptions, TrackSource, type RemoteParticipant } from '@livekit/rtc-node';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { startSession } from '@/lib/orchestrator/start-session';
import { scriptOwnerId } from '@/lib/script-owner';
import { AGENT_NAME, DATA_TOPIC, type ServerMessage } from '@/lib/voice/protocol';
import { voiceRoomName } from '@/lib/voice/capacity';
import { claimVoiceDispatch } from '@/lib/voice/dispatch-claim';
import { closeVoiceRoom, roomAdminFromEnv } from '@/lib/voice/room-lifecycle';

const flag = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const N = Number(flag('n') ?? 5);
const TURNS = Number(flag('turns') ?? 10);
const CONFIRM = process.argv.includes('--confirm');
const VERBOSE = process.argv.includes('--verbose');

const RATE = 48000;
const FRAME = 960;                   // 20 ms
const PAUSE_MS = 700;                // a person's pause before answering
const LISTEN_FALLBACK_MS = 12_000;   // listening this long with nothing said: answer anyway
const HELLO_TIMEOUT_MS = 180_000;    // a sleeping agent wakes (cold start)
const SESSION_CAP_MS = 15 * 60_000;
const SAY_VOICE = 'Samantha';
const CACHE = '.voice-cache';
const OUT_DIR = 'Case Interview Runs/voice-load';

// One recorded run per case (the newest with ≥ 12 candidate turns, 14 Nov).
const RUNS: { caseId: string; file: string }[] = [
  { caseId: 'prof-001', file: 'batch-40-brewbean-oct-27-runs-1-5/57-marisol-the-context-confuser/live-run-2026-10-27-ce000d1b.json' },
  { caseId: 'prof-002', file: 'batch-40-larkspur-oct-27-runs-6-7/67-victor-the-data-challenger/live-run-2026-10-27-6bc6807c.json' },
  { caseId: 'entry-001', file: 'batch-39-aldermoor-oct-26-runs-1-5/57-marisol-the-context-confuser/live-run-2026-10-26-5bc506bc.json' },
  { caseId: 'pricing-001', file: 'batch-40-quillpath-oct-27-runs-1-8/66-remy-the-results-only-answerer/live-run-2026-10-27-edc72915.json' },
  { caseId: 'launch-001', file: 'batch-39-hollisbay-oct-26-runs-1-5/57-marisol-the-context-confuser/live-run-2026-10-26-17b4117c.json' },
];

function candidateLines(file: string): string[] {
  const run = JSON.parse(readFileSync(path.join('Case Interview Runs/test runs', file), 'utf8')) as { turns: { role: string; text: string; turnIndex: number }[] };
  return run.turns.filter(t => t.role === 'candidate').sort((a, b) => a.turnIndex - b.turnIndex).map(t => shorten(t.text));
}

// About 70 words, ending at a sentence: the recorded personas' monologues run ~50 s; a spoken answer is shorter.
function shorten(text: string, words = 70): string {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  let out = '';
  for (const s of sentences) {
    if (out && (out + s).split(/\s+/).length > words) break;
    out += s;
  }
  return out.trim();
}

function wavData(buf: Buffer): Buffer {
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') return buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}

// A line as 48 kHz mono PCM, spoken once by `say` and cached.
function speech(text: string): Int16Array {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${createHash('sha1').update(`say:${SAY_VOICE}|${RATE}|${text}`).digest('hex')}.pcm`);
  if (!existsSync(file)) {
    const aiff = `${file}.aiff`, wav = `${file}.wav`;
    execFileSync('say', ['-v', SAY_VOICE, '-o', aiff, text]);
    execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, wav]);
    writeFileSync(file, wavData(readFileSync(wav)));
  }
  const b = readFileSync(file);
  return new Int16Array(b.buffer, b.byteOffset, Math.floor(b.length / 2));
}

type SessionResult = {
  i: number; caseId: string; sessionId: string;
  helloMs: number | null; turnsSpoken: number;
  agentLatency: { turnSeq: number; firstSoundMs: number | null; firstUsefulMs: number | null }[];
  speechEndToSpeakingMs: number[];
  stalls: number; fallbacks: number; ended: string | null; errors: string[]; durationMs: number;
};

async function runOne(i: number, owner: string, admin: NonNullable<ReturnType<typeof roomAdminFromEnv>>, t0: number): Promise<SessionResult> {
  const { caseId, file } = RUNS[i % RUNS.length];
  const lines = candidateLines(file).slice(0, TURNS).map(speech);
  const { sessionId } = await startSession(owner, caseId);
  const room = voiceRoomName(sessionId);
  const r: SessionResult = { i, caseId, sessionId, helloMs: null, turnsSpoken: 0, agentLatency: [], speechEndToSpeakingMs: [], stalls: 0, fallbacks: 0, ended: null, errors: [], durationMs: 0 };
  const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s s${i} ${caseId}] ${m}`);

  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity: owner, ttl: '30m' });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
  const lk = new Room();
  await lk.connect(process.env.LIVEKIT_URL!, await at.toJwt(), { autoSubscribe: false, dynacast: false });
  const source = new AudioSource(RATE, 1, 200);
  await lk.localParticipant!.publishTrack(LocalAudioTrack.createAudioTrack('mic', source), new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));

  if (await claimVoiceDispatch(sessionId, Date.now())) await admin.createDispatch(room, AGENT_NAME, { metadata: JSON.stringify({ sessionId }) });
  const dispatchedAt = Date.now();
  log(`dispatched (${sessionId.slice(0, 8)})`);

  const enc = new TextEncoder();
  const send = (m: object) => void lk.localParticipant?.publishData(enc.encode(JSON.stringify(m)), { reliable: true, topic: DATA_TOPIC }).catch(() => {});

  // The microphone: the current line, else silence, paced by the source's 200 ms queue.
  const mic: { line: { pcm: Int16Array; off: number } | null } = { line: null };
  let speechEndAt: number | null = null;
  let listeningSince = 0;
  let stop = false;
  const silence = new Int16Array(FRAME);
  const pump = (async () => {
    while (!stop) {
      let chunk = silence;
      const line = mic.line;
      if (line) {
        chunk = new Int16Array(FRAME);
        chunk.set(line.pcm.subarray(line.off, line.off + FRAME));
        line.off += FRAME;
        if (line.off >= line.pcm.length) { mic.line = null; speechEndAt = Date.now() + 200; listeningSince = Date.now(); if (VERBOSE) log(`-> line ${r.turnsSpoken} done`); }
      }
      await source.captureFrame(new AudioFrame(chunk, RATE, 1, FRAME));
    }
  })();

  let state = 'none';
  let done!: () => void;
  const finished = new Promise<void>(res => { done = res; });
  const speakNext = (why: 'turn' | 'fallback') => {
    if (mic.line || r.turnsSpoken >= lines.length) return;
    if (why === 'fallback') r.fallbacks++;
    mic.line = { pcm: lines[r.turnsSpoken], off: 0 };
    if (VERBOSE) log(`-> speaking line ${r.turnsSpoken + 1} (${(lines[r.turnsSpoken].length / RATE).toFixed(1)}s, ${why})`);
    speechEndAt = null;
    r.turnsSpoken++;
  };

  lk.on(RoomEvent.DataReceived, (payload: Uint8Array, p?: RemoteParticipant, _k?: unknown, topic?: string) => {
    if (topic !== DATA_TOPIC || !p || p.identity === owner) return;
    let m: ServerMessage;
    try { m = JSON.parse(new TextDecoder().decode(payload)) as ServerMessage; } catch { return; }
    if (VERBOSE && m.type !== 'caption_words' && m.type !== 'caption_segment') log(`<- ${m.type}${m.type === 'state' ? ` ${m.state} #${m.turnSeq}` : m.type === 'caption' ? ` ${m.who}${m.final ? ' final' : ''}: …${m.text.slice(-50)}` : ''}`);
    if (m.type === 'hello') {
      if (r.helloMs === null) { r.helloMs = Date.now() - dispatchedAt; log(`agent joined after ${(r.helloMs / 1000).toFixed(1)}s`); }
      send({ type: 'ready' });
    } else if (m.type === 'state') {
      if (m.state === 'speaking' && speechEndAt !== null && state !== 'speaking') { r.speechEndToSpeakingMs.push(Date.now() - speechEndAt); speechEndAt = null; }
      const wasSpeaking = state === 'speaking';
      state = m.state;
      if (m.state === 'listening') {
        listeningSince = Date.now();
        if (wasSpeaking) {
          if (r.turnsSpoken >= lines.length) { log('all lines answered'); done(); return; }
          setTimeout(() => { if (state === 'listening') speakNext('turn'); }, PAUSE_MS);
        }
      }
    } else if (m.type === 'latency') {
      r.agentLatency.push({ turnSeq: m.turnSeq, firstSoundMs: m.firstSoundMs, firstUsefulMs: m.firstUsefulMs });
    } else if (m.type === 'exhibit') {
      send({ type: 'exhibit_shown', turnSeq: m.turnSeq, exhibitId: m.exhibit.id });
    } else if (m.type === 'ended') {
      r.ended = m.reason; log(`ended: ${m.reason}`); done();
    } else if (m.type === 'error') {
      r.errors.push(m.message); log(`agent error: ${m.message}`);
    }
  });

  // Watchdog: no agent, a stalled turn, the overall cap.
  const watch = setInterval(() => {
    const now = Date.now();
    if (r.helloMs === null && now - dispatchedAt > HELLO_TIMEOUT_MS) { r.errors.push('no agent joined'); log('NO AGENT JOINED'); done(); }
    if (state === 'listening' && !mic.line && now - listeningSince > LISTEN_FALLBACK_MS && r.helloMs !== null) {
      if (r.turnsSpoken >= lines.length) { done(); return; }
      log('listening with nothing said: answering'); listeningSince = now; speakNext('fallback');
    }
    if ((state === 'thinking') && now - listeningSince > 30_000) { r.stalls++; listeningSince = now; log('STALL: thinking > 30s'); }
    if (now - dispatchedAt > SESSION_CAP_MS) { r.errors.push('session cap'); done(); }
  }, 1000);

  await finished;
  clearInterval(watch);
  r.durationMs = Date.now() - dispatchedAt;
  stop = true;
  await pump.catch(() => {});
  await lk.disconnect().catch(() => {});
  await closeVoiceRoom(admin, room, () => {});
  await db.update(sessions).set({ status: 'abandoned' }).where(and(eq(sessions.id, sessionId), eq(sessions.status, 'active')));
  return r;
}

// `lk agent status`: CPU "312m / 2", Mem "1.1GB / 4GB", Replicas "1 / 1 / 1".
type Sample = { atS: number; status: string; cpuMilli: number | null; mem: string; replicas: string };
async function sampleAgent(t0: number): Promise<Sample | null> {
  try {
    const { stdout } = await promisify(execFile)('lk', ['agent', 'status'], { timeout: 20_000 });
    const row = stdout.split('\n').find(l => l.includes('case-interviewer'));
    if (!row) return null;
    const c = row.split('│').map(s => s.trim());
    const cpu = /^(\d+(?:\.\d+)?)(m?)/.exec(c[7] ?? '');
    return { atS: Math.round((Date.now() - t0) / 1000), status: c[6], cpuMilli: cpu ? Number(cpu[1]) * (cpu[2] ? 1 : 1000) : null, mem: c[8], replicas: c[9] };
  } catch { return null; }
}

const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

async function main() {
  const owner = scriptOwnerId();
  const admin = roomAdminFromEnv();
  if (!admin) throw new Error('LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not set');
  const plan = Array.from({ length: N }, (_, i) => RUNS[i % RUNS.length].caseId);
  console.log(`Plan: ${N} voice sessions at once (${plan.join(', ')}), ${TURNS} candidate turns each, against the hosted agent.`);
  console.log(`Estimate: ≈ $${(N * TURNS * 0.04 + N * 0.1).toFixed(2)} (Claude ≈ $0.04/turn, Deepgram ≈ $0.0077/min); Cartesia from the plan.`);
  for (const r of RUNS.slice(0, Math.min(N, RUNS.length))) candidateLines(r.file).slice(0, TURNS).forEach(speech);   // synthesize up front (free)
  if (!CONFIRM) { console.log('Dry run: add --confirm to run it.'); process.exit(0); }

  const t0 = Date.now();
  const samples: Sample[] = [];
  let sampling = true;
  const sampler = (async () => { while (sampling) { const s = await sampleAgent(t0); if (s) { samples.push(s); console.log(`[${String(s.atS).padStart(4)}s agent] ${s.status} cpu ${s.cpuMilli ?? '?'}m mem ${s.mem} replicas ${s.replicas}`); } await new Promise(r => setTimeout(r, 10_000)); } })();

  const results = await Promise.all(Array.from({ length: N }, (_, i) => runOne(i, owner, admin, t0).catch(e => ({ i, caseId: plan[i], sessionId: '', helloMs: null, turnsSpoken: 0, agentLatency: [], speechEndToSpeakingMs: [], stalls: 0, fallbacks: 0, ended: null, errors: [String(e)], durationMs: 0 } as SessionResult))));
  sampling = false;
  await sampler;

  console.log('\n| # | case | agent joined | turns | first sound p50 / max | speech end → speaking p50 / max | stalls | ended | errors |');
  console.log('|---|---|---:|---:|---:|---:|---:|---|---|');
  for (const r of results) {
    const fs = r.agentLatency.map(l => l.firstSoundMs).filter((x): x is number => x !== null);
    console.log(`| ${r.i} | ${r.caseId} | ${r.helloMs === null ? '—' : (r.helloMs / 1000).toFixed(1) + 's'} | ${r.turnsSpoken} | ${pct(fs, 0.5) ?? '—'} / ${fs.length ? Math.max(...fs) : '—'} ms | ${pct(r.speechEndToSpeakingMs, 0.5) ?? '—'} / ${r.speechEndToSpeakingMs.length ? Math.max(...r.speechEndToSpeakingMs) : '—'} ms | ${r.stalls} | ${r.ended ?? '—'} | ${r.errors.join('; ') || '—'} |`);
  }
  const cpus = samples.map(s => s.cpuMilli).filter((x): x is number => x !== null);
  console.log(`\nAgent CPU peak ${cpus.length ? Math.max(...cpus) : '?'}m of 2000m; memory samples ${[...new Set(samples.map(s => s.mem))].join(', ')}; replicas ${[...new Set(samples.map(s => s.replicas))].join(', ')}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-n${N}.json`);
  writeFileSync(out, JSON.stringify({ n: N, turns: TURNS, results, samples }, null, 2));
  console.log(`Wrote ${out}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
