// Listenable demo of a voice case (M0 spike): one audio file with the timing a
// candidate would hear. No STT — a recorded candidate's lines are spoken by
// macOS `say`; a fixed end-of-turn gap stands in for Flux (~0.7s median
// measured). The interviewer is the real pipeline: the instant acknowledgment
// plays at end-of-turn, then each segment runTurn delivers is placed at the
// moment it was delivered plus the measured TTS first-audio time, so every
// silence in the file is a measured one. Interviewer voice: Deepgram Aura
// (REST, linear16) — Cartesia's free credits ran out.
//
//   npx tsx --env-file=<.env.local> scripts/voice-demo.ts [--run=batch-12-oct-06/00] [--endpoint-ms=700] [--voice=aura-2-orion-en]
//
// Writes Case Interview Runs/voice-demos/<stamp>-<run>.m4a and a .txt cue sheet.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { startSession } from '@/lib/orchestrator/start-session';
import { runTurn } from '@/lib/orchestrator/session-runner';
import { runPostTurnBackground } from '@/lib/orchestrator/post-turn';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { pickAck, shouldAcknowledge } from '@/lib/voice/acknowledge';
import { trimSilence } from '@/lib/voice/pcm';
import type { SegmentKind } from '@/lib/orchestrator/turn-types';
import { requireRunBudget } from '@/lib/llm-budget';

const flag = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const RUN = flag('run') ?? 'batch-12-oct-06/00';
const ENDPOINT_MS = Number(flag('endpoint-ms') ?? 700);
const VOICE = flag('voice') ?? 'aura-2-orion-en';
const CANDIDATE_VOICE = 'Samantha';
const RATE = 24000;
const OUT_DIR = 'Case Interview Runs/voice-demos';
const TMP = '.voice-cache/demo';

// ---- audio ----

const silence = (ms: number) => new Uint8Array(Math.max(0, Math.round((ms / 1000) * RATE)) * 2);
const ms = (pcm: Uint8Array) => (pcm.length / 2 / RATE) * 1000;

// Deepgram Aura: raw 16-bit PCM at RATE. Returns the audio and the time to
// its first byte (what a streaming player would wait before sound).
async function aura(text: string): Promise<{ pcm: Uint8Array; firstByteMs: number }> {
  const t0 = Date.now();
  const res = await fetch(`https://api.deepgram.com/v1/speak?model=${VOICE}&encoding=linear16&sample_rate=${RATE}&container=none`, {
    method: 'POST',
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY ?? ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) throw new Error(`Aura ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let firstByteMs = -1;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (firstByteMs < 0) firstByteMs = Date.now() - t0;
    parts.push(value);
  }
  return { pcm: new Uint8Array(Buffer.concat(parts)), firstByteMs };
}

// macOS `say` → 16-bit mono PCM at RATE (the WAV's data chunk).
function sayPcm(text: string, i: number): Uint8Array {
  mkdirSync(TMP, { recursive: true });
  const aiff = path.join(TMP, `c${i}.aiff`), wav = path.join(TMP, `c${i}.wav`);
  execFileSync('say', ['-v', CANDIDATE_VOICE, '-o', aiff, text]);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, wav]);
  const buf = readFileSync(wav);
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === 'data') return new Uint8Array(buf.subarray(off + 8, off + 8 + size));
    off += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}

function wavFile(pcm: Uint8Array): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// ---- the case ----

function candidateLines(): string[] {
  const [batch, prefix] = RUN.split('/');
  const dir = path.join('Case Interview Runs/test runs', batch);
  const sub = readdirSync(dir).find(d => d.startsWith(prefix));
  if (!sub) throw new Error(`no run ${RUN}`);
  const file = readdirSync(path.join(dir, sub)).find(f => f.endsWith('.json'))!;
  const run = JSON.parse(readFileSync(path.join(dir, sub, file), 'utf8')) as { turns: { role: string; text: string; turnIndex: number }[] };
  return run.turns.filter(t => t.role === 'candidate').sort((a, b) => a.turnIndex - b.turnIndex).map(t => t.text);
}

const fmt = (t: number) => `${Math.floor(t / 60000)}:${String(Math.floor((t % 60000) / 1000)).padStart(2, '0')}.${String(Math.floor((t % 1000) / 100))}`;

async function main() {
  const budget = requireRunBudget('voice-demo');
  process.on('exit', () => console.log(`[budget] ${budget.summary()}`));
  const lines = candidateLines();
  const owner = await db.query.sessions.findFirst({ orderBy: [desc(sessions.startedAt)] });
  if (!owner) throw new Error('No existing session to borrow a user id from.');
  const { sessionId, openingText } = await startSession(owner.userId, 'prof-001');
  console.log(`[demo] session ${sessionId} · ${lines.length} candidate lines from ${RUN} · interviewer ${VOICE} · end-of-turn gap ${ENDPOINT_MS}ms`);

  const track: Uint8Array[] = [];
  let now = 0;   // ms into the recording
  const cues: string[] = [];
  const put = (pcm: Uint8Array, who: string, text: string) => {
    cues.push(`${fmt(now)}  ${who.padEnd(11)} ${text}`);
    track.push(pcm); now += ms(pcm);
  };
  const gap = (g: number, note?: string) => {
    if (g <= 0) return;
    if (note) cues.push(`${fmt(now)}  ${'(silence)'.padEnd(11)} ${(g / 1000).toFixed(2)}s — ${note}`);
    track.push(silence(g)); now += g;
  };

  // Pre-synthesized acknowledgments (as the live agent would hold them).
  const ackAudio = new Map<string, Uint8Array>();

  put((await aura(openingText)).pcm, 'INTERVIEWER', openingText);
  gap(800);

  let phase: Phase = 'INTRO';
  let lastAck: string | null = null;
  const background: Promise<unknown>[] = [];
  const stats: { firstSoundMs: number | null; ackToSonnetMs: number | null; firstSonnetMs: number | null; firstUsefulMs: number | null }[] = [];

  for (let i = 0; i < lines.length; i++) {
    put(sayPcm(lines[i], i), 'CANDIDATE', lines[i]);
    const speechEnd = now;
    gap(ENDPOINT_MS, 'end-of-turn detection (simulated Flux)');

    const ack: string | null = shouldAcknowledge(lines[i]) ? pickAck(`${sessionId}:${i}`, lastAck) : null;
    if (ack) {
      lastAck = ack;
      if (!ackAudio.has(ack)) ackAudio.set(ack, trimSilence((await aura(ack)).pcm, RATE));
      put(ackAudio.get(ack)!, 'INTERVIEWER', `${ack}   [instant acknowledgment]`);
    }

    // The real turn: segments with the moment each was delivered.
    const eot = Date.now();
    const segments: { text: string; kind: SegmentKind; atMs: number }[] = [];
    const phaseBefore = phase;
    const result = await runTurn(sessionId, lines[i], {
      acknowledged: ack ?? undefined,
      onSegment: async seg => { if (seg.text.trim()) segments.push({ text: seg.text.trim(), kind: seg.kind, atMs: Date.now() - eot }); },
      defer: task => { background.push(task()); },
    });
    phase = result.phase;
    background.push(runPostTurnBackground({ sessionId, userId: owner.userId, caseId: 'prof-001', phase: phaseBefore, result }));

    // Place each segment at delivery time + its TTS first-byte time, after
    // whatever is already playing (the acknowledgment, an earlier segment).
    const eotOnTrack = speechEnd + ENDPOINT_MS;
    const tts = await Promise.all(segments.map(seg => aura(seg.text)));
    const dues = segments.map((seg, k) => eotOnTrack + seg.atMs + tts[k].firstByteMs);
    const ackEnd = now;
    let firstSonnet: number | null = null, firstUseful: number | null = null;
    for (let k = 0; k < segments.length; k++) {
      const seg = segments[k];
      const due = dues[k];
      gap(due - now, `waiting on the interviewer (delivered at +${(seg.atMs / 1000).toFixed(2)}s after end-of-turn, TTS first audio ${tts[k].firstByteMs}ms)`);
      firstSonnet ??= now;
      if (seg.kind !== 'say') firstUseful ??= now;
      put(tts[k].pcm, 'INTERVIEWER', seg.kind === 'say' ? seg.text : `${seg.text}   [${seg.kind}]`);
    }
    const firstSound = ack ? speechEnd + ENDPOINT_MS : firstSonnet;
    stats.push({
      firstSoundMs: firstSound != null ? firstSound - speechEnd : null,
      ackToSonnetMs: ack && firstSonnet != null ? Math.max(0, firstSonnet - ackEnd) : null,
      firstSonnetMs: firstSonnet != null ? firstSonnet - speechEnd : null,
      firstUsefulMs: firstUseful != null ? firstUseful - speechEnd : null,
    });
    const last = stats[stats.length - 1];
    console.log(`[demo] turn ${i + 1}/${lines.length}: ack=${ack ?? '-'} · silence ack→Sonnet ${last.ackToSonnetMs ?? '-'}ms · first Sonnet ${last.firstSonnetMs != null ? (last.firstSonnetMs / 1000).toFixed(2) + 's' : '-'} · first useful ${last.firstUsefulMs != null ? (last.firstUsefulMs / 1000).toFixed(2) + 's' : '-'}`);
    gap(600);
    if (result.ended) break;
  }
  await Promise.allSettled(background);

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const base = path.join(OUT_DIR, `${stamp}-${RUN.replace('/', '-')}`);
  const wav = `${base}.wav`;
  writeFileSync(wav, wavFile(new Uint8Array(Buffer.concat(track))));
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', wav, `${base}.m4a`]);
  rmSync(wav);
  const summary = (name: string, xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null).sort((a, b) => a - b);
    return v.length ? `${name}: median ${(v[Math.floor(v.length / 2)] / 1000).toFixed(2)}s, max ${(v[v.length - 1] / 1000).toFixed(2)}s (n ${v.length})` : `${name}: -`;
  };
  const gaps = [
    summary('end of speech → first sound', stats.map(s => s.firstSoundMs)),
    summary('silence, acknowledgment end → Sonnet speech', stats.map(s => s.ackToSonnetMs)),
    summary('end of speech → first Sonnet speech', stats.map(s => s.firstSonnetMs)),
    summary('end of speech → first useful (data line / question)', stats.map(s => s.firstUsefulMs)),
  ];
  for (const g of gaps) console.log(`[demo] ${g}`);
  writeFileSync(`${base}.txt`, [
    `Voice demo · session ${sessionId} · candidate lines from ${RUN} · interviewer ${VOICE} (Deepgram Aura) · candidate macOS say (${CANDIDATE_VOICE})`,
    `End-of-turn detection simulated at ${ENDPOINT_MS}ms (Flux median, Phase A). Interviewer timing is real: delivery time from the orchestrator + TTS first-byte time.`,
    ...gaps,
    '', ...cues,
  ].join('\n'));
  console.log(`[demo] wrote ${base}.m4a (${fmt(now)}) and ${base}.txt`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
