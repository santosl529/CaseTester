// A voice sample (Lorenzo's brief, 17 Oct, item 5, narrowed by his ruling: one
// voice he picked, on sonic-3.6 — no A/B of voices). Five interviewer lines
// from session 9ccf0836 — the opener, a probe, a data release, a correction, a
// question — in the TTS text as it plays live (pronounce.ts), one WAV each,
// plus index.txt. Two lines were saved cut off (the candidate spoke over them);
// they are closed with the words marked in index.txt.
//
// Paid: Cartesia characters; --dry prints the count. Checked against --cap and
// added to the monthly ledger.
//
//   npx tsx --env-file=<.env.local> scripts/voice-sample.ts --voice=<id> --model=sonic-3.6 \
//     --out="Case Interview Runs/voice-demos/2026-10-18-voice-533b2990-sonic36" --cap=1300 [--speed=1.0] [--dry]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CartesiaTTS } from '@/lib/voice/cartesia';
import { TtsCharBudget, RunCharCap, monthlyLedgerFile } from '@/lib/voice/tts-budget';
import { speechTextFor } from '@/lib/voice/pronounce';

const RATE = 24000;
const flag = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const VOICE = flag('voice');
const MODEL = flag('model') ?? 'sonic-3.6';
const OUT = flag('out') ?? `Case Interview Runs/voice-demos/2026-10-18-voice-${(VOICE ?? 'x').slice(0, 8)}-${MODEL.replace(/[^a-z0-9]/gi, '')}`;
const CAP = Number(flag('cap') ?? 0);
const DRY = process.argv.includes('--dry');

// 9ccf0836 (17 Oct), the interviewer's lines as saved, less the filler. [closing words] were added.
const LINES: { id: string; turn: string; text: string; added?: string }[] = [
  { id: '1-opener', turn: 'T0', text: "Your client is Brew & Bean, a specialty coffee chain with 200 locations across the US. Over the past two years, their net profit margin has declined from 24% to 6%, even though revenues have grown 15% over the same period. The CEO has hired us to identify the root cause of this profit decline and recommend how to reverse it. How would you approach this problem? Take a moment, then walk me through how you'd approach this." },
  { id: '2-probe', turn: 'T20', text: 'You said ten percent of the increase comes from beans. What is that ten percent a percentage of, and what base does it rest on?' },
  { id: '3-data-release', turn: 'T14', text: "Other input costs — dairy, packaging, and food — are up 37.5% over the past two years. Raw coffee bean costs are up 40% over the past two years. As I mentioned: Coffee beans were 25% of COGS two years ago. With that in hand, what would you want to know next to pin down what's driving COGS?", added: '"?"' },
  { id: '4-correction', turn: 'T24', text: "Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points, not 10. Given that, how large is the bean contribution compared with the other inputs, and what does that tell you about where to look next?", added: '"look next?"' },
  { id: '5-question', turn: 'T34', text: 'Putting it together, what is your recommendation to the CEO, and what would you do first?' },
];

function wav(pcm: Uint8Array): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.length)]);
}

async function main() {
  if (!VOICE) throw new Error('--voice=<Cartesia voice id> is required');
  const jobs = LINES.map(l => ({ ...l, spoken: speechTextFor(l.text).text }));
  const chars = jobs.reduce((n, j) => n + j.spoken.length, 0);
  console.log(`${jobs.length} renders, ${chars} characters · voice ${VOICE} · ${MODEL}`);
  if (DRY) return;
  if (!(CAP > 0) || chars > CAP) throw new Error(`--cap=${CAP} must cover ${chars} characters`);
  const run = new RunCharCap(CAP);
  const ledger = new TtsCharBudget(monthlyLedgerFile(), Number(process.env.VOICE_TTS_CHAR_CAP ?? 90_000), 0);
  if (!run.take(chars) || !ledger.take(chars)) throw new Error('over the run cap or the monthly ledger');
  const tts = new CartesiaTTS(VOICE, MODEL);
  mkdirSync(OUT, { recursive: true });
  const index = [`Voice sample — ${new Date().toISOString().slice(0, 10)} · voice ${VOICE} · Cartesia ${MODEL} · ${chars} characters`,
    'Five interviewer lines from session 9ccf0836, as the TTS reads them live (COGS → "cogs").', ''];
  for (const j of jobs) {
    const utt = await tts.open({ encoding: 'pcm_s16le', sampleRate: RATE });
    const chunks: Uint8Array[] = [];
    utt.onAudio(p => chunks.push(p));
    await utt.push(j.spoken);
    await utt.end();
    const pcm = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of chunks) { pcm.set(c, o); o += c.length; }
    writeFileSync(path.join(OUT, `${j.id}.wav`), wav(pcm));
    index.push(`${j.id}.wav  (${j.turn}${j.added ? `; saved cut off — ${j.added} added` : ''})\n    ${j.spoken}`);
    console.log(`wrote ${j.id}.wav`);
  }
  writeFileSync(path.join(OUT, 'index.txt'), index.join('\n') + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
