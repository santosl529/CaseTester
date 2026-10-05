import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));

import { tailAfterDelivered } from '@/lib/orchestrator/settle-turn';

// The prefix lock: today's pipeline decides the final text; only what follows
// the already-delivered speech is sent.
describe('tailAfterDelivered', () => {
  it('returns everything when nothing was delivered', () => {
    expect(tailAfterDelivered('Okay. What drove it?', [])).toEqual({ tail: 'Okay. What drove it?', mismatch: false });
  });

  it('returns only the text after the delivered prefix', () => {
    expect(tailAfterDelivered('Okay. COGS is 58% of revenue. Here is more. What drove it?', ['Okay.', 'COGS is 58% of revenue.']))
      .toEqual({ tail: 'Here is more. What drove it?', mismatch: false });
  });

  it('ignores whitespace differences in the prefix', () => {
    expect(tailAfterDelivered('Okay.  COGS  is up. Why?', ['Okay.', 'COGS is up.'])).toEqual({ tail: 'Why?', mismatch: false });
  });

  it('on a replacement, sends the final sentences not yet delivered, in order', () => {
    expect(tailAfterDelivered('Before we close, what would you tell the CEO?', ['Okay.']))
      .toEqual({ tail: 'Before we close, what would you tell the CEO?', mismatch: true });
    expect(tailAfterDelivered('Okay. Revenue is $480M. What now?', ['Revenue is $480M.']))
      .toEqual({ tail: 'Okay. What now?', mismatch: true });
  });

  it('returns an empty tail when the final text was fully delivered', () => {
    expect(tailAfterDelivered('Okay. Go on.', ['Okay.', 'Go on.'])).toEqual({ tail: '', mismatch: false });
  });

  it('accepts a delivered say text that has no closing punctuation', () => {
    // The parser emits a whole say text at its closing quote; the final text
    // joins say texts with a space.
    expect(tailAfterDelivered('Walk me through that What drove it?', ['Walk me through that']))
      .toEqual({ tail: 'What drove it?', mismatch: false });
  });
});
