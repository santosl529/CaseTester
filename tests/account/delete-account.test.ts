// The order of a deletion (9 Nov): the voice room closed, the data deleted, then the login. If the login can't be
// deleted the student is told to try again, and a retry is safe (the data step finds nothing left).
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
const { deleteAccount } = await import('@/lib/account/delete-account');

const fake = (over: Record<string, () => Promise<unknown>> = {}) => {
  const calls: string[] = [];
  const deps = {
    closeVoice: async () => { calls.push('voice'); },
    deleteData: async () => { calls.push('data'); },
    deleteLogin: async () => { calls.push('login'); },
    ...over,
  };
  return { calls, deps };
};

describe('deleteAccount', () => {
  it('voice room, then data, then the login', async () => {
    const f = fake();
    expect(await deleteAccount('u1', f.deps)).toEqual({ ok: true });
    expect(f.calls).toEqual(['voice', 'data', 'login']);
  });
  it('a voice room that will not close does not stop the deletion', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fake({ closeVoice: async () => { throw new Error('livekit down'); } });
    expect(await deleteAccount('u1', f.deps)).toEqual({ ok: true });
    warn.mockRestore();
  });
  it('the data delete fails: the login is kept (nothing half-gone), retry', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = fake({ deleteData: async () => { throw new Error('db'); } });
    expect(await deleteAccount('u1', f.deps)).toEqual({ ok: false, error: 'delete_failed' });
    expect(f.calls).toEqual(['voice']);
    err.mockRestore();
  });
  it('the login delete fails after the data is gone: delete_failed, and a retry finishes it', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let first = true;
    const f = fake({ deleteLogin: async () => { if (first) { first = false; throw new Error('auth'); } } });
    expect(await deleteAccount('u1', f.deps)).toEqual({ ok: false, error: 'delete_failed' });
    expect(await deleteAccount('u1', f.deps)).toEqual({ ok: true });
    err.mockRestore();
  });
});
