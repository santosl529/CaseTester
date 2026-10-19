// The browser's per-turn health line (Lorenzo, 19 Oct, d): the voice page
// froze on laptop speakers and nothing on record said why. Each interviewer
// turn, the page reports the longest gap between animation frames and the
// long-task time since the last report, the audio element count and the audio
// context's state, into the session records. Client-safe: no server imports.

export type HealthReport = { longestFrameGapMs: number; longTaskMs: number | null; audioElements: number; audioContextState: string };

export class HealthMeter {
  private last: number | null = null;
  private longest = 0;
  private longTaskTotal = 0;

  // longTasks: the browser reports long tasks (Chromium only).
  constructor(private longTasks: boolean) {}

  // A frame at `t`; a hidden tab pauses frames, so its gap isn't a stall.
  frame(t: number, visible: boolean): void {
    if (!visible) { this.last = null; return; }
    if (this.last !== null) this.longest = Math.max(this.longest, t - this.last);
    this.last = t;
  }

  longTask(ms: number): void { this.longTaskTotal += ms; }

  take(now: { audioElements: number; audioContextState: string }): HealthReport {
    const r = { longestFrameGapMs: Math.round(this.longest), longTaskMs: this.longTasks ? Math.round(this.longTaskTotal) : null, ...now };
    this.longest = 0;
    this.longTaskTotal = 0;
    return r;
  }
}
