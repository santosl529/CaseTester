// The voice page's setup timings (session b406165f, 19 Oct): a 2.86s
// main-thread block during the room join sped up the opener, and nothing on
// record said which step it sat in. Each step's start (from the Start click)
// and duration, with when the agent's hello came, setup ended and `ready` went
// out — sent once, when ready has gone out and the agent's audio track is
// attached, as a `setup` line in the session records. Client-safe: no imports.

export const SETUP_SPANS = ['audioContext', 'connect', 'startAudio', 'mic', 'micMeter', 'firstTrack'] as const;
export type SetupSpanName = (typeof SETUP_SPANS)[number];
export type SetupSpan = { atMs: number; ms: number };
export type SetupMark = 'hello' | 'setupDone' | 'ready';
export type SetupTimingLine = {
  spans: Record<SetupSpanName, SetupSpan | null>;
  helloAtMs: number | null; setupDoneAtMs: number | null; readyAtMs: number | null;
};

export class SetupTimings {
  private t0: number;
  private spans: Partial<Record<SetupSpanName, SetupSpan>> = {};
  private marks: Partial<Record<SetupMark, number>> = {};
  private taken = false;

  constructor(private now: () => number) { this.t0 = now(); }

  // The first of each step counts (a rejoining agent's track is not the setup).
  span<T>(name: SetupSpanName, fn: () => T): T {
    const at = this.now();
    try { return fn(); } finally { this.record(name, at); }
  }

  async spanAsync<T>(name: SetupSpanName, fn: () => Promise<T>): Promise<T> {
    const at = this.now();
    try { return await fn(); } finally { this.record(name, at); }
  }

  mark(name: SetupMark): void {
    if (this.marks[name] === undefined) this.marks[name] = Math.round(this.now() - this.t0);
  }

  // The line, once: when ready has gone out and the first remote track is attached.
  take(): SetupTimingLine | null {
    if (this.taken || this.marks.ready === undefined || !this.spans.firstTrack) return null;
    this.taken = true;
    const spans = Object.fromEntries(SETUP_SPANS.map(n => [n, this.spans[n] ?? null])) as Record<SetupSpanName, SetupSpan | null>;
    return { spans, helloAtMs: this.marks.hello ?? null, setupDoneAtMs: this.marks.setupDone ?? null, readyAtMs: this.marks.ready ?? null };
  }

  private record(name: SetupSpanName, at: number): void {
    if (!this.spans[name]) this.spans[name] = { atMs: Math.round(at - this.t0), ms: Math.round(this.now() - at) };
  }
}
