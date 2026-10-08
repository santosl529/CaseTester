// Types shared by the turn stages (spec 2026-10-05-streaming-turn):
// plan-turn.ts → stream-turn.ts → settle-turn.ts, coordinated by
// session-runner.ts.
import type { sessions } from '@/db/schema';
import type { CheckLog } from './check-log';
import type { Phase } from './state-machine';

export type ExhibitDisplay = {
  id: string;
  title: string;
  chartType: string;
  data: Record<string, unknown>[];
};

export type TurnResult = {
  interviewerText: string;
  exhibit?: ExhibitDisplay;
  phase: Phase;
  ended: boolean;
  auditPassed: boolean;
  // Set when the session ended WITHOUT producing a score (conduct termination
  // or C5-accepted abandonment). The client must not trigger scoring.
  scoringSuppressed?: boolean;
  // Set when this turn's exchange was already classified for data requests
  // synchronously (recommendation-ask turns) — the turn route's background
  // pass must skip it, or the rows would be logged twice.
  dataRequestsClassified?: boolean;
};

export type ConductFlags = { warnings?: number; distressOffered?: boolean; distressOfferedAtMs?: number; category?: string };

// A session event decided during the turn, written at commit.
export type PendingEvent = {
  category: 'intervention' | 'conduct' | 'request_signal';
  subtype: string;
  payload: Record<string, unknown>;
};

// Per-turn constants and the turn's write queues.
export type TurnCtx = {
  sessionId: string;
  userId: string;
  candidateText: string;
  now: number;
  turnStartMs: number;
  nextTurnIndex: number;
  currentPhase: Phase;
  flags: Record<string, unknown>;
  conduct: ConductFlags;
  checks: CheckLog;
  events: PendingEvent[];
  later: (task: () => Promise<void>) => void; // analytics, after the response
  // Voice: a backchannel the voice layer already spoke when the candidate's
  // turn ended. The model is told; the saved interviewer line starts with it.
  acknowledged?: string;
};

// A turn with no model call (conduct, distress, inactive session): the text
// and the writes, committed by settle-turn.ts commitScripted.
export type ScriptedPlan = {
  kind: 'scripted';
  ctx: TurnCtx;
  interviewerText: string;
  result: TurnResult;
  sessionUpdate: Partial<typeof sessions.$inferInsert>;
  noPersist?: boolean; // inactive session: nothing is written (Rule 18)
  // Voice (spec 2026-10-08-voice-phase-b §5.6): what a cut line does.
  // required — the state change stands only if the line was heard in full
  // (offers, warnings); decided — it stands regardless, because it rests on
  // the candidate's words (termination, the close after an accepted pause).
  delivery?: 'required' | 'decided';
};

// One delivered piece of the interviewer's turn (D3: reveals are booked when
// the segment carrying them is delivered).
// `kind`: "say" (the model's opening sentence), "data" (code's data line),
// "tail" (Settle's rest: the question, and anything Stream left), "scripted"
// (a turn written by code: close, distress offer).
export type SegmentKind = 'say' | 'data' | 'tail' | 'scripted';
export type Segment = { text: string; revealIds: string[]; exhibitId?: string; kind: SegmentKind };

// Useful content (latency step 1, 7 Oct): anything past "say", which is now a
// neutral acknowledgment — the candidate's wait is to the data line or the
// question, not to the first sound.
export function isUsefulSegment(s: Pick<Segment, 'kind'>): boolean {
  return s.kind !== 'say';
}
// Resolves when the segment was delivered; rejects when it was not.
export type SegmentSink = (s: Segment) => Promise<void>;

// Voice playback of one accepted segment (spec 2026-10-08-voice-phase-b §5).
// playback and heardChars are estimates from the voice layer's playout clock:
// heardChars is how much of `text` was heard, at a word boundary; played = all
// of it, partial = some, unplayed = none. exhibitShown is the browser's
// confirmation that the segment's exhibit rendered — the only confirmed fact.
export type SegmentPlayback = 'played' | 'partial' | 'unplayed';
export type HeardSegment = Segment & { playback: SegmentPlayback; heardChars: number; exhibitShown: boolean };
// What the candidate got of one turn: every accepted segment, in order.
export type HeardReport = { segments: HeardSegment[]; interrupted: boolean };

// A cut before anything of the turn was heard or shown: the turn is dropped
// whole — no writes, no deferred work — and the voice layer carries the
// candidate's text into the next turn (§5.5).
export class TurnCancelled extends Error {
  constructor() { super('turn cancelled: cut before any of it was heard'); this.name = 'TurnCancelled'; }
}
export function isCancelledTurn(r: HeardReport): boolean {
  return r.interrupted && r.segments.every(s => s.heardChars === 0 && !s.exhibitShown);
}
