// The voice agent's job end (voice lifecycle, 5 Nov; lib/voice/agent-lifecycle.ts): the candidate leaving — even
// during the cold start — or never arriving, the room closing under it, or the case ending, each finishes the job
// exactly once; a late agent never joins a session that is over.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentLifecycle, shouldJoin, CANDIDATE_WAIT_MS, ENDED_GRACE_MS, type FinishReason } from '@/lib/voice/agent-lifecycle';

const make = () => {
  vi.useFakeTimers();
  const finished: FinishReason[] = [];
  const life = new AgentLifecycle({ candidate: 'u1', setTimer: (f, ms) => setTimeout(f, ms), clearTimer: h => clearTimeout(h as ReturnType<typeof setTimeout>), onFinish: w => finished.push(w) });
  return { life, finished };
};
afterEach(() => { vi.useRealTimers(); });

describe('a late-arriving agent', () => {
  it('joins only an active session', () => {
    expect(shouldJoin({ status: 'active' })).toBe(true);
    for (const s of [{ status: 'completed' }, { status: 'abandoned' }, null, undefined]) expect(shouldJoin(s)).toBe(false);
  });
});

describe('the candidate leaving during the cold start', () => {
  it('gone before the agent connected: the agent finds no candidate and leaves after the wait', () => {
    const { life, finished } = make();
    life.connected(['some-other-identity']);
    vi.advanceTimersByTime(CANDIDATE_WAIT_MS - 1);
    expect(finished).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(finished).toEqual(['candidate_absent']);
    expect(life.over).toBe(true);
  });

  it('arriving within the wait: the job carries on', () => {
    const { life, finished } = make();
    life.connected([]);
    vi.advanceTimersByTime(CANDIDATE_WAIT_MS / 2);
    life.joined('u1');
    vi.advanceTimersByTime(CANDIDATE_WAIT_MS * 2);
    expect(finished).toEqual([]);
  });

  it('leaving while the agent sets up: finishes once, whatever follows', () => {
    const { life, finished } = make();
    life.connected(['u1']);
    life.left('someone-else');
    expect(finished).toEqual([]);
    life.left('u1');
    life.roomClosed();
    life.caseEnded();
    vi.advanceTimersByTime(60_000);
    expect(finished).toEqual(['candidate_left']);
  });
});

describe('the other ends', () => {
  it('End deletes the room: the agent sees it close and finishes', () => {
    const { life, finished } = make();
    life.connected(['u1']);
    life.roomClosed();
    expect(finished).toEqual(['room_closed']);
  });

  it('the case ending: the agent leaves after a short grace, not 25 minutes later', () => {
    const { life, finished } = make();
    life.connected(['u1']);
    life.caseEnded();
    life.caseEnded();
    vi.advanceTimersByTime(ENDED_GRACE_MS - 1);
    expect(finished).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(finished).toEqual(['case_ended']);
  });
});
