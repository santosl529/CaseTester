// One record per candidate turn for evaluation runs (spec 2026-10-09
// persona-batch-evaluation §2.1): the exact requests the model got, the state
// they were built from, what the model wrote, what code decided and what was
// delivered. Filled through optional hooks; production passes none.
import type { CheckDecision } from './check-log';
import type { PromptContext } from '@/lib/agent/prompts/system';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { TurnValidation } from '@/lib/agent/models/interface';
import type { LlmUsage } from '@/lib/llm-usage';
import type { Segment, SegmentKind } from './turn-types';
import type { Phase } from './state-machine';

// first / retry: the adapter's own attempts; guard / guard_retry: the same
// after guard B wrote the turn again (lib/agent/interviewer.ts).
export type AttemptKind = 'first' | 'retry' | 'guard' | 'guard_retry';

export type TurnStateBefore = {
  phase: Phase;
  elapsedMs: number | null;
  kind: string;                       // TurnKind, or 'scripted'
  promptContext: PromptContext | null; // the exact input the prompt was built from
  revealedIds: string[];
  shownExhibitIds: string[];
  openDataRequests: { ledgerItemId: string; what: string }[];
  pressureTest: unknown;
  stallRung: number | null;
  verifiedFigures: unknown[];
  recomputeFlags: unknown[];
  requestCues: string[];
};

export type TurnRecord = {
  type: 'turn';
  sessionId: string;
  turnIndex: number;
  candidateText: string;
  stateBefore: TurnStateBefore;
  requests: { attempt: AttemptKind; model: string; body: unknown; atMs: number }[];
  outputs: { attempt: AttemptKind; text: string; atMs: number }[];
  parsedTurn: ModelTurn | null;
  validation: TurnValidation | null;
  checks: CheckDecision[];
  delivered: { kind: SegmentKind; text: string; revealIds: string[]; exhibitId?: string; atMs: number }[];
  savedLine: string;
  phaseAfter: Phase;
  ended: boolean;
  timing: Record<string, number>;
  usage: LlmUsage[];
  /** Recorder steps that failed this turn (follow-up 9 Oct): the record is incomplete evidence for those stages. Empty when none. */
  recorderErrors: { stage: string; message: string }[];
};

export class TurnRecorder {
  private state: TurnStateBefore | null = null;
  private requests: TurnRecord['requests'] = [];
  private outputs: TurnRecord['outputs'] = [];
  private usages: LlmUsage[] = [];
  private segments: TurnRecord['delivered'] = [];
  private modelTurn: ModelTurn | null = null;
  private validation: TurnValidation | null = null;
  private errors: TurnRecord['recorderErrors'] = [];

  constructor(private startMs: number, private now: () => number = Date.now) {}

  private at(): number { return this.now() - this.startMs; }

  setState(s: TurnStateBefore): void { this.state = s; }
  setModelTurn(turn: ModelTurn | null, validation: TurnValidation | null): void { this.modelTurn = turn; this.validation = validation; }
  request(attempt: AttemptKind, model: string, body: unknown): void {
    this.requests.push({ attempt, model, body: structuredClone(body), atMs: this.at() });
  }
  output(attempt: AttemptKind, text: string): void { this.outputs.push({ attempt, text, atMs: this.at() }); }
  usage(u: LlmUsage): void { this.usages.push({ ...u }); }
  /** Notes a failed recorder step. Never throws. */
  noteError(stage: string, message: string): void {
    try { this.errors.push({ stage: String(stage), message: String(message) }); } catch { /* a note that cannot be made is dropped */ }
  }
  segment(seg: Segment): void {
    this.segments.push({ kind: seg.kind, text: seg.text, revealIds: [...seg.revealIds], ...(seg.exhibitId ? { exhibitId: seg.exhibitId } : {}), atMs: this.at() });
  }

  finish(p: {
    sessionId: string; turnIndex: number; candidateText: string; checks: CheckDecision[];
    savedLine: string; phaseAfter: Phase; ended: boolean; timing: Record<string, number>;
  }): TurnRecord {
    if (!this.state) throw new Error('TurnRecorder.finish: no state snapshot was set');
    return {
      type: 'turn', sessionId: p.sessionId, turnIndex: p.turnIndex, candidateText: p.candidateText,
      stateBefore: this.state, requests: this.requests, outputs: this.outputs,
      parsedTurn: this.modelTurn, validation: this.validation, checks: p.checks.map(c => ({ ...c })),
      delivered: this.segments, savedLine: p.savedLine, phaseAfter: p.phaseAfter, ended: p.ended,
      timing: { ...p.timing }, usage: this.usages, recorderErrors: this.errors.map(e => ({ ...e })),
    };
  }
}
