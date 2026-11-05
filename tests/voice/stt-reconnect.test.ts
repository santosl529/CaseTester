// A forced STT reconnect (voice lifecycle, 5 Nov; the 2 Nov audit): while Deepgram's socket reconnects, sendMedia
// throws "Socket is not open." — that threw out of the agent's mic loop and the candidate was never heard again.
// Now the frames are dropped while it is down, each loss and reconnect is logged, and audio flows again after.
import { describe, it, expect } from 'vitest';
import { fluxSession, type FluxSocket } from '@/lib/voice/deepgram';
import { pumpMic, type MicFrame } from '@/lib/voice/mic-pump';

// The SDK's socket, reduced: one handler per event (its `on` replaces), sendMedia throws while not open.
class FakeSocket implements FluxSocket {
  open = true; sent = 0; closed = false;
  private h: Record<string, (x: unknown) => void> = {};
  on(e: string, cb: (x: unknown) => void) { this.h[e] = cb; }
  sendMedia() { if (!this.open) throw new Error('Socket is not open.'); this.sent++; }
  sendCloseStream() {}
  close() { this.closed = true; }
  emit(e: string, x?: unknown) { this.h[e]?.(x); }
  drop() { this.open = false; this.emit('close', { code: 1006 }); }
  reconnect() { this.open = true; this.emit('open'); }
}

// A mic track as an async reader we feed by hand.
function micFeed() {
  const queue: (MicFrame | null)[] = [];
  let wake: (() => void) | null = null;
  return {
    push(f: MicFrame | null) { queue.push(f); wake?.(); wake = null; },
    reader: { async read() { while (!queue.length) await new Promise<void>(r => { wake = r; }); const v = queue.shift()!; return v ? { value: v, done: false } : { done: true }; } },
  };
}
const frame = (): MicFrame => ({ data: new Int16Array(160) });
const tick = () => new Promise(r => setTimeout(r, 0));

describe('a forced STT reconnect', () => {
  it('the candidate is heard again after the socket reconnects; each step is logged', async () => {
    const socket = new FakeSocket();
    const logs: string[] = [];
    let t = 1000;
    const stt = fluxSession(socket, { now: () => t, log: m => logs.push(m) });
    socket.emit('open');   // the first open: not a reconnect
    const mic = micFeed();
    const pump = pumpMic(mic.reader, { vad: () => {}, stt: pcm => stt.push(pcm) }, { log: m => logs.push(m) });

    for (let i = 0; i < 3; i++) mic.push(frame());
    await tick();
    expect(socket.sent).toBe(3);

    socket.drop();
    for (let i = 0; i < 5; i++) mic.push(frame());
    await tick();
    expect(socket.sent).toBe(3);
    expect(stt.stats).toMatchObject({ down: true, dropped: 5 });

    t += 1200;
    socket.reconnect();
    for (let i = 0; i < 4; i++) mic.push(frame());
    await tick();
    expect(socket.sent).toBe(7);   // heard again
    expect(stt.stats).toMatchObject({ reconnects: 1, down: false });

    expect(logs).toEqual([
      '[voice] stt connection lost (close 1006); reconnecting',
      '[voice] stt reconnected (#1) after 1200ms; 5 mic frames dropped while down',
    ]);
    mic.push(null);
    expect((await pump.done).ended).toBe('track_ended');
    expect(pump.stats.frames).toBe(12);
  });

  it('a send that fails before any close event still counts as the connection lost, once', async () => {
    const socket = new FakeSocket();
    const logs: string[] = [];
    const stt = fluxSession(socket, { log: m => logs.push(m) });
    socket.open = false;
    stt.push(new Uint8Array(2)); stt.push(new Uint8Array(2));
    expect(logs).toEqual(['[voice] stt connection lost (Socket is not open.); reconnecting']);
    expect(stt.stats.dropped).toBe(2);
  });

  it('our own close is not a reconnect: nothing logged, pushes ignored', async () => {
    const socket = new FakeSocket();
    const logs: string[] = [];
    const stt = fluxSession(socket, { log: m => logs.push(m) });
    await stt.close();
    socket.drop();
    stt.push(new Uint8Array(2));
    expect(logs).toEqual([]);
    expect(socket.closed).toBe(true);
  });
});

describe('the mic loop', () => {
  it('a sink that throws costs that frame only; a stream error ends it with a log', async () => {
    const logs: string[] = [];
    let vadFrames = 0, n = 0;
    const mic = micFeed();
    const pump = pumpMic(mic.reader, { vad: () => { vadFrames++; }, stt: () => { if (++n === 2) throw new Error('boom'); } }, { log: m => logs.push(m) });
    for (let i = 0; i < 4; i++) mic.push(frame());
    await tick();
    expect(vadFrames).toBe(4);
    expect(pump.stats.sinkErrors).toBe(1);
    expect(logs[0]).toMatch(/mic frame not delivered to stt \(1 so far\): boom/);

    const bad = pumpMic({ read: async () => { throw new Error('track gone'); } }, { vad: () => {}, stt: () => {} }, { log: m => logs.push(m) });
    expect((await bad.done).ended).toBe('stream_error');
    expect(logs.at(-1)).toMatch(/mic stream error, listening stopped: track gone/);
    pump.stop(); mic.push(frame());
    expect((await pump.done).ended).toBe('stopped');
  });
});
