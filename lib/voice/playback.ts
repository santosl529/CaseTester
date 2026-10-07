// The interviewer's playback order for one turn (latency step 2, 7 Oct): the
// instant acknowledgment, an optional thinking filler, then the turn's
// segments in order, each as soon as it is ready and the line is free. Pure —
// the scheduler simulation replays logged delivery times through it, and the
// live agent can run the same policy. Times in ms from end of turn.
import { isUsefulSegment, type SegmentKind } from '@/lib/orchestrator/turn-types';

export type PlaySegment = { kind: SegmentKind; readyMs: number; durMs: number };

// mode "none": no filler. "full": the filler always plays to its end (the
// 7 Oct demo). "yield": once useful audio is ready, the filler stops at its
// next natural boundary (cutsMs, offsets from the filler's start; the last is
// its end). The filler starts delayMs after the acknowledgment ends, only if
// nothing playable is ready by then.
export type FillerPolicy = { mode: 'none' | 'full' | 'yield'; delayMs: number; durMs: number; cutsMs: number[] };

export type Playback = {
  firstUsefulMs: number | null;    // the first useful segment starts playing
  fillerPlayed: boolean;
  fillerCut: boolean;
  longestSilenceMs: number;        // between the acknowledgment and the first useful audio
  saySkipped: boolean;
};

// skipSay: a "say" sentence not yet started when useful audio is ready is
// dropped — "say" is a neutral acknowledgment, and the instant one already
// played.
export function schedulePlayback(input: { ackDurMs: number | null; segments: PlaySegment[]; filler: FillerPolicy; skipSay?: boolean }): Playback {
  const { segments, filler } = input;
  const ackEnd = input.ackDurMs ?? 0;
  let t = ackEnd;                       // when the line is next free
  let longestSilenceMs = 0;
  const playAt = (start: number, dur: number) => {
    longestSilenceMs = Math.max(longestSilenceMs, start - t);
    t = start + dur;
  };

  let fillerPlayed = false, fillerCut = false;
  const fillerStart = ackEnd + filler.delayMs;
  if (filler.mode !== 'none' && segments.length > 0 && segments[0].readyMs > fillerStart) {
    fillerPlayed = true;
    let dur = filler.durMs;
    const usefulReady = segments.find(isUsefulSegment)?.readyMs;
    if (filler.mode === 'yield' && usefulReady !== undefined && usefulReady < fillerStart + filler.durMs) {
      const into = usefulReady - fillerStart;
      dur = filler.cutsMs.find(c => c >= into) ?? filler.durMs;
      fillerCut = dur < filler.durMs;
    }
    playAt(fillerStart, dur);
  }

  let firstUsefulMs: number | null = null;
  let saySkipped = false;
  const usefulReadyMs = segments.find(isUsefulSegment)?.readyMs;
  for (const seg of segments) {
    const start = Math.max(seg.readyMs, t);
    if (input.skipSay && seg.kind === 'say' && usefulReadyMs !== undefined && usefulReadyMs <= start) {
      saySkipped = true;
      continue;
    }
    if (isUsefulSegment(seg)) {
      longestSilenceMs = Math.max(longestSilenceMs, start - t);
      firstUsefulMs = start;
      break;
    }
    playAt(start, seg.durMs);
  }
  return { firstUsefulMs, fillerPlayed, fillerCut, longestSilenceMs, saySkipped };
}
