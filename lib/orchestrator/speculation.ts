// Speculative turns (latency experiment 2, 7 Oct). A draft turn runs on
// Flux's eager end-of-turn transcript behind a DraftGate: every delivery and
// every write waits on the gate, so nothing is heard or saved until the turn
// is confirmed and accepted; a cancelled gate makes them throw DraftCancelled
// instead, and the runner drops the turn's deferred work. Live speculation is
// not wired yet — scripts and tests only.
import { randomUUID } from 'node:crypto';
import type { TurnPlan } from './plan-turn';
import { promptContextFor } from './prompt-context';
import { buildPromptParts } from '@/lib/agent/prompts/system';

export class DraftCancelled extends Error {
  constructor() { super('speculative draft cancelled'); }
}

export class DraftGate {
  readonly id = randomUUID();
  private state: 'pending' | 'accepted' | 'cancelled' = 'pending';
  private settled: Promise<void>;
  private resolve!: () => void;
  private reject!: (e: Error) => void;

  constructor() {
    this.settled = new Promise<void>((res, rej) => { this.resolve = res; this.reject = rej; });
    this.settled.catch(() => {}); // a cancelled gate nobody waited on is not an unhandled rejection
  }

  get accepted(): boolean { return this.state === 'accepted'; }
  get cancelled(): boolean { return this.state === 'cancelled'; }

  // Resolves once accepted; throws DraftCancelled once cancelled.
  wait(): Promise<void> { return this.settled; }

  accept(): void {
    if (this.state !== 'pending') return;
    this.state = 'accepted';
    this.resolve();
  }

  cancel(): void {
    if (this.state !== 'pending') return;
    this.state = 'cancelled';
    this.reject(new DraftCancelled());
  }
}

// What a turn's plan decided, minus the raw clock: two plans with the same
// fingerprint give the model the same input and code the same decisions. The
// prompt's m:ss clock is left out (a second ticking over between the eager
// and the final signal is not a different turn); every decision taken from
// the clock (time up, time warning, time pressure, may end) stays in.
export function planFingerprint(plan: TurnPlan): string {
  if (plan.kind === 'scripted') {
    return JSON.stringify({ kind: 'scripted', text: plan.interviewerText, phase: plan.result.phase, ended: plan.result.ended });
  }
  const { ctx, state } = plan;
  // The rendered prompt, so directives derived from the clock (pacing nudge,
  // load shedding) count; only the m:ss readings are blanked.
  const { stable, turn } = buildPromptParts(promptContextFor(plan));
  const prompt = `${stable}\n${turn}`.replace(/\b\d{1,2}:\d{2}\b/g, 'm:ss');
  return JSON.stringify({
    kind: 'model', turnKind: state.kind, phase: ctx.currentPhase, candidateText: ctx.candidateText,
    history: state.history, prompt,
    timeUp: state.timeUp, timeWarning: state.shouldFireTimeWarning, mayEnd: state.mayEnd, coverageMayEnd: state.coverageMayEnd,
    stall: state.stallDecision.intervene ? state.stallDecision.rung : null, buffered: state.buffered,
  });
}
