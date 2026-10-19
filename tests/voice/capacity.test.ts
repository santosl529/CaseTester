import { describe, it, expect, vi } from 'vitest';
import { agentAudioWatchdog, liveVoiceRooms, maxConcurrentVoice, CONNECTING_MESSAGE } from '@/lib/voice/capacity';

describe('voice capacity', () => {
  it('VOICE_MAX_CONCURRENT defaults to 1 and takes a positive whole number', () => {
    expect(maxConcurrentVoice({})).toBe(1);
    expect(maxConcurrentVoice({ VOICE_MAX_CONCURRENT: '3' })).toBe(3);
    expect(maxConcurrentVoice({ VOICE_MAX_CONCURRENT: '0' })).toBe(1);
    expect(maxConcurrentVoice({ VOICE_MAX_CONCURRENT: 'x' })).toBe(1);
  });

  it('counts other voice rooms with someone in them or just created; never our own room or other rooms', () => {
    const now = 1_000_000;
    const rooms = [
      { name: 'case-a', numParticipants: 2, creationTime: BigInt(now - 600) },   // a session running
      { name: 'case-b', numParticipants: 0, creationTime: BigInt(now - 5) },     // dispatched, nobody in yet
      { name: 'case-c', numParticipants: 0, creationTime: BigInt(now - 300) },   // emptied, closing
      { name: 'case-ours', numParticipants: 1, creationTime: BigInt(now - 60) }, // a reload of this session
      { name: 'playground', numParticipants: 1, creationTime: BigInt(now - 60) },
    ];
    expect(liveVoiceRooms(rooms, 'case-ours', now)).toEqual(['case-a', 'case-b']);
  });
});

describe('the agent-audio watchdog', () => {
  it('fires once if no interviewer audio within the timeout', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const w = agentAudioWatchdog({ onTimeout, timeoutMs: 15_000 });
    w.arm();
    vi.advanceTimersByTime(14_999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('never fires once audio was heard, and re-arming restarts the wait (the audio-unlock click)', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const w = agentAudioWatchdog({ onTimeout, timeoutMs: 15_000 });
    w.arm();
    vi.advanceTimersByTime(10_000);
    w.stop();                                     // audio blocked: waiting for the click
    vi.advanceTimersByTime(60_000);
    w.arm();                                      // clicked
    vi.advanceTimersByTime(14_000);
    w.heard();
    vi.advanceTimersByTime(60_000);
    w.arm();
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(w.wasHeard).toBe(true);
    vi.useRealTimers();
  });
});

// Lorenzo, 19 Oct: a LiveKit Build-plan agent can cold-start 10–20s after
// idle; 15s with no interviewer audio called that "busy". The wait is 30s, and
// the page says it is connecting meanwhile (the token route's 429 stays immediate).
describe('the cold-start wait', () => {
  it('waits 30s by default before calling voice busy', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const w = agentAudioWatchdog({ onTimeout });
    w.arm();
    vi.advanceTimersByTime(29_999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('says it is connecting while it waits', () => {
    expect(CONNECTING_MESSAGE).toBe('Connecting to your interviewer…');
  });
});
