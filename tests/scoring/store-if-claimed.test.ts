// Phase 1 4.11, review fix round, item 7. `storeIfClaimed` is the only `db.transaction` in the codebase and nothing
// here has run it against Postgres (no DB access allowed in this round). If it fails, it fails *after* all three
// Opus passes are paid: the route answers 500 and the client's retry pays for them again. So an unexpected failure
// falls back to the same token-checked conditional write without the transaction — and never once the write has run.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  own: [{ id: 's1' }] as { id: string }[],
  txThrow: null as Error | null,
  commitThrow: null as Error | null,
  events: [] as string[],
}));

vi.mock('@/db/client', () => {
  const handle = (who: string) => ({
    tag: who,
    update: () => ({ set: () => ({ where: () => ({ returning: async () => { h.events.push(`${who}:claim-check`); return h.own; } }) }) }),
    insert: () => ({ values: async () => { h.events.push(`${who}:insert`); } }),
  });
  return {
    db: {
      ...handle('db'),
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        h.events.push('tx:begin');
        if (h.txThrow) throw h.txThrow;
        const out = await fn(handle('tx'));
        if (h.commitThrow) throw h.commitThrow;
        return out;
      },
    },
  };
});

const { storeIfClaimed } = await import('@/lib/scoring/scoring-claim');

const CLAIM = { sessionId: 's1', token: 1_700_000_000_000 };
// Supavisor's transaction mode is the plausible failure: a statement the pooler won't take inside a transaction.
const POOLER = new Error('prepared statement "s1" already exists');

beforeEach(() => {
  h.own = [{ id: 's1' }];
  h.txThrow = null;
  h.commitThrow = null;
  h.events = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('storeIfClaimed', () => {
  it('writes the row inside the transaction while the claim is this pass\'s', async () => {
    const wrote: string[] = [];
    expect(await storeIfClaimed(CLAIM, async w => { wrote.push((w as unknown as { tag: string }).tag); })).toBe(true);
    expect(wrote).toEqual(['tx']);
    expect(h.events).toEqual(['tx:begin', 'tx:claim-check']);
  });

  it('the claim was taken over: false, and nothing is written', async () => {
    h.own = [];
    const write = vi.fn(async () => {});
    expect(await storeIfClaimed(CLAIM, write)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('the transaction itself fails: the same token-checked write without it, so three paid passes are not thrown away', async () => {
    h.txThrow = POOLER;
    const wrote: string[] = [];
    expect(await storeIfClaimed(CLAIM, async w => { wrote.push((w as unknown as { tag: string }).tag); })).toBe(true);
    expect(wrote).toEqual(['db']);                                   // the fallback's handle, not a transaction's
    expect(h.events).toEqual(['tx:begin', 'db:claim-check']);
  });

  it('the fallback still checks the claim token: a lost claim writes nothing', async () => {
    h.txThrow = POOLER;
    h.own = [];
    const write = vi.fn(async () => {});
    expect(await storeIfClaimed(CLAIM, write)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('the transaction fails after the write ran: the error stands — the row is never written twice', async () => {
    h.commitThrow = new Error('could not serialize access');
    const write = vi.fn(async () => {});
    await expect(storeIfClaimed(CLAIM, write)).rejects.toThrow('could not serialize access');
    expect(write).toHaveBeenCalledTimes(1);
  });
});
