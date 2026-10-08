import { it, expect } from 'vitest';
import { FakeTTS } from '@/lib/voice/fake-tts';
import type { TTSProvider } from '@/lib/voice/types';

it('returns tone audio of msPerChar per character and evenly spaced words', async () => {
  const tts: TTSProvider = new FakeTTS(10, 0);
  const utt = await tts.open({ encoding: 'pcm_s16le', sampleRate: 24000 }, { timestamps: true });
  let bytes = 0; let words: { word: string; endMs: number }[] = [];
  utt.onAudio(pcm => { bytes += pcm.length; });
  utt.onWords?.(w => { words = w; });
  await utt.push('One two.');
  expect(bytes).toBe(24000 * 0.08 * 2);           // 8 chars × 10ms
  expect(words.map(w => w.word)).toEqual(['One', 'two.']);
  expect(words.at(-1)?.endMs).toBe(80);
});

it('sends nothing after cancel', async () => {
  const utt = await new FakeTTS(10, 0).open({ encoding: 'pcm_s16le', sampleRate: 24000 });
  let bytes = 0; utt.onAudio(pcm => { bytes += pcm.length; });
  await utt.cancel();
  await utt.push('One two.');
  expect(bytes).toBe(0);
});
