// The voice turn controller against spec 2026-10-08-voice-phase-b §5: what
// the candidate heard, barge-in, cancellation and carry, scripted lines,
// exhibit confirmation, audio blocked, End. Fake clock, fake TTS, scripted runner.
import { describe, it, expect } from 'vitest';
import { Playout } from '@/lib/voice/playout';
import { FakeTTS } from '@/lib/voice/fake-tts';
import { VoiceTurnController, EXHIBIT_CONFIRM_MS, type ControllerDeps, type RunTurnFn } from '@/lib/voice/turn-controller';
import { TurnCancelled, isCancelledTurn, type HeardReport, type Segment } from '@/lib/orchestrator/turn-types';
import type { ServerMessage } from '@/lib/voice/protocol';
import { fakeClock, sink } from './helpers/playout-fakes';

const RATE = 24000;
const ACK_MS = 300;
const result = (o: Record<string, unknown> = {}) => ({ interviewerText: '', phase: 'CLARIFY', ended: false, auditPassed: true, ...o }) as never;

function harness(script: (Segment[] | { segs: Segment[]; ended?: boolean })[], o: Partial<ControllerDeps> = {}) {
  const { clock, advance } = fakeClock();
  const sent: ServerMessage[] = [];
  const reports: HeardReport[] = [];
  const texts: string[] = [];
  const records: Record<string, unknown>[] = [];
  const runTurn: RunTurnFn = async (text, opts) => {
    texts.push(text);
    const step = script.shift() ?? [];
    const { segs, ended } = Array.isArray(step) ? { segs: step, ended: false } : step;
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
    ttsAllow: () => true, canStartTurn: () => true, bargeMinWords: 2, sessionSeed: 's1',
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
    await h.advance(1000);
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
