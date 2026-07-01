import { z } from 'zod';

const PhaseSchema = z.enum([
  'INTRO', 'CLARIFY', 'STRUCTURE', 'ANALYSIS',
  'EXHIBIT', 'BRAINSTORM', 'RECOMMENDATION', 'WRAP', 'SCORING',
]);

const LedgerItemSchema = z.object({
  id: z.string(),
  label: z.string(),        // shown to LLM before reveal (e.g. "Total revenue")
  value: z.string(),        // the actual number — server-only
  releaseWhen: PhaseSchema, // earliest phase at which reveal is legal
});

const MathStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  answer: z.number(),                      // ground truth — server-only
  tolerance: z.number(),                    // ±5% acceptable error — must be explicit in case file
});

const ExhibitSchema = z.object({
  id: z.string(),
  title: z.string(),
  chartType: z.enum(['bar', 'line', 'table', 'pie']),
  data: z.array(z.record(z.string(), z.unknown())),    // client-safe display data
  interpretationKey: z.string(),           // server-only insight
});

const RubricAnchorSchema = z.object({
  needs_work: z.string(),
  meets_bar: z.string(),
  strong: z.string(),
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
  rubricAnchors: z.object({
    structure: RubricAnchorSchema,
    quantitative: RubricAnchorSchema,
    judgment: RubricAnchorSchema,
    communication: RubricAnchorSchema,
    synthesis: RubricAnchorSchema,
  }),
});

export type Case = z.infer<typeof CaseSchema>;
