// The turn route's guards (security audit, 6 Nov): the message is checked before any model runs, and a second turn
// on a session whose turn is still running is refused instead of running the interviewer twice.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  claimed: new Set<string>(),
  runTurn: null as unknown as Mock<(...a: unknown[]) => Promise<unknown>>,
}));
vi.mock('next/server', async () => ({ ...(await vi.importActual<object>('next/server')), after: () => {} }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock('@/db/client', () => ({ db: { query: { sessions: { findFirst: async () => ({ id: '51111111-1111-4111-8111-111111111111', userId: 'u1', caseId: 'prof-001', phase: 'framing' }) } } } }));
vi.mock('@/lib/orchestrator/post-turn', () => ({ runPostTurnBackground: async () => {} }));
vi.mock('@/lib/orchestrator/session-runner', () => ({ runTurn: (...a: unknown[]) => h.runTurn(...a) }));
vi.mock('@/lib/orchestrator/turn-claim', async () => {
  const real = await vi.importActual<typeof import('@/lib/orchestrator/turn-claim')>('@/lib/orchestrator/turn-claim');
  return {
    ...real,
    turnOnce: (id: string, run: () => Promise<unknown>) => real.turnOnce(id, run, {
      now: () => 0,
      claim: async (sid: string) => (h.claimed.has(sid) ? false : (h.claimed.add(sid), true)),
      release: async (sid: string) => { h.claimed.delete(sid); },
    }),
  };
});

const { POST } = await import('@/app/api/channel/[sessionId]/turn/route');
const send = (body: string) => POST(
  new Request('http://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }) as never,
  { params: Promise.resolve({ sessionId: '51111111-1111-4111-8111-111111111111' }) },
);

beforeEach(() => {
  h.user = { id: 'u1' };
  h.claimed.clear();
  h.runTurn = vi.fn(async () => ({ interviewerText: 'ok', ended: false, exhibit: null }));
});

describe('turn route guards', () => {
  it('a message over the cap: 400, no model runs', async () => {
    const res = await send(JSON.stringify({ text: 'a'.repeat(4001) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Message too long' });
    expect(h.runTurn).not.toHaveBeenCalled();
  });

  it('text that is not a string: 400, no model runs', async () => {
    const res = await send(JSON.stringify({ text: { a: 1 } }));
    expect(res.status).toBe(400);
    expect(h.runTurn).not.toHaveBeenCalled();
  });

  it('a body that is not JSON: 400, no model runs', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
    expect(h.runTurn).not.toHaveBeenCalled();
  });

  it('a turn already running on the session: 409, the interviewer is not run again', async () => {
    h.claimed.add('51111111-1111-4111-8111-111111111111');
    const res = await send(JSON.stringify({ text: 'hello' }));
    expect(res.status).toBe(409);
    expect(h.runTurn).not.toHaveBeenCalled();
  });

  it('two turns sent at once: one runs, the other gets 409', async () => {
    let finish!: () => void;
    h.runTurn = vi.fn(() => new Promise(resolve => { finish = () => resolve({ interviewerText: 'ok', ended: false, exhibit: null }); }));
    const first = send(JSON.stringify({ text: 'one' }));
    await vi.waitFor(() => expect(h.runTurn).toHaveBeenCalledTimes(1));
    const second = await send(JSON.stringify({ text: 'two' }));
    expect(second.status).toBe(409);
    finish();
    expect((await first).status).toBe(200);
    expect(h.runTurn).toHaveBeenCalledTimes(1);
    expect(h.claimed.size).toBe(0);
  });

  it('a normal turn: runs with the trimmed text and frees the session for the next one', async () => {
    const res = await send(JSON.stringify({ text: '  hello  ' }));
    expect(res.status).toBe(200);
    expect(h.runTurn).toHaveBeenCalledWith('51111111-1111-4111-8111-111111111111', 'hello', expect.anything());
    expect(h.claimed.size).toBe(0);
  });
});
