// Deepgram STT adapters (M0 spike): Flux (listen v2, conversational, with its
// own end-of-turn model and an eager early signal) and Nova-3 (listen v1,
// end of speech from VAD endpointing). The client reads DEEPGRAM_API_KEY from
// the environment. Message parsing is pure so it is tested without a socket.
import { DeepgramClient } from '@deepgram/sdk';
import type { PcmFormat, STTProvider, STTSession, SttEvent, TurnSignal } from './types';

type Signal = SttEvent;

// ---- Flux --------------------------------------------------------------

type FluxMessage = { type?: string; event?: string; transcript?: string };

export function fluxSignal(msg: FluxMessage, atMs: number): Signal | null {
  if (msg.type !== 'TurnInfo') return null;
  const transcript = (msg.transcript ?? '').trim();
  if (msg.event === 'StartOfTurn' || msg.event === 'Update') {
    return { kind: 'speech', transcript, words: transcript ? transcript.split(/\s+/).length : 0, atMs, ...(msg.event === 'StartOfTurn' ? { start: true as const } : {}) };
  }
  if (msg.event === 'EagerEndOfTurn') return { kind: 'eager', transcript, atMs };
  if (msg.event === 'EndOfTurn') return { kind: 'final', transcript, atMs };
  if (msg.event === 'TurnResumed') return { kind: 'resumed', atMs };
  return null;
}

export type FluxOptions = { eotThreshold?: number; eagerEotThreshold?: number; eotTimeoutMs?: number; keyterms?: string[] };

// Deepgram model training off (Lorenzo, 13 Nov): every connection sends mip_opt_out=true — the audio is kept only
// while it is transcribed and is not used to train Deepgram's models (its Model Improvement Program).
const MIP_OPT_OUT = { mip_opt_out: true } as const;

export function fluxConnectArgs(format: PcmFormat, opts: FluxOptions) {
  return {
    model: 'flux-general-en' as const,
    encoding: 'linear16' as const,
    sample_rate: format.sampleRate,
    ...(opts.eotThreshold !== undefined ? { eot_threshold: opts.eotThreshold } : {}),
    ...(opts.eagerEotThreshold !== undefined ? { eager_eot_threshold: opts.eagerEotThreshold } : {}),
    ...(opts.eotTimeoutMs !== undefined ? { eot_timeout_ms: opts.eotTimeoutMs } : {}),
    // Keyterm prompting (keyterms.ts): the terms the case's checks read.
    ...(opts.keyterms?.length ? { keyterm: opts.keyterms } : {}),
    ...MIP_OPT_OUT,
  };
}

export class DeepgramFluxSTT implements STTProvider {
  get name(): string {
    const o = this.opts;
    return `deepgram-flux${o.eotThreshold !== undefined ? `-eot${o.eotThreshold}` : ''}${o.eagerEotThreshold !== undefined ? `-eager${o.eagerEotThreshold}` : ''}`;
  }
  constructor(private opts: FluxOptions = {}) {}

  async open(format: PcmFormat): Promise<STTSession> {
    const client = new DeepgramClient();
    const conn = await client.listen.v2.connect(fluxConnectArgs(format, this.opts));
    const session = fluxSession(conn as unknown as FluxSocket);
    conn.connect();
    await conn.waitForOpen();
    return session;
  }
}

// The Flux socket as the session uses it (the SDK's V2Socket, whose ReconnectingWebSocket retries a dropped
// connection on its own — up to 30 times).
export type FluxSocket = {
  on(event: 'message' | 'open' | 'close' | 'error', cb: (x: unknown) => void): void;
  sendMedia(pcm: Uint8Array): void;
  sendCloseStream(m: { type: 'CloseStream' }): void;
  close(): void;
};

export type FluxSessionStats = { reconnects: number; dropped: number; down: boolean };

// The session over one socket, through its reconnects (voice lifecycle, 5 Nov). While the socket is down,
// `sendMedia` throws "Socket is not open." — `push` drops the frame instead (there is no one to send it to) and
// counts it; when the socket opens again, audio flows again. Each loss and each reconnect is logged.
export function fluxSession(conn: FluxSocket, o: { now?: () => number; log?: (m: string) => void } = {}): STTSession & { stats: FluxSessionStats } {
  const now = o.now ?? (() => Date.now());
  const log = o.log ?? (m => console.warn(m));
  let cb: (s: Signal) => void = () => {};
  let closedByUs = false;
  let opened = false;
  let downSince: number | null = null;
  let droppedThisOutage = 0;
  const stats: FluxSessionStats = { reconnects: 0, dropped: 0, down: false };
  const goDown = (why: string) => {
    if (closedByUs || downSince !== null) return;
    downSince = now();
    droppedThisOutage = 0;
    stats.down = true;
    log(`[voice] stt connection lost (${why}); reconnecting`);
  };
  conn.on('message', (m: unknown) => {
    const s = fluxSignal(m as FluxMessage, now());
    if (s) cb(s);
  });
  conn.on('open', () => {
    if (!opened) { opened = true; return; }
    if (closedByUs) return;
    stats.reconnects++;
    const after = downSince === null ? 0 : now() - downSince;
    log(`[voice] stt reconnected (#${stats.reconnects}) after ${after}ms; ${droppedThisOutage} mic frames dropped while down`);
    downSince = null;
    stats.down = false;
  });
  conn.on('close', (e: unknown) => {
    const code = (e as { code?: number } | undefined)?.code;
    if (!closedByUs) goDown(`close ${code ?? '?'}`);
  });
  conn.on('error', (e: unknown) => {
    if (!closedByUs) log(`[voice] stt socket error: ${(e as { message?: string } | undefined)?.message ?? String(e)}`);
  });
  return {
    stats,
    push: pcm => {
      if (closedByUs) return;
      try { conn.sendMedia(pcm); } catch (e) {
        goDown(e instanceof Error ? e.message : 'send failed');
        stats.dropped++;
        droppedThisOutage++;
      }
    },
    onSignal: f => { cb = f; },
    close: async () => {
      closedByUs = true;
      try { conn.sendCloseStream({ type: 'CloseStream' }); } catch { /* already closed */ }
      conn.close();
    },
  };
}

// ---- Nova-3 ------------------------------------------------------------

type NovaMessage = {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: { transcript?: string }[] };
};

// Finalized pieces accumulate until the turn closes: on speech_final (VAD
// endpoint — closes at short sentence pauses) or only on UtteranceEnd (a
// word gap of utterance_end_ms). An UtteranceEnd always closes a pending turn.
export class NovaTurnReducer {
  private pieces: string[] = [];
  constructor(private closeOn: 'speech_final' | 'utterance_end' = 'speech_final') {}

  next(msg: NovaMessage, atMs: number): TurnSignal | null {
    if (msg.type === 'Results') {
      const text = (msg.channel?.alternatives?.[0]?.transcript ?? '').trim();
      if (msg.is_final && text) this.pieces.push(text);
      if (msg.speech_final && this.closeOn === 'speech_final') return this.close(atMs);
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

export type NovaOptions = { endpointingMs?: number; utteranceEndMs?: number; closeOn?: 'speech_final' | 'utterance_end' };

export function novaConnectArgs(format: PcmFormat, opts: NovaOptions) {
  return {
    model: 'nova-3' as const,
    language: 'en' as const,
    encoding: 'linear16' as const,
    sample_rate: format.sampleRate,
    channels: 1,
    punctuate: 'true' as const,
    smart_format: 'true' as const,
    interim_results: 'true' as const,
    endpointing: opts.endpointingMs ?? 300,
    utterance_end_ms: opts.utteranceEndMs ?? 1000,
    vad_events: 'true' as const,
    ...MIP_OPT_OUT,
  };
}

export class DeepgramNovaSTT implements STTProvider {
  get name(): string { return `deepgram-nova-3${this.opts.closeOn === 'utterance_end' ? '-utterance-end' : ''}`; }
  constructor(private opts: NovaOptions = {}) {}

  async open(format: PcmFormat): Promise<STTSession> {
    const client = new DeepgramClient();
    const conn = await client.listen.v1.connect(novaConnectArgs(format, this.opts));
    const reducer = new NovaTurnReducer(this.opts.closeOn);
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
