import { describe, it, expect, vi } from 'vitest';

vi.mock('@deepgram/sdk', () => ({ DeepgramClient: class {} }));
vi.mock('@cartesia/cartesia-js', () => ({ default: class {} }));

import { fluxSignal, NovaTurnReducer } from '@/lib/voice/deepgram';
import { chunkAudio, continuation } from '@/lib/voice/cartesia';
import { speakingSink, turnLatency } from '@/lib/voice/speak';
import type { TTSUtterance } from '@/lib/voice/types';

describe('Deepgram Flux signals', () => {
  it('maps eager, final and resumed turn events', () => {
    expect(fluxSignal({ type: 'TurnInfo', event: 'EagerEndOfTurn', transcript: ' COGS. ' }, 5)).toEqual({ kind: 'eager', transcript: 'COGS.', atMs: 5 });
    expect(fluxSignal({ type: 'TurnInfo', event: 'EndOfTurn', transcript: 'COGS.' }, 6)).toEqual({ kind: 'final', transcript: 'COGS.', atMs: 6 });
    expect(fluxSignal({ type: 'TurnInfo', event: 'TurnResumed' }, 7)).toEqual({ kind: 'resumed', atMs: 7 });
  });

  it('ignores updates and other messages', () => {
    expect(fluxSignal({ type: 'TurnInfo', event: 'Update', transcript: 'C' }, 1)).toBeNull();
    expect(fluxSignal({ type: 'Connected' }, 1)).toBeNull();
  });
});

describe('Deepgram Nova-3 turn reducer', () => {
  const res = (transcript: string, is_final: boolean, speech_final = false) =>
    ({ type: 'Results', is_final, speech_final, channel: { alternatives: [{ transcript }] } });

  it('joins finalized pieces and closes the turn on speech_final', () => {
    const r = new NovaTurnReducer();
    expect(r.next(res('COGS went', false), 1)).toBeNull();
    expect(r.next(res('COGS went up', true), 2)).toBeNull();
    expect(r.next(res('sixteen points.', true, true), 3)).toEqual({ kind: 'final', transcript: 'COGS went up sixteen points.', atMs: 3 });
  });

  it('falls back to UtteranceEnd and never emits an empty turn', () => {
    const r = new NovaTurnReducer();
    expect(r.next({ type: 'UtteranceEnd' }, 1)).toBeNull();
    r.next(res('Labor is flat.', true), 2);
    expect(r.next({ type: 'UtteranceEnd' }, 3)).toEqual({ kind: 'final', transcript: 'Labor is flat.', atMs: 3 });
  });
});

describe('Cartesia helpers', () => {
  it('decodes audio chunks and ignores the rest', () => {
    expect(Array.from(chunkAudio({ type: 'chunk', data: Buffer.from([1, 2, 3]).toString('base64') })!)).toEqual([1, 2, 3]);
    expect(chunkAudio({ type: 'done' })).toBeNull();
  });

  it('spaces continuations', () => {
    expect(continuation(' What drove it? ')).toBe('What drove it? ');
    expect(continuation('  ')).toBe('');
  });
});

describe('speakingSink', () => {
  it('speaks each non-empty segment and resolves after its audio starts', async () => {
    const pushed: string[] = [];
    const utt: TTSUtterance = { push: async t => { pushed.push(t); }, end: async () => {}, cancel: async () => {}, onAudio: () => {} };
    const sink = speakingSink(utt);
    await sink({ text: 'Understood.', revealIds: [] });
    await sink({ text: '  ', revealIds: [] });
    await sink({ text: 'COGS is 58% of revenue.', revealIds: ['cogs_pct'] });
    expect(pushed).toEqual(['Understood.', 'COGS is 58% of revenue.']);
  });

  it('rejects when speech fails, so the reveal is not booked', async () => {
    const utt: TTSUtterance = { push: async () => { throw new Error('tts down'); }, end: async () => {}, cancel: async () => {}, onAudio: () => {} };
    await expect(speakingSink(utt)({ text: 'COGS is 58%.', revealIds: ['cogs_pct'] })).rejects.toThrow();
  });
});

describe('turnLatency', () => {
  it('splits speech end → first audio into endpoint, turn and TTS', () => {
    expect(turnLatency({ speechEndMs: 1000, eagerMs: 1250, finalMs: 1400, firstSegmentMs: 2800, firstAudioMs: 3000 }))
      .toEqual({ endpointMs: 400, eagerLeadMs: 150, turnMs: 1400, ttsMs: 200, totalMs: 2000 });
  });

  it('leaves the later stages null when nothing was spoken', () => {
    expect(turnLatency({ speechEndMs: 0, finalMs: 300, firstSegmentMs: null, firstAudioMs: null }))
      .toEqual({ endpointMs: 300, eagerLeadMs: null, turnMs: null, ttsMs: null, totalMs: null });
  });
});
