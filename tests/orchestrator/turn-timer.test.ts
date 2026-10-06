import { describe, it, expect, vi, afterEach } from 'vitest';
import { TurnTimer } from '@/lib/orchestrator/turn-timer';

afterEach(() => vi.useRealTimers());

describe('TurnTimer', () => {
  it('marks ms since the turn started; the first mark of a name wins', () => {
    vi.useFakeTimers({ now: 1_000 });
    const t = new TurnTimer(1_000);
    vi.setSystemTime(1_250);
    t.mark('reads_done');
    vi.setSystemTime(1_400);
    t.mark('reads_done');
    expect(t.marks).toEqual({ reads_done: 250 });
  });

  it('times an awaited step with start and end marks', async () => {
    const t = new TurnTimer(Date.now());
    await t.time('hint_check', Promise.resolve(1));
    expect(Object.keys(t.marks)).toEqual(['hint_check_start', 'hint_check_end']);
  });

  it('watches a parallel step and orders marks by time', async () => {
    const t = new TurnTimer(Date.now() - 10);
    t.mark('plan_done');
    const p = Promise.resolve();
    t.watch('distress_verdict', p);
    await p; await Promise.resolve();
    expect(t.ordered().map(([k]) => k)).toEqual(['plan_done', 'distress_verdict']);
  });
});
