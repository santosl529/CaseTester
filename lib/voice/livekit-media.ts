// The LiveKit AudioSource as the playout's FrameSink: 20ms frames go into
// the interviewer track; a cut clears whatever is queued.
import { AudioFrame, type AudioSource } from '@livekit/rtc-node';
import type { FrameSink } from './playout';

export class LiveKitSink implements FrameSink {
  constructor(private source: AudioSource, private sampleRate: number) {}
  // A copy: AudioFrame hands the native layer `data.buffer` from offset 0, so
  // a view into a larger chunk would play the chunk's start (smoke, 8 Oct).
  capture(frame: Int16Array): Promise<void> {
    const own = new Int16Array(frame);
    return this.source.captureFrame(new AudioFrame(own, this.sampleRate, 1, own.length));
  }
  clear(): void { this.source.clearQueue(); }
}
