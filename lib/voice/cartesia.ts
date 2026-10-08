// Cartesia TTS adapter (M0 spike). One WebSocket context per interviewer
// turn: segments are pushed as continuations as the orchestrator delivers
// them, so prosody carries across sentences, and raw PCM streams back. The
// SDK does not read its key from the environment, so CARTESIA_API_KEY is
// passed in (cartesiaClient).
import Cartesia from '@cartesia/cartesia-js';
import type { RawOutputFormat } from '@cartesia/cartesia-js/resources/tts';
import type { PcmFormat, TTSProvider, TTSUtterance, Word } from './types';

export const CARTESIA_MODEL = 'sonic-3.5';

export function cartesiaClient(): Cartesia {
  return new Cartesia({ apiKey: process.env.CARTESIA_API_KEY });
}

type WsResponse = { type: string; data?: string };
type WordTimestamps = { words: string[]; start: number[]; end: number[] };

// Cartesia word timestamps (seconds, from the context's first audio) as Words.
export function toWords(wt: WordTimestamps): Word[] {
  return wt.words.map((word, i) => ({ word, startMs: Math.round(wt.start[i] * 1000), endMs: Math.round(wt.end[i] * 1000) }));
}

// Base64 chunk → PCM bytes; null for anything that isn't audio.
export function chunkAudio(r: WsResponse): Uint8Array | null {
  if (r.type !== 'chunk' || !r.data) return null;
  return new Uint8Array(Buffer.from(r.data, 'base64'));
}

// Continuations are concatenated server-side, so each pushed piece needs its
// own separating space.
export function continuation(text: string): string {
  const t = text.trim();
  return t ? `${t} ` : '';
}

export class CartesiaTTS implements TTSProvider {
  readonly name = 'cartesia';
  private client = cartesiaClient();
  private ws: Awaited<ReturnType<Cartesia['tts']['websocket']>> | null = null;

  constructor(private voiceId: string, private model: string = CARTESIA_MODEL) {}

  // A connection reused across turns (pre-warmed: the handshake is not on the
  // turn's critical path).
  async connect(): Promise<void> {
    this.ws ??= await this.client.tts.websocket();
  }

  async open(format: PcmFormat, opts: { timestamps?: boolean } = {}): Promise<TTSUtterance> {
    await this.connect();
    const ctx = this.ws!.context({
      model_id: this.model,
      voice: { mode: 'id', id: this.voiceId },
      output_format: { container: 'raw', encoding: format.encoding, sample_rate: format.sampleRate as RawOutputFormat['sample_rate'] },
      ...(opts.timestamps ? { add_timestamps: true } : {}),
    });
    let onAudio: (pcm: Uint8Array, atMs: number) => void = () => {};
    let onWords: (words: Word[]) => void = () => {};
    let waiters: (() => void)[] = [];
    let started = false;
    let pushed = false;
    let doneResolve: () => void = () => {};
    const done = new Promise<void>(r => { doneResolve = r; });

    const pump = async () => {
      try {
        for await (const r of ctx.receive()) {
          const ts = r as WsResponse & { word_timestamps?: WordTimestamps };
          if (ts.type === 'timestamps' && ts.word_timestamps) onWords(toWords(ts.word_timestamps));
          const pcm = chunkAudio(r as WsResponse);
          if (pcm) {
            onAudio(pcm, Date.now());
            const w = waiters; waiters = [];
            for (const f of w) f();
          }
          if ((r as WsResponse).type === 'done') break;
        }
      } finally {
        for (const f of waiters) f();
        doneResolve();
      }
    };

    return {
      push: async text => {
        const piece = continuation(text);
        if (!piece) return;
        const heard = new Promise<void>(r => waiters.push(r));
        await ctx.push({ transcript: piece });
        pushed = true;
        if (!started) { started = true; void pump(); }
        await heard;
      },
      end: async () => {
        if (!pushed) return;
        await ctx.no_more_inputs();
        await done;
      },
      cancel: async () => {
        await ctx.cancel();
      },
      onAudio: cb => { onAudio = cb; },
      onWords: cb => { onWords = cb; },
    };
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}

// A voice from the catalog when none is configured: the first English one.
export async function defaultVoiceId(): Promise<string> {
  const configured = process.env.CARTESIA_VOICE_ID;
  if (configured) return configured;
  const client = cartesiaClient();
  for await (const v of client.voices.list({ limit: 50 } as never)) {
    const voice = v as { id: string; language?: string };
    if (!voice.language || voice.language === 'en') return voice.id;
  }
  throw new Error('No Cartesia voice found; set CARTESIA_VOICE_ID');
}
