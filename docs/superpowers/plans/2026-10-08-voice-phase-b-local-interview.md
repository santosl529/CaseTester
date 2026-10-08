# M0 Phase B — Local Interruptible Voice Interview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One complete, interruptible prof-001 interview by voice in a browser on localhost, through the real orchestrator, with per-turn end-of-speech → first sound / first useful audio timing.

**Architecture:** A LiveKit Agents worker (explicit dispatch) runs one job per session. The job pipes the candidate's mic (rtc-node `AudioStream`) into Deepgram Flux and a VAD, and runs a `VoiceTurnController`. The controller calls `runTurn` with a pipelined segment sink and a `heard()` playback report. Segments go through Cartesia (one context per segment, word timestamps) into a `Playout` clock over the LiveKit `AudioSource`. The orchestrator books reveals, the saved line and the question state from what was actually heard. The browser page shows captions, exhibits, state and End.

**Tech Stack:** TypeScript, Next.js 16 route handlers, `@livekit/agents` 1.9.1, `@livekit/rtc-node` 1.1.0, `livekit-client` 2.22, `livekit-server-sdk` 2.19, Deepgram Flux, Cartesia Sonic 3.5, vitest, drizzle.

**Spec:** `docs/superpowers/specs/2026-10-08-voice-phase-b-local-interview-design.md` — read §5 (delivery semantics) before any task.

## Global Constraints

- No voice library import from `lib/orchestrator`, `lib/agent`, `lib/scoring` (existing ESLint boundary rule). New orchestrator types (`HeardReport`) live in `lib/orchestrator`; `lib/voice` implements them.
- Text mode is unchanged: every new `runTurn`/`persist` behavior applies only when `heard` is passed.
- Spec §5 (revised 8 Oct) is binding: every case figure in a saved line belongs to a booked item (a release is booked if any figure of it was heard); exhibits are booked only on browser confirmation; delivery-dependent state follows the §5.4 table; scripted lines follow `required` / `decided`.
- Interviewer in the voice agent only: `INTERVIEWER_PROVIDER=anthropic-haiku55-none-medium`. Background models unchanged (`BACKGROUND_MODEL_ID`).
- Speculation stays disabled; eager signals are logged only.
- `HEARD_MARGIN_MS = 150`, `FRAME_MS = 20`, barge-in minimum words while speaking `VOICE_BARGE_MIN_WORDS` default 2 (≥1 while thinking), `VOICE_TTS_CHAR_CAP` default 90,000 per calendar month, reserve 2,000, `VOICE_MAX_SESSION_MIN` default 25, `LLM_BUDGET_USD` required (script default $1.00).
- Flux settings unchanged: eot 0.7 / eager 0.5, 16 kHz linear16 in. Cartesia/TTS out 24 kHz mono s16le.
- No subscription purchase (Cartesia is already upgraded), no TTS vendor change. Every paid run needs the user's go-ahead with its own estimate and caps (`LLM_BUDGET_USD`, `VOICE_TTS_RUN_CAP`, session count; spec §9). The upgrade is not a test budget.
- Never read `.env.local`; scripts load it with `--env-file`.
- Commit after each task with passing typecheck, tests, lint. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Browser autoplay blocked** → the agent must not speak (so nothing is "played" on its clock) until the browser sends `ready`. Pinned by a controller test in Task 3 ("says nothing before ready").
2. **Laptop speakers (echo)** → interviewer audio leaks into the mic and Flux transcribes it, which would trigger barge-in. Expected: a "headphones required" notice on the page; AEC on. Pinned by the Task 5 render test (notice present) and the Task 6 drill.
3. **Page reload / re-join mid-interview** → a second Start must not create a second agent in the room. The new agent replays the last interviewer line without booking anything. Pinned by a Task 4 token-route test (no second dispatch when one exists) and a Task 3 test (opening replay books nothing).
4. **Second tab on the same session** → only the session owner's first audio track is used; the other tab is ignored. Pinned by a Task 4 test of `pickCandidateTrack`.
5. **End clicked while a turn is mid-playout** → the session stays `abandoned` (not revived by Settle), and the heard part of the turn is saved. Pinned by a Task 1 runner test (status re-check).

---

### Task 1: Orchestrator — heard-aware turns (revised 8 Oct with spec §5)

**Files:**
- Modify: `lib/orchestrator/turn-types.ts` (`SegmentPlayback`, `HeardSegment` with `heardChars` + `exhibitShown`, `HeardReport`, `TurnCancelled`, `isCancelledTurn`, `ScriptedPlan.delivery`)
- Modify: `lib/orchestrator/data-decisions.ts` (`DataLinePart`, `renderDataLineParts`; `renderDataLines` = its texts)
- Modify: `lib/orchestrator/data-requests.ts` (`DetectedDataRequest.unheardResponse`, carried into the row payload)
- Create: `lib/orchestrator/heard.ts` (`applyHeard`, `heardRequestRows`, `unheardQuestionPressureTest`)
- Modify: `lib/orchestrator/plan-turn.ts` (`delivery: 'decided'` on termination and the distress close; `'required'` on warnings and offers)
- Modify: `lib/orchestrator/session-runner.ts` (`heard`, `onTiming`; `heard` on every path that speaks, scripted included; `TurnCancelled` unless the scripted line is `decided`; a cancelled turn drops deferred work)
- Modify: `lib/orchestrator/settle-turn.ts` (`commitScripted(plan, heard)` per §5.6; `persist(latency, heard)` per the §5.4 table, returning the turn as heard; status re-check; `pt_judge_settle` / `structure_judge` marks)
- Modify: `lib/orchestrator/stream-turn.ts` (`pt_judge` mark)
- Test: `tests/orchestrator/heard.test.ts` (16, pure), `tests/orchestrator/heard-runner.test.ts` (14, through the real runner with the in-memory store)

**Interfaces (produced):**
```ts
export type HeardSegment = Segment & { playback: SegmentPlayback; heardChars: number; exhibitShown: boolean };
export type HeardReport = { segments: HeardSegment[]; interrupted: boolean };
export class TurnCancelled extends Error {}
export function isCancelledTurn(r: HeardReport): boolean;        // interrupted && nothing heard or shown
// RunTurnOptions.heard?: () => Promise<HeardReport>; RunTurnOptions.onTiming?: (marks) => void
// Settled.persist(latency, heard?) => Promise<TurnResult>; commitScripted(plan, heard?) => Promise<TurnResult>
```
Timer marks: `pt_judge_start/_end`, `pt_judge_settle_start/_end`, `structure_judge_start/_end`, `heard_resolved`.

- [x] **Step 1: Failing tests.** The test files above, written first. They cover:
  - reveal bookkeeping: booked if any figure was heard (cut after the figure → booked; cut before it → not booked, its request row logged `none` with `unheardResponse`); with no figure, the whole sentence must be heard;
  - exhibits booked only on browser confirmation;
  - the question heard only in full;
  - every delivery-dependent row of §5.4: `lastQuestion`, the pressure test, close → `ended`, grace ask;
  - cancellation: nothing written, `TurnCancelled`, `onTiming` called;
  - no revive after End;
  - scripted lines: a `required` warning counts only in full; a warning nobody heard is cancelled; a `decided` termination stands unheard; a cut distress offer isn't recorded; an inactive session never calls `heard`.
- [x] **Step 2: Run, verify RED.** Pure file: module missing. Runner file: 11 fail because `heard` is ignored. 3 already pass, because they pin existing behavior (full play, termination, inactive session).
- [x] **Step 3: Implement** the files above.
- [x] **Step 4: GREEN.** `npx vitest run tests/orchestrator/heard.test.ts tests/orchestrator/heard-runner.test.ts` → 30/30.
- [x] **Step 5: Mutation check.** Six guards were removed one at a time, and each was caught: `endedSaved`, figure-based booking, the status re-check, the `required` gate, the exhibit confirmation, and the pressure-test revert.
- [x] **Step 6: Full verification.** `npm run typecheck && npm test && npm run lint` → clean; 964 passed, 1 skipped (the API-key harness).
- [x] **Step 7: Commit.**

**Checkpoint (delivery bookkeeping):** stop and report.

> **Amendments for Tasks 2–5 from the 8 Oct spec revision.** These override the code below wherever they conflict, and each task's brief is re-checked against spec §5 when it starts:
> 1. **`heardChars`, not `heardText`.** `Playout.interrupt`/`classify` return `{ playback, heardChars }`. Word timestamps are aligned 1:1 to the text's whitespace tokens to give character positions; when the counts differ, or there are no timestamps, the heard share of the audio is applied to the text and snapped back to a word boundary.
> 2. **Heard cursor = play end + `HEARD_MARGIN_MS`.** Caption words are scheduled at `startAt + w.endMs + HEARD_MARGIN_MS`, so the screen never runs ahead of the saved line.
> 3. **Exhibits.** The controller tracks `exhibit_shown` confirmations per segment. `heard()` waits for outstanding ones up to `EXHIBIT_CONFIRM_MS` (1500ms). After that, or on a late confirmation, it sends `exhibit_withdraw`. The protocol gains `exhibit_shown`, `exhibit_withdraw` and `audio_blocked`.
> 4. **Scripted turns call `heard()` too.** The controller resolves it for scripted-only turns. A final that arrives while a scripted segment plays is queued as the next turn, not dropped. Barge-in is still ignored during scripted lines.
> 5. **`audio_blocked`** is a cut without a carry. The agent goes silent until `ready`, and a turn cancelled this way re-runs with its text after `ready`.
> 6. **`VOICE_TTS_RUN_CAP`** is required whenever `VOICE_TTS` is not `fake`, enforced per agent process, alongside the monthly ledger.
> 7. **Environment commands** are in spec §12.


---

### Task 2: Voice primitives — playout clock, Flux speech signals, word timestamps, fake TTS, VAD

**Files:**
- Modify: `lib/voice/types.ts`, `lib/voice/deepgram.ts`, `lib/voice/cartesia.ts`, `lib/voice/pcm.ts`
- Create: `lib/voice/playout.ts`, `lib/voice/fake-tts.ts`
- Test: `tests/voice/playout.test.ts`, `tests/voice/flux-speech.test.ts`, `tests/voice/cartesia-words.test.ts`, `tests/voice/fake-tts.test.ts`, extend `tests/voice/pcm.test.ts`

**Interfaces:**
- Consumes: `SegmentPlayback` (Task 1).
- Produces (types.ts):
  ```ts
  export type Word = { word: string; startMs: number; endMs: number }; // ms from the utterance's first audio
  export type SpeechSignal = { kind: 'speech'; transcript: string; words: number; atMs: number };
  export type SttEvent = TurnSignal | SpeechSignal | { kind: 'resumed'; atMs: number };
  // STTSession.onSignal(cb: (s: SttEvent) => void)
  // TTSProvider.open(format: PcmFormat, opts?: { timestamps?: boolean }): Promise<TTSUtterance>
  // TTSUtterance.onWords?(cb: (words: Word[]) => void): void
  ```
- Produces (playout.ts): `HEARD_MARGIN_MS`, `FRAME_MS`, `interface FrameSink { capture(frame: Int16Array): Promise<void>; clear(): void }`, `interface Clock { now(): number; at(ms: number, fn: () => void): () => void }`, `class Playout { open(id, o: { text: string; interruptible: boolean; onStart?: (atMs: number) => void; onWord?: (w: Word, atMs: number) => void }): void; push(id, pcm: Uint8Array): void; words(id, ws: Word[]): void; finish(id): void; fail(id): void; started(id): boolean; hasPendingNonInterruptible(): boolean; whenIdle(): Promise<void>; interrupt(atMs): Map<string, { playback: SegmentPlayback; heardText: string }>; classify(id): { playback: SegmentPlayback; heardText: string } }`, `classifySegment(...)`, `heardPrefix(...)`.
- Produces (deepgram.ts): `fluxSignal` returns `SpeechSignal` for `StartOfTurn` / `Update`.
- Produces (cartesia.ts): `toWords(wt: { words: string[]; start: number[]; end: number[] }): Word[]`; `open(format, { timestamps })`.
- Produces (fake-tts.ts): `class FakeTTS implements TTSProvider`, `tone(ms, sampleRate): Uint8Array`.
- Produces (pcm.ts): `class SpeechEndTracker { push(pcm: Int16Array, atMs: number): void; get lastVoicedAt(): number | null }`.

- [ ] **Step 1: Write the failing playout tests**

`tests/voice/playout.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Playout, HEARD_MARGIN_MS, heardPrefix, type Clock, type FrameSink } from '@/lib/voice/playout';

const RATE = 24000;
const pcmMs = (ms: number) => new Uint8Array((RATE * ms / 1000) * 2);
function fakeClock() {
  let t = 1000;
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
  };
  return { clock, advance };
}
const sink = (): FrameSink & { frames: number; cleared: number } => ({ frames: 0, cleared: 0, async capture() { this.frames++; }, clear() { this.cleared++; } });

describe('Playout', () => {
  it('plays segments in order and computes start/end on the playout clock', async () => {
    const { clock, advance } = fakeClock();
    const p = new Playout(sink(), clock, RATE);
    const starts: [string, number][] = [];
    p.open('a', { text: 'One.', interruptible: true, onStart: at => starts.push(['a', at]) });
    p.open('b', { text: 'Two.', interruptible: true, onStart: at => starts.push(['b', at]) });
    p.push('b', pcmMs(200)); p.finish('b');      // b's audio first: still waits for a
    p.push('a', pcmMs(400)); p.finish('a');
    await advance(1000);
    expect(starts).toEqual([['a', 1000], ['b', 1400]]);
    expect(p.classify('a')).toEqual({ playback: 'played', heardText: 'One.' });
  });

  it('classifies played / partial / unplayed at an interrupt, with the heard margin', async () => {
    const { clock, advance } = fakeClock();
    const s = sink();
    const p = new Playout(s, clock, RATE);
    p.open('a', { text: 'Fair point.', interruptible: true }); p.push('a', pcmMs(300)); p.finish('a');
    p.open('b', { text: 'There are 120 stores.', interruptible: true }); p.push('b', pcmMs(1000)); p.finish('b');
    p.words('b', [{ word: 'There', startMs: 0, endMs: 200 }, { word: 'are', startMs: 200, endMs: 350 }, { word: '120', startMs: 350, endMs: 800 }, { word: 'stores.', startMs: 800, endMs: 1000 }]);
    p.open('c', { text: 'Where would you start?', interruptible: true });
    await advance(300 + 700);                       // 700ms into b
    const out = p.interrupt(clock.now());
    expect(out.get('a')).toEqual({ playback: 'played', heardText: 'Fair point.' });
    expect(out.get('b')).toEqual({ playback: 'partial', heardText: 'There are' }); // 120 ends at 800 > 700−150
    expect(out.get('c')).toEqual({ playback: 'unplayed', heardText: '' });
    expect(s.cleared).toBe(1);
  });

  it('a segment that ended within the margin before the interrupt is partial, not played', async () => {
    const { clock, advance } = fakeClock();
    const p = new Playout(sink(), clock, RATE);
    p.open('a', { text: 'Labor is 22 percent.', interruptible: true }); p.push('a', pcmMs(500)); p.finish('a');
    await advance(500 + HEARD_MARGIN_MS - 10);
    expect(p.interrupt(clock.now()).get('a')?.playback).toBe('partial');
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

  it('reports a pending scripted segment and drops audio for cut segments', async () => {
    const { clock } = fakeClock();
    const p = new Playout(sink(), clock, RATE);
    p.open('s', { text: 'Let us pause.', interruptible: false });
    expect(p.hasPendingNonInterruptible()).toBe(true);
    p.open('a', { text: 'x', interruptible: true });
    p.interrupt(clock.now());
    p.push('a', pcmMs(100));                        // ignored: cut
    expect(p.started('a')).toBe(false);
  });

  it('a failed segment with no audio is unplayed', async () => {
    const { clock, advance } = fakeClock();
    const p = new Playout(sink(), clock, RATE);
    p.open('a', { text: 'Hi.', interruptible: true }); p.fail('a');
    await advance(50);
    expect(p.classify('a').playback).toBe('unplayed');
  });
});

describe('heardPrefix without timestamps', () => {
  it('keeps whole sentences that fit the heard share of the audio', () => {
    expect(heardPrefix('First one. Second one. Third.', null, 600, 1000)).toBe('First one.');   // 2nd ends at 23/29 ≈ 0.79
    expect(heardPrefix('First one. Second one. Third.', null, 800, 1000)).toBe('First one. Second one.');
    expect(heardPrefix('Only sentence.', null, 100, 1000)).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/voice/playout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/voice/playout.ts`**

```ts
// The interviewer's audio on the agent clock (spec 2026-10-08-voice-phase-b
// §5). Segments play strictly in order through a FrameSink (the LiveKit
// AudioSource); a frame handed over at t while the queue ends at `cursor`
// plays from max(t, cursor), so every segment gets a computed start and end.
// An interrupt clears the queue and classifies each segment as played /
// partial / unplayed; the heard words come from TTS word timestamps.
import type { SegmentPlayback } from '@/lib/orchestrator/turn-types';
import type { Word } from './types';

export const HEARD_MARGIN_MS = 150;   // network + jitter buffer: heard ≈ played − 150ms
export const FRAME_MS = 20;

export interface FrameSink { capture(frame: Int16Array): Promise<void>; clear(): void }
export interface Clock { now(): number; at(ms: number, fn: () => void): () => void }

type Seg = {
  id: string; text: string; interruptible: boolean;
  onStart?: (atMs: number) => void; onWord?: (w: Word, atMs: number) => void;
  chunks: Int16Array[]; finished: boolean; failed: boolean; cut: boolean;
  words: Word[] | null; audioMs: number; startAt: number | null; endAt: number | null;
};
type Outcome = { playback: SegmentPlayback; heardText: string };

export class Playout {
  private segs: Seg[] = [];
  private byId = new Map<string, Seg>();
  private cursor = 0;
  private timers: (() => void)[] = [];
  private wake: (() => void) | null = null;
  private gen = 0;
  private pumping = false;
  private idleWaiters: (() => void)[] = [];

  constructor(private sink: FrameSink, private clock: Clock, private sampleRate: number) {}

  open(id: string, o: { text: string; interruptible: boolean; onStart?: (atMs: number) => void; onWord?: (w: Word, atMs: number) => void }): void {
    const s: Seg = { id, ...o, chunks: [], finished: false, failed: false, cut: false, words: null, audioMs: 0, startAt: null, endAt: null };
    this.segs.push(s);
    this.byId.set(id, s);
    this.kick();
  }

  push(id: string, pcm: Uint8Array): void {
    const s = this.byId.get(id);
    if (!s || s.cut || s.finished) return;
    const bytes = pcm.slice(0, pcm.length - (pcm.length % 2));
    const v = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    s.chunks.push(v);
    s.audioMs += (v.length / this.sampleRate) * 1000;
    this.kick();
  }

  words(id: string, ws: Word[]): void {
    const s = this.byId.get(id);
    if (!s || s.cut) return;
    s.words = [...(s.words ?? []), ...ws];
    if (s.startAt !== null) this.scheduleWords(s, ws);
  }

  finish(id: string): void { const s = this.byId.get(id); if (s && !s.cut) { s.finished = true; this.kick(); } }
  fail(id: string): void { const s = this.byId.get(id); if (s && !s.cut) { s.failed = true; s.finished = true; s.chunks = []; this.kick(); } }

  started(id: string): boolean {
    const s = this.byId.get(id);
    return !!s && !s.cut && s.startAt !== null && s.startAt <= this.clock.now();
  }

  hasPendingNonInterruptible(): boolean {
    const now = this.clock.now();
    return this.segs.some(s => !s.interruptible && !s.cut && (s.endAt === null || s.endAt > now));
  }

  whenIdle(): Promise<void> {
    return new Promise(r => { this.idleWaiters.push(r); this.checkIdle(); });
  }

  classify(id: string): Outcome {
    const s = this.byId.get(id);
    return s ? classifySegment(s, null) : { playback: 'unplayed', heardText: '' };
  }

  // Barge-in: stop now; every open segment is classified at `atMs`.
  interrupt(atMs: number): Map<string, Outcome> {
    this.gen++;
    this.sink.clear();
    for (const cancel of this.timers.splice(0)) cancel();
    this.wake?.(); this.wake = null;
    const out = new Map<string, Outcome>();
    for (const s of this.segs) {
      if (s.cut) continue;
      out.set(s.id, classifySegment(s, atMs));
      s.cut = true;
    }
    this.cursor = atMs;
    for (const w of this.idleWaiters.splice(0)) w();
    return out;
  }

  private kick(): void {
    this.wake?.(); this.wake = null;
    if (!this.pumping) void this.pump();
  }

  private async pump(): Promise<void> {
    this.pumping = true;
    const gen = this.gen;
    const frameLen = (this.sampleRate * FRAME_MS) / 1000;
    try {
      while (gen === this.gen) {
        const s = this.segs.find(x => x.endAt === null && !x.cut);
        if (!s) break;
        if (s.chunks.length === 0) {
          if (s.finished) { this.close(s); continue; }
          await new Promise<void>(r => { this.wake = r; });
          continue;
        }
        const chunk = s.chunks.shift()!;
        for (let i = 0; i < chunk.length && gen === this.gen; i += frameLen) {
          const frame = chunk.subarray(i, i + frameLen);
          const playAt = Math.max(this.clock.now(), this.cursor);
          if (s.startAt === null) this.begin(s, playAt);
          this.cursor = playAt + (frame.length / this.sampleRate) * 1000;
          await this.sink.capture(frame);
        }
      }
    } finally {
      this.pumping = false;
    }
    if (gen !== this.gen && this.segs.some(x => x.endAt === null && !x.cut)) void this.pump();
    else this.checkIdle();
  }

  private begin(s: Seg, at: number): void {
    s.startAt = at;
    this.timers.push(this.clock.at(at, () => s.onStart?.(at)));
    if (s.words) this.scheduleWords(s, s.words);
  }

  private close(s: Seg): void {
    if (s.startAt === null && !s.failed) this.begin(s, Math.max(this.clock.now(), this.cursor));
    if (s.startAt !== null) this.cursor = Math.max(this.cursor, s.startAt);
    s.endAt = this.cursor;
    this.checkIdle();
  }

  // A caption word appears when it has been heard (its end on the playout clock).
  private scheduleWords(s: Seg, ws: Word[]): void {
    for (const w of ws) {
      const at = s.startAt! + w.endMs;
      this.timers.push(this.clock.at(at, () => s.onWord?.(w, at)));
    }
  }

  private checkIdle(): void {
    if (this.idleWaiters.length === 0) return;
    if (this.segs.some(x => x.endAt === null && !x.cut)) return;
    const end = Math.max(this.clock.now(), ...this.segs.filter(x => !x.cut).map(x => x.endAt ?? 0));
    this.timers.push(this.clock.at(end, () => {
      if (this.segs.some(x => x.endAt === null && !x.cut)) return; // more opened since; its close re-checks
      for (const w of this.idleWaiters.splice(0)) w();
    }));
  }
}

export function classifySegment(
  s: Pick<Seg, 'text' | 'startAt' | 'endAt' | 'failed' | 'words' | 'audioMs'>, cutAt: number | null,
): Outcome {
  if (s.startAt === null || (cutAt !== null && s.startAt >= cutAt)) return { playback: 'unplayed', heardText: '' };
  if (s.failed && s.audioMs === 0) return { playback: 'unplayed', heardText: '' };
  const limit = cutAt === null ? Infinity : cutAt - HEARD_MARGIN_MS;
  if (!s.failed && s.endAt !== null && s.endAt <= limit) return { playback: 'played', heardText: s.text };
  const heardMs = Math.max(0, Math.min(limit, s.endAt ?? limit) - s.startAt);
  return { playback: 'partial', heardText: heardPrefix(s.text, s.words, heardMs, s.audioMs) };
}

// The words of a cut segment the candidate heard: by word timestamps, else the
// whole sentences that fit the heard share of the audio.
export function heardPrefix(text: string, words: Word[] | null, heardMs: number, audioMs: number): string {
  if (words && words.length > 0) return words.filter(w => w.endMs <= heardMs).map(w => w.word).join(' ');
  if (audioMs <= 0 || !text) return '';
  const share = Math.min(1, heardMs / audioMs);
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const kept: string[] = [];
  let used = 0;
  for (const s of sentences) {
    used += s.length;
    if (used / text.length > share + 1e-9) break;
    kept.push(s.trim());
  }
  return kept.join(' ');
}
```

- [ ] **Step 4: Run playout tests**

Run: `npx vitest run tests/voice/playout.test.ts`
Expected: PASS. If the in-order test fails on timing, check `begin`/`cursor` against the comment's model. Fix the code, not the expected numbers.

- [ ] **Step 5: Failing tests for Flux speech, Cartesia words, fake TTS, VAD**

`tests/voice/flux-speech.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fluxSignal } from '@/lib/voice/deepgram';

describe('fluxSignal speech events (barge-in input)', () => {
  it('maps StartOfTurn and Update to speech with a word count', () => {
    expect(fluxSignal({ type: 'TurnInfo', event: 'StartOfTurn', transcript: '' }, 5)).toEqual({ kind: 'speech', transcript: '', words: 0, atMs: 5 });
    expect(fluxSignal({ type: 'TurnInfo', event: 'Update', transcript: ' wait, sorry ' }, 6)).toEqual({ kind: 'speech', transcript: 'wait, sorry', words: 2, atMs: 6 });
  });
  it('keeps end-of-turn signals as before', () => {
    expect(fluxSignal({ type: 'TurnInfo', event: 'EndOfTurn', transcript: 'done' }, 7)).toEqual({ kind: 'final', transcript: 'done', atMs: 7 });
  });
});
```
`tests/voice/cartesia-words.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toWords } from '@/lib/voice/cartesia';

it('converts Cartesia word timestamps (seconds) to ms words', () => {
  expect(toWords({ words: ['There', 'are'], start: [0, 0.21], end: [0.2, 0.35] }))
    .toEqual([{ word: 'There', startMs: 0, endMs: 200 }, { word: 'are', startMs: 210, endMs: 350 }]);
});
```
`tests/voice/fake-tts.test.ts`:
```ts
import { it, expect } from 'vitest';
import { FakeTTS } from '@/lib/voice/fake-tts';

it('returns tone audio of ~msPerChar per character and evenly spaced words', async () => {
  const utt = await new FakeTTS(10, 0).open({ encoding: 'pcm_s16le', sampleRate: 24000 });
  let bytes = 0; let words: { word: string; endMs: number }[] = [];
  utt.onAudio(pcm => { bytes += pcm.length; });
  utt.onWords?.(w => { words = w; });
  await utt.push('One two.');
  expect(bytes).toBe(24000 * 0.08 * 2);           // 8 chars × 10ms
  expect(words.map(w => w.word)).toEqual(['One', 'two.']);
  expect(words.at(-1)?.endMs).toBe(80);
});
```
Append to `tests/voice/pcm.test.ts`:
```ts
import { SpeechEndTracker } from '@/lib/voice/pcm';
it('SpeechEndTracker keeps the time of the last voiced frame', () => {
  const t = new SpeechEndTracker();
  const loud = new Int16Array(320).fill(8000), quiet = new Int16Array(320);
  t.push(loud, 100); t.push(quiet, 120); t.push(loud, 140); t.push(quiet, 160);
  expect(t.lastVoicedAt).toBe(140);
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run tests/voice`
Expected: the four new files FAIL (missing exports); existing voice tests pass.

- [ ] **Step 7: Implement**

`lib/voice/types.ts` — add `Word`, `SpeechSignal`, `SttEvent`; change `STTSession.onSignal` to `(cb: (s: SttEvent) => void) => void`; `TTSProvider.open(format: PcmFormat, opts?: { timestamps?: boolean })`; add optional `onWords?(cb: (words: Word[]) => void): void` to `TTSUtterance`.

`lib/voice/deepgram.ts` — in `fluxSignal`, before the eager line:
```ts
  if (msg.event === 'StartOfTurn' || msg.event === 'Update') {
    return { kind: 'speech', transcript, words: transcript ? transcript.split(/\s+/).length : 0, atMs };
  }
```
Change the local `Signal` type to `SttEvent`. `NovaTurnReducer` is unchanged.

`lib/voice/cartesia.ts`:
```ts
type WordTimestamps = { words: string[]; start: number[]; end: number[] };
export function toWords(wt: WordTimestamps): Word[] {
  return wt.words.map((word, i) => ({ word, startMs: Math.round(wt.start[i] * 1000), endMs: Math.round(wt.end[i] * 1000) }));
}
```
In `open(format, opts = {})`, pass `...(opts.timestamps ? { add_timestamps: true } : {})` into `ws.context({...})`. First confirm the option name in the installed SDK with `grep -n "add_timestamps" node_modules/@cartesia/cartesia-js/resources/tts.d.ts`. Add `let onWords: (w: Word[]) => void = () => {};`; in `pump`, `const r = raw as WsResponse & { word_timestamps?: WordTimestamps }; if (r.type === 'timestamps' && r.word_timestamps) onWords(toWords(r.word_timestamps));`; and return `onWords: cb => { onWords = cb; }`.

`lib/voice/fake-tts.ts`:
```ts
// Free development TTS (spec 2026-10-08-voice-phase-b §8): a quiet tone per
// segment, ~80ms per character (Aura's ~12.5 chars/s in the 7 Oct demo),
// first audio after 140ms (Cartesia's measured first audio), and evenly
// spaced word timestamps — barge-in and bookkeeping run on a live mic with no
// TTS credits. VOICE_TTS=fake selects it.
import type { PcmFormat, TTSProvider, TTSUtterance, Word } from './types';

export function tone(ms: number, sampleRate: number, hz = 220, amp = 0.05): Uint8Array {
  const n = Math.round((sampleRate * ms) / 1000);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / sampleRate) * amp * 32767);
  return new Uint8Array(out.buffer);
}

export class FakeTTS implements TTSProvider {
  readonly name = 'fake-tone';
  constructor(private msPerChar = 80, private firstAudioMs = 140) {}
  async open(format: PcmFormat): Promise<TTSUtterance> {
    let onAudio: (pcm: Uint8Array, atMs: number) => void = () => {};
    let onWords: (w: Word[]) => void = () => {};
    let cancelled = false;
    return {
      push: async text => {
        if (this.firstAudioMs > 0) await new Promise(r => setTimeout(r, this.firstAudioMs));
        if (cancelled || !text.trim()) return;
        const ms = text.length * this.msPerChar;
        const ws = text.trim().split(/\s+/);
        const per = ms / ws.length;
        onWords(ws.map((word, i) => ({ word, startMs: Math.round(i * per), endMs: Math.round((i + 1) * per) })));
        onAudio(tone(ms, format.sampleRate), Date.now());
      },
      end: async () => {},
      cancel: async () => { cancelled = true; },
      onAudio: cb => { onAudio = cb; },
      onWords: cb => { onWords = cb; },
    };
  }
}
```

`lib/voice/pcm.ts`:
```ts
// The candidate's last voiced mic frame (spec §7 speechEndAt): RMS over each
// pushed frame against the same threshold speechEndSec uses.
export class SpeechEndTracker {
  private last: number | null = null;
  constructor(private threshold = 0.02) {}
  push(pcm: Int16Array, atMs: number): void {
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) sum += (pcm[i] / 32768) ** 2;
    if (pcm.length > 0 && Math.sqrt(sum / pcm.length) > this.threshold) this.last = atMs;
  }
  get lastVoicedAt(): number | null { return this.last; }
}
```

- [ ] **Step 8: Run tests, typecheck, lint**

Run: `npx vitest run tests/voice && npm run typecheck && npm run lint`
Expected: PASS. If `scripts/voice-latency.ts` or `scripts/endpoint-sweep.ts` fail to typecheck on the widened signal union, narrow with `if (s.kind === 'speech') return;` at their `onSignal` callbacks. Behavior there is unchanged.

- [ ] **Step 9: Commit**

```bash
git add lib/voice tests/voice scripts/voice-latency.ts scripts/endpoint-sweep.ts
git commit -m "feat(voice): playout clock with heard classification, Flux speech signals, Cartesia word timestamps, fake TTS, speech-end tracker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint:** stop and report.

---

### Task 3: Voice turn controller, protocol and timing records

**Files:**
- Create: `lib/voice/protocol.ts`, `lib/voice/records.ts`, `lib/voice/tts-budget.ts`, `lib/voice/turn-controller.ts`
- Test: `tests/voice/turn-controller.test.ts`, `tests/voice/records.test.ts`, `tests/voice/tts-budget.test.ts`

**Interfaces:**
- Consumes: `Playout`, `Clock`, `FrameSink`, `FakeTTS` (Task 2); `HeardReport`, `TurnCancelled`, `isCancelledTurn`, `isUsefulSegment`, `Segment`, `TurnResult`, `ExhibitDisplay` (orchestrator types); `pickAck`, `shouldAcknowledge`.
- Produces (protocol.ts):
  ```ts
  export const AGENT_NAME = 'case-interviewer';
  export const DATA_TOPIC = 'case';
  export type VoiceState = 'waiting' | 'listening' | 'thinking' | 'speaking' | 'ended';
  export type ServerMessage =
    | { type: 'state'; state: VoiceState; turnSeq: number }
    | { type: 'caption'; who: 'interviewer' | 'candidate'; turnSeq: number; text: string; final: boolean }
    | { type: 'exhibit'; turnSeq: number; exhibit: ExhibitDisplay }
    | { type: 'latency'; turnSeq: number; firstSoundMs: number | null; firstUsefulMs: number | null }
    | { type: 'ended'; scoringSuppressed: boolean; reason: 'case_complete' | 'tts_cap' | 'time_limit' | 'error' }
    | { type: 'error'; message: string };
  export type ClientMessage = { type: 'ready' } | { type: 'timing'; turnSeq: number; clientFirstSoundMs: number };
  export function parseClientMessage(raw: string): ClientMessage | null;
  ```
- Produces (records.ts): `type TurnRecord`, `classifierWaits(marks)`, `summarize(records): Record<string, number | null>`.
- Produces (tts-budget.ts): `class TtsCharBudget { constructor(file: string, cap: number, reserve?: number); canStartTurn(): boolean; take(chars: number): boolean; get used(): number }`.
- Produces (turn-controller.ts): `class VoiceTurnController { constructor(d: ControllerDeps); ready(opening: string): Promise<void>; onStt(e: SttEvent): void; idle(): Promise<void>; close(): void }`, `type ControllerDeps`, `type RunTurnFn`.

- [ ] **Step 1: Failing tests**

`tests/voice/records.test.ts`:
```ts
import { it, expect } from 'vitest';
import { classifierWaits, summarize } from '@/lib/voice/records';

it('counts only waits that blocked delivery', () => {
  expect(classifierWaits({ model_first_sentence: 900, distress_verdict: 1100, held_for_distress: 900, pt_judge_start: 1200, pt_judge_end: 1500, hint_check_start: 2000, hint_check_end: 2300 }))
    .toEqual({ distress: 200, ptJudge: 300, structureJudge: 0, hintCheck: 300, codeWrittenChecks: 0 });
  expect(classifierWaits({ model_first_sentence: 900, distress_verdict: 700 }).distress).toBe(0); // never held
});
it('summarizes medians and p90s over completed turns', () => {
  const s = summarize([1, 2, 3, 4, 10].map(v => ({ firstSoundMs: v * 100, firstUsefulMs: v * 200, endpointMs: v, cancelled: false } as never)));
  expect(s.firstSoundMs_median).toBe(300);
  expect(s.firstUsefulMs_p90).toBe(2000);
});
```
`tests/voice/tts-budget.test.ts`:
```ts
import { it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TtsCharBudget } from '@/lib/voice/tts-budget';

it('persists a monthly character count and refuses past the cap and reserve', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'tts-')), 'chars.json');
  const b = new TtsCharBudget(file, 5000, 2000);
  expect(b.take(2500)).toBe(true);
  expect(b.canStartTurn()).toBe(true);
  expect(b.take(600)).toBe(true);                 // 3100 used, 1900 left
  expect(b.canStartTurn()).toBe(false);
  expect(new TtsCharBudget(file, 5000, 2000).used).toBe(3100);
  expect(b.take(2000)).toBe(false);
});
```
`tests/voice/turn-controller.test.ts` — fakes: the fake clock and sink from `tests/voice/playout.test.ts` (copy them), `FakeTTS(10, 0)`, a scripted `runTurn` that calls `onSegment` for given segments, then `await heard()`, and returns a `TurnResult`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { Playout } from '@/lib/voice/playout';
import { FakeTTS } from '@/lib/voice/fake-tts';
import { VoiceTurnController, type ControllerDeps, type RunTurnFn } from '@/lib/voice/turn-controller';
import { TurnCancelled, isCancelledTurn, type HeardReport, type Segment } from '@/lib/orchestrator/turn-types';
import type { ServerMessage } from '@/lib/voice/protocol';
// fakeClock(), sink() as in playout.test.ts

const result = (o = {}) => ({ interviewerText: '', phase: 'CLARIFY', ended: false, auditPassed: true, ...o }) as never;
function harness(script: Segment[][], o: Partial<ControllerDeps> = {}) {
  const { clock, advance } = fakeClock();
  const sent: ServerMessage[] = []; const reports: HeardReport[] = []; const texts: string[] = []; const records: unknown[] = [];
  const runTurn: RunTurnFn = async (text, opts) => {
    texts.push(text);
    for (const s of script.shift() ?? []) await opts.onSegment(s).catch(() => {});
    const r = await opts.heard(); reports.push(r);
    opts.onTiming({});
    if (isCancelledTurn(r)) throw new TurnCancelled();
    return result();
  };
  const c = new VoiceTurnController({
    now: () => clock.now(), clock, runTurn, afterTurn: () => {}, tts: new FakeTTS(10, 0),
    format: { encoding: 'pcm_s16le', sampleRate: 24000 }, playout: new Playout(sink(), clock, 24000),
    ackPcm: () => new Uint8Array(24000 * 2 * 0.3), exhibitById: id => ({ id, title: 'T', chartType: 'table', data: [] }),
    send: m => sent.push(m), record: r => records.push(r), speechEndAt: () => clock.now() - 300,
    ttsAllow: () => true, canStartTurn: () => true, bargeMinWords: 2, sessionSeed: 's1', ...o,
  } as ControllerDeps);
  return { c, clock, advance, sent, reports, texts, records };
}
const seg = (kind: Segment['kind'], text: string, extra: Partial<Segment> = {}): Segment => ({ kind, text, revealIds: [], ...extra });
const speech = (words: string, at = 0) => ({ kind: 'speech' as const, transcript: words, words: words ? words.split(' ').length : 0, atMs: at });
const final = (t: string, at = 0) => ({ kind: 'final' as const, transcript: t, atMs: at });

describe('VoiceTurnController', () => {
  it('says nothing before ready (Review Focus 1)', async () => {
    const h = harness([[seg('tail', 'Go on.')]]);
    h.c.onStt(final('Hello there'));
    await h.advance(2000);
    expect(h.texts).toEqual([]);
    expect(h.sent.some(m => m.type === 'caption' && m.who === 'interviewer')).toBe(false);
  });

  it('plays a full turn, reports every segment played, and records first sound and first useful', async () => {
    const h = harness([[seg('say', 'Fair point.'), seg('data', 'There are 120 stores.', { revealIds: ['stores_count'] }), seg('tail', 'Where would you start?')]]);
    await h.c.ready(''); h.c.onStt(final('How many stores are there?'));
    await h.advance(5000);
    expect(h.reports[0].interrupted).toBe(false);
    expect(h.reports[0].segments.map(s => s.playback)).toEqual(['played', 'played', 'played']);
    const rec = h.records[0] as { firstSoundMs: number; firstUsefulMs: number };
    expect(rec.firstSoundMs).toBeLessThan(rec.firstUsefulMs);
  });

  it('barge-in mid data line: partial, later segments unplayed, captions only heard words', async () => {
    const h = harness([[seg('data', 'There are 120 stores in total.', { revealIds: ['stores_count'] }), seg('tail', 'Where would you start?')]], { ackPcm: () => null });
    await h.c.ready(''); h.c.onStt(final('How many stores?'));
    await h.advance(120);                               // ~12 chars of 30 heard
    h.c.onStt(speech('wait sorry'));
    await h.advance(1000);
    const r = h.reports[0];
    expect(r.interrupted).toBe(true);
    expect(r.segments.map(s => s.playback)).toEqual(['partial', 'unplayed']);
    const shown = h.sent.filter(m => m.type === 'caption' && m.who === 'interviewer').map(m => (m as { text: string }).text).at(-1) ?? '';
    expect(shown).not.toContain('120');
  });

  it('one word while speaking is not a barge-in; its final is a dropped backchannel', async () => {
    const h = harness([[seg('tail', 'Walk me through your structure, step by step please.')]]);
    await h.c.ready(''); h.c.onStt(final('Okay so'));
    await h.advance(400);                               // ack 0–300ms, the 540ms question from 300ms
    h.c.onStt(speech('mhm')); h.c.onStt(final('mhm'));
    await h.advance(5000);
    expect(h.reports[0].interrupted).toBe(false);
    expect(h.texts).toEqual(['Okay so']);
  });

  it('speech during thinking cancels the turn and carries its text into the next one', async () => {
    const h = harness([[], [seg('tail', 'Go on.')]]);
    await h.c.ready(''); h.c.onStt(final('I think the issue is'));
    await h.advance(100);                               // ack playing, nothing of the turn heard
    h.c.onStt(speech('costs'));
    h.c.onStt(final('costs rising.'));
    await h.advance(3000);
    expect(h.texts).toEqual(['I think the issue is', 'I think the issue is costs rising.']);
  });

  it('does not interrupt a scripted segment; it is played to the end', async () => {
    const h = harness([[seg('scripted', 'Let us set the case aside for a moment. Are you okay?')]]);
    await h.c.ready(''); h.c.onStt(final('I cannot do this'));
    await h.advance(200);
    h.c.onStt(speech('yes I am fine'));
    await h.advance(3000);
    expect(h.reports.length).toBe(1);
    expect(h.reports[0].segments[0].playback).toBe('played');
  });

  it('shows the exhibit when its segment starts', async () => {
    const h = harness([[seg('say', 'Sure.'), seg('data', 'Here it is.', { exhibitId: 'exhibit-a' }), seg('tail', 'What stands out?')]], { ackPcm: () => null });
    await h.c.ready(''); h.c.onStt(final('Can I see the costs?'));
    await h.advance(30);
    expect(h.sent.some(m => m.type === 'exhibit')).toBe(false);
    await h.advance(3000);
    expect(h.sent.some(m => m.type === 'exhibit')).toBe(true);
  });

  it('replays the opening without booking anything and lets it be interrupted (Review Focus 3)', async () => {
    const h = harness([]);
    await h.c.ready('Welcome. Brew & Bean has seen profits fall.');
    await h.advance(100);
    h.c.onStt(speech('sorry go ahead'));
    await h.advance(500);
    expect(h.reports).toEqual([]);
    expect(h.sent.at(-1)).toMatchObject({ type: 'state', state: 'listening' });
  });

  it('starts no turn when the TTS allowance is spent', async () => {
    const h = harness([[seg('tail', 'Go on.')]], { canStartTurn: () => false });
    await h.c.ready(''); h.c.onStt(final('Hello'));
    await h.advance(1000);
    expect(h.texts).toEqual([]);
    expect(h.sent.some(m => m.type === 'ended' && m.reason === 'tts_cap')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/voice/turn-controller.test.ts tests/voice/records.test.ts tests/voice/tts-budget.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `protocol.ts`, `records.ts`, `tts-budget.ts`**

`lib/voice/protocol.ts`: the types listed under Interfaces, plus:
```ts
// Messages the browser may send on the data channel; anything else is ignored.
export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    if (m.type === 'ready') return { type: 'ready' };
    if (m.type === 'timing' && Number.isInteger(m.turnSeq) && typeof m.clientFirstSoundMs === 'number') {
      return { type: 'timing', turnSeq: m.turnSeq as number, clientFirstSoundMs: m.clientFirstSoundMs };
    }
  } catch { /* not JSON */ }
  return null;
}
```
This file imports only `type ExhibitDisplay` from `@/lib/orchestrator/turn-types`, so it is safe to import from a client component.

`lib/voice/records.ts`:
```ts
// Per-turn voice timing (spec 2026-10-08-voice-phase-b §7), agent clock.
export type TurnRecord = {
  turnSeq: number; at: string; candidateText: string; carried: boolean; ack: string | null;
  phase: string | null; ended: boolean;
  speechEndAt: number | null; finalAt: number; endpointMs: number | null; queueWaitMs: number;
  firstSoundMs: number | null; firstUsefulMs: number | null;
  firstSegmentAcceptedMs: number | null; ttsFirstAudioMs: number | null;
  waits: ReturnType<typeof classifierWaits>; marks: Record<string, number>;
  interrupted: boolean; cancelled: boolean; backchannelsDropped: number; droppedRevealIds: string[];
  clientFirstSoundMs?: number;
};

// How long delivery was blocked on each classifier (TurnTimer marks, ms from turn start).
export function classifierWaits(m: Record<string, number>) {
  const span = (a: string, b: string) => (m[a] !== undefined && m[b] !== undefined ? Math.max(0, m[b] - m[a]) : 0);
  return {
    distress: m.held_for_distress !== undefined && m.distress_verdict !== undefined && m.model_first_sentence !== undefined
      ? Math.max(0, m.distress_verdict - m.model_first_sentence) : 0,
    ptJudge: span('pt_judge_start', 'pt_judge_end') + span('pt_judge_settle_start', 'pt_judge_settle_end'),
    structureJudge: span('structure_judge_start', 'structure_judge_end'),
    hintCheck: span('hint_check_start', 'hint_check_end'),
    codeWrittenChecks: span('code_written_checks_start', 'code_written_checks_end'),
  };
}

const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
};

export function summarize(rs: Pick<TurnRecord, 'firstSoundMs' | 'firstUsefulMs' | 'endpointMs' | 'cancelled'>[]): Record<string, number | null> {
  const done = rs.filter(r => !r.cancelled);
  const out: Record<string, number | null> = { turns: done.length, cancelled: rs.length - done.length };
  for (const k of ['endpointMs', 'firstSoundMs', 'firstUsefulMs'] as const) {
    const xs = done.map(r => r[k]).filter((v): v is number => v !== null);
    out[`${k}_median`] = pct(xs, 0.5);
    out[`${k}_p90`] = pct(xs, 0.9);
  }
  return out;
}
```

`lib/voice/tts-budget.ts`:
```ts
// The monthly Cartesia character ledger (spec §9): one JSON file per calendar
// month under .voice-cache, shared by every agent job. take() refuses past the
// cap; canStartTurn() keeps a reserve so no turn starts that might not finish.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export class TtsCharBudget {
  constructor(private file: string, private cap: number, private reserve = 2000) {}
  get used(): number {
    return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, 'utf8')) as { used: number }).used : 0;
  }
  canStartTurn(): boolean { return this.cap - this.used >= this.reserve; }
  take(chars: number): boolean {
    const used = this.used;
    if (used + chars > this.cap) return false;
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ used: used + chars, cap: this.cap }));
    return true;
  }
}
export const monthlyLedgerFile = (d = new Date()) => `.voice-cache/tts-chars-${d.toISOString().slice(0, 7)}.json`;
```

- [ ] **Step 4: Implement `lib/voice/turn-controller.ts`**

```ts
// The voice turn loop (spec 2026-10-08-voice-phase-b §5): Flux signals in;
// one runTurn per candidate turn, one at a time; segments → TTS (one context
// per segment) → Playout; barge-in, cancellation with carry, backchannels,
// word-synced captions, exhibits at segment start, per-turn timing records.
// Everything external is injected — the LiveKit job wires the real ones.
import {
  TurnCancelled, isCancelledTurn, isUsefulSegment,
  type ExhibitDisplay, type HeardReport, type Segment, type TurnResult,
} from '@/lib/orchestrator/turn-types';
import type { Clock, Playout } from './playout';
import type { PcmFormat, SttEvent, TTSProvider } from './types';
import type { ServerMessage, VoiceState } from './protocol';
import { classifierWaits, type TurnRecord } from './records';
import { pickAck, shouldAcknowledge } from './acknowledge';

export type RunTurnFn = (text: string, opts: {
  onSegment: (s: Segment) => Promise<void>;
  heard: () => Promise<HeardReport>;
  acknowledged?: string;
  onTiming: (marks: Record<string, number>) => void;
}) => Promise<TurnResult>;

export type ControllerDeps = {
  now: () => number;
  clock: Clock;
  runTurn: RunTurnFn;
  afterTurn: (r: TurnResult) => void;
  tts: TTSProvider;
  format: PcmFormat;
  playout: Playout;
  ackPcm: (ack: string) => Uint8Array | null;     // cached at job start; null = no ack
  exhibitById: (id: string) => ExhibitDisplay | null;
  send: (m: ServerMessage) => void;
  record: (r: TurnRecord) => void;
  speechEndAt: () => number | null;               // SpeechEndTracker
  ttsAllow: (chars: number) => boolean;          // TtsCharBudget.take
  canStartTurn: () => boolean;                    // TtsCharBudget.canStartTurn
  bargeMinWords: number;
  sessionSeed: string;
};

type Entry = { id: string; seg: Segment; cancel: () => void };
type Live = {
  seq: number; text: string; carried: boolean; ack: string | null; opening: boolean;
  finalAt: number; speechEndAt: number | null; startedAt: number | null;
  entries: Entry[]; interruptedAt: number | null; report: HeardReport | null; waiters: ((r: HeardReport) => void)[];
  firstSoundAt: number | null; firstUsefulAt: number | null; firstAcceptedAt: number | null; ttsFirstAudioAt: number | null;
  marks: Record<string, number>; caption: string[]; backchannels: number;
};

export class VoiceTurnController {
  private state: VoiceState = 'waiting';
  private seq = 0;
  private live: Live | null = null;
  private lock: Promise<void> = Promise.resolve();
  private carry: string | null = null;
  private lastAck: string | null = null;

  constructor(private d: ControllerDeps) {}

  // The browser can play audio (spec §5): only now may anything be spoken.
  // The opening (already persisted) is replayed interruptible and unbooked.
  // Returns once the opening is queued — not when it has played.
  async ready(opening: string): Promise<void> {
    if (this.state !== 'waiting') return;
    this.setState('listening', 0);
    if (!opening.trim()) return;
    const t = this.newLive('', this.d.now(), true);
    this.setState('thinking', t.seq);
    await this.accept(t, { kind: 'say', text: opening, revealIds: [] });
    void this.d.playout.whenIdle().then(() => {
      if (this.live === t && t.interruptedAt === null) this.setState('listening', t.seq);
    });
  }

  onStt(e: SttEvent): void {
    if (this.state === 'waiting' || this.state === 'ended') return;
    if (e.kind === 'speech') {
      if (e.transcript) this.d.send({ type: 'caption', who: 'candidate', turnSeq: this.seq, text: e.transcript, final: false });
      this.maybeBargeIn(e.words);
      return;
    }
    if (e.kind === 'final') this.onFinal(e.transcript, e.atMs);
    // eager / resumed: speculation is off (spec §2); nothing to do.
  }

  idle(): Promise<void> { return this.lock; }

  close(): void {
    if (this.live && this.live.interruptedAt === null) this.interrupt(this.live);
    this.state = 'ended';
  }

  private maybeBargeIn(words: number): void {
    const t = this.live;
    if (!t || t.interruptedAt !== null || this.d.playout.hasPendingNonInterruptible()) return;
    const anyStarted = t.entries.some(x => this.d.playout.started(x.id));
    if (!anyStarted && (this.state === 'thinking') && words >= 1) this.interrupt(t);
    else if (anyStarted && this.state === 'speaking' && words >= this.d.bargeMinWords) this.interrupt(t);
  }

  private onFinal(transcript: string, atMs: number): void {
    const t = this.live;
    if (t && t.interruptedAt === null && this.state === 'speaking') { t.backchannels++; return; } // §5.5
    if (t && t.interruptedAt === null && this.state === 'thinking' && !this.d.playout.hasPendingNonInterruptible()) this.interrupt(t);
    const text = [this.carry, transcript.trim()].filter(Boolean).join(' ');
    const carried = this.carry !== null;
    this.carry = null;
    if (!text) return;
    this.d.send({ type: 'caption', who: 'candidate', turnSeq: this.seq + 1, text, final: true });
    if (!this.d.canStartTurn()) { this.end('tts_cap', true); return; }
    const next = this.newLive(text, atMs, false);
    next.carried = carried;
    next.speechEndAt = this.d.speechEndAt();
    this.setState('thinking', next.seq);
    this.playAck(next);
    this.lock = this.lock.then(() => this.execute(next)).catch(e => {
      this.d.send({ type: 'error', message: e instanceof Error ? e.message : 'turn failed' });
      this.setState('listening', next.seq);
    });
  }

  private newLive(text: string, finalAt: number, opening: boolean): Live {
    const t: Live = {
      seq: ++this.seq, text, carried: false, ack: null, opening, finalAt, speechEndAt: null, startedAt: null,
      entries: [], interruptedAt: null, report: null, waiters: [],
      firstSoundAt: null, firstUsefulAt: null, firstAcceptedAt: null, ttsFirstAudioAt: null,
      marks: {}, caption: [], backchannels: 0,
    };
    this.live = t;
    return t;
  }

  private playAck(t: Live): void {
    if (!shouldAcknowledge(t.text)) return;
    const ack = pickAck(`${this.d.sessionSeed}:${t.seq}`, this.lastAck);
    const pcm = this.d.ackPcm(ack);
    if (!pcm) return;
    this.lastAck = ack;
    t.ack = ack;
    const id = `${t.seq}:ack`;
    this.d.playout.open(id, { text: ack, interruptible: true, onStart: at => { t.firstSoundAt ??= at; } });
    this.d.playout.push(id, pcm);
    this.d.playout.finish(id);
  }

  private async execute(t: Live): Promise<void> {
    if (t.interruptedAt !== null) { this.writeRecord(t, null, true); return; } // cancelled while queued
    t.startedAt = this.d.now();
    try {
      const result = await this.d.runTurn(t.text, {
        onSegment: seg => this.accept(t, seg),
        heard: () => this.heardFor(t),
        acknowledged: t.ack ?? undefined,
        onTiming: marks => { t.marks = marks; },
      });
      this.d.afterTurn(result);
      await this.d.playout.whenIdle();              // scripted segments play out too
      this.writeRecord(t, result, false);
      this.d.send({ type: 'caption', who: 'interviewer', turnSeq: t.seq, text: t.report ? joinHeard(t.report) : t.caption.join(' '), final: true });
      if (result.ended) this.end('case_complete', Boolean(result.scoringSuppressed));
      else if (this.live === t) this.setState('listening', t.seq);
    } catch (e) {
      if (e instanceof TurnCancelled) { this.writeRecord(t, null, true); return; }
      throw e;
    }
  }

  // The sink (spec §5): resolves on acceptance; rejects once the turn was
  // interrupted, except a scripted segment, which always plays (§5.4).
  private async accept(t: Live, seg: Segment): Promise<void> {
    if (t.interruptedAt !== null && seg.kind !== 'scripted') throw new Error('interrupted');
    const text = seg.text.trim();
    if (!text && !seg.exhibitId) return;
    if (text && !this.d.ttsAllow(text.length)) throw new Error('tts cap');
    const id = `${t.seq}:${t.entries.length}`;
    let cancelled = false;
    t.entries.push({ id, seg, cancel: () => { cancelled = true; } });
    t.firstAcceptedAt ??= this.d.now();
    const useful = !t.opening && isUsefulSegment(seg);
    this.d.playout.open(id, {
      text, interruptible: seg.kind !== 'scripted',
      onStart: at => {
        t.firstSoundAt ??= at;
        if (useful) t.firstUsefulAt ??= at;
        if (this.live === t && this.state === 'thinking') this.setState('speaking', t.seq);
        const ex = seg.exhibitId ? this.d.exhibitById(seg.exhibitId) : null;
        if (ex) this.d.send({ type: 'exhibit', turnSeq: t.seq, exhibit: ex });
      },
      onWord: w => {
        t.caption.push(w.word);
        this.d.send({ type: 'caption', who: 'interviewer', turnSeq: t.seq, text: t.caption.join(' '), final: false });
      },
    });
    if (!text) { this.d.playout.finish(id); return; }
    void (async () => {
      try {
        const utt = await this.d.tts.open(this.d.format, { timestamps: true });
        t.entries.find(x => x.id === id)!.cancel = () => { cancelled = true; void utt.cancel().catch(() => {}); };
        if (cancelled) { await utt.cancel().catch(() => {}); return; }
        utt.onAudio((pcm, at) => { t.ttsFirstAudioAt ??= at; this.d.playout.push(id, pcm); });
        utt.onWords?.(ws => this.d.playout.words(id, ws));
        await utt.push(text);
        await utt.end();
        this.d.playout.finish(id);
      } catch {
        this.d.playout.fail(id);
        if (!cancelled) this.d.send({ type: 'error', message: 'audio failed' });
      }
    })();
  }

  private heardFor(t: Live): Promise<HeardReport> {
    if (t.report) return Promise.resolve(t.report);
    return new Promise(res => {
      t.waiters.push(res);
      void this.d.playout.whenIdle().then(() => {
        if (t.report) return;                        // interrupted meanwhile: already resolved
        t.report = {
          interrupted: false,
          segments: t.entries.map(x => ({ ...x.seg, ...this.d.playout.classify(x.id) })),
        };
        for (const w of t.waiters.splice(0)) w(t.report);
      });
    });
  }

  private interrupt(t: Live): void {
    const at = this.d.now();
    t.interruptedAt = at;
    const outcome = this.d.playout.interrupt(at);
    for (const x of t.entries) x.cancel();
    t.report = {
      interrupted: true,
      segments: t.entries.map(x => ({ ...x.seg, ...(outcome.get(x.id) ?? { playback: 'unplayed' as const, heardText: '' }) })),
    };
    if (isCancelledTurn(t.report) && t.text) this.carry = t.text;   // §5.3: nothing heard — carry it
    for (const w of t.waiters.splice(0)) w(t.report);
    this.setState('listening', t.seq);
  }

  private end(reason: 'case_complete' | 'tts_cap' | 'time_limit' | 'error', scoringSuppressed: boolean): void {
    this.setState('ended', this.seq);
    this.d.send({ type: 'ended', reason, scoringSuppressed });
  }

  private setState(state: VoiceState, turnSeq: number): void {
    if (this.state === 'ended') return;
    this.state = state;
    this.d.send({ type: 'state', state, turnSeq });
  }

  private writeRecord(t: Live, r: TurnResult | null, cancelled: boolean): void {
    if (t.opening) return;
    const from = t.speechEndAt;
    const rel = (x: number | null) => (x !== null && from !== null ? x - from : null);
    const rec: TurnRecord = {
      turnSeq: t.seq, at: new Date().toISOString(), candidateText: t.text, carried: t.carried, ack: t.ack,
      phase: r?.phase ?? null, ended: r?.ended ?? false,
      speechEndAt: from, finalAt: t.finalAt, endpointMs: from !== null ? t.finalAt - from : null,
      queueWaitMs: t.startedAt !== null ? t.startedAt - t.finalAt : 0,
      firstSoundMs: rel(t.firstSoundAt), firstUsefulMs: rel(t.firstUsefulAt),
      firstSegmentAcceptedMs: rel(t.firstAcceptedAt), ttsFirstAudioMs: rel(t.ttsFirstAudioAt),
      waits: classifierWaits(t.marks), marks: t.marks,
      interrupted: t.interruptedAt !== null, cancelled, backchannelsDropped: t.backchannels,
      droppedRevealIds: (t.report?.segments ?? []).filter(s => s.playback !== 'played').flatMap(s => s.revealIds),
    };
    this.d.record(rec);
    this.d.send({ type: 'latency', turnSeq: t.seq, firstSoundMs: rec.firstSoundMs, firstUsefulMs: rec.firstUsefulMs });
  }
}

const joinHeard = (r: HeardReport) => r.segments.map(s => s.heardText.trim()).filter(Boolean).join(' ');
```

- [ ] **Step 5: Run the controller tests and fix until green**

Run: `npx vitest run tests/voice`
Expected: PASS. These tests pin spec §5. If one fails, fix the controller; change a test only if it contradicts the spec, and flag that to the user. Then mutation-check: comment out the `hasPendingNonInterruptible()` guard and confirm the scripted test fails; set `bargeMinWords` to 1 and confirm the backchannel test fails; restore both.

- [ ] **Step 6: Full verification and commit**

Run: `npm run typecheck && npm test && npm run lint`
```bash
git add lib/voice tests/voice
git commit -m "feat(voice): turn controller — barge-in, cancel and carry, backchannels, scripted lines uninterruptible, word-synced captions, timing records

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint:** stop and report. Ask the user to review the controller against spec §5 before any LiveKit wiring.

---

### Task 4: LiveKit agent, token and end routes

**Prerequisites (user):** spec §12 has the commands: `npm install --save @livekit/rtc-node@^1.1.0` (already installed as a peer of `@livekit/agents`; this records it in package.json). LiveKit Cloud credentials are already in `.env.local` (`wss://` URL), so there is no local server and no `brew install`. No paid API calls in this task. A worker registering with Cloud uses no participant minutes until a session starts.

**Files:**
- Modify: `package.json` (dependency + `voice:agent` script), `.env.example`
- Create: `scripts/voice-agent.ts`, `lib/voice/livekit-agent.ts`, `lib/voice/livekit-media.ts`
- Create: `app/api/voice/[sessionId]/token/route.ts`, `app/api/voice/[sessionId]/end/route.ts`
- Test: `tests/voice/livekit-media.test.ts`, `tests/api/voice-token.test.ts`, `tests/api/voice-end.test.ts` (follow the mocking style of any existing route test; if none exists, mock `@/lib/supabase/server` and `@/db/client` with `vi.mock`, as in the runner tests)

**Interfaces:**
- Consumes: `VoiceTurnController`, `Playout`, `FrameSink`, `Clock`, `TtsCharBudget`, `monthlyLedgerFile`, `SpeechEndTracker`, `FakeTTS`, `CartesiaTTS`, `DeepgramFluxSTT`, `AGENT_NAME`, `DATA_TOPIC`, `parseClientMessage`, `summarize`; `runTurn`, `runPostTurnBackground`, `getCaseById`, `requireRunBudget`.
- Produces (livekit-media.ts): `pickCandidateTrack(ownerId: string, current: string | null, participantIdentity: string, trackSid: string): boolean`, `class LiveKitSink implements FrameSink`, `realClock: Clock`.
- Produces routes: `POST /api/voice/[sessionId]/token` → `{ url: string; token: string }` (401 / 404 / 409 when not active / 503 when LiveKit env missing); `POST /api/voice/[sessionId]/end` → `{ status }`.

- [ ] **Step 1: Prove the worker loads our TypeScript (spec §12 risk 1)**

Create `scripts/voice-agent.ts`:
```ts
// The M0 Phase B voice worker (spec 2026-10-08-voice-phase-b). Registers
// with the LiveKit server for explicit dispatch as AGENT_NAME; each job runs
// lib/voice/livekit-agent.ts. Run: npm run voice:agent (dev mode).
import path from 'node:path';
import { cli, WorkerOptions } from '@livekit/agents';
import { AGENT_NAME } from '@/lib/voice/protocol';

cli.runApp(new WorkerOptions({ agent: path.resolve('lib/voice/livekit-agent.ts'), agentName: AGENT_NAME }));
```
Create a temporary `lib/voice/livekit-agent.ts` with `export default defineAgent({ entry: async ctx => { console.log('[voice-agent] job', ctx.job.metadata); } });` (import `defineAgent` from `@livekit/agents`). Add the script:
`"voice:agent": "INTERVIEWER_PROVIDER=anthropic-haiku55-none-medium LLM_BUDGET_USD=${LLM_BUDGET_USD:-1.00} tsx --env-file=.env.local scripts/voice-agent.ts dev"`.
Run `npm run voice:agent` (it registers with your LiveKit Cloud project).
Expected: the worker logs that it registered with the server. **If job processes fail to load the `.ts` agent or its `@/` imports**, switch to the §3 fallback: `scripts/voice-agent.ts` connects with `new Room().connect(url, token)` for a room passed on its command line, and the token route spawns nothing (you start the agent by hand per session). Report the outcome before continuing.

- [ ] **Step 2: Failing tests for media helpers and routes**

`tests/voice/livekit-media.test.ts`:
```ts
import { it, expect } from 'vitest';
import { pickCandidateTrack } from '@/lib/voice/livekit-media';

it('uses only the session owner’s first audio track (Review Focus 4)', () => {
  expect(pickCandidateTrack('u1', null, 'u1', 'TR_a')).toBe(true);
  expect(pickCandidateTrack('u1', 'TR_a', 'u1', 'TR_b')).toBe(false);   // second tab
  expect(pickCandidateTrack('u1', null, 'intruder', 'TR_c')).toBe(false);
});
```
`tests/api/voice-token.test.ts` covers: 401 without a user; 404 for another user's session; 409 for a non-active session; it mints a token for the owner and dispatches once; **a second call does not dispatch again when the room already has a dispatch (Review Focus 3)**. Mock `livekit-server-sdk` with `vi.mock('livekit-server-sdk', () => ({ AccessToken: class { addGrant() {} async toJwt() { return 'jwt'; } }, AgentDispatchClient: class { listDispatch = listDispatch; createDispatch = createDispatch; } }))`, with `listDispatch`/`createDispatch` as `vi.fn`s declared via `vi.hoisted`.
`tests/api/voice-end.test.ts` covers: an active session becomes `abandoned` with `abandonPhase`; a completed session is untouched.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/voice/livekit-media.test.ts tests/api`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement `lib/voice/livekit-media.ts`**

```ts
// LiveKit glue that is testable without a room: which mic track is the
// candidate's, the AudioSource as a FrameSink, and the wall clock.
import { AudioFrame, type AudioSource } from '@livekit/rtc-node';
import type { Clock, FrameSink } from './playout';

// One candidate per room: the session owner's first audio track only (spec §9).
export function pickCandidateTrack(ownerId: string, current: string | null, identity: string, trackSid: string): boolean {
  return identity === ownerId && (current === null || current === trackSid);
}

export class LiveKitSink implements FrameSink {
  constructor(private source: AudioSource, private sampleRate: number) {}
  capture(frame: Int16Array): Promise<void> {
    return this.source.captureFrame(new AudioFrame(frame, this.sampleRate, 1, frame.length));
  }
  clear(): void { this.source.clearQueue(); }
}

export const realClock: Clock = {
  now: () => Date.now(),
  at: (ms, fn) => { const h = setTimeout(fn, Math.max(0, ms - Date.now())); return () => clearTimeout(h); },
};
```
Check the `AudioFrame` constructor signature: `grep -n "constructor" node_modules/@livekit/rtc-node/dist/audio_frame.d.ts`.

- [ ] **Step 5: Implement the routes**

`app/api/voice/[sessionId]/token/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { AGENT_NAME } from '@/lib/voice/protocol';

// A LiveKit token for the session owner, and one dispatch of the voice agent
// into the session's room (spec 2026-10-08-voice-phase-b §4). Server-only keys.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { sessionId } = await params;
  const session = await db.query.sessions.findFirst({ where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)) });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.status !== 'active') return NextResponse.json({ error: 'Session is not active' }, { status: 409 });
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
  if (!url || !key || !secret) return NextResponse.json({ error: 'Voice is not configured' }, { status: 503 });

  const room = `case-${sessionId}`;
  const at = new AccessToken(key, secret, { identity: user.id, ttl: '30m' });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
  const dispatcher = new AgentDispatchClient(url.replace(/^ws/, 'http'), key, secret);
  const existing = await dispatcher.listDispatch(room).catch(() => []);
  if (!existing.some(d => d.agentName === AGENT_NAME)) {
    await dispatcher.createDispatch(room, AGENT_NAME, { metadata: JSON.stringify({ sessionId }) });
  }
  return NextResponse.json({ url, token: await at.toJwt() });
}
```
Check `listDispatch`'s name and return type: `grep -n "listDispatch\|createDispatch" node_modules/livekit-server-sdk/dist/AgentDispatchClient.d.ts`.

`app/api/voice/[sessionId]/end/route.ts`: same auth and ownership; if `status === 'active'`, `db.update(sessions).set({ status: 'abandoned', completedAt: new Date(), abandonPhase: session.phase }).where(and(eq(sessions.id, sessionId), eq(sessions.status, 'active')))` and `logEvent('case_abandoned', { reason: 'candidate_ended_voice', phase: session.phase }, { sessionId, userId: user.id })`; return `{ status }`.

- [ ] **Step 6: Implement the job, `lib/voice/livekit-agent.ts`**

Replace the temporary file:
```ts
// One voice interview (spec 2026-10-08-voice-phase-b): joins the session's
// room, takes the owner's mic into Flux + the speech-end tracker, publishes
// the interviewer track, and runs the VoiceTurnController until the case ends,
// the candidate leaves, the time limit or a budget is hit.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { defineAgent, type JobContext } from '@livekit/agents';
import { AudioSource, AudioStream, LocalAudioTrack, RoomEvent, TrackKind, TrackPublishOptions, TrackSource, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication } from '@livekit/rtc-node';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions, sessionTurns } from '@/db/schema';
import { runTurn } from '@/lib/orchestrator/session-runner';
import { runPostTurnBackground } from '@/lib/orchestrator/post-turn';
import { getCaseById } from '@/lib/cases/loader';
import { requireRunBudget } from '@/lib/llm-budget';
import type { ExhibitDisplay } from '@/lib/orchestrator/turn-types';
import { DeepgramFluxSTT } from './deepgram';
import { CartesiaTTS, defaultVoiceId } from './cartesia';
import { FakeTTS } from './fake-tts';
import { ACKS } from './acknowledge';
import { Playout } from './playout';
import { SpeechEndTracker } from './pcm';
import { TtsCharBudget, monthlyLedgerFile } from './tts-budget';
import { VoiceTurnController } from './turn-controller';
import { DATA_TOPIC, parseClientMessage, type ServerMessage } from './protocol';
import { summarize, type TurnRecord } from './records';
import { LiveKitSink, pickCandidateTrack, realClock } from './livekit-media';
import type { TTSProvider } from './types';

const OUT_RATE = 24000, IN_RATE = 16000;
const env = (k: string, d: number) => Number(process.env[k] ?? d);

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const { sessionId } = JSON.parse(ctx.job.metadata || '{}') as { sessionId?: string };
    const session = sessionId ? await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) }) : null;
    if (!session || session.status !== 'active') { console.warn('[voice-agent] no active session', sessionId); return; }
    requireRunBudget('voice-agent');
    const caseData = getCaseById(session.caseId);
    await ctx.connect();
    const room = ctx.room;
    const enc = new TextEncoder();
    const send = (m: ServerMessage) => { void room.localParticipant?.publishData(enc.encode(JSON.stringify(m)), { reliable: true, topic: DATA_TOPIC }); };

    // Interviewer track.
    const source = new AudioSource(OUT_RATE, 1);
    const track = LocalAudioTrack.createAudioTrack('interviewer', source);
    await room.localParticipant!.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
    const playout = new Playout(new LiveKitSink(source, OUT_RATE), realClock, OUT_RATE);

    // TTS: Cartesia unless VOICE_TTS=fake; acknowledgments cached on disk.
    const fake = process.env.VOICE_TTS === 'fake';
    const tts: TTSProvider = fake ? new FakeTTS() : new CartesiaTTS(await defaultVoiceId());
    const budget = new TtsCharBudget(monthlyLedgerFile(), env('VOICE_TTS_CHAR_CAP', 90_000));
    const acks = new Map<string, Uint8Array>();
    for (const ack of ACKS) {
      const file = path.join('.voice-cache/acks', `${tts.name}-${process.env.CARTESIA_VOICE_ID ?? 'default'}-${createHash('sha1').update(ack).digest('hex').slice(0, 10)}.pcm`);
      if (existsSync(file)) { acks.set(ack, new Uint8Array(readFileSync(file))); continue; }
      if (!budget.take(ack.length)) break;
      const utt = await tts.open({ encoding: 'pcm_s16le', sampleRate: OUT_RATE });
      const parts: Uint8Array[] = []; utt.onAudio(p => parts.push(p));
      await utt.push(ack); await utt.end();
      const pcm = Buffer.concat(parts); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, pcm);
      acks.set(ack, new Uint8Array(pcm));
    }

    // Records.
    const day = new Date().toISOString().slice(0, 10);
    const recFile = path.join('Case Interview Runs/voice-live', day, `${sessionId}.jsonl`);
    mkdirSync(path.dirname(recFile), { recursive: true });
    const records: TurnRecord[] = [];
    const record = (r: TurnRecord) => { records.push(r); appendFileSync(recFile, JSON.stringify(r) + '\n'); console.log(`[voice] t${r.turnSeq} firstSound=${r.firstSoundMs}ms firstUseful=${r.firstUsefulMs}ms endpoint=${r.endpointMs}ms waits=${JSON.stringify(r.waits)}${r.interrupted ? ' INTERRUPTED' : ''}${r.cancelled ? ' CANCELLED' : ''}`); };

    // Turns.
    const background: Promise<unknown>[] = [];
    let phase = session.phase;
    const vad = new SpeechEndTracker();
    const exhibits = new Map<string, ExhibitDisplay>(caseData.exhibits.map(e => [e.id, { id: e.id, title: e.title, chartType: e.chartType, data: e.data as Record<string, unknown>[] }]));
    const controller = new VoiceTurnController({
      now: () => Date.now(), clock: realClock, playout, tts, format: { encoding: 'pcm_s16le', sampleRate: OUT_RATE },
      runTurn: (text, o) => runTurn(session.id, text, { ...o, defer: task => { background.push(task().catch(() => {})); } }),
      afterTurn: result => { const p = phase; phase = result.phase; background.push(runPostTurnBackground({ sessionId: session.id, userId: session.userId, caseId: session.caseId, phase: p, result })); },
      ackPcm: ack => acks.get(ack) ?? null, exhibitById: id => exhibits.get(id) ?? null,
      send, record, speechEndAt: () => vad.lastVoicedAt,
      ttsAllow: n => budget.take(n), canStartTurn: () => budget.canStartTurn(),
      bargeMinWords: env('VOICE_BARGE_MIN_WORDS', 2), sessionSeed: session.id,
    });

    // Candidate mic → Flux + VAD.
    const stt = await new DeepgramFluxSTT({ eotThreshold: 0.7, eagerEotThreshold: 0.5 }).open({ encoding: 'pcm_s16le', sampleRate: IN_RATE });
    stt.onSignal(s => controller.onStt(s));
    let micSid: string | null = null;
    room.on(RoomEvent.TrackSubscribed, (t: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (t.kind !== TrackKind.KIND_AUDIO || !pickCandidateTrack(session.userId, micSid, p.identity, pub.sid!)) return;
      micSid = pub.sid!;
      void (async () => {
        for await (const frame of new AudioStream(t, { sampleRate: IN_RATE, numChannels: 1 })) {
          const pcm = frame.data;
          vad.push(pcm, Date.now());
          stt.push(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
        }
      })();
    });

    // Browser back-channel: ready (audio unlocked) and client timing.
    const opening = (await db.query.sessionTurns.findMany({ where: eq(sessionTurns.sessionId, session.id), orderBy: [asc(sessionTurns.turnIndex)] })).filter(r => r.role === 'interviewer').at(-1)?.text ?? '';
    room.on(RoomEvent.DataReceived, (payload: Uint8Array, p?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== DATA_TOPIC || p?.identity !== session.userId) return;
      const m = parseClientMessage(new TextDecoder().decode(payload));
      if (m?.type === 'ready') void controller.ready(opening);
      if (m?.type === 'timing') { const r = records.find(x => x.turnSeq === m.turnSeq); if (r) { r.clientFirstSoundMs = m.clientFirstSoundMs; appendFileSync(recFile, JSON.stringify({ turnSeq: m.turnSeq, clientFirstSoundMs: m.clientFirstSoundMs }) + '\n'); } }
    });

    // Shutdown: candidate leaves, time limit, or the job ends.
    const finish = async (why: string) => {
      controller.close();
      await stt.close();
      await controller.idle().catch(() => {});
      await Promise.allSettled(background);
      const summary = { why, ...summarize(records), ttsCharsUsedThisMonth: budget.used };
      appendFileSync(recFile, JSON.stringify({ summary }) + '\n');
      console.log('[voice] session summary', JSON.stringify(summary));
    };
    const limit = setTimeout(() => { send({ type: 'ended', reason: 'time_limit', scoringSuppressed: true }); void finish('time_limit').then(() => ctx.shutdown('time limit')); }, env('VOICE_MAX_SESSION_MIN', 25) * 60_000);
    room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      if (p.identity !== session.userId) return;
      clearTimeout(limit);
      void finish('candidate_left').then(() => ctx.shutdown('candidate left'));
    });
  },
});
```
Before relying on them, check these names against the installed `.d.ts` files: `JobContext.shutdown`, `RoomEvent.DataReceived` handler arguments, the `AudioStream` options object, `TrackPublishOptions`/`TrackSource` exports, and `RemoteTrackPublication.sid`. Commands: `grep -n "shutdown\|DataReceived\|interface AudioStreamOptions\|export.*TrackSource" node_modules/@livekit/agents/dist/job.d.ts node_modules/@livekit/rtc-node/dist/*.d.ts`. Adjust the call sites, not the behavior.

- [ ] **Step 7: `.env.example` additions**

```
# Voice M0 Phase B. LiveKit Cloud project (wss:// URL from the project settings; key/secret server-only):
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
VOICE_DEV=1                    # show the voice link on the case page
VOICE_TTS=fake                 # fake | (unset = Cartesia)
VOICE_TTS_CHAR_CAP=90000       # monthly Cartesia characters (Pro = 100K)
VOICE_BARGE_MIN_WORDS=2
VOICE_MAX_SESSION_MIN=25
```
(The existing empty `LIVEKIT_*` lines are replaced, not duplicated.)

- [ ] **Step 8: Verify (free)**

Run: `npm run typecheck && npm test && npm run lint && npm run build`
Then `VOICE_TTS=fake npm run voice:agent` should register with your Cloud project with no errors. No session is started, so nothing is billed.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json .env.example scripts/voice-agent.ts lib/voice app/api/voice tests/voice tests/api
git commit -m "feat(voice): LiveKit worker and job, token and end routes (localhost, Haiku 5.5 interviewer in the agent only)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint:** stop and report.

---

### Task 5: Browser voice page + first live smoke on fake TTS

**Files:**
- Create: `components/exhibit-table.tsx` (moved from `components/chat-window.tsx:17-50`), `components/voice-room.tsx`, `app/case/[sessionId]/voice/page.tsx`
- Modify: `components/chat-window.tsx` (import `ExhibitTable`), `app/case/[sessionId]/page.tsx` (voice link when `process.env.VOICE_DEV === '1'`)
- Test: `tests/components/voice-room.test.tsx` (vitest + `@vitejs/plugin-react` is configured; check `vitest.config.ts` for a jsdom environment. If none is set, use `// @vitest-environment jsdom` per file, which needs `jsdom` — **ask before adding it**; otherwise test only the pure helpers exported from `voice-room.tsx`).

**Interfaces:**
- Consumes: `ServerMessage`, `ClientMessage`, `DATA_TOPIC`, `ExhibitDisplay`; routes from Task 4; `POST /api/channel/[id]/score`.
- Produces: `applyMessage(view: VoiceView, m: ServerMessage): VoiceView` (a pure reducer exported for tests), `<VoiceRoom sessionId casePrompt />`.

- [ ] **Step 1: Failing reducer test** (`tests/components/voice-room.test.tsx`)

```ts
import { it, expect } from 'vitest';
import { applyMessage, initialView } from '@/components/voice-room';

it('keeps one interviewer caption per turn, ignores stale turns, shows exhibits and the end state', () => {
  let v = initialView;
  v = applyMessage(v, { type: 'caption', who: 'interviewer', turnSeq: 2, text: 'There are', final: false });
  v = applyMessage(v, { type: 'caption', who: 'interviewer', turnSeq: 2, text: 'There are 120 stores.', final: true });
  v = applyMessage(v, { type: 'caption', who: 'interviewer', turnSeq: 1, text: 'stale', final: false });
  expect(v.captions.filter(c => c.who === 'interviewer').map(c => c.text)).toEqual(['There are 120 stores.']);
  v = applyMessage(v, { type: 'exhibit', turnSeq: 2, exhibit: { id: 'exhibit-a', title: 'Costs', chartType: 'table', data: [] } });
  expect(v.exhibits.map(e => e.id)).toEqual(['exhibit-a']);
  v = applyMessage(v, { type: 'ended', reason: 'case_complete', scoringSuppressed: false });
  expect(v.state).toBe('ended'); expect(v.canScore).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/components/voice-room.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`components/exhibit-table.tsx`: move `ExhibitTable` from `chat-window.tsx` unchanged and export it; `chat-window.tsx` imports it.

`components/voice-room.tsx` (`'use client'`):
- Exports `type VoiceView = { state: VoiceState | 'idle' | 'connecting'; captions: { who; turnSeq; text; final }[]; exhibits: ExhibitDisplay[]; latency: { firstSoundMs; firstUsefulMs } | null; canScore: boolean; error: string | null }`, `initialView`, `applyMessage` (pure reducer):
  - `caption` replaces the entry with the same `who` + `turnSeq`, else appends.
  - Interviewer messages older than the newest interviewer `turnSeq` seen are ignored.
  - The list is trimmed to the last 8 entries.
  - `exhibit` is appended if new; `state` sets the state; `latency` sets latency.
  - `ended` sets `state: 'ended'` and `canScore = reason === 'case_complete' && !scoringSuppressed`.
  - `error` sets the error.
- Component, from `livekit-client`:
  - Start button → `POST /api/voice/${sessionId}/token` → `const room = new Room({ adaptiveStream: false })`.
  - `room.on(RoomEvent.DataReceived, (payload, _p, _k, topic) => topic === DATA_TOPIC && dispatch(JSON.parse(decode(payload))))`.
  - `room.on(RoomEvent.TrackSubscribed, track => { if (track.kind === Track.Kind.Audio) { const el = track.attach(); document.body.appendChild(el); watchRemote(track.mediaStreamTrack); } })`.
  - Then `await room.connect(url, token)`, `await room.startAudio()`, and `await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true })`.
  - If `room.canPlaybackAudio` is true, publish `{ type: 'ready' }` on `DATA_TOPIC`. Otherwise show "Click to enable audio", which calls `room.startAudio()` and then sends `ready`.
- Client cross-check: a Web Audio `AnalyserNode` on the local mic track and one on the remote track, sampled every 20ms.
  - On `state` → `thinking`: take `lastMicLoudAt`.
  - On the first remote level > threshold after it: publish `{ type: 'timing', turnSeq, clientFirstSoundMs }`.
- End button → `POST /api/voice/${sessionId}/end` → `room.disconnect()` → state `ended`.
- Score button (only when `canScore`) → `POST /api/channel/${sessionId}/score` → `router.push(`/case/${sessionId}/report`)`.
- On screen: a state pill; a fixed "Use headphones — the interviewer's voice on speakers can interrupt itself." notice (Review Focus 2); captions; exhibits via `ExhibitTable`; the case prompt in a `<details>`; and a debug strip `first sound {x}ms · first useful {y}ms`.

`app/case/[sessionId]/voice/page.tsx`: the same server-side auth, ownership and `notFound()` as `app/case/[sessionId]/page.tsx`. Render `<VoiceRoom sessionId={sessionId} casePrompt={casePrompt} />`; if `session.status !== 'active'`, render a link to the report instead. On the case page, show a `Voice (dev)` link when `process.env.VOICE_DEV === '1'`.

- [ ] **Step 4: Tests, typecheck, lint, build**

Run: `npx vitest run tests/components && npm run typecheck && npm test && npm run lint && npm run build`
Expected: PASS. Confirm that no server-only module reaches the client bundle: `grep -rl "dataLedger\|answer_key\|rubric_anchors" .next/static | head` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add components app tests/components
git commit -m "feat(voice): minimal voice page — mic, interviewer audio, captions, exhibits, end, optional scoring, client timing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Live smoke on fake TTS — PAID, ask first**

Estimate to give the user: ~3 short sessions × (Flux ~2–3 min ≈ $0.02 + Haiku turns ≈ $0.02) ≈ **$0.15**, with `LLM_BUDGET_USD=0.50`. LiveKit Cloud minutes are within the free Build plan (spec §9). With go-ahead, run two terminals:
1. `VOICE_TTS=fake npm run voice:agent`
2. `npm run dev`

Then sign in, start prof-001 with a club code, open `/case/<id>/voice` with headphones on, and run ~5 turns. Check:
- you hear the tone (the "voice") and captions advance word by word;
- talking over a long tone stops it within ~0.5s;
- a one-word "mhm" does not stop it;
- the exhibit appears when its tone starts;
- End marks the session abandoned;
- the JSONL record and summary exist.

Read the DB rows for the session by hand (spec §11 item 2 subset) and report.

**Checkpoint:** stop and report the smoke results.

---

### Task 6: Listening gate on Cartesia — PAID, its own approved budget

**Prerequisites (user):**
- Cartesia is already upgraded (no purchase). Overages stay **off**; `CARTESIA_API_KEY` / `CARTESIA_VOICE_ID` are in `.env.local`.
- Go-ahead on this step's own budget: 3 full interviews + 1 barge-in drill ≈ LLM $0.45 (`LLM_BUDGET_USD=1.00` per session), Flux ≈ $0.80, Cartesia `VOICE_TTS_RUN_CAP` ≈ 15K per session (≈15–40K total). Optional scoring is +$0.45 per scored interview. The upgrade is not a test budget.

**Files:**
- Create: `Case Interview Runs/voice-live/<date>/gate.md` (results; not committed unless the user asks)
- Modify: `.superpowers/sdd/progress.md`

- [ ] **Step 1: Barge-in drill (one session)**

Interrupt deliberately: (a) during the ack, (b) mid-`say`, (c) mid-data-line, (d) mid-question, (e) during a scripted line. To reach (e), say a distress phrase from the C5 lexicon used in the persona runs; you can decline the pause after. After each case, check the DB against spec §5:
- `revealed_data` contains no item from a cut data line;
- `exhibits_shown` matches what was on screen;
- the saved interviewer line equals the heard words;
- `flags.lastQuestion` and `flags.pressureTest` follow §5.2;
- a `voice_heard` check event exists.

- [ ] **Step 2: Three full interviews** (opening to close, natural pace), headphones on.

- [ ] **Step 3: FR-4 check**

For each session, run the existing audit over the saved interviewer lines; it should find zero unrevealed numbers. Confirm by reading that no caption showed a figure missing from `revealed_data`.

- [ ] **Step 4: Results**

Write `gate.md`:
- per session, the JSONL summary: endpoint, first sound and first useful medians/p90s; agent vs client first sound; classifier waits; interruptions, cancellations and backchannels;
- spend from the meter, Cartesia characters and Flux minutes;
- what it felt like, in your words.

- [ ] **Step 5: Progress, PRD flags, commit**

Add a "M0 Phase B" entry to `.superpowers/sdd/progress.md` and update "Where things stand". List the PRD sections that need updating (spec §12): §8.3, §8.5, §12 step 7, §1 TTS row, §3 repo map. Don't edit the PRD without the user's OK. Run `npm run typecheck && npm test && npm run lint`, then:
```bash
git add .superpowers/sdd/progress.md
git commit -m "docs(progress): M0 Phase B local voice gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Checkpoint:** report results; the user decides what's next.
