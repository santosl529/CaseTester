import { describe, it, expect } from 'vitest';
import {
  evaluateSilence, resumeOnCandidateTurn, effectiveElapsedMs, checkInText,
  INITIAL_SILENCE_STATE, SILENCE_CHECK_IN_MS, SILENCE_PAUSE_MS,
} from '@/lib/orchestrator/silence';
import { recordSilenceStall, evaluateStall, INITIAL_STALL_STATE } from '@/lib/orchestrator/stall';

const NOW = 1_000_000;
const LONG_AGO = 0; // last turn far enough back that reported silence is never bounded

describe('evaluateSilence', () => {
  it('does nothing inside the tolerance window (a slow thinker is not rescued)', () => {
    const d = evaluateSilence(55_000, NOW, INITIAL_SILENCE_STATE, LONG_AGO);
    expect(d.action).toBe('none');
    expect(d.state).toEqual(INITIAL_SILENCE_STATE);
  });

  it('checks in once the tolerance window passes', () => {
    const d = evaluateSilence(SILENCE_CHECK_IN_MS, NOW, INITIAL_SILENCE_STATE, LONG_AGO);
    expect(d.action).toBe('check_in');
    expect(d.state.checkedIn).toBe(true);
  });

  it('checks in only once per silence', () => {
    const first = evaluateSilence(SILENCE_CHECK_IN_MS, NOW, INITIAL_SILENCE_STATE, LONG_AGO);
    const again = evaluateSilence(SILENCE_CHECK_IN_MS + 30_000, NOW + 30_000, first.state, LONG_AGO);
    expect(again.action).toBe('none');
  });

  it('checks in first even if the first tick arrives past the pause threshold', () => {
    const d = evaluateSilence(SILENCE_PAUSE_MS + 10_000, NOW, INITIAL_SILENCE_STATE, LONG_AGO);
    expect(d.action).toBe('check_in');
    expect(d.state.pausedAtMs).toBeNull();
  });

  it('pauses on continued silence after the check-in, backdated to when the silence began', () => {
    const checked = evaluateSilence(SILENCE_CHECK_IN_MS, NOW, INITIAL_SILENCE_STATE, LONG_AGO).state;
    expect(checked.silenceStartedAtMs).toBe(NOW - SILENCE_CHECK_IN_MS);
    const d = evaluateSilence(SILENCE_PAUSE_MS, NOW + 120_000, checked, NOW); // the check-in itself was a turn at NOW
    expect(d.action).toBe('pause');
    expect(d.state.pausedAtMs).toBe(NOW - SILENCE_CHECK_IN_MS);
  });

  it('bounds reported silence by the last turn (a client cannot inflate it)', () => {
    const d = evaluateSilence(10 * 60_000, NOW, INITIAL_SILENCE_STATE, NOW - 30_000);
    expect(d.action).toBe('none');
  });

  it('bounds the pause tick by when the silence began, not by the check-in turn', () => {
    const checked = evaluateSilence(SILENCE_CHECK_IN_MS, NOW, INITIAL_SILENCE_STATE, NOW - SILENCE_CHECK_IN_MS).state;
    // Client claims 10 minutes, but only 150s have passed since the silence began.
    const early = evaluateSilence(10 * 60_000, NOW + 90_000, checked, NOW);
    expect(early.action).toBe('none');
  });

  it('does nothing further while paused', () => {
    const checked = evaluateSilence(SILENCE_CHECK_IN_MS, NOW, INITIAL_SILENCE_STATE, LONG_AGO).state;
    const paused = evaluateSilence(SILENCE_PAUSE_MS, NOW, checked, LONG_AGO).state;
    expect(evaluateSilence(SILENCE_PAUSE_MS * 2, NOW, paused, LONG_AGO).action).toBe('none');
  });
});

describe('resumeOnCandidateTurn', () => {
  it('clears the check-in so the next silence can check in again', () => {
    const checked = evaluateSilence(SILENCE_CHECK_IN_MS, NOW, INITIAL_SILENCE_STATE, LONG_AGO).state;
    const r = resumeOnCandidateTurn(checked, NOW + 5_000);
    expect(r.state.checkedIn).toBe(false);
    expect(r.resumedAfterMs).toBeNull();
  });

  it('ends a pause and banks the paused interval', () => {
    const start = NOW - SILENCE_PAUSE_MS;
    const checked = evaluateSilence(SILENCE_CHECK_IN_MS, start + SILENCE_CHECK_IN_MS, INITIAL_SILENCE_STATE, start).state;
    const paused = evaluateSilence(SILENCE_PAUSE_MS, NOW, checked, start + SILENCE_CHECK_IN_MS).state; // pausedAt = start
    const r = resumeOnCandidateTurn(paused, NOW + 20_000);
    expect(r.resumedAfterMs).toBe(SILENCE_PAUSE_MS + 20_000);
    expect(r.state).toEqual({ checkedIn: false, silenceStartedAtMs: null, pausedAtMs: null, pausedTotalMs: SILENCE_PAUSE_MS + 20_000 });
  });

  it('accumulates across several pauses', () => {
    const r = resumeOnCandidateTurn({ checkedIn: true, silenceStartedAtMs: NOW - 10_000, pausedAtMs: NOW - 10_000, pausedTotalMs: 50_000 }, NOW);
    expect(r.state.pausedTotalMs).toBe(60_000);
  });
});

describe('effectiveElapsedMs', () => {
  it('is wall time with no pauses', () => {
    expect(effectiveElapsedMs(0, 300_000, INITIAL_SILENCE_STATE)).toBe(300_000);
  });

  it('excludes banked pauses (Rule 19)', () => {
    expect(effectiveElapsedMs(0, 300_000, { checkedIn: false, silenceStartedAtMs: null, pausedAtMs: null, pausedTotalMs: 200_000 })).toBe(100_000);
  });

  it('excludes an open pause up to now', () => {
    expect(effectiveElapsedMs(0, 300_000, { checkedIn: true, silenceStartedAtMs: 250_000, pausedAtMs: 250_000, pausedTotalMs: 0 })).toBe(250_000);
  });
});

describe('checkInText', () => {
  it('restates the last question on the table', () => {
    expect(checkInText('Good. How would you structure this problem?'))
      .toBe('Still with me? Take your time. The question on the table: how would you structure this problem?');
  });

  it('falls back to a bare check-in when there is no question', () => {
    expect(checkInText('Here is the cost breakdown.')).toBe('Still with me? Take your time.');
    expect(checkInText(null)).toBe('Still with me? Take your time.');
  });
});

describe('recordSilenceStall', () => {
  it('counts silence as one no-progress turn without firing a rung itself', () => {
    const s = recordSilenceStall(INITIAL_STALL_STATE);
    expect(s.consecutiveNoProgress).toBe(1);
    expect(s.ladderLevel).toBe(0);
  });

  it('silence then a hedge fires Level 1', () => {
    const s = recordSilenceStall(INITIAL_STALL_STATE);
    const d = evaluateStall("I'm not sure", 'ANALYSIS', s);
    expect(d.intervene).toBe(true);
    expect(d.rung).toBe(1);
  });

  it('silence then real analysis resets the streak', () => {
    const s = recordSilenceStall(INITIAL_STALL_STATE);
    const d = evaluateStall('COGS went from 42% to 58%, so 16 points of margin.', 'ANALYSIS', s);
    expect(d.intervene).toBe(false);
    expect(d.state.consecutiveNoProgress).toBe(0);
  });

  it('breaks a clarifying-question streak', () => {
    const s = recordSilenceStall({ ...INITIAL_STALL_STATE, consecutiveClarify: 2 });
    expect(s.consecutiveClarify).toBe(0);
  });
});
