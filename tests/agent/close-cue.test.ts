import { describe, it, expect } from 'vitest';
import { hasCloseCue, CLOSE_SCRIPTS } from '@/lib/agent/prompts/scripts';

// Rule 12: the close must appear in the transcript. Live run eca39ec7's final
// turn (after time-up) was only a correction — no close — and the close
// fallback fired only when the turn was empty.
describe('hasCloseCue', () => {
  it('recognizes every close script and the model’s natural closes from live runs', () => {
    for (const script of CLOSE_SCRIPTS) expect(hasCloseCue(script), script).toBe(true);
    expect(hasCloseCue("That's a clear place to close. Thank you for working through it — a full written report with feedback will follow.")).toBe(true);
    expect(hasCloseCue("That's a clear recommendation with the risks flagged. We'll stop there. A full written report will follow.")).toBe(true);
  });

  // Fact guards Phase 5 (batch 20 R10, R20): said mid-case, then the case went on.
  it('recognizes "that closes the case / out / the recommendation" as a close', () => {
    expect(hasCloseCue('Thanks, that closes the case.')).toBe(true);
    expect(hasCloseCue("That closes out the recommendation work we'll take from this case.")).toBe(true);
    expect(hasCloseCue('That closes the recommendation and its fallback.')).toBe(true);
    expect(hasCloseCue('That closes the gap on beans — what about the other inputs?')).toBe(false);
    // Batch 21 wave 1, Owen t18, said mid-case.
    expect(hasCloseCue("That's all I need from you on the case.")).toBe(true);
  });

  // Lorenzo, 13 Oct (Step 4, Jasmine 35897f4a t18 — said mid-case with stages
  // owed, then the case went on; and the other closing lines a scan of every
  // saved run found).
  it.each([
    "That's all I have on the case.",
    "That's all I have.",
    "We're done here.",
    'Thanks, that covers it.',
    "That's it from me.",
    "That's all for today.",
    'That wraps it up.',
  ])('recognizes a closing line: %s', s => expect(hasCloseCue(s)).toBe(true));
  it.each([
    "That's all I have on competitor pricing.",
    "Once we're done here with costs, what would you look at?",
    'That covers costs; what about revenue?',
    "That's all right.",
    'Before we wrap up, what is the single biggest risk to your recommendation?',
    "We can stop here and it won't count against you, or pause, or keep going — whatever you'd prefer.",
  ])('not a close: %s', s => expect(hasCloseCue(s)).toBe(false));

  it('does not treat a correction as a close, even one that says "before we close"', () => {
    expect(hasCloseCue('One flag before we close. The COGS dollar increase you computed includes normal growth — the margin problem is the 16-point compression, a different quantity than the $103M.')).toBe(false);
  });
});
