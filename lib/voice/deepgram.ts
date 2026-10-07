// Deepgram STT adapters (M0 spike): Flux (listen v2, conversational, with its
// own end-of-turn model and an eager early signal) and Nova-3 (listen v1,
// end of speech from VAD endpointing). The client reads DEEPGRAM_API_KEY from
// the environment. Message parsing is pure so it is tested without a socket.
import { DeepgramClient } from '@deepgram/sdk';
import type { PcmFormat, STTProvider, STTSession, TurnSignal } from './types';

type Signal = TurnSignal | { kind: 'resumed'; atMs: number };

// ---- Flux --------------------------------------------------------------

type FluxMessage = { type?: string; event?: string; transcript?: string };

export function fluxSignal(msg: FluxMessage, atMs: number): Signal | null {
  if (msg.type !== 'TurnInfo') return null;
  const transcript = (msg.transcript ?? '').trim();
  if (msg.event === 'EagerEndOfTurn') return { kind: 'eager', transcript, atMs };
  if (msg.event === 'EndOfTurn') return { kind: 'final', transcript, atMs };
  if (msg.event === 'TurnResumed') return { kind: 'resumed', atMs };
  return null;
}

export type FluxOptions = { eotThreshold?: number; eagerEotThreshold?: number; eotTimeoutMs?: number };

export class DeepgramFluxSTT implements STTProvider {
  readonly name = 'deepgram-flux';
  constructor(private opts: FluxOptions = {}) {}

  async open(format: PcmFormat): Promise<STTSession> {
    const client = new DeepgramClient();
    const conn = await client.listen.v2.connect({
      model: 'flux-general-en',
      encoding: 'linear16',
      sample_rate: format.sampleRate,
      ...(this.opts.eotThreshold !== undefined ? { eot_threshold: this.opts.eotThreshold } : {}),
      ...(this.opts.eagerEotThreshold !== undefined ? { eager_eot_threshold: this.opts.eagerEotThreshold } : {}),
      ...(this.opts.eotTimeoutMs !== undefined ? { eot_timeout_ms: this.opts.eotTimeoutMs } : {}),
    });
    let cb: (s: Signal) => void = () => {};
    conn.on('message', (m: unknown) => {
      const s = fluxSignal(m as FluxMessage, Date.now());
      if (s) cb(s);
    });
    conn.connect();
    await conn.waitForOpen();
    return {
      push: pcm => conn.sendMedia(pcm),
      onSignal: f => { cb = f; },
      close: async () => {
        try { conn.sendCloseStream({ type: 'CloseStream' }); } catch { /* already closed */ }
        conn.close();
      },
    };
  }
}

// ---- Nova-3 ------------------------------------------------------------

type NovaMessage = {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: { transcript?: string }[] };
};

// Finalized pieces accumulate until speech_final (VAD endpoint) or an
// UtteranceEnd (word-gap fallback) closes the turn.
export class NovaTurnReducer {
  private pieces: string[] = [];

  next(msg: NovaMessage, atMs: number): TurnSignal | null {
    if (msg.type === 'Results') {
      const text = (msg.channel?.alternatives?.[0]?.transcript ?? '').trim();
      if (msg.is_final && text) this.pieces.push(text);
      if (msg.speech_final) return this.close(atMs);
      return null;
    }
    if (msg.type === 'UtteranceEnd') return this.close(atMs);
    return null;
  }

  private close(atMs: number): TurnSignal | null {
    if (this.pieces.length === 0) return null;
    const transcript = this.pieces.join(' ');
    this.pieces = [];
    return { kind: 'final', transcript, atMs };
  }
}

export type NovaOptions = { endpointingMs?: number; utteranceEndMs?: number };

export class DeepgramNovaSTT implements STTProvider {
  readonly name = 'deepgram-nova-3';
  constructor(private opts: NovaOptions = {}) {}

  async open(format: PcmFormat): Promise<STTSession> {
    const client = new DeepgramClient();
    const conn = await client.listen.v1.connect({
      model: 'nova-3',
      language: 'en',
      encoding: 'linear16',
      sample_rate: format.sampleRate,
      channels: 1,
      punctuate: 'true',
      smart_format: 'true',
      interim_results: 'true',
      endpointing: this.opts.endpointingMs ?? 300,
      utterance_end_ms: this.opts.utteranceEndMs ?? 1000,
      vad_events: 'true',
    });
    const reducer = new NovaTurnReducer();
    let cb: (s: Signal) => void = () => {};
    conn.on('message', (m: unknown) => {
      const s = reducer.next(m as NovaMessage, Date.now());
      if (s) cb(s);
    });
    conn.connect();
    await conn.waitForOpen();
    return {
      push: pcm => conn.sendMedia(pcm),
      onSignal: f => { cb = f; },
      close: async () => {
        try { conn.sendCloseStream({ type: 'CloseStream' }); } catch { /* already closed */ }
        conn.close();
      },
    };
  }
}
