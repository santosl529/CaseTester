// The bridge from the orchestrator's streamed turn to speech: an onSegment
// sink (session-runner RunTurnOptions) that speaks each segment and resolves
// once its audio has started — so a reveal is booked only when it is being
// heard (D3). In the spike "heard" means audio came back from TTS; with
// LiveKit it becomes the playback acknowledgement.
import type { SegmentSink } from '@/lib/orchestrator/turn-types';
import type { TTSUtterance } from './types';

export function speakingSink(utterance: TTSUtterance, onSegmentText?: (text: string) => void): SegmentSink {
  return async seg => {
    const text = seg.text.trim();
    if (!text) return;
    onSegmentText?.(text);
    await utterance.push(text);
  };
}

// One turn's latency, from the moment the candidate stopped speaking.
export type TurnTimestamps = {
  speechEndMs: number;       // the last voiced audio was sent (wall clock)
  eagerMs?: number | null;   // eager end-of-turn signal, if any
  finalMs: number;           // final end-of-turn signal
  firstSegmentMs: number | null;  // the orchestrator delivered its first segment
  firstAudioMs: number | null;    // TTS returned the first audio
};

export type TurnLatency = {
  endpointMs: number;              // speech end → final end-of-turn
  eagerLeadMs: number | null;      // how much earlier the eager signal came
  turnMs: number | null;           // end-of-turn → first segment (orchestrator + model)
  ttsMs: number | null;            // first segment → first audio
  totalMs: number | null;          // speech end → first audio (the PRD gate, ≤1.5s)
};

export function turnLatency(t: TurnTimestamps): TurnLatency {
  return {
    endpointMs: t.finalMs - t.speechEndMs,
    eagerLeadMs: t.eagerMs != null ? t.finalMs - t.eagerMs : null,
    turnMs: t.firstSegmentMs != null ? t.firstSegmentMs - t.finalMs : null,
    ttsMs: t.firstSegmentMs != null && t.firstAudioMs != null ? t.firstAudioMs - t.firstSegmentMs : null,
    totalMs: t.firstAudioMs != null ? t.firstAudioMs - t.speechEndMs : null,
  };
}
