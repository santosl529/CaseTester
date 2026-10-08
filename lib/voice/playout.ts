// The interviewer's audio on the agent clock (spec 2026-10-08-voice-phase-b
// §5). Segments play strictly in order through a FrameSink (the LiveKit
// AudioSource); a frame handed over at t while the queue ends at `cursor`
// plays from max(t, cursor), so every segment gets an estimated start and end.
// These are estimates, never browser-confirmed. Audio counts as heard
// HEARD_MARGIN_MS after it plays; heardChars is how much of a segment's text
// the heard cursor has passed, at a word boundary, from TTS word timestamps
// aligned to the text's tokens (else the audio's share of the characters).
// Captions are emitted on the same cursor, so the screen never shows a word
// the saved line won't hold.
import type { SegmentPlayback } from '@/lib/orchestrator/turn-types';
import type { Word } from './types';

export const HEARD_MARGIN_MS = 150;   // network + jitter buffer
export const FRAME_MS = 20;

export interface FrameSink { capture(frame: Int16Array): Promise<void>; clear(): void }
export interface Clock { now(): number; at(ms: number, fn: () => void): () => void }
export type Outcome = { playback: SegmentPlayback; heardChars: number };

// Each whitespace token of `text`: its end offset, and when (ms from the
// segment's first audio) it has been spoken — null while unknown.
export type Token = { chars: number; endMs: number | null };

export function tokenTimeline(text: string, words: Word[] | null, audioMs: number, complete: boolean): Token[] {
  const tokens = [...text.matchAll(/\S+/g)].map(m => m.index! + m[0].length);
  const out: Token[] = [];
  let lastMs = 0;
  let lastChars = 0;
  const aligned = Math.min(words?.length ?? 0, tokens.length);
  for (let i = 0; i < tokens.length; i++) {
    let endMs: number | null = null;
    if (i < aligned) endMs = words![i].endMs;
    else if (complete && audioMs > 0) {
      // The rest of the text spread over the rest of the audio, by characters.
      const left = tokens[tokens.length - 1] - lastChars;
      endMs = lastMs + (left > 0 ? ((tokens[i] - lastChars) / left) * (audioMs - lastMs) : 0);
    }
    if (endMs === null) { out.push({ chars: tokens[i], endMs: null }); continue; }
    endMs = Math.max(endMs, out.at(-1)?.endMs ?? 0);
    out.push({ chars: tokens[i], endMs });
    if (i < aligned) { lastMs = endMs; lastChars = tokens[i]; }
  }
  return out;
}

// Characters heard after `heardMs` of a segment's audio: the last token, in
// order, whose end is known and passed.
export function heardCharsAt(tl: Token[], heardMs: number): number {
  let chars = 0;
  for (const t of tl) {
    if (t.endMs === null || t.endMs > heardMs) break;
    chars = t.chars;
  }
  return chars;
}

type Seg = {
  id: string; text: string; interruptible: boolean;
  onStart?: (atMs: number) => void; onHeard?: (heardChars: number, atMs: number) => void;
  chunks: Int16Array[]; finished: boolean; failed: boolean; cut: boolean;
  words: Word[] | null; audioMs: number; startAt: number | null; endAt: number | null;
  captioned: number;   // tokens whose caption is scheduled
  oddByte: number | null;   // half a sample left over from the last chunk
};

export class Playout {
  private segs: Seg[] = [];
  private byId = new Map<string, Seg>();
  private cursor = 0;
  private timers: (() => void)[] = [];
  private wake: (() => void) | null = null;
  private gen = 0;
  private pumping = false;
  private idleWaiters: (() => void)[] = [];

  constructor(private sink: FrameSink, private clock: Clock, private sampleRate: number) {}

  open(id: string, o: { text: string; interruptible: boolean; onStart?: (atMs: number) => void; onHeard?: (heardChars: number, atMs: number) => void }): void {
    const s: Seg = { id, ...o, chunks: [], finished: false, failed: false, cut: false, words: null, audioMs: 0, startAt: null, endAt: null, captioned: 0, oddByte: null };
    this.segs.push(s);
    this.byId.set(id, s);
    this.kick();
  }

  push(id: string, pcm: Uint8Array): void {
    const s = this.byId.get(id);
    if (!s || s.cut || s.finished) return;
    // TTS chunks can split a 16-bit sample: carry the odd byte to the next
    // chunk, or every later sample is byte-shifted (heard as buzzing).
    const joined = s.oddByte === null ? pcm : new Uint8Array([s.oddByte, ...pcm]);
    s.oddByte = joined.length % 2 === 1 ? joined[joined.length - 1] : null;
    const bytes = joined.slice(0, joined.length - (joined.length % 2));
    if (bytes.length === 0) return;
    const v = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    s.chunks.push(v);
    s.audioMs += (v.length / this.sampleRate) * 1000;
    this.kick();
  }

  words(id: string, ws: Word[]): void {
    const s = this.byId.get(id);
    if (!s || s.cut) return;
    s.words = [...(s.words ?? []), ...ws];
    this.scheduleCaptions(s);
  }

  finish(id: string): void {
    const s = this.byId.get(id);
    if (!s || s.cut) return;
    s.finished = true;
    this.scheduleCaptions(s);
    this.kick();
  }

  // TTS failed: audio already received still plays; only timestamps place
  // its words (the audio's share would overstate a truncated segment).
  fail(id: string): void {
    const s = this.byId.get(id);
    if (!s || s.cut) return;
    s.failed = true;
    s.finished = true;
    this.kick();
  }

  started(id: string): boolean {
    const s = this.byId.get(id);
    return !!s && !s.cut && s.startAt !== null && s.startAt <= this.clock.now();
  }

  hasPendingNonInterruptible(): boolean {
    const now = this.clock.now();
    return this.segs.some(s => !s.interruptible && !s.cut && (s.endAt === null || s.endAt > now));
  }

  whenIdle(): Promise<void> {
    return new Promise(r => { this.idleWaiters.push(r); this.checkIdle(); });
  }

  classify(id: string): Outcome {
    const s = this.byId.get(id);
    return s ? this.outcome(s, null) : { playback: 'unplayed', heardChars: 0 };
  }

  // A cut (barge-in, End, audio blocked…): stop now; every open segment is
  // classified at `atMs`, and nothing more of them plays or is captioned.
  interrupt(atMs: number): Map<string, Outcome> {
    this.gen++;
    this.sink.clear();
    for (const cancel of this.timers.splice(0)) cancel();
    this.wake?.(); this.wake = null;
    const out = new Map<string, Outcome>();
    for (const s of this.segs) {
      if (s.cut) continue;
      out.set(s.id, this.outcome(s, atMs));
      s.cut = true;
    }
    this.cursor = atMs;
    for (const w of this.idleWaiters.splice(0)) w();
    return out;
  }

  private timeline(s: Seg): Token[] {
    return tokenTimeline(s.text, s.words, s.audioMs, s.finished && !s.failed);
  }

  // At a cut, or (cutAt null) now: a segment that has finished playing
  // uncut counts as played — its last words are on their way to the ear.
  private outcome(s: Seg, cutAt: number | null): Outcome {
    const at = cutAt ?? this.clock.now();
    if (s.startAt === null || s.startAt >= at) return { playback: 'unplayed', heardChars: 0 };
    const limit = at - HEARD_MARGIN_MS;
    const total = s.text.trim() ? s.text.length : 0;
    if (!s.failed && s.endAt !== null && s.endAt <= (cutAt === null ? at : limit)) return { playback: 'played', heardChars: total };
    const heardMs = Math.max(0, Math.min(limit, s.endAt ?? limit) - s.startAt);
    const heardChars = heardCharsAt(this.timeline(s), heardMs);
    return { playback: total > 0 && heardChars >= s.text.trimEnd().length ? 'played' : 'partial', heardChars };
  }

  private kick(): void {
    this.wake?.(); this.wake = null;
    if (!this.pumping) void this.pump();
  }

  private async pump(): Promise<void> {
    this.pumping = true;
    const gen = this.gen;
    const frameLen = (this.sampleRate * FRAME_MS) / 1000;
    try {
      while (gen === this.gen) {
        const s = this.segs.find(x => x.endAt === null && !x.cut);
        if (!s) break;
        if (s.chunks.length === 0) {
          if (s.finished) { this.close(s); continue; }
          await new Promise<void>(r => { this.wake = r; });
          continue;
        }
        const chunk = s.chunks.shift()!;
        for (let i = 0; i < chunk.length && gen === this.gen; i += frameLen) {
          const frame = chunk.subarray(i, i + frameLen);
          const playAt = Math.max(this.clock.now(), this.cursor);
          if (s.startAt === null) this.begin(s, playAt);
          this.cursor = playAt + (frame.length / this.sampleRate) * 1000;
          await this.sink.capture(frame);
        }
      }
    } finally {
      this.pumping = false;
    }
    if (gen !== this.gen && this.segs.some(x => x.endAt === null && !x.cut)) void this.pump();
    else this.checkIdle();
  }

  private begin(s: Seg, at: number): void {
    s.startAt = at;
    this.timers.push(this.clock.at(at, () => s.onStart?.(at)));
    this.scheduleCaptions(s);
  }

  private close(s: Seg): void {
    // An audio-less segment (exhibit only) starts — and shows — when reached;
    // a failed one with no audio never starts.
    if (s.startAt === null && !(s.failed && s.audioMs === 0)) this.begin(s, Math.max(this.clock.now(), this.cursor));
    s.endAt = this.cursor;
    this.checkIdle();
  }

  // Each token's caption at the moment it counts as heard.
  private scheduleCaptions(s: Seg): void {
    if (s.startAt === null || s.cut || !s.onHeard) return;
    const tl = this.timeline(s);
    for (let i = s.captioned; i < tl.length; i++) {
      const t = tl[i];
      if (t.endMs === null) break;
      const at = s.startAt + t.endMs + HEARD_MARGIN_MS;
      this.timers.push(this.clock.at(at, () => s.onHeard?.(t.chars, at)));
      s.captioned = i + 1;
    }
  }

  private checkIdle(): void {
    if (this.idleWaiters.length === 0) return;
    if (this.segs.some(x => x.endAt === null && !x.cut)) return;
    const end = Math.max(this.clock.now(), ...this.segs.filter(x => !x.cut).map(x => x.endAt ?? 0));
    this.timers.push(this.clock.at(end, () => {
      if (this.segs.some(x => x.endAt === null && !x.cut)) return; // more opened since; its close re-checks
      for (const w of this.idleWaiters.splice(0)) w();
    }));
  }
}
