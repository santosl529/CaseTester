// One scoring pass per session (site flow, 19 Oct; main 58911e63): two tabs or a double click must not run the Opus
// passes twice or write two score rows. The first call claims the session; a second waits for its score. Phase 1
// 4.11 adds the claim's beat (a pass that is still running, retries included, keeps its claim) and the token on
// release.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
const { scoreOnce, SCORING_CLAIM_STALE_MS, CLAIM_BEAT_MS } = await import('@/lib/scoring/scoring-claim');
const { fakeClaimStore } = await import('./helpers/fake-claim-store');

describe('scoreOnce', () => {
  it('no claim held: claims, scores once, releases', async () => {
    const f = fakeClaimStore();
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, f.deps)).toBe('scored');
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ sessionId: 's1', token: 0 });
    expect(f.calls.releases).toBe(1);
    expect(f.state.claimAt).toBeNull();
  });

  it('already scored: nothing runs', async () => {
    const f = fakeClaimStore({ scoredAfterMs: 0 });
    f.advance(0);
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, f.deps)).toBe('already_scored');
    expect(run).not.toHaveBeenCalled();
  });

  it('a pass already running (second tab, double click): waits for its score, never runs a second pass', async () => {
    const f = fakeClaimStore({ scoredAfterMs: 90_000 });
    f.state.claimAt = 0; f.state.beatAt = 0;
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, f.deps)).toBe('already_scored');
    expect(run).not.toHaveBeenCalled();
  });

  it('the running pass outlives the wait: in_progress, nothing run', async () => {
    const f = fakeClaimStore();
    f.state.claimAt = 0; f.state.beatAt = 0;
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, { ...f.deps, waitMs: 60_000 })).toBe('in_progress');
    expect(run).not.toHaveBeenCalled();
  });

  it('a claim left by a pass that died (no beat for longer than the stale limit) is taken over', async () => {
    const f = fakeClaimStore();
    f.state.claimAt = -SCORING_CLAIM_STALE_MS - 1; f.state.beatAt = f.state.claimAt;
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, f.deps)).toBe('scored');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a long pass beats: its claim is never stale while it runs, so a second caller waits', async () => {
    const f = fakeClaimStore();
    let second: string | undefined;
    const run = async () => {
      // Eight minutes of retries and passes, longer than the stale limit; a second caller arrives at minute 7.
      f.advance(7 * 60_000);
      second = await scoreOnce('s1', vi.fn(async () => {}), { ...f.deps, waitMs: 0 });
      f.advance(60_000);
    };
    expect(await scoreOnce('s1', run, f.deps)).toBe('scored');
    expect(second).toBe('in_progress');
    expect(f.calls.beats).toBeGreaterThanOrEqual(7);
    expect(CLAIM_BEAT_MS).toBeLessThan(SCORING_CLAIM_STALE_MS);
  });

  it('a failed pass releases its claim, so a retry can score at once', async () => {
    const f = fakeClaimStore();
    await expect(scoreOnce('s1', async () => { throw new Error('judge failed'); }, f.deps)).rejects.toThrow('judge failed');
    expect(f.calls.releases).toBe(1);
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, f.deps)).toBe('scored');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('scored between the check and the claim: releases, runs nothing', async () => {
    const f = fakeClaimStore();
    let checks = 0;
    const deps = { ...f.deps, scored: async () => ++checks > 1 };
    const run = vi.fn(async () => {});
    expect(await scoreOnce('s1', run, deps)).toBe('already_scored');
    expect(run).not.toHaveBeenCalled();
    expect(f.calls.releases).toBe(1);
  });

  it('a pass whose claim was taken over releases nothing of the new one', async () => {
    const f = fakeClaimStore();
    const run = async () => { f.state.claimAt = 999; f.state.beatAt = 999; };   // another pass's claim now
    await scoreOnce('s1', run, f.deps);
    expect(f.state.claimAt).toBe(999);
  });
});
