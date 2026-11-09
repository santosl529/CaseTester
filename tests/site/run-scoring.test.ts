// Getting a report after an interview (8 Nov). The score route claims one pass per session (never charged twice);
// when another pass is already running — a second tab, or a pass that outlived its request — it answers 409
// "Scoring in progress". That isn't a failure: wait and ask again, up to ~10 minutes.
import { describe, it, expect } from 'vitest';
import { runScoring } from '@/lib/site/run-scoring';

type Answer = { ok: boolean; status: number; data: Record<string, unknown> | null };
function fake(answers: Answer[]) {
  const calls: string[] = [];
  let t = 0;
  return {
    calls,
    deps: {
      request: async (url: string): Promise<Answer> => { calls.push(url.split('/').pop()!); return url.endsWith('/finalize') ? { ok: true, status: 200, data: {} } : answers.shift() ?? { ok: false, status: 500, data: null }; },
      sleep: async (ms: number) => { t += ms; },
      now: () => t,
      onWaiting: () => { calls.push('waiting'); },
    },
  };
}
const ok = { ok: true, status: 200, data: { scored: true } };
const inProgress = { ok: false, status: 409, data: { error: 'Scoring in progress' } };

describe('runScoring', () => {
  it('finalize, then score: ready', async () => {
    const f = fake([ok]);
    expect(await runScoring('s', f.deps)).toBe('ready');
    expect(f.calls).toEqual(['finalize', 'score']);
  });
  it('in progress elsewhere: tells the student it is still preparing, waits, asks again', async () => {
    const f = fake([inProgress, inProgress, ok]);
    expect(await runScoring('s', f.deps)).toBe('ready');
    expect(f.calls).toEqual(['finalize', 'score', 'waiting', 'score', 'waiting', 'score']);
  });
  it('a timeout or the network: also waited out (the pass may still be running)', async () => {
    const f = fake([{ ok: false, status: 504, data: null }, { ok: false, status: 0, data: null }, ok]);
    expect(await runScoring('s', f.deps)).toBe('ready');
  });
  it('a real error: one retry, then failed', async () => {
    const f = fake([{ ok: false, status: 500, data: { error: 'server_error' } }, { ok: false, status: 500, data: null }]);
    expect(await runScoring('s', f.deps)).toBe('failed');
    expect(f.calls.filter(c => c === 'score')).toHaveLength(2);
  });
  it('still in progress after ~10 minutes: failed (the student can try again)', async () => {
    const f = fake(Array.from({ length: 100 }, () => inProgress));
    expect(await runScoring('s', f.deps)).toBe('failed');
    expect(f.calls.filter(c => c === 'score').length).toBeLessThanOrEqual(42);
  });
});
