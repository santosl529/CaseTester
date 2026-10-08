// The playout clock (spec 2026-10-08-voice-phase-b §5): estimated start/end
// per segment, the heard cursor (play end + HEARD_MARGIN_MS), heardChars, and
// captions that never run ahead of what counts as heard.
import { describe, it, expect } from 'vitest';
import { Playout, HEARD_MARGIN_MS, tokenTimeline, heardCharsAt, type Clock, type FrameSink } from '@/lib/voice/playout';

const RATE = 24000;
const pcmMs = (ms: number) => new Uint8Array((RATE * ms / 1000) * 2);

export function fakeClock(start = 1000) {
  let t = start;
  const timers: { at: number; fn: () => void; dead: boolean }[] = [];
  const clock: Clock = { now: () => t, at: (at, fn) => { const x = { at, fn, dead: false }; timers.push(x); return () => { x.dead = true; }; } };
  const advance = async (ms: number) => {
    const end = t + ms;
    for (;;) {
      await new Promise(r => setTimeout(r, 0));
      const due = timers.filter(x => !x.dead && x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      t = Math.max(t, due.at); due.dead = true; due.fn();
    }
    t = end;
    await new Promise(r => setTimeout(r, 0));
  };
  return { clock, advance };
}
export const sink = (): FrameSink & { cleared: number } => ({ cleared: 0, async capture() {}, clear() { this.cleared++; } });

describe('tokenTimeline / heardCharsAt', () => {
  const text = 'There are 120 stores.';
  const words = [{ word: 'There', startMs: 0, endMs: 200 }, { word: 'are', startMs: 200, endMs: 350 }, { word: '120', startMs: 350, endMs: 800 }, { word: 'stores.', startMs: 800, endMs: 1000 }];

  it('aligns word timestamps to the text tokens, giving character positions', () => {
    const tl = tokenTimeline(text, words, 1000, true);
    expect(tl.map(t => t.chars)).toEqual([5, 9, 13, 21]);
    expect(heardCharsAt(tl, 550)).toBe(9);           // "There are"
    expect(heardCharsAt(tl, 800)).toBe(13);          // through "120"
    expect(heardCharsAt(tl, 100)).toBe(0);
  });

  it('falls back to the audio share by characters when there are no timestamps', () => {
    const tl = tokenTimeline(text, null, 1000, true);
    expect(heardCharsAt(tl, 1000)).toBe(21);
    expect(heardCharsAt(tl, 500)).toBe(9);           // 10.5 of 21 chars → back to the word boundary
  });

  it('knows nothing past the received words until the audio is complete', () => {
    const tl = tokenTimeline(text, words.slice(0, 2), 600, false);
    expect(heardCharsAt(tl, 10_000)).toBe(9);
    const done = tokenTimeline(text, words.slice(0, 2), 1000, true);
    expect(heardCharsAt(done, 1000)).toBe(21);       // the rest spread over the remaining audio
  });

  it('counts heard characters in order: nothing past the first unknown or unheard token', () => {
    expect(heardCharsAt([{ chars: 3, endMs: 100 }, { chars: 7, endMs: null }, { chars: 9, endMs: 50 }], 200)).toBe(3);
    expect(heardCharsAt([{ chars: 3, endMs: 100 }, { chars: 7, endMs: 300 }, { chars: 9, endMs: 150 }], 200)).toBe(3);
  });

  it('is monotonic even if timestamps are not', () => {
    const tl = tokenTimeline('a b c', [{ word: 'a', startMs: 0, endMs: 300 }, { word: 'b', startMs: 0, endMs: 100 }, { word: 'c', startMs: 0, endMs: 400 }], 400, true);
    expect(tl.map(t => t.endMs)).toEqual([300, 300, 400]);
  });
});

describe('Playout', () => {
  it('plays segments in order and computes start times on the playout clock', async () => {
    const { clock, advance } = fakeClock();
    const p = new Playout(sink(), clock, RATE);
    const starts: [string, number][] = [];
    p.open('a', { text: 'One.', interruptible: true, onStart: at => starts.push(['a', at]) });
    p.open('b', { text: 'Two.', interruptible: true, onStart: at => starts.push(['b', at]) });
    p.push('b', pcmMs(200)); p.finish('b');          // b's audio first: it still waits for a
    p.push('a', pcmMs(400)); p.finish('a');
    await advance(1000);
    expect(starts).toEqual([['a', 1000], ['b', 1400]]);
    expect(p.classify('a')).toEqual({ playback: 'played', heardChars: 4 });
  });

  it('classifies played / partial / unplayed at a cut, with the heard margin', async () => {
    const { clock, advance } = fakeClock();
    const s = sink();
    const p = new Playout(s, clock, RATE);
    p.open('a', { text: 'Fair point.', interruptible: true }); p.push('a', pcmMs(300)); p.finish('a');
    p.open('b', { text: 'There are 120 stores.', interruptible: true }); p.push('b', pcmMs(1000)); p.finish('b');
    p.words('b', [{ word: 'There', startMs: 0, endMs: 200 }, { word: 'are', startMs: 200, endMs: 350 }, { word: '120', startMs: 350, endMs: 800 }, { word: 'stores.', startMs: 800, endMs: 1000 }]);
    p.open('c', { text: 'Where would you start?', interruptible: true });
    await advance(300 + 700);                        // 700ms into b; heard cursor at 550ms
    const out = p.interrupt(clock.now());
    expect(out.get('a')).toEqual({ playback: 'played', heardChars: 11 });
    expect(out.get('b')).toEqual({ playback: 'partial', heardChars: 9 });   // "There are" — 120 ends at 800
    expect(out.get('c')).toEqual({ playback: 'unplayed', heardChars: 0 });
    expect(s.cleared).toBe(1);
  });

  it('a segment that ended within the margin before the cut is not fully heard', async () => {
    const { clock, advance } = fakeClock();
    const p = new Playout(sink(), clock, RATE);
    p.open('a', { text: 'Labor is 22 percent.', interruptible: true }); p.push('a', pcmMs(500)); p.finish('a');
    p.words('a', [{ word: 'Labor', startMs: 0, endMs: 100 }, { word: 'is', startMs: 100, endMs: 200 }, { word: '22', startMs: 200, endMs: 350 }, { word: 'percent.', startMs: 350, endMs: 500 }]);
    await advance(500 + HEARD_MARGIN_MS - 10);
    expect(p.interrupt(clock.now()).get('a')).toEqual({ playback: 'partial', heardChars: 11 });
  });

  it('captions follow the heard cursor: a word is shown at its end plus the margin', async () => {
    const { clock, advance } = fakeClock();
    const p = new Playout(sink(), clock, RATE);
    const shown: [number, number][] = [];
    p.open('a', { text: 'There are 120 stores.', interruptible: true, onHeard: (chars, at) => shown.push([chars, at]) });
    p.push('a', pcmMs(1000)); p.finish('a');
    p.words('a', [{ word: 'There', startMs: 0, endMs: 200 }, { word: 'are', startMs: 200, endMs: 350 }, { word: '120', startMs: 350, endMs: 800 }, { word: 'stores.', startMs: 800, endMs: 1000 }]);
    await advance(700);                              // cut at 1700 → heard cursor 1550 = 550ms in
    const cut = p.interrupt(clock.now()).get('a')!;
    await advance(2000);
    expect(shown).toEqual([[5, 1000 + 200 + HEARD_MARGIN_MS], [9, 1000 + 350 + HEARD_MARGIN_MS]]);
    expect(shown.at(-1)![0]).toBe(cut.heardChars);   // the screen and the saved line agree
  });

  it('fires onStart for an audio-less (exhibit-only) segment when reached, and whenIdle after the last end', async () => {
    const { clock, advance } = fakeClock();
    const p = new Playout(sink(), clock, RATE);
    let shown = 0;
    p.open('a', { text: 'Okay.', interruptible: true }); p.push('a', pcmMs(200)); p.finish('a');
    p.open('x', { text: '', interruptible: true, onStart: () => { shown++; } }); p.finish('x');
    let idle = false; void p.whenIdle().then(() => { idle = true; });
    await advance(100); expect(shown).toBe(0);
    await advance(150); expect(shown).toBe(1); expect(idle).toBe(true);
  });

  it('reports a pending scripted segment and ignores audio for cut segments', async () => {
    const { clock } = fakeClock();
    const p = new Playout(sink(), clock, RATE);
    p.open('s', { text: 'Let us pause.', interruptible: false });
    expect(p.hasPendingNonInterruptible()).toBe(true);
    p.open('a', { text: 'x', interruptible: true });
    p.interrupt(clock.now());
    p.push('a', pcmMs(100));
    expect(p.started('a')).toBe(false);
  });

  it('a failed segment with no audio is unplayed; with some audio it is partial', async () => {
    const { clock, advance } = fakeClock();
    const p = new Playout(sink(), clock, RATE);
    p.open('a', { text: 'Hi.', interruptible: true }); p.fail('a');
    p.open('b', { text: 'Hello there.', interruptible: true }); p.push('b', pcmMs(200)); p.fail('b');
    await advance(500);
    expect(p.classify('a')).toEqual({ playback: 'unplayed', heardChars: 0 });
    expect(p.classify('b').playback).toBe('partial');
  });

  it('whenIdle resolves at once on a cut', async () => {
    const { clock } = fakeClock();
    const p = new Playout(sink(), clock, RATE);
    p.open('a', { text: 'Long.', interruptible: true }); p.push('a', pcmMs(5000)); p.finish('a');
    let idle = false; void p.whenIdle().then(() => { idle = true; });
    await new Promise(r => setTimeout(r, 0));
    p.interrupt(clock.now());
    await new Promise(r => setTimeout(r, 0));
    expect(idle).toBe(true);
  });
});
