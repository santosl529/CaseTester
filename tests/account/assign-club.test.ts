// Changing club (Lorenzo, 9 Nov: "record now, decide later"): the new club applies from now, and every change is
// logged with its date (analytics event club_changed { from, to }), so club statistics can later count history
// either way. Also fixes the club step for a student whose stored code was removed: it used to keep the old one.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
const { assignClub } = await import('@/lib/club');

const fake = (current: string | null) => {
  const log: unknown[] = [];
  let stored = current;
  return {
    log, get stored() { return stored; },
    deps: { read: async () => stored, write: async (_u: string, org: string) => { stored = org; }, logEvent: async (...a: unknown[]) => { log.push(a); } },
  };
};

describe('assignClub', () => {
  it('first club: saved and logged from null', async () => {
    const f = fake(null);
    expect(await assignClub('u1', 'ALPHA', f.deps)).toEqual({ changed: true, from: null });
    expect(f.stored).toBe('ALPHA');
    expect(f.log).toEqual([['club_changed', { from: null, to: 'ALPHA' }, { userId: 'u1' }]]);
  });
  it('a different club: replaced and logged', async () => {
    const f = fake('ALPHA');
    expect(await assignClub('u1', 'BETA', f.deps)).toEqual({ changed: true, from: 'ALPHA' });
    expect(f.stored).toBe('BETA');
    expect(f.log).toEqual([['club_changed', { from: 'ALPHA', to: 'BETA' }, { userId: 'u1' }]]);
  });
  it('the same club: nothing written or logged', async () => {
    const f = fake('ALPHA');
    expect(await assignClub('u1', 'ALPHA', f.deps)).toEqual({ changed: false, from: 'ALPHA' });
    expect(f.log).toEqual([]);
  });
});
