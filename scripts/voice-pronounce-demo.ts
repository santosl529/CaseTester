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
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CartesiaTTS, CARTESIA_MODEL, defaultVoiceId } from '@/lib/voice/cartesia';
import { RunCharCap } from '@/lib/voice/tts-budget';
import { speechTextFor } from '@/lib/voice/pronounce';
import type { Word } from '@/lib/voice/types';

const RATE = 24000;
const flag = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const OUT = flag('out') ?? 'Case Interview Runs/voice-demos/2026-10-17-pronunciation';
const CAP = Number(flag('cap') ?? 0);
const DRY = process.argv.includes('--dry');
// --only=<id>[,<id>]: just those renders (file stems, e.g. 02-mece-new); index.txt and words.json are updated, not rewritten.
const ONLY = (flag('only') ?? '').split(',').filter(Boolean);

// Lines in the interviewer's own wording (batches 27–30, 9ccf0836), one per term.
export const LINES: { id: string; text: string; listen: string; newOnly?: boolean }[] = [
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
  // Item 1's conversion lines (own-quantity.ts), to hear their wording — as they play now only.
  { id: '12-conversion', text: "In revenue terms, that's about 4.2 points.", listen: 'the conversion line (9ccf0836 T24)', newOnly: true },
  { id: '13-conversion-pricing', text: "From today's 6% margin, recovering 16 points of margin takes about a 20.5% price rise.", listen: 'the conversion line (batch 30 Noor t16)', newOnly: true },
  { id: '14-own-base', text: "In COGS terms, bean inflation's contribution to the COGS increase is about 10 points, not 15.", listen: 'a correction on their own base', newOnly: true },
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
    if (l.newOnly) return [{ file: `${l.id}.wav`, text: now, line: l }];
    return [{ file: `${l.id}-today.wav`, text: l.text, line: l }, ...(now !== l.text ? [{ file: `${l.id}-new.wav`, text: now, line: l }] : [])];
  });
  if (ONLY.length) jobs.splice(0, jobs.length, ...jobs.filter(j => ONLY.includes(j.file.replace(/\.wav$/, ''))));
  const chars = jobs.reduce((n, j) => n + j.text.length, 0);
  console.log(`${jobs.length} renders, ${chars} characters (model ${CARTESIA_MODEL})`);
  if (DRY) { for (const j of jobs) console.log(`  ${j.file}  ${j.text}`); return; }
  if (!(CAP > 0) || chars > CAP) throw new Error(`--cap=${CAP} must cover ${chars} characters`);
  const run = new RunCharCap(CAP);
  const ledger = await (await import('@/lib/voice/tts-ledger-store')).openTtsLedger(0);
  if (!run.take(chars) || !ledger.take(chars)) throw new Error('over the run cap or the monthly ledger');
  const voice = await defaultVoiceId();
  const tts = new CartesiaTTS(voice);
  mkdirSync(OUT, { recursive: true });
  if (ONLY.length) {
    const wordsFile = path.join(OUT, 'words.json');
    const all = existsSync(wordsFile) ? JSON.parse(readFileSync(wordsFile, 'utf8')) as Record<string, Word[]> : {};
    const notes: string[] = [];
    for (const j of jobs) {
      const { pcm, words } = await render(tts, j.text);
      writeFileSync(path.join(OUT, j.file), wav(pcm));
      all[j.file] = words;
      notes.push(`${j.file}  — re-rendered ${new Date().toISOString().slice(0, 10)} (${j.text.length} characters)\n    TTS text: ${j.text}\n    words back: ${words.map(w => w.word).join(' | ')}`);
      console.log(`wrote ${j.file}`);
    }
    writeFileSync(wordsFile, JSON.stringify(all, null, 1));
    appendFileSync(path.join(OUT, 'index.txt'), `\n${notes.join('\n')}\n`);
    return;
  }
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
  await ledger.flush();
}

// The database pool stays open: exit when done.
main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
