import { describe, it, expect } from 'vitest';
import { isSpokenClose, resolveSpokenClose, CLOSE_DEFERRED_PROBE } from '@/lib/orchestrator/spoken-close';

// Run 1d76e3d9: the model said this at 15:33 of a 20-minute case without
// calling end_case, and the session looped on goodbyes until time-up.
const DEREK_CLOSE = "That's time. Thanks for working through it — you'll get a full written report with detailed feedback rather than a debrief now.\n\nI'll close the case here.";

describe('isSpokenClose', () => {
  it('recognizes an explicit close', () => {
    expect(isSpokenClose(DEREK_CLOSE)).toBe(true);
    expect(isSpokenClose("That's the case. Thanks again.")).toBe(true);
    expect(isSpokenClose("We're out of time, so we'll stop there.")).toBe(true);
  });

  it('does not treat mid-case thanks as a close', () => {
    expect(isSpokenClose('Thanks for walking me through that. What drives the COGS increase?')).toBe(false);
    expect(isSpokenClose("Thanks for working through the math. Now let's look at costs.")).toBe(false);
  });

  it('does not treat a time warning as a close', () => {
    expect(isSpokenClose("We're near time. What's your recommendation?")).toBe(false);
  });
});

describe('resolveSpokenClose', () => {
  it('leaves a turn alone when the model already ended the case', () => {
    expect(resolveSpokenClose({ spokenText: DEREK_CLOSE, ended: true, mayEnd: true }))
      .toEqual({ action: 'none', ended: true, spokenText: DEREK_CLOSE });
  });

  it('leaves a turn with no close alone', () => {
    const text = 'Good. What would you tell the CEO?';
    expect(resolveSpokenClose({ spokenText: text, ended: false, mayEnd: true }))
      .toEqual({ action: 'none', ended: false, spokenText: text });
  });

  it('ends the case when the interviewer spoke a close and the case may end', () => {
    expect(resolveSpokenClose({ spokenText: DEREK_CLOSE, ended: false, mayEnd: true }))
      .toEqual({ action: 'promoted', ended: true, spokenText: DEREK_CLOSE });
  });

  it('strips the close and keeps the case going when it may not end yet', () => {
    const r = resolveSpokenClose({
      spokenText: "Good point on hedging. That's time — thanks for working through it.",
      ended: false,
      mayEnd: false,
    });
    expect(r.action).toBe('stripped');
    expect(r.ended).toBe(false);
    expect(r.spokenText).toBe('Good point on hedging.');
  });

  it('substitutes a depth probe when stripping leaves nothing', () => {
    const r = resolveSpokenClose({ spokenText: DEREK_CLOSE, ended: false, mayEnd: false });
    expect(r).toEqual({ action: 'stripped', ended: false, spokenText: CLOSE_DEFERRED_PROBE });
  });
});
