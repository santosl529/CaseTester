// The voice page's setup timings (session b406165f, 19 Oct): how long each
// step of joining took, from the Start click, so the next freeze shows which
// step it sat in. Sent once, as a `setup` line in the session records.
import { describe, it, expect } from 'vitest';
import { SetupTimings } from '@/lib/voice/setup-timing';
import { parseClientMessage } from '@/lib/voice/protocol';

function clock() {
  const c = { t: 1000 };
  return { c, now: () => c.t };
}

describe('SetupTimings', () => {
  it('times each step from the Start click, and marks hello, setup done and ready', async () => {
    const { c, now } = clock();
    const s = new SetupTimings(now);
    c.t = 1300;
    s.span('audioContext', () => { c.t += 5; });
    await s.spanAsync('connect', async () => { c.t += 1200; });
    s.mark('hello');
    await s.spanAsync('startAudio', async () => { c.t += 3000; });
    expect(s.take()).toBeNull();              // nothing yet: no ready, no remote track
    s.mark('setupDone');
    s.mark('ready');
    s.span('firstTrack', () => { c.t += 2; });
    expect(s.take()).toEqual({
      spans: {
        audioContext: { atMs: 300, ms: 5 }, connect: { atMs: 305, ms: 1200 }, startAudio: { atMs: 1505, ms: 3000 },
        mic: null, micMeter: null, firstTrack: { atMs: 4505, ms: 2 },
      },
      helloAtMs: 1505, setupDoneAtMs: 4505, readyAtMs: 4505, longTasks: null,
    });
  });

  it('records each long task from the Start click (startTime is on the same clock), until the line is taken', () => {
    const { c, now } = clock();
    const s = new SetupTimings(now, true);
    s.longTask(2105.4, 2860.2);     // the b406165f freeze: 1.1s into connect
    s.longTask(5000, 61);
    c.t = 6000; s.mark('ready'); s.span('firstTrack', () => {});
    expect(s.take()?.longTasks).toEqual([{ atMs: 1105, ms: 2860 }, { atMs: 4000, ms: 61 }]);
    s.longTask(7000, 80);           // after: not the setup
  });

  it('keeps at most 50 long tasks', () => {
    const { now } = clock();
    const s = new SetupTimings(now, true);
    for (let i = 0; i < 60; i++) s.longTask(1000 + i * 100, 55);
    s.mark('ready'); s.span('firstTrack', () => {});
    expect(s.take()?.longTasks).toHaveLength(50);
  });

  it('a browser that reports long tasks with none during setup says [] (not null)', () => {
    const { now } = clock();
    const s = new SetupTimings(now, true);
    s.mark('ready'); s.span('firstTrack', () => {});
    expect(s.take()?.longTasks).toEqual([]);
  });

  it('is taken once; later spans and marks (a rejoin) change nothing', () => {
    const { now } = clock();
    const s = new SetupTimings(now);
    s.mark('ready');
    s.span('firstTrack', () => {});
    expect(s.take()).not.toBeNull();
    s.mark('hello');
    expect(s.take()).toBeNull();
  });

  it('keeps the first of each: a second track or a second ready is not the setup', () => {
    const { c, now } = clock();
    const s = new SetupTimings(now);
    c.t = 1100; s.span('firstTrack', () => {});
    c.t = 1200; s.mark('ready');
    c.t = 1900; s.span('firstTrack', () => {}); s.mark('ready');
    expect(s.take()).toMatchObject({ spans: { firstTrack: { atMs: 100, ms: 0 } }, readyAtMs: 200 });
  });

  it('a step that throws is still timed, and the error passes through', async () => {
    const { c, now } = clock();
    const s = new SetupTimings(now);
    await expect(s.spanAsync('mic', async () => { c.t += 40; throw new Error('NotAllowedError'); })).rejects.toThrow('NotAllowedError');
    s.mark('ready'); s.span('firstTrack', () => {});
    expect(s.take()?.spans.mic).toEqual({ atMs: 0, ms: 40 });
  });
});

describe('the setup message', () => {
  const ok = {
    type: 'setup',
    spans: { audioContext: { atMs: 300, ms: 5 }, connect: { atMs: 305, ms: 1200 }, startAudio: null, mic: null, micMeter: null, firstTrack: { atMs: 4505, ms: 2 } },
    helloAtMs: 1505, setupDoneAtMs: null, readyAtMs: 4505, longTasks: [{ atMs: 1105, ms: 2860 }],
  };

  it('parses a well-formed line', () => {
    expect(parseClientMessage(JSON.stringify(ok))).toEqual(ok);
    expect(parseClientMessage(JSON.stringify({ ...ok, longTasks: null }))).toEqual({ ...ok, longTasks: null });
  });

  it('keeps only the known steps, and rejects a malformed one', () => {
    expect(parseClientMessage(JSON.stringify({ ...ok, spans: { ...ok.spans, extra: { atMs: 1, ms: 1 } } }))).toEqual(ok);
    expect(parseClientMessage(JSON.stringify({ ...ok, spans: { ...ok.spans, connect: { atMs: 'x', ms: 1 } } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...ok, helloAtMs: 'soon' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...ok, spans: null }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...ok, longTasks: [{ atMs: 1, ms: 'x' }] }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...ok, longTasks: 'many' }))).toBeNull();
    const many = Array.from({ length: 80 }, (_, i) => ({ atMs: i, ms: 50 }));
    expect((parseClientMessage(JSON.stringify({ ...ok, longTasks: many })) as { longTasks: unknown[] }).longTasks).toHaveLength(50);
  });
});
