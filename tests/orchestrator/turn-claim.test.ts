// One turn at a time per session, and a cap on the candidate's message (security audit, 6 Nov): two turn requests
// at once both ran the interviewer and its checks, and nothing bounded the text a later turn and scoring re-send.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
const { turnOnce, parseTurnText, MAX_TURN_CHARS, TURN_CLAIM_STALE_MS } = await import('@/lib/orchestrator/turn-claim');

// The claim as one conditional UPDATE would hold it: one token per session, stale after TURN_CLAIM_STALE_MS.
function fakeStore(now = 0) {
  const state = { claimAt: null as number | null, releases: 0, now };
  const deps = {
    now: () => state.now,
    claim: async (_id: string, at: number) => {
      if (state.claimAt !== null && state.claimAt >= at - TURN_CLAIM_STALE_MS) return false;
      state.claimAt = at;
      return true;
    },
    release: async (_id: string, token: number) => {
      state.releases++;
      if (state.claimAt === token) state.claimAt = null;
    },
  };
  return { state, deps };
}

describe('turnOnce', () => {
  it('no turn running: runs the turn once and releases the claim', async () => {
    const f = fakeStore();
    const run = vi.fn(async () => 'result');
    expect(await turnOnce('s1', run, f.deps)).toEqual({ status: 'ran', result: 'result' });
    expect(run).toHaveBeenCalledTimes(1);
    expect(f.state.claimAt).toBeNull();
  });

  it('a turn already running on the session: busy, nothing run', async () => {
    const f = fakeStore();
    f.state.claimAt = 0;
    const run = vi.fn(async () => 'result');
    expect(await turnOnce('s1', run, f.deps)).toEqual({ status: 'busy' });
    expect(run).not.toHaveBeenCalled();
    expect(f.state.claimAt).toBe(0);
  });

  it('two turns sent at once: exactly one runs', async () => {
    const f = fakeStore();
    let finish!: () => void;
    const run = vi.fn(() => new Promise<string>(resolve => { finish = () => resolve('first'); }));
    const first = turnOnce('s1', run, f.deps);
    await Promise.resolve();
    expect(await turnOnce('s1', run, f.deps)).toEqual({ status: 'busy' });
    finish();
    expect(await first).toEqual({ status: 'ran', result: 'first' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('the turn throws: the claim is still released, the error stands', async () => {
    const f = fakeStore();
    await expect(turnOnce('s1', async () => { throw new Error('model down'); }, f.deps)).rejects.toThrow('model down');
    expect(f.state.claimAt).toBeNull();
  });

  it('a claim left by a turn that died is taken over once stale', async () => {
    const f = fakeStore(TURN_CLAIM_STALE_MS + 1);
    f.state.claimAt = 0;
    const run = vi.fn(async () => 'result');
    expect(await turnOnce('s1', run, f.deps)).toEqual({ status: 'ran', result: 'result' });
  });
});

describe('parseTurnText', () => {
  it('a normal message: trimmed text', () => {
    expect(parseTurnText({ text: '  revenue is price times volume  ' })).toEqual({ ok: true, text: 'revenue is price times volume' });
  });
  it('empty or whitespace: rejected', () => {
    expect(parseTurnText({ text: '   ' })).toEqual({ ok: false, error: 'Empty turn' });
    expect(parseTurnText({})).toEqual({ ok: false, error: 'Empty turn' });
  });
  it('not a string: rejected', () => {
    expect(parseTurnText({ text: 42 })).toEqual({ ok: false, error: 'Empty turn' });
    expect(parseTurnText({ text: ['a'] })).toEqual({ ok: false, error: 'Empty turn' });
    expect(parseTurnText(null)).toEqual({ ok: false, error: 'Empty turn' });
  });
  it(`exactly ${MAX_TURN_CHARS} characters: accepted; one more: rejected`, () => {
    expect(parseTurnText({ text: 'a'.repeat(MAX_TURN_CHARS) }).ok).toBe(true);
    expect(parseTurnText({ text: 'a'.repeat(MAX_TURN_CHARS + 1) })).toEqual({ ok: false, error: 'Message too long' });
  });
});
