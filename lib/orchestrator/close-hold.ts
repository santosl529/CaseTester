// The close hold on the final answers (Lorenzo, 16 Oct; batches 23–28: 19 of
// 60 runs closed with time left before the recommendation and the replies after
// it were checked, three after a redo that was still wrong). A wrong figure in
// the final answers is report material, not a failure; closing before they are
// checked is. When the case would close with time left:
// - a figure the checker rated wrong in those replies is probed once, whatever
//   its conclusion-changing rating — or, when the closing message carries a
//   deterministic flag on it, code's own line (the checker defers to it);
// - one extra probe per figure, counted by its step: a redo still wrong, even
//   at another value, goes to the report and the case closes;
// - a reply whose verdict hasn't landed yet holds the close one turn: code asks
//   the stage's natural follow-up instead (once an interview).
// Only time-up overrides it. Plan decides (plan-turn.ts); Settle keeps the
// memory (settle-turn.ts).
import { asksRiskQuestion } from './spoken-close';
import { stepOfKey } from './math-checker-live';
import { pickScript } from '@/lib/agent/prompts/scripts';
import type { StageRecord } from './stage-evidence';

export type CloseHoldMemory = {
  waited?: boolean;     // the follow-up turn was asked
  probed?: string[];    // flag keys probed in the final answers (code's hold, or the checker's line heard on a model turn)
};

// The first candidate message after the recommendation ask, as the stage record has it (one source of truth).
export function finalAnswersFrom(record: StageRecord | undefined): number | null {
  const rec = record?.recommendation;
  return rec?.delivered && rec.deliveredAt !== undefined ? rec.deliveredAt + 1 : null;
}

// A final answer: from the recommendation reply on.
export function inFinalScope(m: number, from: number | null): boolean {
  return from !== null && m >= from;
}

// The figure has had its one extra probe: a key of the same step was probed.
export function probedAlready(key: string, memory: CloseHoldMemory): boolean {
  return (memory.probed ?? []).some(k => stepOfKey(k) === stepOfKey(key));
}

type Row = { category?: string | null; subtype?: string | null; payloadJsonb?: unknown };
// Final answers the checker ran on whose verdict (or error) hasn't landed — the
// current message's always: its check has only just started.
export function pendingFinalChecks(p: {
  messages: { index: number; text: string }[]; from: number | null;
  rows: Row[]; checked: (text: string) => boolean;
}): number[] {
  const landed = new Set(p.rows.filter(r => r.category === 'math_checker' && (r.subtype === 'verdict' || r.subtype === 'error'))
    .map(r => (r.payloadJsonb as { candidateTurnIndex?: number }).candidateTurnIndex));
  return p.messages.filter(m => inFinalScope(m.index, p.from) && p.checked(m.text) && !landed.has(m.index))
    .map(m => m.index);
}

// The stage's natural follow-up: after the risk, how they'd guard against it;
// otherwise the first step. No recommendation or risk ask in its words — it
// must not reopen a stage.
const AFTER_RISK = ['How would you guard against that?', 'What would you put in place to guard against that?'] as const;
const FIRST_STEP = ['What would you have the client do first?', "What's the first step you'd want the client to take?"] as const;
const MEASURE = ['How would you know, six months in, that it was working?'] as const;
export function closeWaitLine(lastQuestion: string, seed: string): string {
  if (asksRiskQuestion(lastQuestion, true) && !/\b(?:mitigat\w*|guard against|protect against|de-?risk)\b/i.test(lastQuestion)) return pickScript([...AFTER_RISK], seed);
  if (!/\bfirst\b/i.test(lastQuestion)) return pickScript([...FIRST_STEP], seed);
  return pickScript([...MEASURE], seed);
}
