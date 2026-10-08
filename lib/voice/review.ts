// Reviewing a recorded voice session (lib/voice/recorder.ts): where the
// candidate was actually speaking (from the mic recording), and what the
// turn-taking did around it — per turn, with flags for the moments that
// sound robotic. Pure; scripts/voice-review.ts does the file reading.
import type { RecordedEvent } from './recorder';

export type Interval = { start: number; end: number };   // ms from the session start

// Speech in a mono recording: 20ms frames above `threshold` RMS (the agent's
// VAD threshold), gaps up to `gapMs` bridged, blips under `minMs` dropped.
export function voicedIntervals(samples: Int16Array, rate: number, threshold = 0.02, frameMs = 20, gapMs = 250, minMs = 100): Interval[] {
  const step = Math.max(1, Math.round((rate * frameMs) / 1000));
  const raw: Interval[] = [];
  for (let i = 0; i < samples.length; i += step) {
    const end = Math.min(i + step, samples.length);
    let sum = 0;
    for (let j = i; j < end; j++) sum += (samples[j] / 32768) ** 2;
    if (Math.sqrt(sum / (end - i)) <= threshold) continue;
    const a = (i / rate) * 1000, b = (end / rate) * 1000;
    const last = raw.at(-1);
    if (last && a - last.end <= gapMs) last.end = b;
    else raw.push({ start: a, end: b });
  }
  return raw.filter(v => v.end - v.start >= minMs).map(v => ({ start: Math.round(v.start), end: Math.round(v.end) }));
}

export type TurnReview = {
  seq: number; text: string; finalAt: number;
  speechEnd: number | null; endpointMs: number | null;
  ackAt: number | null; firstContentAt: number | null; ackToContentMs: number | null;
  bargeReactionMs: number | null; cancelled: boolean; interrupted: boolean;
  flags: string[];
};

const ACK_OVERLAP_MS = 1200;     // speech this soon after the ack starts = talked over
const PREMATURE_MS = 1500;       // speech resuming this soon after end of turn = not finished
const DEAD_AIR_MS = 2500;        // ack → content longer than this = dead air

export function reviewSession(events: RecordedEvent[], voiced: Interval[]): TurnReview[] {
  const turns: TurnReview[] = [];
  const bySeq = new Map<number, TurnReview>();
  let lastFinal: RecordedEvent | null = null;
  for (const e of events) {
    if (e.type === 'final') { lastFinal = e; continue; }
    const seq = typeof e.seq === 'number' ? e.seq : null;
    if (seq === null) continue;
    if (e.type === 'turn_start') {
      const finalAt = lastFinal?.t ?? e.t;
      const before = voiced.filter(v => v.start < finalAt);
      const speechEnd = before.length ? Math.min(before.at(-1)!.end, finalAt) : null;
      const t: TurnReview = {
        seq, text: String(lastFinal?.text ?? ''), finalAt, speechEnd, endpointMs: speechEnd === null ? null : finalAt - speechEnd,
        ackAt: null, firstContentAt: null, ackToContentMs: null, bargeReactionMs: null, cancelled: false, interrupted: false, flags: [],
      };
      bySeq.set(seq, t);
      turns.push(t);
      continue;
    }
    const t = bySeq.get(seq);
    if (!t) continue;
    if (e.type === 'ack_start') t.ackAt ??= e.t;
    else if (e.type === 'segment_start') t.firstContentAt ??= e.t;
    else if (e.type === 'cut') {
      t.interrupted = true;
      if (e.kind === 'barge') {
        const onset = voiced.filter(v => v.start <= e.t).at(-1);
        if (onset) t.bargeReactionMs = e.t - onset.start;
      }
    } else if (e.type === 'turn_end') t.cancelled = Boolean(e.cancelled);
  }
  for (const t of turns) {
    if (t.ackAt !== null && voiced.some(v => v.start < t.ackAt! + ACK_OVERLAP_MS && v.end > t.ackAt!)) t.flags.push('ack_over_speech');
    const resumed = voiced.find(v => v.start > t.finalAt && v.start <= t.finalAt + PREMATURE_MS);
    if (resumed && (t.firstContentAt === null || resumed.start < t.firstContentAt)) t.flags.push('premature_end_of_turn');
    if (t.ackAt !== null && t.firstContentAt !== null) {
      t.ackToContentMs = t.firstContentAt - t.ackAt;
      if (t.ackToContentMs > DEAD_AIR_MS) t.flags.push('dead_air_after_ack');
    }
  }
  return turns;
}
