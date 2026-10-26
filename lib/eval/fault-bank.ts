// The fault bank (Phase 1 contract §4, docs/superpowers/plans/2026-10-22-phase1-contract.md): one record per
// graded fault in batches 33–38 and ~100 records of correct behaviour, in evals/fault-bank/<batch>.jsonl. The
// replay harness (Stream 1, scripts/fault-bank.ts) replays each record's run through the runner replay and checks
// every assertion against what the replay now delivers. A record names the interviewer turn as the grading does:
// `turn` tN is the reply to the candidate message with TurnRecord.turnIndex N − 1.
import { z } from 'zod';

export const FAULT_CLASSES = [
  'false_refusal', 'wrong_release', 'unasked_release', 'unasked_offer', 'bare_partial', 'restatement',
  'hollow_deferral', 'ignored_ask', 'stale_probe', 'stale_correction', 'false_correction', 'missed_error',
  'repeated_probe', 'probe_chain', 'misquote_uncorrected', 'wrong_figure', 'close_wait_reask', 'rec_reask',
  'stage_missed', 'premature_close', 'ack_repetition', 'report_false', 'other',
] as const;
export const CORRECT_CLASSES = ['true_refusal', 'correct_release', 'correct_probe', 'correct_correction', 'correct_deferral', 'correct_close', 'correct_restatement'] as const;

// Where an assertion looks: the record's turn, or a window of interviewer turns (inclusive), e.g. "no probe on Z after tN".
const Scope = z.union([z.object({ turn: z.number().int() }).strict(), z.object({ fromTurn: z.number().int(), toTurn: z.number().int().optional() }).strict()]);

export const AssertionSchema = z.discriminatedUnion('kind', [
  // A ledger item released (in a delivered segment's revealIds) — or not.
  z.object({ kind: z.literal('release'), item: z.string(), must: z.boolean(), scope: Scope.optional() }).strict(),
  z.object({ kind: z.literal('exhibit'), exhibit: z.string(), must: z.boolean(), scope: Scope.optional() }).strict(),
  // A refusal ("I don't have…", "that's not something I have") — optionally one whose words match `about`.
  z.object({ kind: z.literal('refusal'), about: z.string().optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
  // A restatement of an item already out ("As I mentioned", "Repeating what I said before", an exhibit restated).
  // `doubled`: the item's own line said TWICE in the one turn (the model's copy plus code's) — the fault in the
  // b34l doubled-line records, which removing code's copy alone cannot clear (critical 2 of the Stream 1 review).
  z.object({ kind: z.literal('restatement'), item: z.string().optional(), doubled: z.boolean().optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
  // A probe or a correction, optionally naming a figure (as said: "5.8", "$920").
  z.object({ kind: z.literal('probe'), figure: z.string().optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
  z.object({ kind: z.literal('correction'), figure: z.string().optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
  z.object({ kind: z.literal('deferral'), item: z.string().optional(), about: z.string().optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
  // A stage question: the recommendation, the risk, a mitigation, the brainstorm.
  z.object({ kind: z.literal('ask'), stage: z.enum(['recommendation', 'risk', 'mitigation', 'brainstorm']), must: z.boolean(), scope: Scope.optional() }).strict(),
  z.object({ kind: z.literal('close'), must: z.boolean(), scope: Scope.optional() }).strict(),
  // The ask gets a word (critical 5 of the Stream 1 review; Lorenzo, 25 Oct): ON THE RECORD'S TURN (or
  // scope.fromTurn) the item is released, a refusal is spoken, or a deferral is spoken that LATER RESOLVES (a
  // release of the item, or a refusal about it, before the close). The window covers the deferral's resolution
  // only — the three accept paths are anchored at the turn, so a later release does not excuse a turn that ignored
  // the ask (bank fix 4, 26 Oct). An unresolved deferral is not an answer, so silence and a hollow deferral both
  // fail; `accept` narrows which of the three count (default: all three). The window defaults to the record's turn
  // → the close, because a deferral's resolution is owed by then (contract 4.7). At least one of `item` / `about`
  // is given.
  z.object({ kind: z.literal('answered'), item: z.string().optional(), about: z.string().optional(),
    accept: z.array(z.enum(['release', 'refusal', 'deferral'])).min(1).optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
  // The turn says something of its own: a delivered sentence that is neither a refusal nor a deferral — so silence,
  // a neutral "Go on." and a refuse-everything turn all fail. With `question`, that sentence asks something.
  //
  // DECLARED SCOPE (I5, 26 Oct): `spoke` is a NON-DEGENERACY FLOOR, not an answer check. It says the fix must not
  // be "say nothing there" — it does not say the turn said anything relevant. Any sentence of 20 characters, or any
  // question, satisfies it. So where a turn owes an engagement (the candidate asked something, or the turn's own
  // answer must survive the fix), `spoke` is PAIRED with an `answered` over the item or a `says` over the expected
  // content; where the candidate's message carries no ask, the floor is the whole of what the record claims and
  // the must-not carries the fault. Each record's note says which of the two it is.
  z.object({ kind: z.literal('spoke'), question: z.boolean().optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
  // Free text over the turn's delivered words (case-insensitive regex).
  z.object({ kind: z.literal('says'), pattern: z.string(), must: z.boolean(), scope: Scope.optional() }).strict(),
  // A check decision in TurnRecord.checks (e.g. { check: "code_gate", decision: "drop" }).
  z.object({ kind: z.literal('check'), check: z.string(), decision: z.string().optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
]).superRefine((a, ctx) => {
  if (a.kind === 'answered' && !a.item && !a.about) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'an `answered` assertion names the item or the ask (`about`)' });
});
export type Assertion = z.infer<typeof AssertionSchema>;

export const FaultRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),        // e.g. "b38l-tyler-t24-hollow"
  kind: z.enum(['fault', 'correct']),
  batch: z.string(),                           // "batch-38-larkspur"
  wave: z.string(),                            // the run folder's wave, "batch-38-larkspur-oct-21-runs-1-5"
  run: z.string(),                             // session id prefix, "cee7d399"
  turnFile: z.string(),                        // path under the corpus root ("test runs/…/live-run-….turns.jsonl.gz")
  caseId: z.string(),
  persona: z.number().int(),
  turn: z.number().int(),                      // the interviewer turn tN
  grade: z.object({
    severity: z.enum(['serious', 'firm', 'false', 'borderline', 'correct']),
    class: z.enum([...FAULT_CLASSES, ...CORRECT_CLASSES]),
    source: z.string(),                        // "batch-38-larkspur/hand-grading.md" or "lorenzo-ruling-2026-10-21"
    note: z.string(),
  }).strict(),
  // The recorded state, from the turn file (stateBefore of turnIndex turn − 1).
  state: z.object({
    phase: z.string(),
    elapsedMs: z.number().nullable(),
    revealedIds: z.array(z.string()),
    shownExhibitIds: z.array(z.string()),
    openDataRequests: z.array(z.object({ ledgerItemId: z.string(), what: z.string() })),
  }).strict(),
  candidateText: z.string(),
  said: z.string(),                            // the interviewer line as delivered (the segments joined)
  assertions: z.array(AssertionSchema).min(1),
  // false: the fix needs words only the model writes or a live call the replay doesn't serve (contract §4.3).
  replayable: z.boolean(),
  replayNote: z.string().optional(),
  stream: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal('phase2'), z.literal('none')]),
}).strict();
export type FaultRecord = z.infer<typeof FaultRecordSchema>;

// The harness's result per record.
// `vacuous`: a must-not assertion whose window holds no turn in the replay — nothing was looked at, so the record
// is skipped, not passed (finding 7 of the Stream 1 review) — but only when nothing else about the record failed:
// a skip must never mask a recorded failure, or a fix that flips a turn's kind or empties a window would take a
// failing record out of the gate's denominator and the gate line would improve (bank fix 3, 26 Oct).
export type FaultResult = { id: string; pass: boolean; failed: { assertion: Assertion; saw: string }[]; skipped?: 'not_replayable' | 'run_missing' | 'diverged' | 'vacuous' };

// ── comparing two runs (bank fix 3, 26 Oct) ──
// Gate condition 1 is not just "how many pass": a fix that flips a turn's kind, shortens a run or empties a
// must-not's window takes a failing record out of the gate's denominator, and the gate line *improves* while the
// fault persists. The probe classes are exactly the ones whose fixes flip kinds. So the gate also requires that
// **no record moves from `fails_as_expected` into any skip class**, and every record that does is listed for a
// hand read. `scripts/fault-bank.ts compare --against=` reads two results.json files through this.
export type BankResultRow = { id: string; kind: FaultRecord['kind']; pass: boolean; skipped?: FaultResult['skipped']; baseline?: string };
export type BankMove = { id: string; kind: string; from: string; to: string; escape: boolean };
export const resultState = (r: BankResultRow) => r.skipped ?? (r.pass ? 'pass' : 'FAIL');

export function bankMoves(from: readonly BankResultRow[], to: readonly BankResultRow[]): BankMove[] {
  const was = new Map(from.map(r => [r.id, r]));
  const now = new Set(to.map(r => r.id));
  const out: BankMove[] = [];
  for (const r of to) {
    const b = was.get(r.id);
    if (!b) { out.push({ id: r.id, kind: r.kind, from: '(new record)', to: resultState(r), escape: false }); continue; }
    if (resultState(b) === resultState(r)) continue;
    out.push({ id: r.id, kind: r.kind, from: resultState(b), to: resultState(r), escape: b.baseline === 'fails_as_expected' && !!r.skipped });
  }
  // A record that is gone entirely has left the denominator too.
  for (const b of from) if (!now.has(b.id)) out.push({ id: b.id, kind: b.kind, from: resultState(b), to: '(record gone)', escape: b.baseline === 'fails_as_expected' });
  return out;
}
export const bankSkipEscapes = (from: readonly BankResultRow[], to: readonly BankResultRow[]) => bankMoves(from, to).filter(m => m.escape);
