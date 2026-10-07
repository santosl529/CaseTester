// Playback-scheduler simulation (latency step 2, 7 Oct): replays the logged
// delivery times of live text runs through lib/voice/playback.ts under
// several filler policies, to see what the acknowledgment and the thinking
// filler do to the first useful audio. Free — no model, STT or TTS calls.
//
// Measured: when each segment was delivered (run logs, "[timing]").
// ESTIMATED: audio durations (12.5 chars/s, Aura in the 7 Oct demos), TTS
// first audio for model segments (140ms, Cartesia, Phase A). Times are from
// end of turn; end-of-turn detection itself is not included. Each turn
// assumes an instant acknowledgment; a "say" that is only an acknowledgment
// is dropped (the double_ack veto), any other "say" plays before the useful
// segment.
//
//   npx tsx scripts/playback-sim.ts batch-12-oct-06 batch-13-oct-06 batch-14-oct-07-state-in-system

import { load, type Row } from './useful-latency';
import { schedulePlayback, type FillerPolicy, type PlaySegment } from '@/lib/voice/playback';
import { ACKS } from '@/lib/voice/acknowledge';

// The thinking fillers as they were on 7 Oct (removed from the voice path
// after the demo: they sounded scripted).
const FILLERS = ['Let me think about that for a second.', 'Give me a moment on that.', 'Hmm, let me consider that.', 'One second while I think that through.'];
const FILLER_DELAY_MS = 400;
import { isBareAcknowledgment } from '@/lib/orchestrator/stream-turn';

const CHARS_PER_SEC = 12.5;  // estimate
const TTS_FIRST_AUDIO_MS = 140;  // estimate
const durMs = (text: string) => Math.round((text.length / CHARS_PER_SEC) * 1000);

// Natural boundaries: the end of each word, spread by character position.
function wordCuts(text: string): number[] {
  const total = durMs(text);
  const cuts: number[] = [];
  for (const m of text.matchAll(/\S+/g)) cuts.push(Math.round(((m.index! + m[0].length) / text.length) * total));
  return cuts;
}
// Two-beat boundaries: after the first clause ("Hmm, | let me see."), and the end.
function beatCuts(text: string): number[] {
  const total = durMs(text);
  const comma = text.indexOf(',');
  return comma > 0 ? [Math.round(((comma + 1) / text.length) * total), total] : [total];
}

// Candidate short fillers (~1s at the estimate rate): neutral, no grading.
const SHORT_FILLERS = ['Hmm, let me see.', 'Okay, one moment.', 'Let me see.'];

// say: "play" (today), "skip" (dropped if useful audio is ready before it
// starts), "drop" (never spoken on an acknowledged turn).
type Arm = { name: string; delayMs?: number; mode: FillerPolicy['mode']; fillers: readonly string[]; cuts: (t: string) => number[]; say: 'play' | 'skip' | 'drop' };
const NONE = { mode: 'none' as const, fillers: FILLERS, cuts: () => [] };
const CURRENT_FULL = { mode: 'full' as const, fillers: FILLERS, cuts: (t: string) => [durMs(t)] };
const CURRENT_YIELD = { mode: 'yield' as const, fillers: FILLERS, cuts: wordCuts };
const SHORT_FULL = { mode: 'full' as const, fillers: SHORT_FILLERS, cuts: (t: string) => [durMs(t)] };
const SHORT_BEAT = { mode: 'yield' as const, fillers: SHORT_FILLERS, cuts: beatCuts };
const SHORT_YIELD = { mode: 'yield' as const, fillers: SHORT_FILLERS, cuts: wordCuts };
const ARMS: Arm[] = [
  { name: 'no filler', ...NONE, say: 'play' },
  { name: 'current (full filler)', ...CURRENT_FULL, say: 'play' },
  { name: 'current, yield at word', ...CURRENT_YIELD, say: 'play' },
  { name: 'short, full', ...SHORT_FULL, say: 'play' },
  { name: 'short, yield at beat', ...SHORT_BEAT, say: 'play' },
  { name: 'short, yield at word', ...SHORT_YIELD, say: 'play' },
  { name: 'no filler, skip say', ...NONE, say: 'skip' },
  { name: 'no filler, drop say', ...NONE, say: 'drop' },
  { name: 'current yield, skip say', ...CURRENT_YIELD, say: 'skip' },
  { name: 'short yield, skip say', ...SHORT_YIELD, say: 'skip' },
  { name: 'short yield, drop say', ...SHORT_YIELD, say: 'drop' },
  { name: '  same, filler at +700ms', ...SHORT_YIELD, say: 'drop', delayMs: 700 },
  { name: '  same, filler at +1000ms', ...SHORT_YIELD, say: 'drop', delayMs: 1000 },
];

function segmentsFor(r: Row, say: Arm['say']): PlaySegment[] {
  const segs: PlaySegment[] = [];
  const m = r.marks;
  // A say segment went out first when the first delivery came before the useful one.
  if (say !== 'drop' && m.first_delivered < r.useful && r.say.trim() && !isBareAcknowledgment(r.say)) {
    segs.push({ kind: 'say', readyMs: m.first_delivered + TTS_FIRST_AUDIO_MS, durMs: durMs(r.say) });
  }
  segs.push({ kind: m.data_line_delivered === r.useful ? 'data' : 'tail', readyMs: r.useful + TTS_FIRST_AUDIO_MS, durMs: 3000 });
  return segs;
}

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function main() {
  const batches = process.argv.slice(2);
  if (!batches.length) throw new Error('name one or more batches under Case Interview Runs/test runs');
  const rows = batches.flatMap(load);
  console.log(`${rows.length} model turns from ${batches.join(', ')} · ms from end of turn · durations and TTS first audio are ESTIMATES`);
  console.log(`  model useful segment ready (+${TTS_FIRST_AUDIO_MS}ms TTS): median ${pct(rows.map(r => r.useful + TTS_FIRST_AUDIO_MS), 0.5)} / p90 ${pct(rows.map(r => r.useful + TTS_FIRST_AUDIO_MS), 0.9)}`);
  console.log(`  ${'arm'.padEnd(26)}${'first useful audio'.padEnd(20)}${'delay vs ready'.padEnd(17)}${'filler'.padEnd(9)}${'cut'.padEnd(7)}${'longest silence'.padEnd(18)}silence >1s  say played`);
  for (const arm of ARMS) {
    const out = rows.map((r, i) => {
      const ack = ACKS[i % ACKS.length];
      const fillerText = arm.fillers[i % arm.fillers.length];
      const policy: FillerPolicy = { mode: arm.mode, delayMs: arm.delayMs ?? FILLER_DELAY_MS, durMs: durMs(fillerText), cutsMs: arm.cuts(fillerText) };
      const p = schedulePlayback({ ackDurMs: durMs(ack), segments: segmentsFor(r, arm.say), filler: policy, skipSay: arm.say === 'skip' });
      return { ...p, delay: (p.firstUsefulMs ?? 0) - (r.useful + TTS_FIRST_AUDIO_MS) };
    });
    const say = rows.map((r, i) => segmentsFor(r, arm.say).some(x => x.kind === 'say') && !out[i].saySkipped);
    const fu = out.map(o => o.firstUsefulMs ?? 0), d = out.map(o => o.delay), s = out.map(o => o.longestSilenceMs);
    console.log(`  ${arm.name.padEnd(26)}${`${pct(fu, 0.5)} / ${pct(fu, 0.9)}`.padEnd(20)}${`${pct(d, 0.5)} / ${pct(d, 0.9)}`.padEnd(17)}` +
      `${`${out.filter(o => o.fillerPlayed).length}`.padEnd(9)}${`${out.filter(o => o.fillerCut).length}`.padEnd(7)}` +
      `${`${pct(s, 0.5)} / ${pct(s, 0.9)}`.padEnd(18)}${String(out.filter(o => o.longestSilenceMs > 1000).length).padEnd(13)}${say.filter(Boolean).length}`);
  }
}

main();
