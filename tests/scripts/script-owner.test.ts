// Test runs own their sessions under a fixed account (Lorenzo, 6 Nov): live-run, voice-latency and voice-demo used to
// borrow the newest session's user — possibly a student, whose start limits the runs then used up.
import { describe, it, expect } from 'vitest';
import { scriptOwnerId } from '@/lib/script-owner';

const ID = '3f2b8c1e-9a4d-4e5f-8b6c-7d8e9f0a1b2c';

describe('scriptOwnerId', () => {
  it('SCRIPT_USER_ID set to a user id: that id', () => {
    expect(scriptOwnerId({ SCRIPT_USER_ID: ` ${ID} ` })).toBe(ID);
  });
  it('unset: a clear error, never a borrowed user', () => {
    expect(() => scriptOwnerId({})).toThrow(/SCRIPT_USER_ID/);
  });
  it('not a user id: a clear error', () => {
    expect(() => scriptOwnerId({ SCRIPT_USER_ID: 'lorenzo' })).toThrow(/not a Supabase user id/);
  });
});
