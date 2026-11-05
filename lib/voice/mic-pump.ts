// The candidate's mic → the speech-end tracker, the recorder and Flux (voice lifecycle, 5 Nov; the 2 Nov audit: the
// loop in livekit-agent.ts had no error handling, so one Deepgram reconnect — `sendMedia` throws "Socket is not
// open." while the SDK's socket reconnects — threw out of the un-awaited loop and the candidate was never heard
// again). Now a sink that throws costs that frame only; the loop ends only when the track does (or `stop()`), and a
// stream error is logged rather than lost.
export type MicFrame = { data: Int16Array };
export type MicReader = { read(): Promise<{ value?: MicFrame; done: boolean }> };

export type MicSinks = {
  vad: (data: Int16Array, now: number) => void;
  record?: (data: Int16Array, now: number) => void;
  stt: (pcm: Uint8Array) => void;
};

export type MicPumpStats = { frames: number; sinkErrors: number; ended: 'track_ended' | 'stopped' | 'stream_error' | null };

export function pumpMic(reader: MicReader, sinks: MicSinks, o: { now?: () => number; log?: (m: string) => void } = {}): { done: Promise<MicPumpStats>; stop: () => void; stats: MicPumpStats } {
  const now = o.now ?? (() => Date.now());
  const log = o.log ?? (m => console.warn(m));
  const stats: MicPumpStats = { frames: 0, sinkErrors: 0, ended: null };
  let stopped = false;
  const sink = (name: string, f: () => void) => {
    try { f(); } catch (e) {
      stats.sinkErrors++;
      // The first error, then every 100th: a reconnect drops a few hundred frames.
      if (stats.sinkErrors === 1 || stats.sinkErrors % 100 === 0) log(`[voice] mic frame not delivered to ${name} (${stats.sinkErrors} so far): ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const done = (async (): Promise<MicPumpStats> => {
    for (;;) {
      if (stopped) { stats.ended = 'stopped'; return stats; }
      let r: { value?: MicFrame; done: boolean };
      try { r = await reader.read(); } catch (e) {
        log(`[voice] mic stream error, listening stopped: ${e instanceof Error ? e.message : String(e)}`);
        stats.ended = 'stream_error';
        return stats;
      }
      if (r.done || !r.value) { stats.ended = stopped ? 'stopped' : 'track_ended'; return stats; }
      const frame = r.value.data;
      const t = now();
      stats.frames++;
      sink('vad', () => sinks.vad(frame, t));
      if (sinks.record) sink('recorder', () => sinks.record!(frame, t));
      sink('stt', () => sinks.stt(new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength)));
    }
  })();
  return { done, stop: () => { stopped = true; }, stats };
}
