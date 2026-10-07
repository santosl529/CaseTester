// Voice provider interfaces (technical PRD §1, §8). Vendors sit behind these
// so a failed M0 spike swaps a provider, not the orchestrator. Nothing in
// lib/orchestrator, lib/agent or lib/scoring may import from lib/voice
// (eslint boundary rule).

// 16-bit little-endian mono PCM throughout: what Deepgram takes and Cartesia
// returns without transcoding.
export type PcmFormat = { encoding: 'pcm_s16le'; sampleRate: number };

// One end-of-turn signal from the STT provider. `eager` is a low-confidence
// early signal (Deepgram Flux EagerEndOfTurn) a speculative turn could start
// on; `final` is the turn boundary the orchestrator acts on.
export type TurnSignal = {
  kind: 'eager' | 'final';
  transcript: string;
  atMs: number;            // wall clock when the signal arrived
};

export interface STTSession {
  push(pcm: Uint8Array): void;
  // A turn signal, or a TurnResumed after an eager one (speech continued).
  onSignal(cb: (s: TurnSignal | { kind: 'resumed'; atMs: number }) => void): void;
  close(): Promise<void>;
}

export interface STTProvider {
  readonly name: string;   // includes the settings, for run records
  open(format: PcmFormat): Promise<STTSession>;
}

// One spoken interviewer turn: text is pushed sentence by sentence as the
// orchestrator delivers segments, and audio streams back in order.
export interface TTSUtterance {
  // Resolves once audio for this text has started arriving.
  push(text: string): Promise<void>;
  end(): Promise<void>;          // no more text; resolves when all audio is in
  cancel(): Promise<void>;       // barge-in
  onAudio(cb: (pcm: Uint8Array, atMs: number) => void): void;
}

export interface TTSProvider {
  readonly name: string;
  open(format: PcmFormat): Promise<TTSUtterance>;
}
