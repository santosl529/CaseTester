// When the browser sends `ready` (session b406165f, 19 Oct): the agent starts
// the opener on `ready`, and a `ready` sent from the hello handler mid
// room.connect started it during the page's 2.86s join freeze — its audio
// queued and played back fast. Now: ready once setup is done, the agent's hello
// seen and audio can play; one ready per hello.
import { describe, it, expect } from 'vitest';
import { ReadyGate } from '@/lib/voice/ready-gate';

function gate(canPlay = true) {
  const sent: string[] = [];
  const s = { canPlay };
  const g = new ReadyGate({ canPlay: () => s.canPlay, sendReady: () => sent.push('ready') });
  return { g, sent, s };
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
