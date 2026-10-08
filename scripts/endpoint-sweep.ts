// End-of-turn sweep (latency experiment 1, 7 Oct): synthetic candidate clips
// — real candidate lines from batch 13 with thinking pauses, a pause after a
// complete sentence, hesitation before a figure, and a self-correction
// (lib/voice/endpoint.ts) — spoken by macOS `say` and streamed in real time
// through Deepgram Flux at several end-of-turn / eager thresholds. No model
// calls. Scores detection time from the true end of speech, premature ends
// (would interrupt), the eager lead, eager signals cancelled by more speech,
// and whether the eager transcript matched the final one.
//
// Synthetic pauses carry no real prosody — the human recordings are the
// final check. One Flux stream at a time (the account's limit).
//
//   npx tsx --env-file=<.env.local> scripts/endpoint-sweep.ts [--configs=0.7:0.5,0.6:0.4] [--lines=8] [--limit=N]

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DeepgramFluxSTT } from '@/lib/voice/deepgram';
import { silence, speechEndSec, streamRealtime } from '@/lib/voice/pcm';
import { clipVariants, scoreSignals, type Clip, type EndpointScore, type Signal } from '@/lib/voice/endpoint';

const flag = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const CONFIGS = (flag('configs') ?? '0.7:0.5,0.6:0.4,0.8:0.5,0.9:0.6,0.7:0.3')
  .split(',').map(c => { const [eot, eager] = c.split(':').map(Number); return { eot, eager }; });
const N_LINES = Number(flag('lines') ?? 8);
const LIMIT = Number(flag('limit') ?? 0) || Infinity;
const RATE = 16000;
const LEAD_SEC = 0.3;
const MAX_TRAIL_SEC = 6;     // past Flux's default 5s end-of-turn timeout
const CACHE = '.voice-cache/endpoint';
const OUT_DIR = 'Case Interview Runs/voice-spike';
const VOICE = 'Samantha';

// One line per batch-13 persona: the first answer with a figure, cut to three
// sentences.
function sourceLines(): string[] {
  const dir = 'Case Interview Runs/test runs/batch-13-oct-06';
  const lines: string[] = [];
  for (const sub of readdirSync(dir).filter(d => !d.startsWith('.')).sort()) {
    const jf = readdirSync(path.join(dir, sub)).find(f => f.endsWith('.json'));
    if (!jf) continue;
    const run = JSON.parse(readFileSync(path.join(dir, sub, jf), 'utf8')) as { turns: { role: string; text: string; turnIndex: number }[] };
    const turn = run.turns.filter(t => t.role === 'candidate' && /\d/.test(t.text) && t.text.length > 150).sort((a, b) => a.turnIndex - b.turnIndex)[0];
    if (!turn) continue;
    const flat = turn.text.replace(/\s+/g, ' ').replace(/[*_#>`]/g, '').trim();
    lines.push(flat.split(/(?<=[.!?])\s+/).slice(0, 3).join(' '));
    if (lines.length >= N_LINES) break;
  }
  return lines;
}

function wavData(buf: Buffer): Uint8Array {
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === 'data') return new Uint8Array(buf.subarray(off + 8, off + 8 + size));
    off += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}

function clipAudio(text: string): Uint8Array {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${createHash('sha1').update(`${VOICE}|${RATE}|${text}`).digest('hex')}.pcm`);
  if (existsSync(file)) return new Uint8Array(readFileSync(file));
  const aiff = `${file}.aiff`, wav = `${file}.wav`;
  execFileSync('say', ['-v', VOICE, '-o', aiff, text]);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, wav]);
  const pcm = wavData(readFileSync(wav));
  writeFileSync(file, pcm);
  return pcm;
}

// Streams the clip as a live mic would and records every Flux signal.
async function hear(stt: DeepgramFluxSTT, audio: Uint8Array): Promise<{ signals: Signal[]; speechEndMs: number }> {
  const session = await stt.open({ encoding: 'pcm_s16le', sampleRate: RATE });
  const signals: Signal[] = [];
  const start = Date.now();
  const speechEndMs = start + (LEAD_SEC + speechEndSec(audio, RATE)) * 1000;
  let done = false;
  session.onSignal(s => {
    if (s.kind === 'speech') return; // barge-in input (Phase B); the sweep scores turn ends only
    signals.push(s.kind === 'resumed' ? { kind: 'resumed', atMs: s.atMs } : { kind: s.kind, atMs: s.atMs, transcript: s.transcript });
    if (s.kind === 'final' && s.atMs >= speechEndMs) done = true;
  });
  await streamRealtime(new Uint8Array(Buffer.concat([silence(LEAD_SEC, RATE), audio])), RATE, f => session.push(f));
  const until = Date.now() + MAX_TRAIL_SEC * 1000;
  const quiet = silence(0.02, RATE);
  while (!done && Date.now() < until) {
    session.push(quiet);
    await new Promise(r => setTimeout(r, 20));
  }
  await session.close();
  // Wall-clock times relative to the stream start.
  return { signals: signals.map(s => ({ ...s, atMs: s.atMs - start })), speechEndMs: speechEndMs - start };
}

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };

type Row = { config: string; line: number; kind: Clip['kind']; score: EndpointScore; speechEndMs: number; signals: Signal[] };

function summarize(rows: Row[]) {
  const det = rows.map(r => r.score.detectionMs).filter((x): x is number => x != null);
  const lead = rows.map(r => r.score.eagerLeadMs).filter((x): x is number => x != null);
  const eagers = rows.reduce((n, r) => n + r.score.eagers, 0), resumed = rows.reduce((n, r) => n + r.score.resumed, 0);
  const withLead = rows.filter(r => r.score.eagerLeadMs != null);
  const kinds = [...new Set(rows.map(r => r.kind))];
  const prem = kinds.map(k => `${k} ${rows.filter(r => r.kind === k && r.score.premature.length > 0).length}/${rows.filter(r => r.kind === k).length}`).join(', ');
  return `detection median ${pct(det, 0.5)}ms p90 ${pct(det, 0.9)}ms · premature clips ${rows.filter(r => r.score.premature.length).length}/${rows.length} (${prem}) · ` +
    `no end-of-turn ${rows.filter(r => r.score.detectionMs == null).length} · eager lead median ${pct(lead, 0.5)}ms (on ${withLead.length}/${rows.length} clips) · ` +
    `eager resumed ${resumed}/${eagers} · eager transcript = final ${withLead.filter(r => r.score.eagerMatches).length}/${withLead.length}`;
}

async function main() {
  const clips = sourceLines().flatMap((line, i) => clipVariants(line).map(c => ({ ...c, line: i }))).slice(0, LIMIT);
  console.log(`${clips.length} clips · ${CONFIGS.length} configs`);
  const rows: Row[] = [];
  for (const cfg of CONFIGS) {
    const name = `eot ${cfg.eot} / eager ${cfg.eager}`;
    const stt = new DeepgramFluxSTT({ eotThreshold: cfg.eot, eagerEotThreshold: cfg.eager });
    const cfgRows: Row[] = [];
    for (const c of clips) {
      const { signals, speechEndMs } = await hear(stt, clipAudio(c.text));
      const row = { config: name, line: c.line, kind: c.kind, score: scoreSignals(signals, speechEndMs), speechEndMs, signals };
      cfgRows.push(row);
      console.log(`  [${name}] line ${c.line} ${c.kind.padEnd(10)} detection ${row.score.detectionMs ?? '-'}ms premature ${row.score.premature.length} eagerLead ${row.score.eagerLeadMs ?? '-'} resumed ${row.score.resumed}`);
    }
    rows.push(...cfgRows);
    console.log(`${name}: ${summarize(cfgRows)}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `endpoint-sweep-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ clips, rows }, null, 2));
  console.log('\nSUMMARY');
  for (const cfg of CONFIGS) { const n = `eot ${cfg.eot} / eager ${cfg.eager}`; console.log(`${n}: ${summarize(rows.filter(r => r.config === n))}`); }
  console.log(`wrote ${file}`);
}

main().catch(e => { console.error(e); process.exit(1); });
