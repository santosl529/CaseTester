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
  z.object({ kind: z.literal('restatement'), item: z.string().optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
  // A probe or a correction, optionally naming a figure (as said: "5.8", "$920").
  z.object({ kind: z.literal('probe'), figure: z.string().optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
  z.object({ kind: z.literal('correction'), figure: z.string().optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
  z.object({ kind: z.literal('deferral'), item: z.string().optional(), about: z.string().optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
  // A stage question: the recommendation, the risk, a mitigation, the brainstorm.
  z.object({ kind: z.literal('ask'), stage: z.enum(['recommendation', 'risk', 'mitigation', 'brainstorm']), must: z.boolean(), scope: Scope.optional() }).strict(),
  z.object({ kind: z.literal('close'), must: z.boolean(), scope: Scope.optional() }).strict(),
  // Free text over the turn's delivered words (case-insensitive regex).
  z.object({ kind: z.literal('says'), pattern: z.string(), must: z.boolean(), scope: Scope.optional() }).strict(),
  // A check decision in TurnRecord.checks (e.g. { check: "code_gate", decision: "drop" }).
  z.object({ kind: z.literal('check'), check: z.string(), decision: z.string().optional(), must: z.boolean(), scope: Scope.optional() }).strict(),
]);
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
export type FaultResult = { id: string; pass: boolean; failed: { assertion: Assertion; saw: string }[]; skipped?: 'not_replayable' | 'run_missing' | 'diverged' };
