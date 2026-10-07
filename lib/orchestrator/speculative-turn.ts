// A speculative turn (latency experiment 2, 7 Oct): runTurn started on Flux's
// eager end-of-turn transcript, behind a DraftGate (speculation.ts). Nothing
// is spoken, written or deferred until accept() — which holds only if the
// confirmed transcript is the draft's exactly and the session, re-planned
// now, still gives the same fingerprint. cancel() (TurnResumed) makes the
// draft's result reject with DraftCancelled, however late its model call
// finishes. Not wired into a live path yet.
import { runTurn, planFingerprintNow, type RunTurnOptions } from './session-runner';
import { DraftGate } from './speculation';
import type { TurnResult } from './turn-types';

export type Draft = {
  id: string;
  text: string;
  result: Promise<TurnResult>;
  accept(finalText: string): Promise<boolean>;
  cancel(): void;
};

export function startDraft(sessionId: string, eagerText: string, opts: Omit<RunTurnOptions, 'gate' | 'onPlanFingerprint'>): Draft {
  const gate = new DraftGate();
  let gotFingerprint: (fp: string) => void = () => {};
  const fingerprint = new Promise<string>(r => { gotFingerprint = r; });
  const result = runTurn(sessionId, eagerText, { ...opts, gate, onPlanFingerprint: fp => gotFingerprint(fp) });
  result.catch(() => {}); // a cancelled draft's rejection is expected
  return {
    id: gate.id,
    text: eagerText,
    result,
    cancel: () => gate.cancel(),
    async accept(finalText: string): Promise<boolean> {
      if (gate.cancelled) return false;
      if (finalText !== eagerText) { gate.cancel(); return false; }
      // The draft's plan is in within the turn's reads (~35ms); a draft that
      // failed before planning has none, and is not accepted.
      const drafted = await Promise.race([fingerprint, result.then(() => null, () => null)]);
      const now = await planFingerprintNow(sessionId, finalText, opts.acknowledged);
      if (drafted === null || drafted !== now || gate.cancelled) { gate.cancel(); return false; }
      gate.accept();
      return true;
    },
  };
}
