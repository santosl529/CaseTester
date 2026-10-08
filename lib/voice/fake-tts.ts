// Free development TTS (spec 2026-10-08-voice-phase-b §8): a quiet tone per
// utterance, ~80ms per character (Aura's ~12.5 chars/s in the 7 Oct demo),
// first audio after 140ms (Cartesia's measured first audio), and evenly
// spaced word timestamps — so barge-in and bookkeeping run on a live mic with
// no TTS credits. Selected with VOICE_TTS=fake.
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
    let onWords: (words: Word[]) => void = () => {};
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
