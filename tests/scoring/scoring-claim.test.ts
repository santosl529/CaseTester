// One scoring pass per session (site flow, 19 Oct): two tabs or a double
// click must not run the Opus passes twice or write two score rows. The first
// call claims the session; a second waits for its score.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
const { scoreOnce, SCORING_CLAIM_STALE_MS } = await import('@/lib/scoring/scoring-claim');

// A fake store with the claim's semantics: at most one live claim per session.
function fakeDeps(opts: { scoredAfterMs?: number } = {}) {
  let t = 0;
  let claimAt: number | null = null;
  let scoredAt: number | null = null;
  const calls = { claims: 0, releases: 0 };
  return {
    calls,
    setClaim: (at: number | null) => { claimAt = at; },
    deps: {
      now: () => t,
      sleep: async (ms: number) => { t += ms; if (opts.scoredAfterMs != null && t >= opts.scoredAfterMs) scoredAt = t; },
      scored: async () => scoredAt != null,
      claim: async (_id: string, nowMs: number) => {
        calls.claims++;
        if (claimAt != null && nowMs - claimAt < SCORING_CLAIM_STALE_MS) return false;
        claimAt = nowMs;
        return true;
      },
      release: async () => { calls.releases++; claimAt = null; },
    },
  };
}

describe('scoreOnce', () => {
  it('no claim held: claims, scores once, releases', async () => {
    const f = fakeDeps();
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, f.deps)).toBe('scored');
    expect(run).toHaveBeenCalledTimes(1);
    expect(f.calls.releases).toBe(1);
  });

  it('already scored: nothing runs', async () => {
    const f = fakeDeps({ scoredAfterMs: 0 });
    await f.deps.sleep(0);
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, f.deps)).toBe('already_scored');
    expect(run).not.toHaveBeenCalled();
  });

  it('a pass already running (second tab, double click): waits for its score, never runs a second pass', async () => {
    const f = fakeDeps({ scoredAfterMs: 90_000 });
    f.setClaim(0);
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, f.deps)).toBe('already_scored');
    expect(run).not.toHaveBeenCalled();
  });

  it('the running pass outlives the wait: in_progress, nothing run', async () => {
    const f = fakeDeps();
    f.setClaim(0);
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, { ...f.deps, waitMs: 60_000 })).toBe('in_progress');
    expect(run).not.toHaveBeenCalled();
  });

  it('a claim left by a pass that died (older than the stale limit) is taken over', async () => {
    const f = fakeDeps();
    f.setClaim(-SCORING_CLAIM_STALE_MS - 1);
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, f.deps)).toBe('scored');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a failed pass releases its claim, so a retry can score at once', async () => {
    const f = fakeDeps();
    await expect(scoreOnce('s1', async () => { throw new Error('judge failed'); }, f.deps)).rejects.toThrow('judge failed');
    expect(f.calls.releases).toBe(1);
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, f.deps)).toBe('scored');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('scored between the check and the claim: releases, runs nothing', async () => {
    const f = fakeDeps();
    let checks = 0;
    const deps = { ...f.deps, scored: async () => ++checks > 1 };
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, deps)).toBe('already_scored');
    expect(run).not.toHaveBeenCalled();
    expect(f.calls.releases).toBe(1);
  });
});
