// One item format for authored and generated drill items (docs/prd-drills.md
// "Content system → Item format"). An item carries its full answer key:
// options' `correct`/`tag`/`feedback`, `numeric`, `checks`, `red_flags`,
// `model_answer`, `explanation` and `extras` are all server-only. Only
// toPublicItem (lib/drills/public-item.ts) may shape an item for the client.
import { z } from 'zod';
import { ChartSpecSchema } from './chart-spec';
import { InputTypeSchema, getDrill, getMistakeTag, isKnownTag, DRILLS_CONFIG } from './config';

const Tier = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Tier = z.infer<typeof Tier>;

const KnownTag = z.string().refine(isKnownTag, { error: iss => `Unknown mistake tag ${String(iss.input)}` });
const skillIds = new Set(DRILLS_CONFIG.taxonomy.skills.map(s => s.id));
const KnownSkill = z.string().refine(s => skillIds.has(s), { error: iss => `Unknown skill ${String(iss.input)}` });

export const OptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  correct: z.boolean(),
  tag: KnownTag.optional(),     // required on wrong options
  feedback: z.string().min(1),
});

export const NumericKeySchema = z.object({
  answer: z.number(),
  tolerance_type: z.enum(['absolute', 'relative']),
  tolerance_value: z.number().nonnegative(),
  percent_format: z.enum(['none', 'percent', 'percent_or_decimal']),
  trap_values: z.array(z.object({ value: z.number(), tag: KnownTag })),
});

export const InputSpecSchema = z.object({
  type: InputTypeSchema,
  max_words: z.number().int().positive().optional(),
  max_buckets: z.number().int().positive().optional(),
  max_select: z.number().int().positive().optional(),
  // Multi-step items (QN-4: pick the formula, then calculate). `type` is the
  // first step's type. Step weights are scoring rules from the drill spec,
  // not answer data, so they may reach the client.
  steps: z.array(z.object({
    type: InputTypeSchema,
    weight: z.number().positive().max(1),
    // What the step asks, shown above its input ("Now calculate it").
    label: z.string().optional(),
    max_words: z.number().int().positive().optional(),
    // Fixed choices for a choice step whose right answer depends on an
    // earlier step (HY-2 keep/revise/drop, QN-5's sanity check), so they
    // can't be options with a static `correct` flag.
    choices: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).optional(),
    // Its own time limit, counted from when the previous step was submitted
    // (HY-2 stage 2). Without one, the step shares the item's limit.
    time_limits_s: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]).optional(),
  })).min(2).optional(),
});

const CheckSchema = z.object({
  check_id: z.string().min(1),
  question: z.string().min(1),
  weight: z.number().positive().max(1),
  fail_tag: KnownTag,
  feedback: z.string().min(1),
  // Which step's answer the check reads (HY-2 grades stage 1 and stage 2).
  step: z.number().int().nonnegative().default(0),
  // "code" checks are settled by code before the AI call and never sent to it
  // (PRD "Deterministic backstops": word caps, bucket counts, number presence).
  detection: z.enum(['ai', 'code']).default('ai'),
  // "whole": the check judges the answer as a whole or something it leaves
  // out ("no two buckets overlap", "leaves out the irrelevant facts"), so no
  // single quote can show it. Every other check needs a verified quote.
  evidence: z.enum(['quote', 'whole']).default('quote'),
});

const RedFlagSchema = z.object({
  id: z.string().min(1),
  definition: z.string().min(1),
  cap: z.number().min(0).max(1),
  tag: KnownTag,
  detection: z.enum(['ai', 'code']),
  // The cap applies to this step's share of the score (HY-2's red flags cap
  // stage 1 only); on single-step items that is the whole item.
  step: z.number().int().nonnegative().default(0),
});

// Set on generated items: attempts store this triple instead of an item row,
// and the generator rebuilds the item from it for review.
const GeneratorRefSchema = z.object({
  template_id: z.string().min(1),
  template_version: z.number().int().positive(),
  seed: z.number().int().nonnegative(),
});

export const ItemSchema = z.object({
  item_id: z.string().min(1),
  version: z.number().int().positive(),
  drill_id: z.string(),
  status: z.enum(['draft', 'in_review', 'live', 'retired']),
  level: z.union([z.literal(1), z.literal(2)]),
  tier: Tier,
  skills: z.array(KnownSkill).min(1),
  case_type: z.string().nullable(),
  prompt: z.string().min(1),
  exhibit: ChartSpecSchema.nullable(),
  input: InputSpecSchema,
  options: z.array(OptionSchema),
  numeric: NumericKeySchema.nullable(),
  checks: z.array(CheckSchema),
  red_flags: z.array(RedFlagSchema),
  model_answer: z.string().nullable(),
  explanation: z.string().min(1),
  // Drill-specific key data (HY-2 families, QN-5 driver cards, generator
  // inputs...). Server-only like the rest of the key.
  extras: z.record(z.string(), z.unknown()).default({}),
  sources: z.array(z.string()).default([]),
  authorship: z.object({
    author_of_record: z.string(),
    drafting_model: z.string().nullable(),
    reviewed_by: z.string().nullable(),
    reviewed_at: z.string().nullable(),
    similarity_check: z.enum(['passed', 'failed', 'pending']),
  }).nullable(),
  generator: GeneratorRefSchema.nullable(),
  // The drill's worked example on the intro screen. One reviewed item per
  // authored drill; never served in a set.
  is_example: z.boolean().default(false),
  firm_style: z.null(),         // reserved (PRD out of scope: firm-style toggles)
}).superRefine((item, ctx) => {
  const issue = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: 'custom', message, path });
  let drill;
  try { drill = getDrill(item.drill_id); } catch { issue(`Unknown drill ${item.drill_id}`, ['drill_id']); return; }

  if (item.level !== drill.level) issue(`${drill.id} is a level ${drill.level} drill`, ['level']);
  for (const s of item.skills) if (!drill.skills.includes(s)) issue(`${drill.id} doesn't train ${s}`, ['skills']);
  if (!drill.input_types.includes(item.input.type)) issue(`${drill.id} doesn't take ${item.input.type} input`, ['input', 'type']);
  if (item.input.steps) {
    if (item.input.steps[0].type !== item.input.type) issue('input.type must be the first step\'s type', ['input', 'steps']);
    for (const step of item.input.steps) {
      if (!drill.input_types.includes(step.type)) issue(`${drill.id} doesn't take ${step.type} input`, ['input', 'steps']);
    }
    const total = item.input.steps.reduce((sum, st) => sum + st.weight, 0);
    if (Math.abs(total - 1) > 1e-6) issue(`Step weights sum to ${total}, not 1`, ['input', 'steps']);
  }

  // Every wrong-answer tag must belong to one of the drill's skills, or the
  // diagnosis would credit a skill the drill doesn't train. Arithmetic
  // diagnosis tags (QN-3 traps) may land on any QN skill.
  const tagOk = (tag: string) => {
    const t = getMistakeTag(tag);
    return !t || drill.skills.includes(t.skill) || t.skill.startsWith('QN.');
  };

  const choice = item.input.type === 'single_choice' || item.input.type === 'multi_select';
  if (choice) {
    if (item.options.length < 2) issue('Choice items need at least 2 options', ['options']);
    const correct = item.options.filter(o => o.correct).length;
    if (item.input.type === 'single_choice' && correct !== 1) issue(`Single choice needs exactly 1 correct option, has ${correct}`, ['options']);
    if (item.input.type === 'multi_select' && correct < 1) issue('Multi-select needs a correct option', ['options']);
  }
  const ids = new Set<string>();
  const texts = new Set<string>();
  item.options.forEach((o, i) => {
    if (ids.has(o.id)) issue(`Duplicate option id ${o.id}`, ['options', i, 'id']);
    if (texts.has(o.text.trim().toLowerCase())) issue(`Duplicate option text "${o.text}"`, ['options', i, 'text']);
    ids.add(o.id); texts.add(o.text.trim().toLowerCase());
    if (!o.correct && !o.tag) issue(`Wrong option ${o.id} needs a mistake tag`, ['options', i, 'tag']);
    if (o.tag && !tagOk(o.tag)) issue(`Option ${o.id}: tag ${o.tag} is outside ${drill.id}'s skills`, ['options', i, 'tag']);
  });

  const takesNumber = item.input.type === 'numeric' || item.input.steps?.some(st => st.type === 'numeric');
  if (takesNumber && !item.numeric) issue('Numeric items need a numeric key', ['numeric']);
  if (item.is_example) {
    if (item.generator !== null) issue('Only authored items can be the worked example', ['is_example']);
    if (!item.authorship?.reviewed_by) issue('The worked example must be a reviewed item', ['is_example']);
  }
  if (item.numeric) {
    item.numeric.trap_values.forEach((t, i) => {
      if (!tagOk(t.tag)) issue(`Trap tag ${t.tag} is outside ${drill.id}'s skills`, ['numeric', 'trap_values', i, 'tag']);
    });
  }

  if (drill.scoring !== 'auto') {
    if (item.checks.length === 0) issue(`${drill.id} is checklist-scored and needs checks`, ['checks']);
  }
  if (item.checks.length) {
    const total = item.checks.reduce((sum, c) => sum + c.weight, 0);
    // HY-2's stage 2 decision weight is scored by code, outside the checks.
    if (drill.scoring === 'checklist' && Math.abs(total - 1) > 1e-6) issue(`Check weights sum to ${total}, not 1`, ['checks']);
  }

  if (drill.item_source === 'generated' && item.generator === null) {
    issue(`${drill.id} items are generated and need a generator ref`, ['generator']);
  }
  if (drill.item_source === 'authored' && item.generator !== null) {
    issue(`${drill.id} items are authored; only generated items carry a generator ref`, ['generator']);
  }
  if (item.generator === null && item.authorship === null) issue('Authored items need authorship', ['authorship']);
});

export type Item = z.infer<typeof ItemSchema>;
export type ItemInput = z.input<typeof ItemSchema>;
export type NumericKey = z.infer<typeof NumericKeySchema>;
