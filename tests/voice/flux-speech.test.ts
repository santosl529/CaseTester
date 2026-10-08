// Flux's StartOfTurn / Update become speech signals with a word count — the
// controller's barge-in input (spec 2026-10-08-voice-phase-b §5.7).
import { describe, it, expect } from 'vitest';
import { fluxSignal } from '@/lib/voice/deepgram';

describe('fluxSignal speech events', () => {
  it('maps StartOfTurn and Update to speech with a word count', () => {
    expect(fluxSignal({ type: 'TurnInfo', event: 'StartOfTurn', transcript: '' }, 5)).toEqual({ kind: 'speech', transcript: '', words: 0, atMs: 5 });
    expect(fluxSignal({ type: 'TurnInfo', event: 'Update', transcript: ' wait, sorry ' }, 6)).toEqual({ kind: 'speech', transcript: 'wait, sorry', words: 2, atMs: 6 });
  });
  it('keeps end-of-turn signals as before', () => {
    expect(fluxSignal({ type: 'TurnInfo', event: 'EndOfTurn', transcript: 'done' }, 7)).toEqual({ kind: 'final', transcript: 'done', atMs: 7 });
  });
});
