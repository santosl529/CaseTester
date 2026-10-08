// A manual clock and a frame sink for playout and controller tests.
import type { Clock, FrameSink } from '@/lib/voice/playout';

export function fakeClock(start = 1000) {
  let t = start;
  const timers: { at: number; fn: () => void; dead: boolean }[] = [];
  const clock: Clock = { now: () => t, at: (at, fn) => { const x = { at, fn, dead: false }; timers.push(x); return () => { x.dead = true; }; } };
  const advance = async (ms: number) => {
    const end = t + ms;
    for (;;) {
      await new Promise(r => setTimeout(r, 0));
      const due = timers.filter(x => !x.dead && x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      t = Math.max(t, due.at); due.dead = true; due.fn();
    }
    t = end;
    await new Promise(r => setTimeout(r, 0));
  };
  return { clock, advance };
}
export const sink = (): FrameSink & { cleared: number } => ({ cleared: 0, async capture() {}, clear() { this.cleared++; } });
