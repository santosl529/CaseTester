// The voice turn loop (spec 2026-10-08-voice-phase-b §5). Flux signals in;
// one runTurn per candidate turn, one at a time; segments → TTS (one context
// per segment) → Playout. It answers runTurn's heard() from the playout
// clock (estimated) and the browser's exhibit confirmations (confirmed), and
// owns barge-in, cancellation with carry, backchannels, scripted lines,
// audio blocked, End, captions on the heard cursor and per-turn timing.
// Everything external is injected; the LiveKit job wires the real ones.
import {
  TurnCancelled, isUsefulSegment,
  type ExhibitDisplay, type HeardReport, type Segment, type TurnResult,
} from '@/lib/orchestrator/turn-types';
import { HEARD_MARGIN_MS, type Clock, type Outcome, type Playout } from './playout';
import type { PcmFormat, SttEvent, TTSProvider } from './types';
import type { ServerMessage, VoiceState } from './protocol';
import { classifierWaits, type TurnRecord } from './records';
import { pickAck, shouldAcknowledge } from './acknowledge';

// How long heard() waits for the browser to confirm an exhibit it was sent.
export const EXHIBIT_CONFIRM_MS = 1500;

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
  afterTurn: (r: TurnResult) => void;            // post-turn background passes
  tts: TTSProvider;
  format: PcmFormat;
  playout: Playout;
  ackPcm: (ack: string) => Uint8Array | null;    // cached at job start; null = no ack
  exhibitById: (id: string) => ExhibitDisplay | null;
  send: (m: ServerMessage) => void;
  record: (r: TurnRecord) => void;
  speechEndAt: () => number | null;              // SpeechEndTracker
  ttsAllow: (chars: number) => boolean;          // run cap + monthly ledger
  canStartTurn: () => boolean;                   // the ledger's reserve
  bargeMinWords: number;
  sessionSeed: string;
  // Optional: the turn-taking decisions as they happen (session recording).
  trace?: (type: string, data?: Record<string, unknown>) => void;
};

type Entry = {
  id: string; seg: Segment; heardChars: number; shownFull: boolean;
  exhibitSentAt: number | null; exhibitConfirmed: boolean;
  cancel: () => void;
};
type CutKind = 'barge' | 'blocked' | 'end';
type Live = {
  seq: number; text: string; carried: boolean; replaces: number | null; opening: boolean;
  ack: string | null; prevAck: string | null;
  finalAt: number; speechEndAt: number | null; startedAt: number | null;
  entries: Entry[];
  cutAt: number | null; cutKind: CutKind | null; cutOutcome: Map<string, Outcome> | null;
  finalizing: boolean; report: HeardReport | null; waiters: ((r: HeardReport) => void)[];
  firstSoundAt: number | null; firstUsefulAt: number | null; firstAcceptedAt: number | null; ttsFirstAudioAt: number | null;
  marks: Record<string, number>; backchannels: number;
};

const join = (...parts: (string | null)[]) => parts.map(p => p?.trim()).filter(Boolean).join(' ');

export class VoiceTurnController {
  private state: VoiceState = 'waiting';
  private blocked = false;
  private seq = 0;
  private live: Live | null = null;
  private recent = new Map<number, Live>();      // for late exhibit confirmations
  private lock: Promise<void> = Promise.resolve();
  private carry: { text: string; seq: number } | null = null;   // barge-in before anything was heard
  private pending: string | null = null;                        // audio blocked before anything was heard
  private lastAck: string | null = null;

  constructor(private d: ControllerDeps) {}

  // The browser can play audio (§5.1). The first time, the opening (already
  // persisted) is replayed, interruptible and unbooked; after audio_blocked,
  // a turn nobody heard runs again.
  async ready(opening: string): Promise<void> {
    if (this.state === 'ended') return;
    if (this.blocked) {
      this.blocked = false;
      this.setState('listening', this.seq);
      const text = this.pending;
      this.pending = null;
      if (text) this.startTurn(text, { carried: true, replaces: null });
      return;
    }
    if (this.state !== 'waiting') return;
    this.setState('listening', 0);
    if (!opening.trim()) return;
    const t = this.newLive('', this.d.now(), true);
    this.setState('thinking', t.seq);
    await this.accept(t, { kind: 'say', text: opening, revealIds: [] });
    void this.d.playout.whenIdle().then(() => {
      if (this.live === t && t.cutAt === null) this.setState('listening', t.seq);
    });
  }

  // The browser can no longer play audio: a cut without a carry; silent until ready.
  audioBlocked(): void {
    if (this.state === 'ended' || this.blocked) return;
    const t = this.live;
    if (t && t.cutAt === null && (this.state === 'thinking' || this.state === 'speaking')) this.cut(t, 'blocked');
    this.blocked = true;
    this.setState('waiting', this.seq);
  }

  // The browser rendered an exhibit (§5.3). Late (after the report) → withdraw.
  exhibitShown(turnSeq: number, exhibitId: string): void {
    const t = this.recent.get(turnSeq);
    if (!t) return;
    const e = t.entries.find(x => x.seg.exhibitId === exhibitId && x.exhibitSentAt !== null);
    if (!e) return;
    if (t.report) {
      if (!e.exhibitConfirmed) this.d.send({ type: 'exhibit_withdraw', turnSeq, exhibitId });
      return;
    }
    e.exhibitConfirmed = true;
    if (t.finalizing) this.tryFinalize(t);
  }

  onStt(e: SttEvent): void {
    if (this.state === 'ended') return;
    if (this.blocked) {
      if (e.kind === 'final') this.pending = join(this.pending, e.transcript);
      return;
    }
    if (this.state === 'waiting') return;
    if (e.kind === 'speech') {
      if (e.transcript) this.d.send({ type: 'caption', who: 'candidate', turnSeq: this.seq + 1, text: e.transcript, final: false });
      this.maybeBargeIn(e.words);
      return;
    }
    if (e.kind === 'final') this.onFinal(e.transcript, e.atMs);
    // eager / resumed: speculation is off (spec §2).
  }

  idle(): Promise<void> { return this.lock; }

  // End or disconnect: cut whatever is playing (no carry); nothing more starts.
  close(): void {
    const t = this.live;
    if (t && t.cutAt === null && (this.state === 'thinking' || this.state === 'speaking')) this.cut(t, 'end');
    this.state = 'ended';
  }

  private maybeBargeIn(words: number): void {
    const t = this.live;
    if (!t || t.cutAt !== null || this.d.playout.hasPendingNonInterruptible()) return;
    const anyStarted = t.entries.some(x => this.d.playout.started(x.id));
    if (this.state === 'thinking' && !anyStarted && words >= 1) this.cut(t, 'barge');
    else if (this.state === 'speaking' && anyStarted && words >= this.d.bargeMinWords) this.cut(t, 'barge');
  }

  private onFinal(transcript: string, atMs: number): void {
    const t = this.live;
    const scripted = this.d.playout.hasPendingNonInterruptible();
    if (t && t.cutAt === null && !scripted) {
      if (this.state === 'speaking') { t.backchannels++; this.d.trace?.('backchannel', { seq: t.seq, text: transcript }); return; }  // §5.7: no barge-in, so a backchannel
      if (this.state === 'thinking') this.cut(t, 'barge');         // a continuation before anything was heard
    }
    const carry = this.carry;
    this.carry = null;
    const text = join(carry?.text ?? null, transcript);
    if (!text) return;
    this.d.trace?.('final', { text: transcript, carried: carry?.text ?? null });
    if (!this.d.canStartTurn()) { this.end('tts_cap', true); return; }
    this.startTurn(text, { carried: carry !== null, replaces: carry?.seq ?? null, finalAt: atMs });
  }

  private startTurn(text: string, o: { carried: boolean; replaces: number | null; finalAt?: number }): void {
    const t = this.newLive(text, this.d.now(), false);
    t.carried = o.carried;
    t.replaces = o.replaces;
    t.speechEndAt = this.d.speechEndAt();
    this.d.trace?.('turn_start', { seq: t.seq, text, speechEndAt: t.speechEndAt });
    this.d.send({ type: 'caption', who: 'candidate', turnSeq: t.seq, text, final: true, ...(o.replaces !== null ? { replaces: o.replaces } : {}) });
    if (!this.d.playout.hasPendingNonInterruptible()) {
      this.setState('thinking', t.seq);
      this.playAck(t);
    }
    this.lock = this.lock.then(() => this.execute(t)).catch(e => {
      this.d.send({ type: 'error', message: e instanceof Error ? e.message : 'turn failed' });
      if (this.live === t) this.setState('listening', t.seq);
    });
  }

  private newLive(text: string, finalAt: number, opening: boolean): Live {
    const t: Live = {
      seq: ++this.seq, text, carried: false, replaces: null, opening, ack: null, prevAck: this.lastAck,
      finalAt, speechEndAt: null, startedAt: null, entries: [],
      cutAt: null, cutKind: null, cutOutcome: null, finalizing: false, report: null, waiters: [],
      firstSoundAt: null, firstUsefulAt: null, firstAcceptedAt: null, ttsFirstAudioAt: null,
      marks: {}, backchannels: 0,
    };
    this.live = t;
    this.recent.set(t.seq, t);
    for (const k of this.recent.keys()) if (k < t.seq - 8) this.recent.delete(k);
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
    this.d.playout.open(id, { text: ack, interruptible: true, onStart: at => { t.firstSoundAt ??= at; this.d.trace?.('ack_start', { seq: t.seq, ack, at }); } });
    this.d.playout.push(id, pcm);
    this.d.playout.finish(id);
  }

  private async execute(t: Live): Promise<void> {
    if (t.cutAt !== null || this.state === 'ended') { this.writeRecord(t, null, true); return; } // cut while queued
    t.startedAt = this.d.now();
    let result: TurnResult;
    try {
      result = await this.d.runTurn(t.text, {
        onSegment: seg => this.accept(t, seg),
        heard: () => this.heardFor(t),
        acknowledged: t.ack ?? undefined,
        onTiming: marks => { t.marks = marks; },
      });
    } catch (e) {
      if (e instanceof TurnCancelled) {
        if (this.lastAck === t.ack) this.lastAck = t.prevAck;   // §5.5: an unheard turn's ack doesn't count
        this.writeRecord(t, null, true);
        return;
      }
      throw e;
    }
    this.d.afterTurn(result);
    await this.d.playout.whenIdle();
    // The turn is over once its last word counts as heard (the heard cursor).
    if (t.cutAt === null) await new Promise<void>(r => this.d.clock.at(this.d.now() + HEARD_MARGIN_MS, r));
    this.writeRecord(t, result, false);
    this.d.send({ type: 'caption', who: 'interviewer', turnSeq: t.seq, text: this.captionText(t), final: true });
    if (result.ended) this.end('case_complete', Boolean(result.scoringSuppressed));
    else if (this.live === t && t.cutAt === null) this.setState('listening', t.seq);
  }

  // The sink: resolves on acceptance (the stream stays pipelined); rejects once
  // the turn was cut — except a scripted line, which still plays (§5.6) unless
  // the session ended or audio is blocked.
  private async accept(t: Live, seg: Segment): Promise<void> {
    if (this.state === 'ended' || this.blocked) throw new Error('not speaking');
    if (t.cutAt !== null && seg.kind !== 'scripted') throw new Error('cut');
    const text = seg.text.trim();
    if (!text && !seg.exhibitId) return;
    if (text && !this.d.ttsAllow(text.length)) throw new Error('tts cap');
    const e: Entry = { id: `${t.seq}:${t.entries.length}`, seg, heardChars: 0, shownFull: false, exhibitSentAt: null, exhibitConfirmed: false, cancel: () => {} };
    t.entries.push(e);
    t.firstAcceptedAt ??= this.d.now();
    const useful = !t.opening && isUsefulSegment(seg);
    const scripted = seg.kind === 'scripted';
    this.d.playout.open(e.id, {
      text: seg.text, interruptible: !scripted, trimLeadingSilence: true,   // TTS pads ~150ms of lead-in
      onStart: at => {
        this.d.trace?.('segment_start', { seq: t.seq, kind: seg.kind, text: seg.text, at });
        t.firstSoundAt ??= at;
        if (useful) t.firstUsefulAt ??= at;
        if (this.live === t && this.state === 'thinking') this.setState('speaking', t.seq);
        // A scripted line carries no case figures: shown in full when it starts.
        if (scripted) { e.shownFull = true; this.sendCaption(t); }
        const ex = seg.exhibitId ? this.d.exhibitById(seg.exhibitId) : null;
        if (ex) { e.exhibitSentAt = at; this.d.send({ type: 'exhibit', turnSeq: t.seq, exhibit: ex }); }
      },
      onHeard: chars => { e.heardChars = chars; this.sendCaption(t); },
    });
    if (!text) { this.d.playout.finish(e.id); return; }
    let cancelled = false;
    e.cancel = () => { cancelled = true; };
    void (async () => {
      try {
        const utt = await this.d.tts.open(this.d.format, { timestamps: true });
        e.cancel = () => { cancelled = true; void utt.cancel().catch(() => {}); };
        if (cancelled) { await utt.cancel().catch(() => {}); return; }
        utt.onAudio((pcm, at) => { t.ttsFirstAudioAt ??= at; this.d.playout.push(e.id, pcm); });
        utt.onWords?.(ws => this.d.playout.words(e.id, ws));
        await utt.push(text);
        await utt.end();
        this.d.playout.finish(e.id);
      } catch {
        this.d.playout.fail(e.id);
        if (!cancelled) this.d.send({ type: 'error', message: 'audio failed' });
      }
    })();
  }

  // heard() for runTurn (§5.2): when the turn's audio has played, or at once
  // after a cut — then the exhibit confirmations, up to EXHIBIT_CONFIRM_MS.
  private heardFor(t: Live): Promise<HeardReport> {
    if (t.report) return Promise.resolve(t.report);
    return new Promise(res => {
      t.waiters.push(res);
      const lateEntries = t.cutOutcome !== null && t.entries.some(e => !t.cutOutcome!.has(e.id));
      if (t.cutAt !== null && !lateEntries) this.beginFinalize(t);
      else void this.d.playout.whenIdle().then(() => {
        // The audio is over: the candidate's next words are an answer, not a
        // backchannel, even while the runner is still saving this turn.
        if (this.live === t && t.cutAt === null && this.state === 'speaking') this.setState('listening', t.seq);
        this.beginFinalize(t);
      });
    });
  }

  private beginFinalize(t: Live): void {
    if (t.report || t.finalizing) return;
    t.finalizing = true;
    const sent = t.entries.filter(e => e.exhibitSentAt !== null && !e.exhibitConfirmed);
    if (sent.length > 0) {
      const deadline = Math.max(...sent.map(e => e.exhibitSentAt!)) + EXHIBIT_CONFIRM_MS;
      this.d.clock.at(Math.max(deadline, this.d.now()), () => this.finalize(t));
    }
    this.tryFinalize(t);
  }

  private tryFinalize(t: Live): void {
    if (t.entries.every(e => e.exhibitSentAt === null || e.exhibitConfirmed)) this.finalize(t);
  }

  private finalize(t: Live): void {
    if (t.report) return;
    const outcome = (e: Entry): Outcome => t.cutOutcome?.get(e.id) ?? this.d.playout.classify(e.id);
    t.report = {
      interrupted: t.cutAt !== null,
      segments: t.entries.map(e => ({ ...e.seg, ...outcome(e), exhibitShown: e.exhibitConfirmed })),
    };
    for (const e of t.entries) {
      if (e.exhibitSentAt !== null && !e.exhibitConfirmed) {
        this.d.send({ type: 'exhibit_withdraw', turnSeq: t.seq, exhibitId: e.seg.exhibitId! });
      }
    }
    for (const w of t.waiters.splice(0)) w(t.report);
  }

  private cut(t: Live, kind: CutKind): void {
    const at = this.d.now();
    t.cutAt = at;
    t.cutKind = kind;
    t.cutOutcome = this.d.playout.interrupt(at);
    this.d.trace?.('cut', { seq: t.seq, kind, at, heard: t.entries.map(e => ({ kind: e.seg.kind, ...t.cutOutcome!.get(e.id) })) });
    for (const e of t.entries) e.cancel();
    const nothing = t.entries.every(e => (t.cutOutcome!.get(e.id)?.heardChars ?? 0) === 0 && e.exhibitSentAt === null);
    if (nothing && t.text && !t.opening) {
      if (kind === 'barge') this.carry = { text: t.text, seq: t.seq };   // §5.5: carried into the next final
      if (kind === 'blocked') this.pending = join(this.pending, t.text); // re-run after ready
    }
    if (t.waiters.length > 0) this.beginFinalize(t);
    if (kind === 'barge') this.setState('listening', t.seq);
  }

  private captionText(t: Live): string {
    return t.entries
      .map(e => (e.shownFull ? e.seg.text : e.seg.text.slice(0, e.heardChars)).trim())
      .filter(Boolean).join(' ');
  }

  private sendCaption(t: Live): void {
    this.d.send({ type: 'caption', who: 'interviewer', turnSeq: t.seq, text: this.captionText(t), final: false });
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
      turnSeq: t.seq, at: new Date(this.d.now()).toISOString(), candidateText: t.text, carried: t.carried, ack: t.ack,
      phase: r?.phase ?? null, ended: r?.ended ?? false,
      speechEndAt: from, finalAt: t.finalAt, endpointMs: from !== null ? t.finalAt - from : null,
      queueWaitMs: t.startedAt !== null ? t.startedAt - t.finalAt : 0,
      firstSoundMs: rel(t.firstSoundAt), firstUsefulMs: rel(t.firstUsefulAt),
      firstSegmentAcceptedMs: rel(t.firstAcceptedAt), ttsFirstAudioMs: rel(t.ttsFirstAudioAt),
      waits: classifierWaits(t.marks), marks: t.marks,
      interrupted: t.cutAt !== null, cancelled, backchannelsDropped: t.backchannels,
      segments: (t.report?.segments ?? []).map(s => ({ kind: s.kind, playback: s.playback, heardChars: s.heardChars, exhibitShown: s.exhibitShown })),
    };
    this.d.record(rec);
    this.d.trace?.('turn_end', { seq: t.seq, cancelled, interrupted: rec.interrupted, firstSoundMs: rec.firstSoundMs, firstUsefulMs: rec.firstUsefulMs });
    this.d.send({ type: 'latency', turnSeq: t.seq, firstSoundMs: rec.firstSoundMs, firstUsefulMs: rec.firstUsefulMs });
  }
}
