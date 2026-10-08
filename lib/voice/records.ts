// Per-turn voice timing (spec 2026-10-08-voice-phase-b §7), on the agent
// clock: from the candidate's last voiced frame to the first sound and the
// first useful audio, with what the turn waited on.
export type ClassifierWaits = { distress: number; ptJudge: number; structureJudge: number; hintCheck: number; codeWrittenChecks: number };

export type TurnRecord = {
  turnSeq: number; at: string; candidateText: string; carried: boolean; ack: string | null;
  phase: string | null; ended: boolean;
  speechEndAt: number | null; finalAt: number; endpointMs: number | null; queueWaitMs: number;
  firstSoundMs: number | null; firstUsefulMs: number | null;
  firstSegmentAcceptedMs: number | null; ttsFirstAudioMs: number | null;
  waits: ClassifierWaits; marks: Record<string, number>;
  interrupted: boolean; cancelled: boolean; backchannelsDropped: number;
  segments: { kind: string; playback: string; heardChars: number; exhibitShown: boolean }[];
  clientFirstSoundMs?: number;
};

// How long delivery was blocked on each classifier (TurnTimer marks, ms from
// the turn's start). The distress check counts only if speech was held for it.
export function classifierWaits(m: Record<string, number>): ClassifierWaits {
  const span = (a: string, b: string) => (m[a] !== undefined && m[b] !== undefined ? Math.max(0, m[b] - m[a]) : 0);
  return {
    distress: m.held_for_distress !== undefined && m.distress_verdict !== undefined && m.model_first_sentence !== undefined
      ? Math.max(0, m.distress_verdict - m.model_first_sentence) : 0,
    ptJudge: span('pt_judge_start', 'pt_judge_end') + span('pt_judge_settle_start', 'pt_judge_settle_end'),
    structureJudge: span('structure_judge_start', 'structure_judge_end'),
    hintCheck: span('hint_check_start', 'hint_check_end'),
    codeWrittenChecks: span('code_written_checks_start', 'code_written_checks_end'),
  };
}

const pct = (xs: number[], p: number): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
};

// The session summary: medians and p90s over turns that weren't cancelled.
export function summarize(rs: Pick<TurnRecord, 'firstSoundMs' | 'firstUsefulMs' | 'endpointMs' | 'cancelled'>[]): Record<string, number | null> {
  const done = rs.filter(r => !r.cancelled);
  const out: Record<string, number | null> = { turns: done.length, cancelled: rs.length - done.length };
  for (const k of ['endpointMs', 'firstSoundMs', 'firstUsefulMs'] as const) {
    const xs = done.map(r => r[k]).filter((v): v is number => v !== null);
    out[`${k}_median`] = pct(xs, 0.5);
    out[`${k}_p90`] = pct(xs, 0.9);
  }
  return out;
}
