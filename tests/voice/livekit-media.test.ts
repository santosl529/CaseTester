// The LiveKit sink: rtc-node's AudioFrame sends `data.buffer` from offset 0
// (it ignores a view's byteOffset), so each frame must own its buffer — a
// subarray of a bigger chunk played the chunk's start every time (smoke, 8 Oct).
import { it, expect } from 'vitest';
import type { AudioFrame, AudioSource } from '@livekit/rtc-node';
import { LiveKitSink } from '@/lib/voice/livekit-media';

it('hands rtc-node a frame that owns exactly its samples', async () => {
  const captured: AudioFrame[] = [];
  const source = { captureFrame: async (f: AudioFrame) => { captured.push(f); }, clearQueue: () => {} } as unknown as AudioSource;
  const chunk = new Int16Array([1, 2, 3, 4, 5, 6, 7, 8]);
  await new LiveKitSink(source, 24000).capture(chunk.subarray(4, 8));
  const f = captured[0];
  expect(f.samplesPerChannel).toBe(4);
  expect(f.data.byteOffset).toBe(0);
  expect(Array.from(new Int16Array(f.data.buffer))).toEqual([5, 6, 7, 8]);
});
