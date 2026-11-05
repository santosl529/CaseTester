// When the voice agent's job ends (voice lifecycle, 5 Nov; Lorenzo's brief: "Leaving frees everything"). Pure, so it
// is tested without LiveKit: the agent reports what happens in the room and calls `finish` once for the first reason:
//   - the candidate leaves (or the tab closes) and is not back within `rejoinGraceMs` (Lorenzo, 5 Nov: a reload or a
//     mobile app switch must resume the same interview) — at any point, including while the agent is still setting up;
//   - the candidate never arrives: connected, but the owner isn't in the room within `candidateWaitMs` (a candidate
//     who left during the cold start; the agent must not sit in an empty room holding the only slot);
//   - the room closes under the agent (End deleted it);
//   - the case ends (the closing line has played; the agent leaves instead of listening on for up to 25 minutes);
//   - the time limit.
// Before connecting, `shouldJoin` keeps a late-arriving agent out of a session that is already over.

export type FinishReason = 'candidate_left' | 'candidate_absent' | 'room_closed' | 'case_ended' | 'time_limit' | 'session_over';

export const CANDIDATE_WAIT_MS = 20_000;
// How long a candidate who dropped out of the room (a reload, a network blip, an app switch) has to come back before
// the job ends — the same 15 s the leave route waits (lib/voice/leave-grace.ts).
export const REJOIN_GRACE_MS = 15_000;
// After the case ends: time for the `ended` message to reach the browser before the agent leaves.
export const ENDED_GRACE_MS = 2_000;

export function shouldJoin(session: { status: string } | null | undefined): boolean {
  return Boolean(session && session.status === 'active');
}

type Timers = { setTimer: (f: () => void, ms: number) => unknown; clearTimer: (h: unknown) => void };

export class AgentLifecycle {
  private reason: FinishReason | null = null;
  private absent: unknown = null;
  private ended: unknown = null;
  private away: unknown = null;

  constructor(private o: Timers & { candidate: string; candidateWaitMs?: number; endedGraceMs?: number; rejoinGraceMs?: number;
    onFinish: (why: FinishReason) => void;
    // The candidate dropped out (the agent pauses: nothing plays into an empty room) / came back within the grace.
    onAway?: () => void; onBack?: () => void }) {}

  get candidateAway(): boolean { return this.away !== null; }

  get over(): boolean { return this.reason !== null; }
  get why(): FinishReason | null { return this.reason; }

  // Just connected: who is in the room now. Without the candidate, wait for them — but not for long.
  connected(present: Iterable<string>): void {
    if (this.over) return;
    if ([...present].includes(this.o.candidate)) return;
    this.absent = this.o.setTimer(() => { this.absent = null; this.finish('candidate_absent'); }, this.o.candidateWaitMs ?? CANDIDATE_WAIT_MS);
  }

  joined(identity: string): void {
    if (identity !== this.o.candidate || this.over) return;
    if (this.absent !== null) { this.o.clearTimer(this.absent); this.absent = null; }
    if (this.away !== null) { this.o.clearTimer(this.away); this.away = null; this.o.onBack?.(); }
  }

  // The candidate dropped out: the job ends only if they aren't back within the grace.
  left(identity: string): void {
    if (identity !== this.o.candidate || this.over || this.away !== null) return;
    this.away = this.o.setTimer(() => { this.away = null; this.finish('candidate_left'); }, this.o.rejoinGraceMs ?? REJOIN_GRACE_MS);
    this.o.onAway?.();
  }

  roomClosed(): void { this.finish('room_closed'); }

  // The case is over (the closing line has played): leave after a short grace.
  caseEnded(): void {
    if (this.over || this.ended !== null) return;
    this.ended = this.o.setTimer(() => { this.ended = null; this.finish('case_ended'); }, this.o.endedGraceMs ?? ENDED_GRACE_MS);
  }

  finish(why: FinishReason): void {
    if (this.over) return;
    this.reason = why;
    for (const h of [this.absent, this.ended, this.away]) if (h !== null) this.o.clearTimer(h);
    this.absent = this.ended = this.away = null;
    this.o.onFinish(why);
  }
}
