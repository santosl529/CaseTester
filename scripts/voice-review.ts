// Review a recorded voice session (VOICE_RECORD=1; lib/voice/recorder.ts):
// per turn — when the candidate stopped speaking, when Flux ended the turn,
// the acknowledgment, the first real content, barge-in reaction — with flags
// for the moments that sound robotic. Times are mm:ss.mmm into mix.wav. Free.
//
//   npx tsx scripts/voice-review.ts .voice-cache/recordings/<session>-<stamp> [--timeline]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { voicedIntervals, reviewSession } from '@/lib/voice/review';
import type { RecordedEvent } from '@/lib/voice/recorder';

function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: npx tsx scripts/voice-review.ts <recording dir> [--timeline]');
  const wav = readFileSync(path.join(dir, 'candidate.wav'));
  const rate = wav.readUInt32LE(24);
  const samples = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length));
  const events = readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as RecordedEvent);
  const voiced = voicedIntervals(samples, rate);
  const turns = reviewSession(events, voiced);
  const ts = (ms: number | null) => {
    if (ms === null) return '–';
    const m = Math.floor(ms / 60000), s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
    return `${m}:${s}`;
  };
  const ms = (v: number | null) => (v === null ? '–' : `${v}ms`);

  console.log(`${dir}\n${turns.length} turns · ${voiced.length} stretches of candidate speech · ${(samples.length / rate).toFixed(1)}s recorded\n`);
  for (const t of turns) {
    console.log(`t${t.seq} @${ts(t.finalAt)} "${t.text.slice(0, 70)}${t.text.length > 70 ? '…' : ''}"`);
    console.log(`   speech end ${ts(t.speechEnd)} → end of turn +${ms(t.endpointMs)} · ack ${ts(t.ackAt)} → content ${ts(t.firstContentAt)} (${ms(t.ackToContentMs)})` +
      `${t.bargeReactionMs !== null ? ` · barge-in stopped after ${t.bargeReactionMs}ms` : ''}${t.cancelled ? ' · CANCELLED' : t.interrupted ? ' · CUT' : ''}`);
    if (t.flags.length) console.log(`   ⚑ ${t.flags.join(', ')}`);
  }
  const counts = turns.flatMap(t => t.flags).reduce<Record<string, number>>((a, f) => ({ ...a, [f]: (a[f] ?? 0) + 1 }), {});
  console.log(`\nflags: ${Object.keys(counts).length ? Object.entries(counts).map(([k, v]) => `${k} ×${v}`).join(', ') : 'none'}`);

  if (process.argv.includes('--timeline')) {
    console.log('\ntimeline (candidate speech ▮, events ·):');
    const rows = [
      ...voiced.map(v => ({ t: v.start, line: `▮ candidate speaking until ${ts(v.end)}` })),
      ...events.filter(e => !(e.type === 'stt' && e.kind === 'speech')).map(e => {
        const { t, type, ...rest } = e;
        return { t, line: `· ${type} ${JSON.stringify(rest)}` };
      }),
    ].sort((a, b) => a.t - b.t);
    for (const r of rows) console.log(`${ts(r.t)}  ${r.line}`);
  }
}

main();
