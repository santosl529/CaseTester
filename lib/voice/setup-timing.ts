// The voice page's setup timings (session b406165f, 19 Oct): a 2.86s
// main-thread block during the room join sped up the opener, and nothing on
// record said which step it sat in. Each step's start (from the Start click)
// and duration, with when the agent's hello came, setup ended and `ready` went
// out — sent once, when ready has gone out and the agent's audio track is
// attached, as a `setup` line in the session records. With each long task from
// the click until then (Chromium; null elsewhere), at its start from the click,
// so a freeze sits inside a step. Client-safe: no imports.

export const SETUP_SPANS = ['audioContext', 'connect', 'startAudio', 'mic', 'micMeter', 'firstTrack'] as const;
export type SetupSpanName = (typeof SETUP_SPANS)[number];
export type SetupSpan = { atMs: number; ms: number };
export const MAX_SETUP_LONG_TASKS = 50;
// playing: the agent's audio element fired 'playing'; playingFallback: the gate's fallback went instead (lib/voice/ready-gate.ts).
export type SetupMark = 'hello' | 'setupDone' | 'ready' | 'playing' | 'playingFallback';
export type SetupTimingLine = {
  spans: Record<SetupSpanName, SetupSpan | null>;
  helloAtMs: number | null; setupDoneAtMs: number | null; readyAtMs: number | null;
  playingAtMs: number | null; playingFallbackAtMs: number | null;
  longTasks: SetupSpan[] | null;
};

export class SetupTimings {
  private t0: number;
  private spans: Partial<Record<SetupSpanName, SetupSpan>> = {};
  private marks: Partial<Record<SetupMark, number>> = {};
  private longTasks: SetupSpan[] = [];
  private taken = false;

  // longTasks: the browser reports long tasks (Chromium only).
  constructor(private now: () => number, private reportsLongTasks = false) { this.t0 = now(); }

  // A long task's entry (startTime on the now() clock), until the line is taken.
  longTask(startTime: number, duration: number): void {
    if (this.taken || this.longTasks.length >= MAX_SETUP_LONG_TASKS) return;
    this.longTasks.push({ atMs: Math.round(startTime - this.t0), ms: Math.round(duration) });
  }

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
    return { spans, helloAtMs: this.marks.hello ?? null, setupDoneAtMs: this.marks.setupDone ?? null, readyAtMs: this.marks.ready ?? null,
      playingAtMs: this.marks.playing ?? null, playingFallbackAtMs: this.marks.playingFallback ?? null,
      longTasks: this.reportsLongTasks ? this.longTasks : null };
  }

  private record(name: SetupSpanName, at: number): void {
    if (!this.spans[name]) this.spans[name] = { atMs: Math.round(at - this.t0), ms: Math.round(this.now() - at) };
  }
}
