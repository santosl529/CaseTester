// Keyterm A/B (Lorenzo, 17 Oct): one recording of a person reading sentences
// that mix "costs", "COGS", "COGS share" and "MECE", streamed to Flux twice —
// without keyterms, then with the case's (keyterms.ts) — in real time, as the
// live mic is. Writes both transcripts, the turns where they differ, and the
// counts of the words at risk (does the "COGS" boost turn "costs" into "COGS"?).
//
// Paid: Deepgram Flux, about twice the recording's length in streamed minutes.
// --max-minutes caps the recording it will stream (default 3); --dry prints the
// length and spends nothing. Runs one stream at a time (the account's limit).
//
//   npx tsx --env-file=<.env.local> scripts/keyterm-ab.ts --audio=<recording: m4a/wav/aiff> [--case=prof-001] \
//     [--out="Case Interview Runs/voice-demos/2026-10-17-keyterm-ab"] [--max-minutes=3] [--dry]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DeepgramFluxSTT } from '@/lib/voice/deepgram';
import { keytermsFor } from '@/lib/voice/keyterms';
import { silence, streamRealtime } from '@/lib/voice/pcm';
import { getCaseById } from '@/lib/cases/loader';

const RATE = 16000;
const flag = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const AUDIO = flag('audio');
const CASE = flag('case') ?? 'prof-001';
const OUT = flag('out') ?? 'Case Interview Runs/voice-demos/2026-10-17-keyterm-ab';
const MAX_MIN = Number(flag('max-minutes') ?? 3);
const DRY = process.argv.includes('--dry');

// The recording as 16 kHz mono 16-bit PCM (macOS afconvert).
function pcmOf(file: string): Uint8Array {
  const wav = path.join(tmpdir(), `ab-${process.pid}.wav`);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', file, wav]);
  const buf = readFileSync(wav);
  for (let o = 12; o + 8 <= buf.length;) {
    const id = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4);
    if (id === 'data') return new Uint8Array(buf.subarray(o + 8, o + 8 + size));
    o += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}

async function transcribe(audio: Uint8Array, keyterms: string[] | undefined): Promise<string[]> {
  const session = await new DeepgramFluxSTT({ eotThreshold: 0.7, eagerEotThreshold: 0.5, ...(keyterms ? { keyterms } : {}) }).open({ encoding: 'pcm_s16le', sampleRate: RATE });
  const finals: string[] = [];
  session.onSignal(s => { if (s.kind === 'final' && s.transcript.trim()) finals.push(s.transcript.trim()); });
  await streamRealtime(new Uint8Array(Buffer.concat([audio, silence(3, RATE)])), RATE, f => session.push(f));
  await new Promise(r => setTimeout(r, 2000));
  await session.close();
  return finals;
}

const COUNTED: [string, RegExp][] = [
  ['costs', /\bcosts?\b/gi], ['COGS', /\bcogs\b/gi], ['COGS share', /\bcogs\s+shares?\b/gi], ['Cogshare/cog share', /\bcogshares?\b|\bcog\s+shares?\b/gi],
  ['MECE', /\bmece\b/gi], ['misheard MECE (miss/messy/mecey)', /\b(?:miss(?:ee|y)?|messy|mecey|meecy|mesi)\b/gi],
];
const counts = (lines: string[]) => COUNTED.map(([k, re]) => `${k}: ${lines.join(' ').match(re)?.length ?? 0}`).join(' · ');

async function main() {
  if (!AUDIO) throw new Error('--audio=<recording> is required');
  const audio = pcmOf(AUDIO);
  const minutes = audio.length / 2 / RATE / 60;
  console.log(`recording ${minutes.toFixed(2)} min → about ${(2 * (minutes + 0.1)).toFixed(2)} streamed Flux minutes (two passes)`);
  if (minutes > MAX_MIN) throw new Error(`the recording is over --max-minutes=${MAX_MIN}`);
  if (DRY) return;
  const terms = keytermsFor(getCaseById(CASE));
  const off = await transcribe(audio, undefined);
  const on = await transcribe(audio, terms);
  mkdirSync(OUT, { recursive: true });
  const n = Math.max(off.length, on.length);
  const rows = Array.from({ length: n }, (_, i) => ({ i, a: off[i] ?? '', b: on[i] ?? '' }));
  const report = [
    `Keyterm A/B — ${new Date().toISOString().slice(0, 10)} · ${AUDIO} · ${minutes.toFixed(2)} min · case ${CASE}`,
    `keyterms (${terms.length}): ${terms.join(', ')}`, '',
    `without: ${counts(off)}`, `with:    ${counts(on)}`, '',
    `turns: ${off.length} without, ${on.length} with; differing: ${rows.filter(r => r.a !== r.b).length}`, '',
    ...rows.filter(r => r.a !== r.b).flatMap(r => [`#${r.i + 1}`, `  without: ${r.a}`, `  with:    ${r.b}`]),
  ];
  writeFileSync(path.join(OUT, 'ab.txt'), report.join('\n') + '\n');
  writeFileSync(path.join(OUT, 'transcripts.json'), JSON.stringify({ off, on, keyterms: terms }, null, 1));
  console.log(report.join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
