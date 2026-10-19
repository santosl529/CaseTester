// The voice turn controller against spec 2026-10-08-voice-phase-b §5: what
// the candidate heard, barge-in, cancellation and carry, scripted lines,
// exhibit confirmation, audio blocked, End. Fake clock, fake TTS, scripted runner.
import { describe, it, expect } from 'vitest';
import { Playout } from '@/lib/voice/playout';
import { FakeTTS } from '@/lib/voice/fake-tts';
import { VoiceTurnController, EXHIBIT_CONFIRM_MS, TTS_CAP_CLOSING, type ControllerDeps, type RunTurnFn } from '@/lib/voice/turn-controller';
import { TurnCancelled, isCancelledTurn, type HeardReport, type Segment } from '@/lib/orchestrator/turn-types';
import type { ServerMessage } from '@/lib/voice/protocol';
import type { TTSProvider } from '@/lib/voice/types';
import { fakeClock, sink } from './helpers/playout-fakes';
import { ACK_POOLS, ackKind, pickAck } from '@/lib/voice/acknowledge';
import { pickConnector } from '@/lib/voice/connector';

const RATE = 24000;
const ACK_MS = 300;
const result = (o: Record<string, unknown> = {}) => ({ interviewerText: '', phase: 'CLARIFY', ended: false, auditPassed: true, ...o }) as never;

function harness(script: (Segment[] | { segs: Segment[]; ended?: boolean; delayMs?: number })[], o: Partial<ControllerDeps> = {}) {
  const { clock, advance } = fakeClock();
  const sent: ServerMessage[] = [];
  const reports: HeardReport[] = [];
  const texts: string[] = [];
  const records: Record<string, unknown>[] = [];
  const runTurn: RunTurnFn = async (text, opts) => {
    texts.push(text);
    const step = script.shift() ?? [];
    const { segs, ended, delayMs } = Array.isArray(step) ? { segs: step, ended: false, delayMs: 0 } : step;
    if (delayMs) await new Promise<void>(r => clock.at(clock.now() + delayMs, r));   // the model's latency
    for (const s of segs) await opts.onSegment(s).catch(() => {});
    const r = await opts.heard();
    reports.push(r);
    opts.onTiming({});
    if (isCancelledTurn(r)) throw new TurnCancelled();
    return result({ ended });
  };
  const c = new VoiceTurnController({
    now: () => clock.now(), clock, runTurn, afterTurn: () => {},
    tts: new FakeTTS(10, 0), format: { encoding: 'pcm_s16le', sampleRate: RATE },
    playout: new Playout(sink(), clock, RATE),
    ackPcm: () => new Uint8Array((RATE * ACK_MS / 1000) * 2),
    exhibitById: id => ({ id, title: 'Costs', chartType: 'table', data: [] }),
    send: m => sent.push(m), record: r => records.push(r as never), speechEndAt: () => clock.now() - 300,
    ttsAllow: () => true, canStartTurn: () => true, bargeMinWords: 2, sessionSeed: 's1', fillerDelayMs: 0,
    ...o,
  });
  const captions = (who: 'interviewer' | 'candidate') =>
    sent.filter((m): m is Extract<ServerMessage, { type: 'caption' }> => m.type === 'caption' && m.who === who);
  return { c, clock, advance, sent, reports, texts, records, captions };
}
const seg = (kind: Segment['kind'], text: string, extra: Partial<Segment> = {}): Segment => ({ kind, text, revealIds: [], ...extra });
const speech = (words: string) => ({ kind: 'speech' as const, transcript: words, words: words ? words.split(' ').length : 0, atMs: 0 });
const final = (t: string) => ({ kind: 'final' as const, transcript: t, atMs: 0 });
const noAck = { ackPcm: () => null };

describe('before the browser can play audio', () => {
  it('says nothing and starts no turn (Review Focus 1)', async () => {
    const h = harness([[seg('tail', 'Go on.')]]);
    h.c.onStt(final('Hello there'));
    await h.advance(2000);
    expect(h.texts).toEqual([]);
    expect(h.captions('interviewer')).toEqual([]);
  });
});

describe('the instant acknowledgment', () => {
  it('fits the kind of message: a stuck candidate hears "take your time", not "got it"', async () => {
    const h = harness([[seg('tail', 'Go on.')], [seg('tail', 'Sure.')]]);
    await h.c.ready(''); h.c.onStt(final('Sorry. Hold on.'));
    await h.advance(3000);
    h.c.onStt(final('Can I see the cost breakdown?'));
    await h.advance(3000);
    const acks = h.records.map(r => (r as { ack: string | null }).ack);
    expect(ACK_POOLS.stuck).toContain(acks[0]);
    expect(ACK_POOLS.data_request).toContain(acks[1]);
  });
});

describe('long answers get a filler too (Lorenzo, 17 Oct)', () => {
  it('a 45-word answer hears a two-beat thinking filler first', async () => {
    const long = Array.from({ length: 45 }, () => 'costs').join(' ');
    const h = harness([[seg('tail', 'Which branch first?')]]);
    await h.c.ready(''); h.c.onStt(final(long));
    await h.advance(3000);
    const rec = h.records[0] as { ack: string | null; firstSoundMs: number; firstUsefulMs: number };
    expect(ACK_POOLS.long).toContain(rec.ack);
    expect(rec.firstSoundMs).toBeLessThan(rec.firstUsefulMs);
  });
});

// A TTS that records what it was asked to say.
class RecordingTTS extends FakeTTS {
  pushed: string[] = [];
  async open(format: Parameters<FakeTTS['open']>[0]) {
    const u = await super.open(format);
    return { ...u, push: async (text: string) => { this.pushed.push(text); await u.push(text); } };
  }
}
// A session seed whose first turn, after `text`, opens with `want`.
function seedFor(text: string, segmentText: string, want: string): string {
  for (let i = 0; i < 200; i++) {
    const ack = pickAck(`k${i}:1`, null, ackKind(text));
    if (pickConnector({ seed: `k${i}:1:connector`, filler: ack, segmentText, recent: [] }) === want) return `k${i}`;
  }
  throw new Error('no seed');
}

describe('the connector after a filler (Lorenzo, 17 Oct)', () => {
  const ANSWER = "I'd start with costs, specifically COGS.";
  const DATA = 'There are 120 stores.';

  it('is spoken before the first segment, and nowhere else: not in the segment, captions, the heard report or the runner', async () => {
    const tts = new RecordingTTS(10, 0);
    const h = harness([[seg('data', DATA, { revealIds: ['stores_count'] }), seg('tail', 'Where would you start?')]], { tts, sessionSeed: seedFor(ANSWER, DATA, 'So,') });
    await h.c.ready(''); h.c.onStt(final(ANSWER));
    await h.advance(5000);
    expect(tts.pushed).toEqual([`So, ${DATA}`, 'Where would you start?']);     // the second segment gets none
    expect(h.texts).toEqual([ANSWER]);
    expect(h.reports[0].segments.map(s => [s.text, s.playback, s.heardChars])).toEqual([[DATA, 'played', DATA.length], ['Where would you start?', 'played', 22]]);
    expect(h.captions('interviewer').every(m => !/\bSo,/.test(m.text))).toBe(true);
    expect(h.captions('interviewer').at(-1)).toMatchObject({ final: true, text: `${DATA} Where would you start?` });
  });

  it('a cut while the connector plays has heard none of the line; its words never shift the heard cursor', async () => {
    const tts = new RecordingTTS(40, 0);   // "So, There are 120 stores." — 5 words, 200ms each
    const h = harness([[seg('data', DATA, { revealIds: ['stores_count'] })]], { tts, sessionSeed: seedFor(ANSWER, DATA, 'So,') });
    await h.c.ready(''); h.c.onStt(final(ANSWER));
    await h.advance(650);                   // ack 0–300ms; the connector 300–500ms; heard cursor at 500ms
    h.c.onStt(speech('wait sorry'));
    await h.advance(2000);
    const [data] = h.reports[0].segments;
    expect(tts.pushed[0]).toBe(`So, ${DATA}`);
    expect(data.heardChars).toBe(0);
    expect(h.reports[0].segments[0].text).toBe(DATA);
  });

  it('"COGS" is said "cogs" — in the TTS text only; captions and the heard report keep "COGS" (pronounce.ts)', async () => {
    const LINE = 'COGS rose 16 points. Is that split MECE?';
    const tts = new RecordingTTS(10, 0);
    const h = harness([[seg('tail', LINE)]], { tts, sessionSeed: seedFor(ANSWER, LINE, 'So,') });
    await h.c.ready(''); h.c.onStt(final(ANSWER));
    await h.advance(5000);
    expect(tts.pushed).toEqual(['So, cogs rose 16 points. Is that split mee-see?']);
    expect(h.reports[0].segments[0]).toMatchObject({ text: LINE, playback: 'played', heardChars: LINE.length });
    expect(h.captions('interviewer').at(-1)).toMatchObject({ final: true, text: LINE });
  });

  it('a cut mid-line: the heard cursor counts the written line\'s characters', async () => {
    const LINE = 'COGS rose 16 points.';   // spoken "So, cogs rose 16 points." — 5 words, 200ms each at 40ms/char
    const tts = new RecordingTTS(40, 0);
    const h = harness([[seg('tail', LINE)]], { tts, sessionSeed: seedFor(ANSWER, LINE, 'So,') });
    await h.c.ready(''); h.c.onStt(final(ANSWER));
    await h.advance(1000);
    h.c.onStt(speech('wait sorry'));
    await h.advance(2000);
    const heard = h.reports[0].segments[0].heardChars;
    expect(LINE.slice(0, heard)).toMatch(/^COGS(?: rose)?(?: 16)?$/);
  });

  it('a correction keeps its exact wording after the connector', async () => {
    const LINE = "From today's 6% margin, a 10% price rise lifts margin about 8.5 points, not 5.";
    const tts = new RecordingTTS(10, 0);
    const h = harness([[seg('tail', LINE)]], { tts, sessionSeed: seedFor(ANSWER, LINE, 'So,') });
    await h.c.ready(''); h.c.onStt(final(ANSWER));
    await h.advance(5000);
    expect(tts.pushed).toEqual([`So, ${LINE}`]);
    expect(h.reports[0].segments[0]).toMatchObject({ text: LINE, playback: 'played', heardChars: LINE.length });
  });

  it('none after "Take your time." — only thinking fillers lead into a connector', async () => {
    const tts = new RecordingTTS(10, 0);
    const h = harness([[seg('tail', 'Where would you start?')]], { tts });
    await h.c.ready(''); h.c.onStt(final('Sorry. Hold on.'));
    await h.advance(3000);
    expect(ACK_POOLS.stuck).toContain((h.records[0] as { ack: string }).ack);
    expect(tts.pushed).toEqual(['Where would you start?']);
  });

  it('never the same connector three turns running', async () => {
    const tts = new RecordingTTS(10, 0);
    const turns = Array.from({ length: 12 }, () => [seg('tail', 'Where would you start?')]);
    // A filler on every turn (the rate set to "always"), to test the connector's own rule.
    const h = harness(turns, { tts, fillerRate: { longWords: 40, maxRun: 99 } });
    await h.c.ready('');
    for (let i = 0; i < 12; i++) { h.c.onStt(final(`${ANSWER} Number ${i}.`)); await h.advance(3000); }
    const opens = tts.pushed.map(p => (p.startsWith('So, ') ? 'So,' : ''));
    expect(opens).toHaveLength(12);
    for (let i = 2; i < opens.length; i++) expect(opens[i] === opens[i - 1] && opens[i] === opens[i - 2]).toBe(false);
  });
});

describe('the filler waits 500ms after end of turn (Lorenzo, 17 Oct: Flux ended 7 of 28 turns mid-calculation)', () => {
  const ANSWER = "I'd start with costs, specifically COGS.";
  // speechEndAt: the last voiced mic frame; `voiced(at)` moves it as the candidate speaks again.
  function delayed(script: Parameters<typeof harness>[0], o: Partial<ControllerDeps> = {}) {
    let lastVoiced: number | null = null;
    const h = harness(script, { fillerDelayMs: 500, speechEndAt: () => lastVoiced, ...o });
    return { ...h, voiced: (at: number) => { lastVoiced = at; } };
  }

  it('plays at 500ms when nothing happened, and the first sound is recorded then', async () => {
    const h = delayed([{ segs: [seg('tail', 'Where would you start?')], delayMs: 1500 }]);
    await h.c.ready('');
    h.voiced(h.clock.now() - 300);
    h.c.onStt(final(ANSWER));
    await h.advance(499);
    expect(h.records).toHaveLength(0);
    await h.advance(4000);
    const rec = h.records[0] as { ack: string | null; ackSkipped: unknown; firstSoundMs: number };
    expect(ACK_POOLS.answer).toContain(rec.ack);
    expect(rec.ackSkipped).toBeNull();
    expect(rec.firstSoundMs).toBe(300 + 500);   // from the last voiced frame: 300ms to end of turn, then the wait
  });

  it('speech before then: no filler — the turn is cut and carried, and the skip is logged', async () => {
    const trace: [string, Record<string, unknown> | undefined][] = [];
    const h = delayed([{ segs: [seg('tail', 'Where would you start?')], delayMs: 1500 }, { segs: [seg('tail', 'Go on.')], delayMs: 1500 }], { trace: (type, data) => trace.push([type, data]) });
    await h.c.ready('');
    h.voiced(h.clock.now() - 200);
    h.c.onStt(final("I'm saying it's ten points of the thirty seven point five percent."));
    await h.advance(250);
    h.voiced(h.clock.now());                 // he speaks again
    h.c.onStt(speech('increasing'));         // Flux's first word: the turn is cut before anything played
    await h.advance(300);
    expect(trace.some(([type]) => type === 'ack_start')).toBe(false);
    expect(trace.find(([type]) => type === 'ack_skipped')?.[1]).toMatchObject({ why: 'cut' });
    h.c.onStt(final('increasing COGS.'));
    await h.advance(4000);
    const [cancelled] = h.records as { cancelled: boolean; ack: string | null; ackSkipped: { why: string } | null; cutMs: number }[];
    expect(cancelled).toMatchObject({ cancelled: true, ack: null, ackSkipped: { why: 'cut' } });
    expect(cancelled.cutMs).toBe(250);
    expect(h.texts.at(-1)).toBe("I'm saying it's ten points of the thirty seven point five percent. increasing COGS.");
  });

  it('a voiced frame without a word yet is enough: nothing plays over him', async () => {
    const h = delayed([{ segs: [seg('tail', 'Where would you start?')], delayMs: 1500 }]);
    await h.c.ready('');
    h.voiced(h.clock.now() - 200);
    h.c.onStt(final(ANSWER));
    await h.advance(300);
    h.voiced(h.clock.now());                 // the mic hears him; Flux has no word yet
    await h.advance(4000);
    const rec = h.records[0] as { ack: string | null; ackSkipped: { why: string } | null };
    expect(rec).toMatchObject({ ack: null, ackSkipped: { why: 'speech_resumed' } });
  });

  it('a reply ready before 500ms goes first: the filler is skipped, never queued behind it', async () => {
    const h = delayed([[seg('tail', 'Where would you start?')]]);
    await h.c.ready('');
    h.voiced(h.clock.now() - 200);
    h.c.onStt(final(ANSWER));
    await h.advance(3000);
    const rec = h.records[0] as { ack: string | null; ackSkipped: { why: string } | null; firstSoundMs: number; firstUsefulMs: number };
    expect(rec).toMatchObject({ ack: null, ackSkipped: { why: 'reply_ready' } });
    expect(rec.firstSoundMs).toBe(rec.firstUsefulMs);
  });

  it('no connector when the filler was skipped', async () => {
    class Rec extends FakeTTS { pushed: string[] = []; async open(f: Parameters<FakeTTS['open']>[0]) { const u = await super.open(f); return { ...u, push: async (x: string) => { this.pushed.push(x); await u.push(x); } }; } }
    for (let i = 0; i < 20; i++) {
      const tts = new Rec(10, 0);
      const h = delayed([{ segs: [seg('tail', 'Where would you start?')], delayMs: 1500 }], { tts, sessionSeed: `n${i}` });
      await h.c.ready('');
      h.voiced(h.clock.now() - 200);
      h.c.onStt(final(ANSWER));
      await h.advance(300);
      h.voiced(h.clock.now());
      await h.advance(3000);
      expect(tts.pushed).toEqual(['Where would you start?']);
    }
  });
});

describe('a turn heard in full', () => {
  it('reports every segment played, captions the whole line, and records first sound before first useful', async () => {
    const h = harness([[seg('say', 'Fair point.'), seg('data', 'There are 120 stores.', { revealIds: ['stores_count'] }), seg('tail', 'Where would you start?')]]);
    await h.c.ready(''); h.c.onStt(final('How many stores are there?'));
    await h.advance(5000);
    expect(h.reports[0].interrupted).toBe(false);
    expect(h.reports[0].segments.map(s => s.playback)).toEqual(['played', 'played', 'played']);
    expect(h.captions('interviewer').at(-1)).toMatchObject({ final: true, text: 'Fair point. There are 120 stores. Where would you start?' });
    const rec = h.records[0] as { firstSoundMs: number; firstUsefulMs: number; interrupted: boolean };
    expect(rec.firstSoundMs).toBeLessThan(rec.firstUsefulMs);
    expect(rec.interrupted).toBe(false);
  });
});

describe('barge-in while speaking (§5.7)', () => {
  it('cuts mid data line: the report and the captions agree on what was heard', async () => {
    const DATA = 'There are 120 stores in total.';
    const h = harness([[seg('data', DATA, { revealIds: ['stores_count'] }), seg('tail', 'Where would you start?')]], noAck);
    await h.c.ready(''); h.c.onStt(final('How many stores?'));
    await h.advance(400);                                 // heard cursor 250ms into the 300ms line
    h.c.onStt(speech('wait sorry'));
    await h.advance(2000);
    const [data, tail] = h.reports[0].segments;
    expect(h.reports[0].interrupted).toBe(true);
    expect(data.playback).toBe('partial');
    expect(data.heardChars).toBeGreaterThan(0);
    expect(data.heardChars).toBeLessThan(DATA.length);
    expect(tail.heardChars).toBe(0);
    const shown = h.captions('interviewer').map(m => m.text);
    expect(shown.at(-1)).toBe(DATA.slice(0, data.heardChars).trim());
    expect(shown.every(t => DATA.startsWith(t))).toBe(true);
  });

  it('one word is not a barge-in, and its final is a dropped backchannel', async () => {
    const h = harness([[seg('tail', 'Walk me through your structure, step by step please.')]]);
    await h.c.ready(''); h.c.onStt(final('Okay so'));
    await h.advance(ACK_MS + 100);                        // the question is playing
    h.c.onStt(speech('mhm')); h.c.onStt(final('mhm'));
    await h.advance(5000);
    expect(h.reports[0].interrupted).toBe(false);
    expect(h.texts).toEqual(['Okay so']);
    expect((h.records[0] as { backchannelsDropped: number }).backchannelsDropped).toBe(1);
  });
});

describe('segments that arrive after a cut', () => {
  it('rejects a normal segment, but accepts and plays a late scripted line (§5.6)', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const outcomes: string[] = [];
    let report: HeardReport | null = null;
    const h = harness([], {
      ...noAck,
      runTurn: async (_text, opts) => {
        await opts.onSegment(seg('say', 'Okay, let me think about that.'));
        await gate;
        await opts.onSegment(seg('tail', 'Where next?')).then(() => outcomes.push('tail accepted'), () => outcomes.push('tail rejected'));
        await opts.onSegment(seg('scripted', 'Let us pause. Are you okay?')).then(() => outcomes.push('scripted accepted'), () => outcomes.push('scripted rejected'));
        report = await opts.heard();
        opts.onTiming({});
        return result();
      },
    });
    await h.c.ready(''); h.c.onStt(final('I am not sure'));
    await h.advance(200);                                // the say is playing
    h.c.onStt(speech('hold on'));
    release();
    await h.advance(2000);
    expect(outcomes).toEqual(['tail rejected', 'scripted accepted']);
    expect(report!.segments.map(s => [s.kind, s.playback])).toEqual([['say', 'partial'], ['scripted', 'played']]);
  });
});

describe('a turn cut while it waits for the previous one', () => {
  it('never reaches the model; its text is carried into the next turn', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const texts: string[] = [];
    const h = harness([], {
      runTurn: async (text, opts) => {
        texts.push(text);
        if (texts.length === 1) await opts.onSegment(seg('tail', 'Go on.'));
        const r = await opts.heard();
        opts.onTiming({});
        if (texts.length === 1) await gate;                   // the first turn is still settling
        if (isCancelledTurn(r)) throw new TurnCancelled();
        return result();
      },
    });
    await h.c.ready(''); h.c.onStt(final('First point.'));
    await h.advance(2000);                                    // played; runTurn still settling
    h.c.onStt(final('Second point'));                         // queued behind it
    await h.advance(100);
    h.c.onStt(speech('and more'));                            // cut while queued
    h.c.onStt(final('and more.'));
    release();
    await h.advance(3000);
    expect(texts).toEqual(['First point.', 'Second point and more.']);
  });
});

describe('trace (recording)', () => {
  it('reports the turn-taking decisions in order', async () => {
    const trace: string[] = [];
    const h = harness([[seg('data', 'There are 120 stores in total.'), seg('tail', 'Where would you start?')]], { trace: (type: string) => trace.push(type) });
    await h.c.ready(''); h.c.onStt(final('How many stores?'));
    await h.advance(ACK_MS + 200);
    h.c.onStt(speech('mhm')); h.c.onStt(final('mhm'));
    h.c.onStt(speech('wait sorry'));
    await h.advance(2000);
    expect(trace).toEqual(['final', 'turn_start', 'connector', 'ack_start', 'segment_start', 'backchannel', 'cut', 'turn_end']);
  });
});

describe('TTS lead-in', () => {
  it('starts a segment’s sound within 20ms of its start, though the TTS pads 150ms of silence', async () => {
    const padded: TTSProvider = {
      name: 'padded',
      open: async () => {
        let onAudio: (pcm: Uint8Array, at: number) => void = () => {};
        return {
          push: async () => {
            const s = new Int16Array([...new Int16Array(RATE * 0.15), ...new Int16Array(RATE * 0.3).fill(5000)]);
            onAudio(new Uint8Array(s.buffer), 0);
          },
          end: async () => {}, cancel: async () => {}, onAudio: cb => { onAudio = cb; },
        };
      },
    };
    const { clock, advance } = fakeClock();
    const firstLoud: number[] = [];
    const playout = new Playout(sink(), clock, RATE, { frame: (f, at) => { if (!firstLoud.length && f.some(x => x !== 0)) firstLoud.push(at); } });
    const h = harness([[seg('tail', 'Go on.')]], { ...noAck, tts: padded, playout, clock, now: () => clock.now() });
    await h.c.ready(''); h.c.onStt(final('Hello'));
    await advance(1000);
    expect(firstLoud[0] - 1000).toBeLessThanOrEqual(20);
  });
});

describe('cancelled turns: nothing of them was heard (§5.5)', () => {
  it('speech during the wait cancels the turn and carries its text into the next one', async () => {
    const h = harness([[], [seg('tail', 'Go on.')]]);
    await h.c.ready(''); h.c.onStt(final('I think the issue is'));
    await h.advance(100);                                 // ack playing, nothing of the turn heard
    h.c.onStt(speech('costs'));
    h.c.onStt(final('costs rising.'));
    await h.advance(3000);
    expect(h.texts).toEqual(['I think the issue is', 'I think the issue is costs rising.']);
    expect((h.records[0] as { cancelled: boolean }).cancelled).toBe(true);
    const merged = h.captions('candidate').filter(m => m.final).at(-1)!;
    expect(merged.text).toBe('I think the issue is costs rising.');
    expect(merged.replaces).toBeDefined();
  });

  it('a cancelled turn leaves no interviewer caption and no exhibit', async () => {
    const h = harness([[], [seg('tail', 'Go on.')]]);
    await h.c.ready(''); h.c.onStt(final('Can I see the costs'));
    await h.advance(50);
    h.c.onStt(speech('exhibit'));
    await h.advance(10);
    expect(h.captions('interviewer')).toEqual([]);
    expect(h.sent.some(m => m.type === 'exhibit')).toBe(false);
  });
});

describe('scripted lines: barge-in proof (§5.6)', () => {
  it('ignores barge-in during a scripted line and reports it played', async () => {
    const h = harness([[seg('scripted', 'Let us set the case aside for a moment. Are you okay?')]]);
    await h.c.ready(''); h.c.onStt(final('I cannot do this'));
    await h.advance(ACK_MS + 100);
    h.c.onStt(speech('yes I am fine'));
    await h.advance(3000);
    expect(h.reports[0].interrupted).toBe(false);
    expect(h.reports[0].segments[0].playback).toBe('played');
  });

  it('a final during a scripted line is queued as the next turn, not dropped', async () => {
    const h = harness([[seg('scripted', 'Let us set the case aside for a moment. Are you okay?')], [seg('tail', 'Good, let us continue.')]]);
    await h.c.ready(''); h.c.onStt(final('I cannot do this'));
    await h.advance(ACK_MS + 100);
    h.c.onStt(speech('yes I am fine')); h.c.onStt(final('yes I am fine'));
    await h.advance(5000);
    expect(h.texts).toEqual(['I cannot do this', 'yes I am fine']);
  });

  it('shows a scripted line in full when it starts (no case figures in it)', async () => {
    const LINE = 'Let us set the case aside for a moment.';
    const h = harness([[seg('scripted', LINE)]], noAck);
    await h.c.ready(''); h.c.onStt(final('I cannot do this'));
    await h.advance(20);
    expect(h.captions('interviewer').at(-1)?.text).toBe(LINE);
  });
});

describe('exhibits are confirmed by the browser (§5.3)', () => {
  const turn = () => [seg('say', 'Sure.'), seg('data', 'Here it is.', { exhibitId: 'exhibit-a' }), seg('tail', 'What stands out?')];

  it('is sent when its segment starts, and reported shown once confirmed', async () => {
    const h = harness([turn()], noAck);
    await h.c.ready(''); h.c.onStt(final('Can I see the costs?'));
    await h.advance(20);
    expect(h.sent.some(m => m.type === 'exhibit')).toBe(false);
    await h.advance(60);
    const ex = h.sent.find((m): m is Extract<ServerMessage, { type: 'exhibit' }> => m.type === 'exhibit')!;
    h.c.exhibitShown(ex.turnSeq, 'exhibit-a');
    await h.advance(3000);
    expect(h.reports[0].segments[1].exhibitShown).toBe(true);
    expect(h.sent.some(m => m.type === 'exhibit_withdraw')).toBe(false);
  });

  it('is withdrawn and reported not shown when the confirmation never comes; a late one is withdrawn again', async () => {
    const h = harness([turn()], noAck);
    await h.c.ready(''); h.c.onStt(final('Can I see the costs?'));
    await h.advance(EXHIBIT_CONFIRM_MS + 1000);
    expect(h.reports).toHaveLength(1);
    expect(h.reports[0].segments[1].exhibitShown).toBe(false);
    expect(h.sent.filter(m => m.type === 'exhibit_withdraw')).toHaveLength(1);
    const ex = h.sent.find((m): m is Extract<ServerMessage, { type: 'exhibit' }> => m.type === 'exhibit')!;
    h.c.exhibitShown(ex.turnSeq, 'exhibit-a');
    expect(h.sent.filter(m => m.type === 'exhibit_withdraw')).toHaveLength(2);
  });

  it('heard waits for an outstanding confirmation even after a cut', async () => {
    const h = harness([turn()], noAck);
    await h.c.ready(''); h.c.onStt(final('Can I see the costs?'));
    await h.advance(80);                                  // exhibit sent at 50ms
    h.c.onStt(speech('oh wait'));
    await h.advance(10);
    expect(h.reports).toHaveLength(0);                    // still waiting on the browser
    const ex = h.sent.find((m): m is Extract<ServerMessage, { type: 'exhibit' }> => m.type === 'exhibit')!;
    h.c.exhibitShown(ex.turnSeq, 'exhibit-a');
    await h.advance(10);
    expect(h.reports[0].segments[1].exhibitShown).toBe(true);
  });
});

describe('audio blocked, End, the opening, the TTS cap', () => {
  it('audio blocked cancels an unheard turn without a carry and re-runs it after ready', async () => {
    const h = harness([[], [seg('tail', 'Go on.')]]);
    await h.c.ready(''); h.c.onStt(final('Hello there'));
    await h.advance(100);
    h.c.audioBlocked();
    await h.advance(1000);
    expect(h.texts).toEqual(['Hello there']);
    await h.c.ready('');
    await h.advance(2000);
    expect(h.texts).toEqual(['Hello there', 'Hello there']);
  });

  it('End cuts the turn without a carry and ends the session', async () => {
    const h = harness([[seg('tail', 'Walk me through your structure, step by step please.')]]);
    await h.c.ready(''); h.c.onStt(final('Okay so'));
    await h.advance(ACK_MS + 200);
    h.c.close();
    await h.advance(2000);
    expect(h.reports[0].interrupted).toBe(true);
    h.c.onStt(final('anything else'));
    await h.advance(1000);
    expect(h.texts).toEqual(['Okay so']);
  });

  it('replays the opening interruptible and unbooked (Review Focus 3)', async () => {
    const h = harness([]);
    await h.c.ready('Welcome. Brew & Bean has seen profits fall.');
    await h.advance(100);
    h.c.onStt(speech('sorry go ahead'));
    await h.advance(500);
    expect(h.reports).toEqual([]);
    expect(h.records).toEqual([]);
    expect(h.sent.filter(m => m.type === 'state').at(-1)).toMatchObject({ state: 'listening' });
  });

  it('starts no turn once the TTS allowance is spent', async () => {
    const h = harness([[seg('tail', 'Go on.')]], { canStartTurn: () => false });
    await h.c.ready(''); h.c.onStt(final('Hello'));
    await h.advance(5000);                        // the closing line plays first (below)
    expect(h.texts).toEqual([]);
    expect(h.sent.some(m => m.type === 'ended' && m.reason === 'tts_cap')).toBe(true);
  });

  it('a case that ends sends ended after the closing line has played', async () => {
    const h = harness([{ segs: [seg('tail', 'Thanks, that is the case.')], ended: true }], noAck);
    await h.c.ready(''); h.c.onStt(final('That is my recommendation.'));
    await h.advance(100);
    expect(h.sent.some(m => m.type === 'ended')).toBe(false);
    await h.advance(2000);
    expect(h.sent.at(-1)).toMatchObject({ type: 'ended', reason: 'case_complete' });
  });
});

// Item 3 (Lorenzo's brief, 17 Oct): one button for the thinking sounds and the
// "So," connector — on by default, from the next turn, logged per turn.
describe('the filler toggle', () => {
  const ANSWER = "I'd start with costs, specifically COGS.";
  const LINE = 'There are 120 stores.';
  it('on by default: the thinking filler and the connector; the record says so', async () => {
    const tts = new RecordingTTS(10, 0);
    const h = harness([[seg('tail', LINE)]], { tts, sessionSeed: seedFor(ANSWER, LINE, 'So,') });
    await h.c.ready(''); h.c.onStt(final(ANSWER));
    await h.advance(3000);
    expect(tts.pushed).toEqual([`So, ${LINE}`]);
    expect(h.records[0]).toMatchObject({ fillers: true });
    expect((h.records[0] as { ack: string | null }).ack).not.toBeNull();
  });
  it('off: no thinking filler, no connector, the reply unchanged; logged off with why the filler was skipped', async () => {
    const tts = new RecordingTTS(10, 0);
    const h = harness([[seg('tail', LINE)]], { tts, sessionSeed: seedFor(ANSWER, LINE, 'So,') });
    await h.c.ready(''); h.c.setFillers(false); h.c.onStt(final(ANSWER));
    await h.advance(3000);
    expect(tts.pushed).toEqual([LINE]);
    expect(h.records[0]).toMatchObject({ fillers: false, ack: null, ackSkipped: { why: 'fillers_off' } });
    expect(h.texts).toEqual([ANSWER]);
  });
  it('off keeps the comfort line "Take your time." (words, not a thinking sound)', async () => {
    const h = harness([[seg('tail', 'Where would you start?')]]);
    await h.c.ready(''); h.c.setFillers(false); h.c.onStt(final('Sorry. Hold on.'));
    await h.advance(3000);
    expect(ACK_POOLS.stuck).toContain((h.records[0] as { ack: string }).ack);
  });
  it('a toggle mid-turn takes effect from the next turn', async () => {
    const tts = new RecordingTTS(10, 0);
    const h = harness([{ segs: [seg('tail', LINE)], delayMs: 800 }, [seg('tail', LINE)]], { tts, sessionSeed: seedFor(ANSWER, LINE, 'So,') });
    await h.c.ready(''); h.c.onStt(final(ANSWER));
    await h.advance(400);
    h.c.setFillers(false);                    // while the first turn is thinking
    await h.advance(3000);
    h.c.onStt(final('And then labor.'));
    await h.advance(3000);
    expect(h.records.map(r => (r as { fillers: boolean }).fillers)).toEqual([true, false]);
    expect(tts.pushed[0]).toBe(`So, ${LINE}`);
    expect(tts.pushed[1]).toBe(LINE);
  });
});


// 4c (Lorenzo's go, 18 Oct): how often a thinking filler plays, by config.
describe('the filler rate', () => {
  const SHORT = 'I would look at costs first.';
  const LONG = Array.from({ length: 45 }, (_, i) => `word${i}`).join(' ') + '.';
  it('a short reply right after a turn with a filler gets none — logged "rate"; the next one does', async () => {
    const h = harness([[seg('tail', 'Go on.')], [seg('tail', 'Go on.')], [seg('tail', 'Go on.')]]);
    await h.c.ready('');
    for (const text of [SHORT, `${SHORT} Then labor.`, `${SHORT} Then rent.`]) { h.c.onStt(final(text)); await h.advance(3000); }
    const recs = h.records as { ack: string | null; ackSkipped: { why: string } | null }[];
    expect(recs[0].ack).not.toBeNull();
    expect(recs[1]).toMatchObject({ ack: null, ackSkipped: { why: 'rate' } });
    expect(recs[2].ack).not.toBeNull();
  });
  it('a long answer or a data ask always gets one', async () => {
    const h = harness([[seg('tail', 'Go on.')], [seg('tail', 'Go on.')], [seg('tail', 'Go on.')]]);
    await h.c.ready('');
    for (const text of [SHORT, LONG, 'Could I see the cost breakdown?']) { h.c.onStt(final(text)); await h.advance(3000); }
    expect((h.records as { ack: string | null }[]).map(r => r.ack !== null)).toEqual([true, true, true]);
  });
  it('maxRun 0: none after short replies; still after long ones', async () => {
    const h = harness([[seg('tail', 'Go on.')], [seg('tail', 'Go on.')]], { fillerRate: { longWords: 40, maxRun: 0 } });
    await h.c.ready('');
    for (const text of [SHORT, LONG]) { h.c.onStt(final(text)); await h.advance(3000); }
    expect((h.records as { ack: string | null; ackSkipped: { why: string } | null }[]).map(r => r.ackSkipped?.why ?? 'played')).toEqual(['rate', 'played']);
  });
});

describe('the TTS allowance runs out (voice deploy, 18 Oct): never silence', () => {
  const ended = (h: ReturnType<typeof harness>) => h.sent.filter(m => m.type === 'ended');

  it('no room for another turn: the closing line plays, the session ends with its report', async () => {
    const calls: string[] = [];
    const h = harness([[seg('tail', 'Go on.')]], { ...noAck, canStartTurn: () => false,
      endEarly: async r => { calls.push(r); return { scoringSuppressed: false }; } });
    await h.c.ready(''); h.c.onStt(final('Hello'));
    await h.advance(100);
    expect(ended(h)).toEqual([]);                 // still speaking the closing line
    await h.advance(5000);
    expect(h.texts).toEqual([]);
    expect(h.captions('interviewer').at(-1)).toMatchObject({ text: TTS_CAP_CLOSING, final: true });
    expect(calls).toEqual(['tts_cap']);
    expect(ended(h)).toEqual([{ type: 'ended', reason: 'tts_cap', scoringSuppressed: false }]);
  });

  it('a segment refused mid-turn: nothing more of that turn plays, then the closing line and the end', async () => {
    let n = 0;
    const said: string[] = [];
    const h = harness([[seg('say', 'First part.'), seg('data', 'A long data line.'), seg('tail', 'Short.')]], {
      ...noAck,
      ttsAllow: () => ++n === 1,                  // the first segment fits, nothing after it
      ttsAllowClosing: c => { said.push(`closing:${c}`); return true; },
    });
    await h.c.ready(''); h.c.onStt(final('What are the costs?'));
    await h.advance(8000);
    const lines = h.captions('interviewer').filter(c => c.final).map(c => c.text);
    expect(lines).toEqual(['First part.', TTS_CAP_CLOSING]);
    expect(said).toEqual([`closing:${TTS_CAP_CLOSING.length}`]);
    expect(ended(h)).toEqual([{ type: 'ended', reason: 'tts_cap', scoringSuppressed: true }]);
    // The candidate speaking during or after the closing starts no turn.
    h.c.onStt(final('Wait, one more thing.'));
    await h.advance(2000);
    expect(h.texts).toEqual(['What are the costs?']);
  });

  it('if even the closing line can’t be spoken, the browser still gets its caption and the end', async () => {
    const h = harness([], { ...noAck, canStartTurn: () => false, ttsAllowClosing: () => false });
    await h.c.ready(''); h.c.onStt(final('Hello'));
    await h.advance(2000);
    expect(h.captions('interviewer').at(-1)).toMatchObject({ text: TTS_CAP_CLOSING, final: true });
    expect(ended(h)).toEqual([{ type: 'ended', reason: 'tts_cap', scoringSuppressed: true }]);
  });
});


import { PHRASE_POOLS } from '@/lib/orchestrator/phrasing';

// Lorenzo's brief, 18 Oct, item 5: after VOICE_CHECKIN_MS with no candidate
// speech and nothing playing, one soft line from a 5-version pool — once per
// silence, again only after the candidate speaks; never while the interviewer
// speaks; no clock pause, no session end. Logged per turn.
describe('the voice silence check-in', () => {
  const CHECK = 90_000;
  const setup = (script: Parameters<typeof harness>[0] = [], o: Partial<ControllerDeps> = {}) => {
    let lastVoiced: number | null = null;
    const notes: Record<string, unknown>[] = [];
    const h = harness(script, { checkInMs: CHECK, speechEndAt: () => lastVoiced, note: l => notes.push(l), ...o });
    return { ...h, notes, voiced: (at: number) => { lastVoiced = at; } };
  };
  const checkIns = (h: ReturnType<typeof setup>) => h.captions('interviewer').filter(m => m.final && (PHRASE_POOLS.voice_check_in as readonly string[]).includes(m.text));

  it('says one line from the pool after the silence, and only once until the candidate speaks', async () => {
    const h = setup();
    await h.c.ready('Your client is a coffee chain. How would you approach this?');
    await h.advance(CHECK - 1000);
    expect(checkIns(h)).toHaveLength(0);
    await h.advance(5000);
    expect(checkIns(h).map(m => m.text)).toEqual([PHRASE_POOLS.voice_check_in[0]]);
    await h.advance(3 * CHECK);                                         // still silent: no second line
    expect(checkIns(h)).toHaveLength(1);
    expect(h.sent.some(m => m.type === 'ended')).toBe(false);           // no session end
  });

  it('resets when the candidate speaks: the silence counts from their last words', async () => {
    const h = setup([[seg('tail', 'Which bucket first?')]]);
    await h.c.ready('');
    await h.advance(60_000);
    h.c.onStt(speech('so I think'));                                    // words, no end of turn yet
    await h.advance(60_000);                                            // 120s in, 60s since they spoke
    expect(checkIns(h)).toHaveLength(0);
    await h.advance(35_000);
    expect(checkIns(h)).toHaveLength(1);
    h.c.onStt(final('Costs first.'));                                   // a turn, then a new silence
    await h.advance(5000);
    await h.advance(CHECK + 5000);
    expect(checkIns(h)).toHaveLength(2);
    expect(checkIns(h)[1].text).not.toBe(checkIns(h)[0].text);         // the next version, not a repeat
  });

  it('a voiced mic frame defers it, though no words were transcribed', async () => {
    const h = setup();
    await h.c.ready('');
    await h.advance(80_000);
    h.voiced(h.clock.now());                                            // a mumble the STT didn't turn into words
    await h.advance(20_000);
    expect(checkIns(h)).toHaveLength(0);
    await h.advance(CHECK);
    expect(checkIns(h)).toHaveLength(1);
  });

  it('never while the interviewer is thinking or speaking: the silence starts when the reply has played', async () => {
    const h = setup([{ segs: [seg('tail', 'Walk me through it.')], delayMs: 100_000 }]);
    await h.c.ready('');
    h.c.onStt(final('Let me think about the structure.'));
    await h.advance(100_000 + 2000);                                    // the model took 100s; the reply plays
    expect(checkIns(h)).toHaveLength(0);
    await h.advance(CHECK - 5000);
    expect(checkIns(h)).toHaveLength(0);
    await h.advance(10_000);
    expect(checkIns(h)).toHaveLength(1);
  });

  it('is interruptible: the candidate talking over it cuts it, and their turn runs', async () => {
    const h = setup([[seg('tail', 'Go on.')]], { tts: new FakeTTS(80, 0) });
    await h.c.ready('');
    await h.advance(CHECK + 500);                                       // the line has started
    h.c.onStt(speech('sorry I was'));
    h.c.onStt(final('Sorry, I was working it out. Costs first.'));
    await h.advance(5000);
    expect(h.texts).toEqual(['Sorry, I was working it out. Costs first.']);
    expect(h.notes[0]).toMatchObject({ checkIn: { playback: 'partial' } });
  });

  it('is logged per turn: the line, the silence before it, what was heard', async () => {
    const h = setup([[seg('tail', 'Which bucket first?')]]);
    await h.c.ready('');
    h.c.onStt(final('Revenue and costs.'));
    await h.advance(5000);
    await h.advance(CHECK + 10_000);
    expect(h.notes).toHaveLength(1);
    const line = PHRASE_POOLS.voice_check_in[0];
    expect(h.notes[0]).toMatchObject({ turnSeq: 2, afterTurnSeq: 1, checkIn: { line, playback: 'played', heardChars: line.length } });
    expect((h.notes[0] as { checkIn: { silentMs: number } }).checkIn.silentMs).toBeGreaterThanOrEqual(CHECK);
  });

  it('is off without checkInMs', async () => {
    const h = setup([], { checkInMs: undefined });
    await h.c.ready('');
    await h.advance(5 * CHECK);
    expect(checkIns(h)).toHaveLength(0);
  });
});

// Lorenzo, 18 Oct (item 4 ruling): a filler that wasn't played never appears as
// said. Skipped before the turn runs (toggle off, the rate): not given to the
// turn at all. Skipped after it started (the reply ready first): the heard
// report says so, and the runner leaves it out of the saved line.
describe('an acknowledgment that did not play', () => {
  const capture = (segs: Segment[]) => {
    const seen: { acknowledged?: string; report?: HeardReport }[] = [];
    const runTurn: RunTurnFn = async (_text, opts) => {
      const row: (typeof seen)[number] = { acknowledged: opts.acknowledged };
      seen.push(row);
      for (const s of segs) await opts.onSegment(s).catch(() => {});
      row.report = await opts.heard();
      opts.onTiming({});
      return result();
    };
    return { seen, runTurn };
  };

  it('thinking sounds off: the turn is not told of the filler code picked', async () => {
    const cap = capture([seg('tail', 'Which bucket first?')]);
    const h = harness([], { runTurn: cap.runTurn });
    await h.c.ready(''); h.c.setFillers(false);
    h.c.onStt(final('I would look at costs and revenue.'));
    await h.advance(3000);
    expect((h.records[0] as { ackSkipped: { why: string } }).ackSkipped.why).toBe('fillers_off');
    expect(cap.seen[0].acknowledged).toBeUndefined();
  });

  it('skipped after the turn started (the reply came first): the report says it was not heard', async () => {
    const cap = capture([seg('tail', 'Which bucket first?')]);
    const h = harness([], { runTurn: cap.runTurn, fillerDelayMs: 500 });
    await h.c.ready('');
    h.c.onStt(final('I would look at costs and revenue.'));
    await h.advance(3000);
    expect((h.records[0] as { ackSkipped: { why: string } }).ackSkipped.why).toBe('reply_ready');
    expect(cap.seen[0].acknowledged).toBeTruthy();
    expect(cap.seen[0].report?.ackHeard).toBe(false);
  });

  it('played: the report says it was heard', async () => {
    const cap = capture([seg('tail', 'Which bucket first?')]);
    const slow: RunTurnFn = async (text, opts) => { await new Promise<void>(r => h.clock.at(h.clock.now() + 1000, r)); return cap.runTurn(text, opts); };
    const h = harness([], { runTurn: slow, fillerDelayMs: 500, speechEndAt: () => 700 });   // no voice since the end of turn
    await h.c.ready('');
    h.c.onStt(final('I would look at costs and revenue.'));
    await h.advance(4000);
    expect((h.records[0] as { ack: string | null }).ack).toBeTruthy();
    expect(cap.seen[0].report?.ackHeard).toBe(true);
  });
});
