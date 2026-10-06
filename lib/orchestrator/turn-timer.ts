// Exact per-turn timing: each step on the turn's path, and when each check
// running beside the model resolved, as ms since the turn started. The first
// occurrence of a mark wins (a regeneration's second first-token is marked
// apart). Logged with turn_latency as `steps`.
export class TurnTimer {
  readonly marks: Record<string, number> = {};
  constructor(private readonly t0: number) {}

  mark(name: string): void {
    this.marks[name] ??= Date.now() - this.t0;
  }

  // Marks `<name>_start` and `<name>_end` around an awaited step.
  async time<T>(name: string, p: Promise<T> | T): Promise<T> {
    this.mark(`${name}_start`);
    try {
      return await p;
    } finally {
      this.mark(`${name}_end`);
    }
  }

  // Marks `name` when a step already running in parallel settles.
  watch(name: string, p: Promise<unknown> | unknown): void {
    if (p && typeof (p as Promise<unknown>).then === 'function') {
      (p as Promise<unknown>).then(() => this.mark(name), () => this.mark(`${name}_failed`));
    }
  }

  // Marks in time order, for the log line.
  ordered(): [string, number][] {
    return Object.entries(this.marks).sort((a, b) => a[1] - b[1]);
  }
}
