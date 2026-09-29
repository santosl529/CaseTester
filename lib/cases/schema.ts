import { z } from 'zod';

const PhaseSchema = z.enum([
  'INTRO', 'CLARIFY', 'STRUCTURE', 'ANALYSIS',
  'EXHIBIT', 'BRAINSTORM', 'RECOMMENDATION', 'WRAP', 'SCORING',
]);

// docs/interviewer-behavior.md Rule 10 + docs/case-authoring.md "Ledger values
// must be speakable sentences": the orchestrator appends `value` verbatim to
// the interviewer's spoken text on reveal (lib/orchestrator/session-runner.ts),
// so an unlabeled fragment ships straight to the candidate. A pilot run
// revealed "+40% increase in raw coffee bean costs" — a noun-phrase fragment,
// not a sentence — right after "let me pull that data for you," reading as a
// non-sequitur. Catching this needs more than a label-keyword check: the bad
// example above already contains "coffee bean," so keyword presence alone
// doesn't distinguish it from the fixed version, "Raw coffee bean costs are up
// 40% over the past two years." The actual difference is sentence structure —
// terminal punctuation plus a finite verb — so that's what this checks.
const SENTENCE_VERB_RE = new RegExp(
  '\\b(is|are|was|were|has|have|had|remains?|remained|stands?|stood|' +
  'rose|rises|risen|fell|falls|fallen|grew|grows|grown|' +
  'increased|increases|decreased|decreases|surged|surges|' +
  'dropped|drops|jumped|jumps|climbed|climbs|stayed|held|holds|' +
  'comes|came|totals?|totaled)\\b',
  'i',
);

function isSpeakableSentence(value: string): boolean {
  return /[.!?]\s*$/.test(value.trim()) && SENTENCE_VERB_RE.test(value);
}

const LedgerItemSchema = z.object({
  id: z.string(),
  label: z.string(),        // shown to LLM before reveal (e.g. "Total revenue")
  value: z.string(),        // the actual number — server-only
  releaseWhen: PhaseSchema, // earliest phase at which reveal is legal
}).superRefine((item, ctx) => {
  if (!isSpeakableSentence(item.value)) {
    ctx.addIssue({
      code: 'custom',
      path: ['value'],
      message: `dataLedger item "${item.id}": value must be a complete spoken ` +
        `sentence with terminal punctuation and a verb (docs/case-authoring.md ` +
        `"Ledger values must be speakable sentences"), got: ${JSON.stringify(item.value)}`,
    });
  }
});

const MathStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  answer: z.number(),                      // ground truth — server-only
  tolerance: z.number(),                    // ±5% acceptable error — must be explicit in case file
  // Other numerically-different-but-defensible results for the same step (e.g.
  // "COGS dollar increase" measured as actual spend growth vs margin impact).
  // A candidate landing on any of these is NOT an arithmetic error; misusing
  // the figure is a separate (conceptual) judgment the judge makes.
  altAnswers: z.array(z.number()).optional(),
});

const ExhibitSchema = z.object({
  id: z.string(),
  title: z.string(),
  chartType: z.enum(['bar', 'line', 'table', 'pie']),
  data: z.array(z.record(z.string(), z.unknown())),    // client-safe display data
  interpretationKey: z.string(),           // server-only insight
  // Ledger item ids whose figures this exhibit displays — showing the exhibit
  // releases them (docs/case-authoring.md, interviewer-behavior Rule 11).
  coversLedgerItems: z.array(z.string()).optional(),
});

const RubricAnchorSchema = z.object({
  needs_work: z.string(),
  meets_bar: z.string(),
  strong: z.string(),
});

// Rule 8 (docs/interviewer-behavior.md): "pacing nudge uses per-phase time
// budgets from case config, not a uniform schedule." Optional — cases without
// pacing fall back to an even split (lib/orchestrator/pacing.ts).
const PacingSchema = z.object({
  phaseBudgetsMs: z.partialRecord(PhaseSchema, z.number().positive()).optional(),
  timeWarningMs: z.number().positive().optional(), // default 90s (text), see DEFAULT_TIME_WARNING_MS
});

export const CaseSchema = z.object({
  id: z.string().regex(/^[a-z]+-\d{3}$/, 'Case id must match pattern like prof-001'),
  title: z.string().min(1),
  firmStyle: z.enum(['mckinsey', 'bcg', 'bain', 'generic']).default('mckinsey'),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  prompt: z.string().min(50),
  interviewerNotes: z.string(),
  dataLedger: z.array(LedgerItemSchema).min(1),
  mathSteps: z.array(MathStepSchema).min(1),
  exhibits: z.array(ExhibitSchema),
  structureKey: z.string().min(1),
  recommendationKey: z.string().min(1),
  pacing: PacingSchema.optional(),
  // Deprecated: the judge scores against the generic 8-dimension rubric in
  // lib/scoring/rubric.ts (docs/Case Interview Feedback Rubric.pdf). Per-case
  // anchors are tolerated in case files but no longer read.
  rubricAnchors: z.record(z.string(), RubricAnchorSchema).optional(),
});

export type Case = z.infer<typeof CaseSchema>;
