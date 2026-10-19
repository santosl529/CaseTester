import { describe, it, expect } from 'vitest';
import {
  evaluateSilence, resumeOnCandidateTurn, effectiveElapsedMs, checkInText, pauseText, restateOnTable,
  INITIAL_SILENCE_STATE, SILENCE_CHECK_IN_MS, SILENCE_PAUSE_MS, SILENCE_PAUSE_MAX_MS, SESSION_PAUSE_BUDGET_MS,
  type SilenceState,
} from '@/lib/orchestrator/silence';
import { recordSilenceStall, evaluateStall, INITIAL_STALL_STATE } from '@/lib/orchestrator/stall';

const NOW = 1_000_000;
const LONG_AGO = 0; // last turn far enough back that reported silence is never bounded

// Drive a silence that began at `start` through check-in and pause, via the real transitions.
function pausedFrom(start: number, prior: SilenceState = INITIAL_SILENCE_STATE): SilenceState {
  const checked = evaluateSilence(SILENCE_CHECK_IN_MS, start + SILENCE_CHECK_IN_MS, prior, start).state;
  const d = evaluateSilence(SILENCE_PAUSE_MS, start + SILENCE_PAUSE_MS, checked, start + SILENCE_CHECK_IN_MS);
  expect(d.action).toBe('pause');
  return d.state;
}

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

  it('pauses on continued silence after the check-in, from the pause point — the silence before it is case time', () => {
    const start = NOW;
    const s = pausedFrom(start);
    expect(s.pausedAtMs).toBe(start + SILENCE_PAUSE_MS);
    expect(s.pauseLimitMs).toBe(SILENCE_PAUSE_MAX_MS);
  });

  it('a late pause tick still starts the pause at the pause threshold, not at the tick', () => {
    const start = NOW;
    const checked = evaluateSilence(SILENCE_CHECK_IN_MS, start + SILENCE_CHECK_IN_MS, INITIAL_SILENCE_STATE, start).state;
    const d = evaluateSilence(SILENCE_PAUSE_MS + 40_000, start + SILENCE_PAUSE_MS + 40_000, checked, start + SILENCE_CHECK_IN_MS);
    expect(d.state.pausedAtMs).toBe(start + SILENCE_PAUSE_MS);
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

  it('does nothing while paused, until the pause limit runs out', () => {
    const s = pausedFrom(NOW);
    const t = SILENCE_PAUSE_MS + SILENCE_PAUSE_MAX_MS - 1_000;
    expect(evaluateSilence(t, NOW + t, s, NOW + SILENCE_PAUSE_MS).action).toBe('none');
  });

  it('expires the pause once its limit runs out', () => {
    const s = pausedFrom(NOW);
    const t = SILENCE_PAUSE_MS + SILENCE_PAUSE_MAX_MS;
    expect(evaluateSilence(t, NOW + t, s, NOW + SILENCE_PAUSE_MS).action).toBe('expire');
  });

  it('cannot expire early on an inflated report', () => {
    const s = pausedFrom(NOW);
    expect(evaluateSilence(60 * 60_000, NOW + SILENCE_PAUSE_MS + 10_000, s, NOW + SILENCE_PAUSE_MS).action).toBe('none');
  });

  it('limits a pause to the session budget that remains', () => {
    const prior = { ...INITIAL_SILENCE_STATE, pausedTotalMs: SESSION_PAUSE_BUDGET_MS - 60_000 };
    expect(pausedFrom(NOW, prior).pauseLimitMs).toBe(60_000);
  });

  it('never pauses once the session budget is spent — the clock keeps running', () => {
    const prior = { ...INITIAL_SILENCE_STATE, pausedTotalMs: SESSION_PAUSE_BUDGET_MS };
    const checked = evaluateSilence(SILENCE_CHECK_IN_MS, NOW + SILENCE_CHECK_IN_MS, prior, NOW).state;
    const d = evaluateSilence(SILENCE_PAUSE_MS, NOW + SILENCE_PAUSE_MS, checked, NOW + SILENCE_CHECK_IN_MS);
    expect(d.action).toBe('none');
    expect(d.state.pausedAtMs).toBeNull();
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
    const s = pausedFrom(NOW);
    const r = resumeOnCandidateTurn(s, NOW + SILENCE_PAUSE_MS + 20_000);
    expect(r.resumedAfterMs).toBe(20_000);
    expect(r.state).toEqual({ ...INITIAL_SILENCE_STATE, pausedTotalMs: 20_000 });
  });

  it('banks no more than the pause limit if the candidate returns late', () => {
    const s = pausedFrom(NOW);
    const r = resumeOnCandidateTurn(s, NOW + SILENCE_PAUSE_MS + SILENCE_PAUSE_MAX_MS + 90_000);
    expect(r.state.pausedTotalMs).toBe(SILENCE_PAUSE_MAX_MS);
  });

  it('accumulates across several pauses', () => {
    const first = resumeOnCandidateTurn(pausedFrom(NOW), NOW + SILENCE_PAUSE_MS + 50_000).state;
    const later = NOW + 1_000_000;
    const r = resumeOnCandidateTurn(pausedFrom(later, first), later + SILENCE_PAUSE_MS + 10_000);
    expect(r.state.pausedTotalMs).toBe(60_000);
  });
});

describe('effectiveElapsedMs', () => {
  it('is wall time with no pauses', () => {
    expect(effectiveElapsedMs(0, 300_000, INITIAL_SILENCE_STATE)).toBe(300_000);
  });

  it('excludes banked pauses (Rule 19)', () => {
    expect(effectiveElapsedMs(0, 300_000, { ...INITIAL_SILENCE_STATE, pausedTotalMs: 200_000 })).toBe(100_000);
  });

  it('excludes an open pause up to now, capped at its limit', () => {
    const s = pausedFrom(0); // paused at 180s, limit 5 min
    expect(effectiveElapsedMs(0, 250_000, s)).toBe(SILENCE_PAUSE_MS);
    expect(effectiveElapsedMs(0, SILENCE_PAUSE_MS + SILENCE_PAUSE_MAX_MS + 60_000, s)).toBe(SILENCE_PAUSE_MS + 60_000);
  });
});

describe('pauseText', () => {
  it('warns the session ends if they are not back in time', () => {
    expect(pauseText(5 * 60_000)).toBe(
      "Looks like we may have lost you — I've paused the clock. If you're not back within 5 minutes, we'll end the session here.",
    );
  });

  it('rounds a short remaining budget up to whole minutes', () => {
    expect(pauseText(40_000)).toContain('within 1 minute,');
  });
});

describe('checkInText', () => {
  it('restates the last question on the table', () => {
    expect(checkInText('Good. How would you structure this problem?'))
      .toBe('Still with me? Take your time. The question on the table: how would you structure this problem?');
  });

  it("lowers only a question word's capital — never an imperative's, a name's or an acronym's (batch 21 D8)", () => {
    expect(checkInText(null, 'COGS rose 16 points — which input drove it?')).toBe('Still with me? Take your time. The question on the table: COGS rose 16 points — which input drove it?');
    expect(checkInText(null, 'Hollis Bay needs 6 million bags — is that reachable?')).toBe('Still with me? Take your time. The question on the table: Hollis Bay needs 6 million bags — is that reachable?');
    expect(checkInText(null, 'Lay out the main areas you would investigate.')).toBe('Still with me? Take your time. The question on the table: Lay out the main areas you would investigate.');
  });

  it('restateOnTable: the "is" form only for one sentence opening with a question word (batch 21 Destiny t4)', () => {
    expect(restateOnTable('Which branch would you start with?')).toBe('The question on the table is which branch would you start with?');
    expect(restateOnTable("Lay out the main areas you'd investigate to find why the margin fell, and how they fit together, before asking for any data. What would your approach be?"))
      .toBe("The question on the table: Lay out the main areas you'd investigate to find why the margin fell, and how they fit together, before asking for any data. What would your approach be?");
    expect(restateOnTable('Larkspur matched the fare — what happened to contribution per flight?')).toBe('The question on the table: Larkspur matched the fare — what happened to contribution per flight?');
    expect(restateOnTable('Take your time. The question on the table is why margins fell?')).toBe('The question on the table is why margins fell?');
    expect(restateOnTable('What framework would you use to break down this profit decline? Take a minute if you need it.'))
      .toBe('The question on the table: What framework would you use to break down this profit decline? Take a minute if you need it.');
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

// Brief B rulings (18 Oct): the check-in and the pause can fire more than once a
// session, so they vary; the expiry line ends the session and stays fixed.
import { checkInText as checkIn2, pauseText as pause2, isSilenceLine as isSilence2 } from '@/lib/orchestrator/silence';
import { PHRASE_POOLS as POOLS2, PHRASE_MEMORY as MEM2, recordPhraseUses as record2, type PhraseUses as Uses2 } from '@/lib/orchestrator/phrasing';
describe('the silence lines vary', () => {
  it('the check-in and the pause: never one of their last 3, every version still a silence line', () => {
    for (const make of [(u: Uses2, s: string) => checkIn2(null, 'How would you size it?', u, s), (u: Uses2, s: string) => pause2(300_000, u, s)]) {
      let uses: Uses2 = {};
      const seen: string[] = [];
      for (let t = 0; t < 15; t++) {
        const text = make(uses, `s:${t}`);
        expect(isSilence2(text), text).toBe(true);
        expect(seen.slice(-MEM2)).not.toContain(text);
        seen.push(text);
        uses = record2(text, uses);
      }
    }
  });
  it('the first check-in is the original line, the question after it', () => {
    expect(checkIn2(null, 'How would you size it?')).toBe(`${POOLS2.check_in[0]} The question on the table: how would you size it?`);
    expect(pause2(300_000)).toBe(POOLS2.pause[0].replace('{x}', '5 minutes'));
  });
});
