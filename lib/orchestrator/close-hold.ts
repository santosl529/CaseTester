// The close hold on the final answers (Lorenzo, 16 Oct; batches 23–28: 19 of
// 60 runs closed with time left before the recommendation and the replies after
// it were checked, three after a redo that was still wrong). A wrong figure in
// the final answers is report material, not a failure; closing before they are
// checked is. When the case would close with time left:
// - a figure the checker rated wrong in those replies is probed once, whatever
//   its conclusion-changing rating — or, when the closing message carries a
//   deterministic flag on it, code's own line (the checker defers to it);
// - one extra probe per figure: its key, or its step at the same value (a
//   restatement), or the reply right after a model turn's probe of it;
// - the redo — the reply to code's own probe ("Before we wrap up — …") — holds
//   nothing and is not waited on: still wrong, it goes to the report and the
//   case closes (batch 28 Jasmine: "22%" probed, "17–18%" in the redo);
// - a reply whose verdict hasn't landed yet holds the close one turn: code asks
//   the stage's natural follow-up instead — but not for the answer to that
//   follow-up, nor twice in a row (the bound: the redo after a probe gets its
//   wait; the follow-up's own answer closes, its verdict to the report).
// Only time-up overrides it. Plan decides (plan-turn.ts); Settle keeps the
// memory (settle-turn.ts).
import { asksRiskQuestion } from './spoken-close';
import { stepOfKey, claimFigures } from './math-checker-live';
import type { CheckerClaim } from './math-checker';

// At most two wrap-up probes an interview (Lorenzo, 16 Oct): code's "Before we
// wrap up — …" lines, of every kind (the recommendation reply's math probe, a
// held line, the close holds); the rest go to the report.
export const WRAP_UP_PROBES = 2;
export const wrapUpsLeft = (memory: CloseHoldMemory) => WRAP_UP_PROBES - (memory.probeTurns?.length ?? 0);

// Which wrong figure the close probes first (Lorenzo, 16 Oct): one in the
// recommendation reply itself, then the largest error — relative to the right
// figure (the checker's, or code's).
export function relativeError(said: number | undefined, right: number | null | undefined): number {
  if (said === undefined || right === null || right === undefined || !Number.isFinite(said) || !Number.isFinite(right)) return 0;
  return Math.abs(said - right) / Math.max(Math.abs(right), 1e-9);
}
export function claimError(c: CheckerClaim): number {
  const right = c.correctValue ?? (c.correctLow !== null && c.correctHigh !== null ? (c.correctLow + c.correctHigh) / 2 : null);
  return relativeError(claimFigures(c)[0], right);
}
export function holdRank(n: number, from: number | null, error: number): number {
  return (n === from ? 1e6 : 0) + Math.min(error, 1e5);
}
import { line, type PhraseUses } from './phrasing';
import type { StageRecord } from './stage-evidence';

export type CloseHoldMemory = {
  waits?: number[];     // the messages the follow-up was asked on: the next message is its answer
  probeTurns?: number[]; // the messages code's own probe was asked on: the next message is the redo
  probed?: { key: string; at: number }[];   // the final answers' figures probed (code's hold, or the checker's line heard on a model turn), and the message the probe answered
};

// The first candidate message after the recommendation ask, as the stage record has it (one source of truth).
export function finalAnswersFrom(record: StageRecord | undefined): number | null {
  const rec = record?.recommendation;
  return rec?.delivered && rec.deliveredAt !== undefined ? rec.deliveredAt + 1 : null;
}

// The answer to the follow-up, and the redo of code's probe: the first message after one they were asked on.
const previous = (m: number, candidateIndexes: number[]) => Math.max(-1, ...candidateIndexes.filter(i => i < m));
export function answersWait(m: number, candidateIndexes: number[], memory: CloseHoldMemory): boolean {
  return (memory.waits ?? []).includes(previous(m, candidateIndexes));
}
export function isRedo(m: number, candidateIndexes: number[], memory: CloseHoldMemory): boolean {
  return (memory.probeTurns ?? []).includes(previous(m, candidateIndexes));
}

// A final answer: from the recommendation reply on.
export function inFinalScope(m: number, from: number | null): boolean {
  return from !== null && m >= from;
}

// The figure has had its one extra probe: the same key; the same step at the
// same value, or a step whose key carries none; or the redo — the first message
// after that step's probe — at another value (Sofia b28: "5.8 points" in the
// recommendation and "4.2 points" in the risk answer are two figures).
const valueOf = (k: string) => { const i = k.lastIndexOf('@'); const v = i < 0 ? NaN : Number(k.slice(i + 1)); return Number.isFinite(v) ? v : null; };
export function probedAlready(key: string, n: number, memory: CloseHoldMemory, candidateIndexes: number[]): boolean {
  const v = valueOf(key);
  return (memory.probed ?? []).some(p => {
    if (p.key === key) return true;
    if (stepOfKey(p.key) !== stepOfKey(key)) return false;
    const pv = valueOf(p.key);
    const redo = Math.min(...candidateIndexes.filter(i => i > p.at)) === n;
    return pv === null || v === null || Math.abs(pv - v) <= Math.max(0.05, Math.abs(v) * 0.01) || redo;
  });
}

type Row = { category?: string | null; subtype?: string | null; payloadJsonb?: unknown };
// Final answers the checker ran on whose verdict (or error) hasn't landed — the
// current message's always: its check has only just started.
export function pendingFinalChecks(p: {
  messages: { index: number; text: string }[]; from: number | null; memory: CloseHoldMemory;
  rows: Row[]; checked: (text: string) => boolean;
}): number[] {
  const indexes = p.messages.map(m => m.index);
  const landed = new Set(p.rows.filter(r => r.category === 'math_checker' && (r.subtype === 'verdict' || r.subtype === 'error'))
    .map(r => (r.payloadJsonb as { candidateTurnIndex?: number }).candidateTurnIndex));
  return p.messages.filter(m => inFinalScope(m.index, p.from) && !answersWait(m.index, indexes, p.memory) && !isRedo(m.index, indexes, p.memory) && p.checked(m.text) && !landed.has(m.index))
    .map(m => m.index);
}

// The stage's natural follow-up: after the risk, how they'd guard against it;
// otherwise the first step. No recommendation or risk ask in its words — it
// must not reopen a stage.
// Read off the last question: already asked how to guard against it; already asked what comes first.
export const CLOSE_WAIT_MITIGATED = /\b(?:mitigat\w*|guard against|protect against|de-?risk)\b/i;
export const CLOSE_WAIT_FIRST = /\bfirst\b/i;
// 4.8 (Phase 1, `closeWaitMitigation`; Lorenzo, 22 Oct: "close_wait: don't ask for a mitigation if the candidate's last
// answer already gave one (action words: phase / stage / pilot / test / trigger / validate / hedge…), or if the last
// question already asked what they'd do."). Batches 34–38: the follow-up re-asked what the answer had just said (b37
// Hollis Bay Marcus t25 "I'd mitigate by locking retailer commitments … and staging marketing" → "How would you guard
// against that?"; b37 Quillpath Marisol t31 "Protection: roll $60 out to a fraction of traffic … Gate full rollout …";
// b36 Aldermoor Raj t33, Tyler t21 and Marisol t25 — the last two re-asked by the first-step line). The same
// answer often says what comes first too, so with the switch on the first-step line is skipped as well when the
// answer has sequencing words ("first", "start with", "next steps", "before committing") or the last question asked
// what they'd do; the measure line is then asked (controller's reading, proposed — it is a re-ask too when the answer
// already named its metric or checkpoint; no other line exists).
//
// Review fix round, item 4 (Stream 4b's review): the first list matched the stems anywhere, so a bare noun counted
// as an action and the answer skipped a mitigation it had never given — b32 Aldermoor Marisol t29 "the $300 million
// board **test** is on net sales", a "net-price-times-share **test**", "the **gate** here is payer coverage". The
// answer must actually do something, so one of these:
//   - an -ing / -ed form of an action verb ("staging marketing", "taste testing", "gated on the upgrade rate");
//   - an action verb under a decision frame within ~3 words ("I'd hedge…", "we would phase…", "by staging…");
//   - an action verb in clause-initial imperative position with an object ("; stage the 60 reps", "Then phase it",
//     "Gate full rollout") — added past the review's rule, which would otherwise lose b36 Aldermoor Raj t33 and
//     b38 Larkspur Tyler t29, two of the six verbatim re-asks 4.8 exists to fix;
//   - a thing put in place ("set a trigger", "hold a go/no-go", "build in a checkpoint");
//   - or one of the headers an answer uses for exactly this ("next steps", "first step", "what I'd do",
//     "Mitigation:" / "Protection:" — a comma counts, as in b38 Larkspur Tyler t29's "Mitigation, in order:").
const CLOSE_WAIT_ACTION_PARTS = [
  /\b(?:phas|stag|pilot|test|trigger|validat|hedg|mitigat|guard|gat|stagger|sequenc|protect|de-?risk)(?:ing|ed)\b|\broll(?:ing|ed)\s+out\b|\brollout\b/,
  /\b(?:i'?d|i\s+would|we(?:'?d|\s+would)|they(?:'?d|\s+would)|(?:the\s+)?client\s+(?:would|should|could)|let'?s|plan\s+to|by)\s+(?:\w+\s+){0,3}(?:phase|stage|pilot|test|trigger|validate|hedge|mitigate|guard|protect|gate|stagger|sequence|roll\s+out)\w*/,
  /(?:^|[.;!?:]\s*|—\s*)(?:(?:and|then|next|also|so)\s+)?(?:phase|stage|pilot|test|trigger|validate|hedge|mitigate|guard|protect|gate|stagger|sequence|roll\s+out)\s+(?:a|an|the|it|them|this|that|full|\$|\d)/,
  /\b(?:put|set|build|add|run|hold|lock)\s+(?:a|an|the|in)?\s*(?:tripwire|checkpoint|gate|trigger|control|go\/no-go)/,
  /\bnext\s+steps?\b|\bfirst\s+step\b|\bwhat\s+i'?d\s+do\b|\b(?:mitigation|protection)\b\s*[:,]/,
];
export const CLOSE_WAIT_ACTION = new RegExp(CLOSE_WAIT_ACTION_PARTS.map(r => r.source).join('|'), 'i');
export const CLOSE_WAIT_ASKED_DO = /\bwhat\s+(?:would|should|could)\s+(?:you|they|the\s+client|\w+)\s+do\b|\bhow\s+would\s+you\s+(?:handle|respond|address|manage|deal\s+with|mitigate|protect|guard|hedge|de-?risk|reduce)\b|\bwhat\s+would\s+you\s+put\s+in\s+place\b|\bnext\s+steps?\b/i;
// …and the same for the sequencing test: a bare "first" fired on "the first-mover advantage" and "the first city".
// It must be the sequencing word — sentence-initial, punctuated as a header, "the first step / thing / move", or
// "start(ing) with". "begin" is narrowed to "begin with / by" for the same reason.
export const CLOSE_WAIT_SAID_FIRST = /(?:^|[.;!?]\s*)first(?:ly)?\b|\bfirst(?:ly)?[,:]|\bthe\s+first\s+(?:step|thing|move)\b|\bstart(?:ing)?\s+with\b|\bbegin\s+(?:with|by)\b|\bnext\s+steps?\b|\bin\s+order\b|\bimmediately\b|\bright\s+now\b|\btomorrow\b|\bbefore\s+(?:committing|launch\w*|the\s+vote|rolling|we|any)\b/i;
export function closeWaitLine(lastQuestion: string, seed: string, uses?: PhraseUses, o: { answer?: string; skipAnswered?: boolean } = {}): string {
  const skip = o.skipAnswered === true;
  const answer = o.answer ?? '';
  const mitigated = skip && (CLOSE_WAIT_ACTION.test(answer) || CLOSE_WAIT_ASKED_DO.test(lastQuestion));
  if (asksRiskQuestion(lastQuestion, true) && !CLOSE_WAIT_MITIGATED.test(lastQuestion) && !mitigated) return line('after_risk', uses, seed);
  const saidFirst = skip && (CLOSE_WAIT_SAID_FIRST.test(answer) || CLOSE_WAIT_ASKED_DO.test(lastQuestion));
  if (!CLOSE_WAIT_FIRST.test(lastQuestion) && !saidFirst) return line('first_step', uses, seed);
  return line('measure', uses, seed);
}
