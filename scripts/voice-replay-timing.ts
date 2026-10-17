// Timing replay of a recorded voice session under the current voice rules
// (17 Oct: trailing fillers, no ack after a long answer, no model echo after
// an ack). Free — no model, STT or TTS calls.
//
// Measured, from the session's per-turn record (.jsonl): end of turn, when
// each segment reached the TTS (marks, from the turn's start), the TTS's
// first-audio latency for that turn. Measured: the acknowledgment clips'
// lengths (the cached audio, trimmed as the agent trims it).
// ESTIMATED: how long a model or data segment plays — CHARS_PER_SEC plus
// PAD_MS, calibrated on the session's own say → question gaps. The model's
// words are the recorded ones: on a turn that loses its ack the real model
// would have been prompted without the "already acknowledged" note, and
// might have written its own "Understood." first.
//
//   npx tsx scripts/voice-replay-timing.ts "Case Interview Runs/voice-live/2026-10-17/314295e0-0170-4a80-9f44-1bdc3788a666.jsonl"
import { readFileSync } from 'node:fs';
import { ackKind, pickAck, shouldAcknowledge } from '@/lib/voice/acknowledge';
import { sayAfterAckReason } from '@/lib/orchestrator/say-after-ack';
import type { TurnRecord } from '@/lib/voice/records';

const CHARS_PER_SEC = 15.5;
const PAD_MS = 200;
// Trimmed clip lengths, ms (Cartesia sonic-3.5, the session's voice): the
// acknowledgments before 17 Oct and the trailing fillers after.
const ACK_MS: Record<string, number> = {
  'Okay, got it.': 960, 'Mm-hm, I see.': 1200, 'Understood, okay.': 1240, 'Okay, I follow.': 1080, 'Got it, thanks.': 960,
  'Okay, sure.': 960, 'Mm-hm, sure.': 1060, 'Okay, let me check.': 1040, 'Sure, one second.': 1400, 'Take your time.': 720, 'Sure, take a moment.': 1540,
  'Okay, so…': 1040, 'Mm, okay…': 1140, 'Hmm…': 380, 'Mm-hm, so…': 1160, 'Mm, so…': 1120, 'Sure, so…': 1080,
};
const playMs = (text: string) => Math.round((text.length / CHARS_PER_SEC) * 1000) + PAD_MS;

type Seg = { kind: string; text: string | null; heardChars: number };
type Played = { kind: string; text: string; start: number; end: number };
type Arm = { ack: string | null; ackStart: number | null; ackEnd: number | null; segs: Played[]; dropped: string[] };

// Segments play in order, each from max(ready, the previous one's end).
function schedule(r: TurnRecord, ack: string | null, segs: Seg[], ackStart: number): Arm {
  const turnStart = (r.endpointMs ?? 0) + r.queueWaitMs;
  const ttsLatency = r.ttsFirstAudioMs !== null && r.firstSegmentAcceptedMs !== null ? r.ttsFirstAudioMs - r.firstSegmentAcceptedMs : 145;
  const m = r.marks;
  const readyMark = (kind: string, first: boolean) =>
    kind === 'tail' ? m.tail_delivered
      : kind === 'data' ? (m.data_line_delivered ?? m.first_useful_delivered ?? m.first_delivered)
        : first ? m.first_delivered : m.first_delivered;
  const ackEnd = ack ? ackStart + ACK_MS[ack] : null;
  let cursor = ackEnd ?? 0;
  const out: Played[] = [];
  segs.forEach((s, i) => {
    const text = s.text ?? 'x'.repeat(s.heardChars);
    const start = Math.max(turnStart + readyMark(s.kind, i === 0) + ttsLatency, cursor);
    const end = start + playMs(text);
    out.push({ kind: s.kind, text, start, end });
    cursor = end;
  });
  return { ack, ackStart: ack ? ackStart : null, ackEnd, segs: out, dropped: [] };
}

function main() {
  const recFile = process.argv[2];
  const segFile = recFile.replace(/[^/]+\.jsonl$/, f => `${f.split('-')[0]}-segments.json`);
  const sessionId = recFile.match(/([0-9a-f-]{36})\.jsonl$/)?.[1] ?? '';
  const records = readFileSync(recFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as TurnRecord & { summary?: unknown })
    .filter(r => 'candidateText' in r);
  const segTurns = (JSON.parse(readFileSync(segFile, 'utf8')) as { turns: { turnSeq: number; segments: Seg[] }[] }).turns;
  const s = (ms: number | null | undefined) => (ms === null || ms === undefined ? '–' : `${(ms / 1000).toFixed(2)}s`);

  let lastAck: string | null = null;
  const rows: { seq: number; words: number; before: Arm; after: Arm; variant: Arm; r: TurnRecord }[] = [];
  for (const r of records) {
    const segs = segTurns.find(t => t.turnSeq === r.turnSeq)!.segments;
    const before = schedule(r, r.ack, segs, r.firstSoundMs ?? (r.endpointMs ?? 0));
    // The rules now: the ack (the agent seeds pickAck with the session id and turn seq).
    const ack: string | null = shouldAcknowledge(r.candidateText) ? pickAck(`${sessionId}:${r.turnSeq}`, lastAck, ackKind(r.candidateText)) : null;
    if (ack) lastAck = ack;
    // The say rule as built drops only after an ack; the variant (not built,
    // for comparison) drops on every voice turn, ack or not.
    const filterSay = (onlyAfterAck: boolean) => {
      const dropped: string[] = [];
      const kept: Seg[] = segs.flatMap(sg => {
        if (sg.kind !== 'say' || (onlyAfterAck && !ack) || !sg.text) return [sg];
        const sentences = sg.text.split(/(?<=[.!?])\s+/).filter(Boolean);
        const keep = sentences.filter(x => {
          const why = sayAfterAckReason(x, { candidateMessage: r.candidateText });
          if (why) dropped.push(`${x} [${why}]`);
          return why === null;
        });
        return keep.length ? [{ ...sg, text: keep.join(' ') }] : [];
      });
      return { kept, dropped };
    };
    const built = filterSay(true), every = filterSay(false);
    const after = { ...schedule(r, ack, built.kept, (r.endpointMs ?? 0) + 1), dropped: built.dropped };
    const variant = { ...schedule(r, ack, every.kept, (r.endpointMs ?? 0) + 1), dropped: every.dropped };
    rows.push({ seq: r.turnSeq, words: r.candidateText.trim().split(/\s+/).length, before, after, variant, r });
  }

  // Calibration: the before arm against what was measured.
  console.log('Calibration (before arm vs measured):');
  for (const { seq, before, r } of rows) {
    const firstUseful = before.segs.find(x => x.kind !== 'say')?.start ?? null;
    const say = before.segs.find(x => x.kind === 'say');
    console.log(`  t${seq}: first data/question ${s(firstUseful)} (measured ${s(r.firstUsefulMs)})${say ? ` · say ${s(say.start)} (first model audio measured ${s(r.ttsFirstAudioMs)})` : ''}`);
  }

  const firstContent = (a: Arm) => a.segs[0]?.start ?? null;
  const question = (a: Arm) => a.segs.find(x => x.kind === 'tail')?.start ?? null;
  const firstSound = (a: Arm) => a.ackStart ?? firstContent(a);
  const silence = (a: Arm) => (a.ackEnd !== null && a.segs[0] ? a.segs[0].start - a.ackEnd : null);
  console.log('\n| turn | words | ack before → after | first sound | silence after ack | model say | first words after the ack (say/data/question) | question starts |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const { seq, words, before, after } of rows) {
    const sayB = before.segs.find(x => x.kind === 'say')?.text;
    const sayA = after.segs.find(x => x.kind === 'say')?.text;
    console.log(`| ${seq} | ${words} | ${before.ack ?? '—'} → ${after.ack ?? '— (none)'} | ${s(firstSound(before))} → ${s(firstSound(after))} | ${s(silence(before))} → ${s(silence(after))} | ${sayB ? `“${sayB}”` : '—'} → ${sayA ? `“${sayA}”` : after.dropped.length ? 'dropped' : '—'} | ${s(firstContent(before))} → ${s(firstContent(after))} | ${s(question(before))} → ${s(question(after))} |`);
  }
  const med = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
    return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
  };
  const sum = (f: (a: Arm) => number | null, k: 'before' | 'after' | 'variant') => med(rows.map(x => f(x[k])));
  console.log('\nVariant (not built): the say rule on every voice turn, ack or not — only turns that differ from "after":');
  console.log('| turn | first sound | model say | question starts |\n|---|---|---|---|');
  for (const { seq, after, variant } of rows) {
    if (variant.dropped.length === after.dropped.length) continue;
    const sayA = after.segs.find(x => x.kind === 'say')?.text, sayV = variant.segs.find(x => x.kind === 'say')?.text;
    console.log(`| ${seq} | ${s(firstSound(after))} → ${s(firstSound(variant))} | ${sayA ? `“${sayA}”` : '—'} → ${sayV ? `“${sayV}”` : 'dropped'} | ${s(question(after))} → ${s(question(variant))} |`);
  }
  console.log(`\nMedians (before → after): first sound ${s(sum(firstSound, 'before'))} → ${s(sum(firstSound, 'after'))}; ` +
    `silence after the ack ${s(sum(silence, 'before'))} → ${s(sum(silence, 'after'))}; ` +
    `question starts ${s(sum(question, 'before'))} → ${s(sum(question, 'after'))} (variant ${s(sum(question, 'variant'))}).`);
  console.log(`Acks: ${rows.filter(x => x.before.ack).length} → ${rows.filter(x => x.after.ack).length}; model say lines spoken after an ack: ${rows.filter(x => x.before.ack && x.before.segs.some(g => g.kind === 'say')).length} → ${rows.filter(x => x.after.ack && x.after.segs.some(g => g.kind === 'say')).length}.`);
  for (const { seq, after } of rows) for (const d of after.dropped) console.log(`  dropped t${seq}: ${d}`);
}

main();
