// When the browser sends `ready` (session b406165f, 19 Oct): the agent starts
// the opener on `ready`, and a `ready` sent from the hello handler mid
// room.connect started it during the page's 2.86s join freeze — its audio
// queued and played back fast. Now: ready once setup is done, the agent's hello
// seen and audio can play; one ready per hello. And (d4bf4638, 19 Oct) the
// page froze 1ms after the agent's audio track attached: ready also waits for
// that track's element to fire 'playing', or 3s from the attach.
import { describe, it, expect } from 'vitest';
import { PLAYING_FALLBACK_MS, ReadyGate } from '@/lib/voice/ready-gate';

// A fake scheduler: timers fire only on advance().
function timers() {
  let now = 0;
  const due: { at: number; fn: () => void; live: boolean }[] = [];
  return {
    schedule: (fn: () => void, ms: number) => { const t = { at: now + ms, fn, live: true }; due.push(t); return () => { t.live = false; }; },
    advance: (ms: number) => { now += ms; for (const t of due) if (t.live && t.at <= now) { t.live = false; t.fn(); } },
  };
}

// playing: the agent's track attached and playing from the start (the first tests are about the other conditions).
function gate(canPlay = true, playing = true) {
  const sent: string[] = [];
  const fallbacks: number[] = [];
  const s = { canPlay };
  const clock = timers();
  const g = new ReadyGate({ canPlay: () => s.canPlay, sendReady: () => sent.push('ready'), schedule: clock.schedule, onFallback: () => fallbacks.push(1) });
  if (playing) g.trackPlaying(g.trackAttached());
  return { g, sent, s, clock, fallbacks };
}

describe('ReadyGate', () => {
  it('a hello before setup ends waits: one ready when setup completes', () => {
    const { g, sent } = gate();
    g.hello();
    expect(sent).toEqual([]);
    g.setupComplete();
    expect(sent).toEqual(['ready']);
    g.setupComplete();
    g.audioUnlocked();
    expect(sent).toEqual(['ready']);
  });

  it('setup done without a hello sends nothing; the hello that follows sends one ready', () => {
    const { g, sent } = gate();
    g.setupComplete();
    expect(sent).toEqual([]);
    g.hello();
    expect(sent).toEqual(['ready']);
  });

  it('an agent that rejoins (a second hello) gets a ready of its own', () => {
    const { g, sent } = gate();
    g.hello();
    g.setupComplete();
    g.hello();
    expect(sent).toEqual(['ready', 'ready']);
  });

  it('audio that cannot play holds the ready until the unlock click', () => {
    const { g, sent, s } = gate(false);
    g.hello();
    g.setupComplete();
    expect(sent).toEqual([]);
    s.canPlay = true;
    g.audioUnlocked();
    expect(sent).toEqual(['ready']);
    g.audioUnlocked();
    expect(sent).toEqual(['ready']);
  });

  it('a click before any hello sends nothing (no agent to hear it)', () => {
    const { g, sent } = gate();
    g.setupComplete();
    g.audioUnlocked();
    expect(sent).toEqual([]);
  });

  it('after audio_blocked the agent waits again: the unlock sends a new ready', () => {
    const { g, sent, s } = gate();
    g.hello();
    g.setupComplete();
    s.canPlay = false;
    g.audioBlocked();
    s.canPlay = true;
    g.audioUnlocked();
    expect(sent).toEqual(['ready', 'ready']);
  });

  it('reports whether setup is done (the page shows the unlock button only then)', () => {
    const { g } = gate();
    expect(g.isSetupDone).toBe(false);
    g.setupComplete();
    expect(g.isSetupDone).toBe(true);
  });
});

describe('ReadyGate: the agent\'s audio element playing', () => {
  it('playing before the hello: ready goes at the hello', () => {
    const { g, sent } = gate(true, false);
    g.setupComplete();
    g.trackPlaying(g.trackAttached());
    expect(sent).toEqual([]);
    g.hello();
    expect(sent).toEqual(['ready']);
  });

  it('playing after the hello: ready waits for it', () => {
    const { g, sent } = gate(true, false);
    const gen = g.trackAttached();
    g.hello();
    g.setupComplete();
    expect(sent).toEqual([]);           // d4bf4638 without a mic prompt: setup done, hello in, the freeze to come
    g.trackPlaying(gen);
    expect(sent).toEqual(['ready']);
  });

  it('no track attached yet: no ready', () => {
    const { g, sent, clock } = gate(true, false);
    g.hello();
    g.setupComplete();
    clock.advance(10_000);
    expect(sent).toEqual([]);
  });

  it(`never fires 'playing': the fallback ${PLAYING_FALLBACK_MS}ms from the attach sends it, and says so`, () => {
    const { g, sent, clock, fallbacks } = gate(true, false);
    g.trackAttached();
    g.hello();
    g.setupComplete();
    clock.advance(PLAYING_FALLBACK_MS - 1);
    expect(sent).toEqual([]);
    clock.advance(1);
    expect(sent).toEqual(['ready']);
    expect(fallbacks).toHaveLength(1);
  });

  it('playing in time cancels the fallback', () => {
    const { g, sent, clock, fallbacks } = gate(true, false);
    const gen = g.trackAttached();
    g.hello();
    g.setupComplete();
    g.trackPlaying(gen);
    clock.advance(PLAYING_FALLBACK_MS);
    expect(sent).toEqual(['ready']);
    expect(fallbacks).toHaveLength(0);
  });

  it('an agent rejoin: the new track must play again, and the old element\'s event does not count', () => {
    const { g, sent, clock } = gate(true, false);
    const first = g.trackAttached();
    g.trackPlaying(first);
    g.hello();
    g.setupComplete();
    expect(sent).toEqual(['ready']);
    const second = g.trackAttached();    // the agent rejoins: a new track, then its hello
    g.hello();
    g.trackPlaying(first);               // stale
    expect(sent).toEqual(['ready']);
    g.trackPlaying(second);
    expect(sent).toEqual(['ready', 'ready']);
    clock.advance(PLAYING_FALLBACK_MS);  // the first attach's fallback was cancelled; the second's is moot
    expect(sent).toEqual(['ready', 'ready']);
  });

  it('a rejoin whose new track never plays: its own fallback sends the ready', () => {
    const { g, sent, clock } = gate(true, false);
    g.trackPlaying(g.trackAttached());
    g.hello();
    g.setupComplete();
    clock.advance(1000);
    g.trackAttached();
    g.hello();
    clock.advance(PLAYING_FALLBACK_MS - 1);
    expect(sent).toEqual(['ready']);
    clock.advance(1);
    expect(sent).toEqual(['ready', 'ready']);
  });

  it('close() cancels the fallback', () => {
    const { g, sent, clock } = gate(true, false);
    g.trackAttached();
    g.hello();
    g.setupComplete();
    g.close();
    clock.advance(PLAYING_FALLBACK_MS);
    expect(sent).toEqual([]);
  });
});
