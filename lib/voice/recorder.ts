// Session recording for turn-taking review (opt-in: VOICE_RECORD=1; local,
// under the gitignored .voice-cache). The candidate's mic as the agent and
// Flux received it, the interviewer's audio placed where it played on the
// playout clock (audio queued past a cut is dropped, as it was never heard
// as such), a stereo mix to listen to, and a timeline of events — all in ms
// from the session's start. scripts/voice-review.ts reads them.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function wavBytes(samples: Int16Array, sampleRate: number, channels: number): Uint8Array {
  const data = samples.length * 2;
  const out = new Uint8Array(44 + data);
  const v = new DataView(out.buffer);
  const ascii = (at: number, s: string) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF'); v.setUint32(4, 36 + data, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  ascii(36, 'data'); v.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, samples[i], true);
  return out;
}

// A mono track that audio is written into at a time (ms from the start).
export class PcmTrack {
  private buf = new Int16Array(0);
  private len = 0;
  constructor(readonly sampleRate: number) {}

  get lengthMs(): number { return (this.len / this.sampleRate) * 1000; }

  writeAt(ms: number, frame: Int16Array): void {
    const at = Math.max(0, Math.round((ms * this.sampleRate) / 1000));
    this.grow(at + frame.length);
    this.buf.set(frame, at);
    this.len = Math.max(this.len, at + frame.length);
  }

  append(frame: Int16Array): void { this.writeAt(this.lengthMs, frame); }

  truncateAfter(ms: number): void {
    const at = Math.max(0, Math.round((ms * this.sampleRate) / 1000));
    if (at < this.len) { this.buf.fill(0, at, this.len); this.len = at; }
  }

  samples(): Int16Array { return this.buf.slice(0, this.len); }

  private grow(n: number): void {
    if (n <= this.buf.length) return;
    const next = new Int16Array(Math.max(n, this.buf.length * 2, 16000));
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
}

// Left: the candidate at `leftRate`; right: the interviewer resampled to it.
export function mixStereo(left: Int16Array, leftRate: number, right: Int16Array, rightRate: number): Int16Array {
  const rightLen = Math.floor((right.length * leftRate) / rightRate);
  const n = Math.max(left.length, rightLen);
  const out = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = i < left.length ? left[i] : 0;
    const src = (i * rightRate) / leftRate;
    const j = Math.floor(src);
    const a = right[j] ?? 0, b = right[j + 1] ?? a;
    out[i * 2 + 1] = i < rightLen ? Math.round(a + (b - a) * (src - j)) : 0;
  }
  return out;
}

export type RecordedEvent = { t: number; type: string } & Record<string, unknown>;

export class SessionRecorder {
  readonly candidateTrack: PcmTrack;
  readonly interviewerTrack: PcmTrack;
  readonly events: RecordedEvent[] = [];
  private candidateStarted = false;

  constructor(private t0: number, rates: { candidateRate: number; interviewerRate: number }) {
    this.candidateTrack = new PcmTrack(rates.candidateRate);
    this.interviewerTrack = new PcmTrack(rates.interviewerRate);
  }

  // A mic frame that arrived (ended) at `atMs`. Kept contiguous, so the
  // recording has no jitter clicks; resynced if it drifts past 100ms.
  candidate(frame: Int16Array, atMs: number): void {
    const startMs = atMs - this.t0 - (frame.length / this.candidateTrack.sampleRate) * 1000;
    if (!this.candidateStarted || Math.abs(startMs - this.candidateTrack.lengthMs) > 100) {
      this.candidateStarted = true;
      this.candidateTrack.writeAt(startMs, frame);
    } else {
      this.candidateTrack.append(frame);
    }
  }

  // An interviewer frame at the time it plays.
  interviewer(frame: Int16Array, playAtMs: number): void { this.interviewerTrack.writeAt(playAtMs - this.t0, frame); }

  // A cut: audio queued past it never played.
  interviewerCut(atMs: number): void { this.interviewerTrack.truncateAfter(atMs - this.t0); }

  // An event at `atMs`, or at its own `at` (a playout time) when it has one;
  // absolute times in the data are made relative to the session start.
  event(type: string, data: Record<string, unknown> = {}, atMs = Date.now()): void {
    const rel: Record<string, unknown> = { ...data };
    for (const k of ['at', 'speechEndAt']) if (typeof rel[k] === 'number') rel[k] = Math.round((rel[k] as number) - this.t0);
    const at = typeof data.at === 'number' ? data.at : atMs;
    this.events.push({ t: Math.round(at - this.t0), type, ...rel });
  }

  flush(dir: string): void {
    mkdirSync(dir, { recursive: true });
    const cand = this.candidateTrack.samples();
    const intv = this.interviewerTrack.samples();
    writeFileSync(path.join(dir, 'candidate.wav'), wavBytes(cand, this.candidateTrack.sampleRate, 1));
    writeFileSync(path.join(dir, 'interviewer.wav'), wavBytes(intv, this.interviewerTrack.sampleRate, 1));
    writeFileSync(path.join(dir, 'mix.wav'), wavBytes(mixStereo(cand, this.candidateTrack.sampleRate, intv, this.interviewerTrack.sampleRate), this.candidateTrack.sampleRate, 2));
    writeFileSync(path.join(dir, 'events.jsonl'), this.events.map(e => JSON.stringify(e)).join('\n') + '\n');
  }
}
