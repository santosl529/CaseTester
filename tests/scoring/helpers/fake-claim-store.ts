// The scoring claim's semantics in memory (lib/scoring/scoring-claim.ts): at most one live claim per session, stale by
// its last beat; a shared fake clock that fires the claim's beat timers as it advances.
import { SCORING_CLAIM_STALE_MS } from '@/lib/scoring/scoring-claim';

export function fakeClaimStore(opts: { scoredAfterMs?: number } = {}) {
  const clock = { t: 0 };
  const state = { claimAt: null as number | null, beatAt: null as number | null, scoredAt: null as number | null };
  const timers: { every: number; next: number; fn: () => void }[] = [];
  const calls = { claims: 0, releases: 0, beats: 0 };
  const advance = (ms: number) => {
    const end = clock.t + ms;
    for (;;) {
      const due = timers.filter(x => x.next <= end).sort((a, b) => a.next - b.next)[0];
      if (!due) break;
      clock.t = due.next; due.next += due.every; due.fn();
    }
    clock.t = end;
    if (opts.scoredAfterMs != null && clock.t >= opts.scoredAfterMs) state.scoredAt ??= clock.t;
  };
  return {
    clock, state, calls, advance,
    deps: {
      now: () => clock.t,
      sleep: async (ms: number) => { await Promise.resolve(); advance(ms); },
      scored: async () => state.scoredAt != null,
      claim: async (_id: string, nowMs: number) => {
        calls.claims++;
        if (state.claimAt != null && nowMs - (state.beatAt ?? state.claimAt) < SCORING_CLAIM_STALE_MS) return false;
        state.claimAt = nowMs; state.beatAt = nowMs;
        return true;
      },
      beat: async (_id: string, token: number, nowMs: number) => {
        calls.beats++;
        if (state.claimAt !== token) return false;
        state.beatAt = nowMs;
        return true;
      },
      release: async (_id: string, token: number) => { calls.releases++; if (state.claimAt === token) { state.claimAt = null; state.beatAt = null; } },
      every: (ms: number, fn: () => void) => { const x = { every: ms, next: clock.t + ms, fn }; timers.push(x); return () => { timers.splice(timers.indexOf(x), 1); }; },
    },
  };
}

