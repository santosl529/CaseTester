// The voice agent's job end (voice lifecycle, 5 Nov; lib/voice/agent-lifecycle.ts): the candidate leaving — even
// during the cold start — or never arriving, the room closing under it, or the case ending, each finishes the job
// exactly once; a late agent never joins a session that is over.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentLifecycle, shouldJoin, CANDIDATE_WAIT_MS, ENDED_GRACE_MS, REJOIN_GRACE_MS, type FinishReason } from '@/lib/voice/agent-lifecycle';

const make = () => {
  vi.useFakeTimers();
  const finished: FinishReason[] = [];
  const events: string[] = [];
  const life = new AgentLifecycle({ candidate: 'u1', setTimer: (f, ms) => setTimeout(f, ms), clearTimer: h => clearTimeout(h as ReturnType<typeof setTimeout>),
    onFinish: w => finished.push(w), onAway: () => events.push('away'), onBack: () => events.push('back') });
  return { life, finished, events };
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

  it('leaving while the agent sets up, for good: finishes once after the rejoin grace, whatever follows', () => {
    const { life, finished } = make();
    life.connected(['u1']);
    life.left('someone-else');
    life.left('u1');
    vi.advanceTimersByTime(REJOIN_GRACE_MS - 1);
    expect(finished).toEqual([]);
    vi.advanceTimersByTime(1);
    life.roomClosed();
    life.caseEnded();
    vi.advanceTimersByTime(60_000);
    expect(finished).toEqual(['candidate_left']);
  });
});

// Lorenzo, 5 Nov: a reload or a mobile app switch mid-session must resume the same interview.
describe('reload and resume', () => {
  it('the candidate drops out and rejoins within 15 s: the agent pauses, then carries on — no finish', () => {
    const { life, finished, events } = make();
    life.connected(['u1']);
    life.left('u1');
    expect(life.candidateAway).toBe(true);
    vi.advanceTimersByTime(REJOIN_GRACE_MS - 1000);
    life.joined('u1');
    expect(life.candidateAway).toBe(false);
    vi.advanceTimersByTime(REJOIN_GRACE_MS * 4);
    expect(finished).toEqual([]);
    expect(events).toEqual(['away', 'back']);
    // …and a second drop later gets its own grace.
    life.left('u1');
    vi.advanceTimersByTime(REJOIN_GRACE_MS);
    expect(finished).toEqual(['candidate_left']);
  });

  it('leave without return: the job ends after the grace', () => {
    const { life, finished, events } = make();
    life.connected(['u1']);
    life.left('u1');
    vi.advanceTimersByTime(REJOIN_GRACE_MS);
    expect(finished).toEqual(['candidate_left']);
    expect(events).toEqual(['away']);
  });

  it('End and the case ending stay immediate, even while the candidate is away', () => {
    const a = make();
    a.life.connected(['u1']); a.life.left('u1'); a.life.roomClosed();
    expect(a.finished).toEqual(['room_closed']);
    vi.useRealTimers();
    const b = make();
    b.life.connected(['u1']); b.life.caseEnded();
    vi.advanceTimersByTime(ENDED_GRACE_MS);
    expect(b.finished).toEqual(['case_ended']);
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
