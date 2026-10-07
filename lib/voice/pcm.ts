// 16-bit mono PCM helpers for the voice pipeline and the latency harness.

// Split PCM into fixed-length frames (the last one may be short). 20ms is
// what a browser mic or WebRTC track delivers.
export function frames(pcm: Uint8Array, sampleRate: number, frameMs = 20): Uint8Array[] {
  const bytes = Math.round((sampleRate * frameMs) / 1000) * 2;
  const out: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += bytes) out.push(pcm.subarray(i, Math.min(i + bytes, pcm.length)));
  return out;
}

export function durationSec(pcm: Uint8Array, sampleRate: number): number {
  return pcm.length / 2 / sampleRate;
}

// Seconds from the start of the clip to the end of the last 20ms window whose
// RMS is above `threshold` (of full scale): where speech actually ends, so
// trailing silence in a synthesized clip isn't counted as speech.
export function speechEndSec(pcm: Uint8Array, sampleRate: number, threshold = 0.02): number {
  const view = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const win = Math.round(sampleRate * 0.02);
  let lastVoiced = 0;
  for (let start = 0; start < view.length; start += win) {
    const end = Math.min(start + win, view.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += (view[i] / 32768) ** 2;
    if (Math.sqrt(sum / (end - start)) > threshold) lastVoiced = end;
  }
  return lastVoiced / sampleRate;
}

export function silence(sec: number, sampleRate: number): Uint8Array {
  return new Uint8Array(Math.round(sec * sampleRate) * 2);
}

// Feed PCM to `push` in real time (a frame every frameMs), as a live mic
// would. Resolves after the last frame.
export async function streamRealtime(
  pcm: Uint8Array, sampleRate: number, push: (frame: Uint8Array) => void,
  opts: { frameMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<void> {
  const frameMs = opts.frameMs ?? 20;
  const sleep = opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const start = now();
  const fs = frames(pcm, sampleRate, frameMs);
  for (let i = 0; i < fs.length; i++) {
    push(fs[i]);
    // Schedule against the start, not the last frame, so drift doesn't add up.
    const wait = start + (i + 1) * frameMs - now();
    if (wait > 0) await sleep(wait);
  }
}

// Seconds to the start of the first quiet 20ms window at or after `fromSec`
// (RMS below `threshold`) once speech has begun: a gap between words, where a
// filler can be cut without clipping one. The quiet lead-in before the first
// word is not a pause. The clip's end when no pause is left.
export function nextPauseSec(pcm: Uint8Array, sampleRate: number, fromSec: number, threshold = 0.02): number {
  const view = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const win = Math.round(sampleRate * 0.02);
  const from = Math.round(fromSec * sampleRate);
  let spoken = false;
  for (let start = 0; start + win <= view.length; start += win) {
    let sum = 0;
    for (let i = start; i < start + win; i++) sum += (view[i] / 32768) ** 2;
    const quiet = Math.sqrt(sum / win) < threshold;
    if (!quiet) spoken = true;
    else if (spoken && start >= from) return start / sampleRate;
  }
  return view.length / sampleRate;
}

// A pre-synthesized clip (acknowledgment, filler) without its quiet lead-in
// and tail: TTS pads both (Aura: ~0.1–0.3s each side), and the lead-in delays
// the first sound the candidate hears.
export function trimSilence(pcm: Uint8Array, sampleRate: number, threshold = 0.02): Uint8Array {
  const view = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const win = Math.round(sampleRate * 0.02);
  let first = -1;
  for (let start = 0; start < view.length; start += win) {
    const end = Math.min(start + win, view.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += (view[i] / 32768) ** 2;
    if (Math.sqrt(sum / (end - start)) > threshold) { first = start; break; }
  }
  if (first < 0) return pcm.subarray(0, 0);
  const last = Math.round(speechEndSec(pcm, sampleRate, threshold) * sampleRate);
  return pcm.subarray(first * 2, last * 2);
}
