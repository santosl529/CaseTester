// Pronunciation demo (Lorenzo's brief, 17 Oct, item 2): each line as Cartesia
// says it today, and — where pronounce.ts changes the TTS text — as it says it
// now ("COGS" → "cogs", "MECE" → "mee-see"). Also the terms and symbols that
// reach the TTS unchanged ($480M, 10–12%, P&L, FY2023, …), to hear how each is
// spoken. Writes one WAV per rendering, words.json (Cartesia's word
// timestamps — whether "mee-see" comes back as one word or two) and index.txt.
//
// Paid: Cartesia characters; --dry prints the count and spends nothing. The
// count is checked against --cap and added to the monthly ledger.
//
//   npx tsx --env-file=<.env.local> scripts/voice-pronounce-demo.ts --out="Case Interview Runs/voice-demos/2026-10-17-pronunciation" --cap=1000 [--dry]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CartesiaTTS, CARTESIA_MODEL, defaultVoiceId } from '@/lib/voice/cartesia';
import { TtsCharBudget, RunCharCap, monthlyLedgerFile } from '@/lib/voice/tts-budget';
import { speechTextFor } from '@/lib/voice/pronounce';
import type { Word } from '@/lib/voice/types';

const RATE = 24000;
const flag = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const OUT = flag('out') ?? 'Case Interview Runs/voice-demos/2026-10-17-pronunciation';
const CAP = Number(flag('cap') ?? 0);
const DRY = process.argv.includes('--dry');

// Lines in the interviewer's own wording (batches 27–30, 9ccf0836), one per term.
export const LINES: { id: string; text: string; listen: string }[] = [
  { id: '01-cogs', text: 'COGS went from 42% to 58% of revenue.', listen: 'COGS' },
  { id: '02-mece', text: 'Is that split MECE, and which branch would you test first?', listen: 'MECE' },
  { id: '03-cogs-share', text: 'Coffee beans were 25% of COGS two years ago.', listen: 'COGS mid-sentence' },
  { id: '04-amp-money', text: 'Brew & Bean has 200 stores and $480M in revenue.', listen: '"&", "$480M"' },
  { id: '05-cents', text: 'The average transaction is $6.80, up from $6.20 two years ago.', listen: '"$6.80"' },
  { id: '06-range', text: 'You said a 10–12% price rise recovers most of the gap.', listen: '"10–12%" (en dash)' },
  { id: '07-pl', text: 'What happens to the P&L and to EBITDA if SG&A stays flat?', listen: 'P&L, EBITDA, SG&A' },
  { id: '08-sku-roi', text: 'How many SKUs would you cut, and what is the ROI of that?', listen: 'SKUs, ROI' },
  { id: '09-fy-yoy', text: 'Revenue grew 15% YoY, from FY2023 to FY2025.', listen: 'YoY, FY2023' },
  { id: '10-route', text: 'On the Hub–Lakeport route, fares fell vs. last year.', listen: '"Hub–Lakeport", "vs."' },
  { id: '11-points', text: "That's about 4.2 percentage points, roughly ~4 points of revenue.", listen: '"4.2", "~4"' },
];

function wav(pcm: Uint8Array): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.length)]);
}

async function render(tts: CartesiaTTS, text: string): Promise<{ pcm: Uint8Array; words: Word[] }> {
  const utt = await tts.open({ encoding: 'pcm_s16le', sampleRate: RATE }, { timestamps: true });
  const chunks: Uint8Array[] = [];
  const words: Word[] = [];
  utt.onAudio(p => chunks.push(p));
  utt.onWords?.(ws => words.push(...ws));
  await utt.push(text);
  await utt.end();
  const pcm = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { pcm.set(c, o); o += c.length; }
  return { pcm, words };
}

async function main() {
  const jobs = LINES.flatMap(l => {
    const now = speechTextFor(l.text).text;
    return [{ file: `${l.id}-today.wav`, text: l.text, line: l }, ...(now !== l.text ? [{ file: `${l.id}-new.wav`, text: now, line: l }] : [])];
  });
  const chars = jobs.reduce((n, j) => n + j.text.length, 0);
  console.log(`${jobs.length} renders, ${chars} characters (model ${CARTESIA_MODEL})`);
  if (DRY) { for (const j of jobs) console.log(`  ${j.file}  ${j.text}`); return; }
  if (!(CAP > 0) || chars > CAP) throw new Error(`--cap=${CAP} must cover ${chars} characters`);
  const run = new RunCharCap(CAP);
  const ledger = new TtsCharBudget(monthlyLedgerFile(), Number(process.env.VOICE_TTS_CHAR_CAP ?? 90_000), 0);
  if (!run.take(chars) || !ledger.take(chars)) throw new Error('over the run cap or the monthly ledger');
  const voice = await defaultVoiceId();
  const tts = new CartesiaTTS(voice);
  mkdirSync(OUT, { recursive: true });
  const index: string[] = [`Pronunciation demo — ${new Date().toISOString().slice(0, 10)} · Cartesia ${CARTESIA_MODEL} · ${chars} characters`,
    '"-today" is what plays now; "-new" is with pronounce.ts (COGS → "cogs", MECE → "mee-see"). Only COGS and MECE change.', ''];
  const allWords: Record<string, Word[]> = {};
  for (const j of jobs) {
    const { pcm, words } = await render(tts, j.text);
    writeFileSync(path.join(OUT, j.file), wav(pcm));
    allWords[j.file] = words;
    index.push(`${j.file}  — listen for ${j.line.listen}\n    TTS text: ${j.text}\n    words back: ${words.map(w => w.word).join(' | ')}`);
    console.log(`wrote ${j.file}`);
  }
  writeFileSync(path.join(OUT, 'words.json'), JSON.stringify(allWords, null, 1));
  writeFileSync(path.join(OUT, 'index.txt'), index.join('\n') + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
