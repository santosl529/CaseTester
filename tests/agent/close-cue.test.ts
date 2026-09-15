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

  it('does not treat a correction as a close, even one that says "before we close"', () => {
    expect(hasCloseCue('One flag before we close. The COGS dollar increase you computed includes normal growth — the margin problem is the 16-point compression, a different quantity than the $103M.')).toBe(false);
  });
});
