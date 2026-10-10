// Drills config (docs/prd-drills.md "Data model → Config files"). Three
// versioned JSON files hold the taxonomy, the drill catalog and the progression
// rules; nothing else may hard-code a tag, skill or threshold. Each file is
// zod-validated and cross-checked against the others when this module loads,
// so a malformed config fails the boot, like a malformed case file
// (lib/cases/loader.ts).
import { z } from 'zod';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import taxonomyJson from './config/taxonomy.v1.json';
import drillsJson from './config/drills.v1.json';
import rulesJson from './config/rules.v1.json';

const AREA_CODES = ['PS', 'HY', 'QN', 'EX', 'BJ', 'CR', 'SY', 'CM', 'CL'] as const;
export type SkillAreaCode = (typeof AREA_CODES)[number];

const SkillId = z.string().regex(/^[A-Z]{2}\.[a-z_]+$/, 'Skill id must look like QN.percent_change');
const TagId = z.string().regex(/^M\.[a-z_]+$/, 'Mistake tag must look like M.unit_error');
const DrillId = z.string().regex(/^[A-Z]{2}-\d$/, 'Drill id must look like QN-3');
const TierTimes = z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]);
const Share = z.number().min(0).max(1);

export const TaxonomySchema = z.object({
  version: z.string(),
  areas: z.array(z.object({
    code: z.enum(AREA_CODES),
    name: z.string().min(1),
    rubric_dimension: z.enum(RUBRIC_DIMENSION_KEYS),
  })),
  skills: z.array(z.object({
    id: SkillId,
    area: z.enum(AREA_CODES),
    name: z.string().min(1),
    description: z.string().min(1),
  })),
  mistake_tags: z.array(z.object({
    id: TagId,
    skill: SkillId,
    // Plain-word name for results copy ("2 of your 3 misses were unit errors").
    label: z.string().min(1),
    // Product sign-off pending (PRD open question "Tag severity"); required
    // before the prescription engine ships in D3.
    severity: z.enum(['minor', 'major']).nullable(),
    deprecated: z.boolean(),
  })),
  // M.timeout and M.skipped: logged on attempts but mapped to no skill.
  system_tags: z.array(z.object({ id: TagId, label: z.string().min(1) })),
});

export const InputTypeSchema = z.enum([
  'single_choice', 'multi_select', 'ordering', 'numeric',
  // numeric_set: several labeled numbers in one step (QN-5's assumptions).
  'numeric_set', 'free_text', 'structured_buckets', 'grouped_ideas',
]);

export const DrillSchema = z.object({
  id: DrillId,
  name: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2)]),
  skills: z.array(SkillId).min(1),
  input_types: z.array(InputTypeSchema).min(1),
  scoring: z.enum(['auto', 'checklist', 'checklist_auto']),
  // Null only for P2 drills the PRD doesn't size yet (BJ-3, CM-2).
  set_size: z.number().int().min(3).max(10).nullable(),
  time_limits_s: TierTimes.nullable(),        // per item, T1 / T2 / T3
  stage_time_limits_s: z.record(z.string(), TierTimes).optional(), // HY-2's two stages
  word_caps: z.record(z.string(), z.number().int().positive()).optional(),
  pass_bar: Share,
  priority: z.enum(['P0', 'P1', 'P2']),
  item_source: z.enum(['generated', 'authored', 'mixed']),
  live: z.boolean(),
}).superRefine((d, ctx) => {
  if (d.priority !== 'P2' && d.set_size === null) {
    ctx.addIssue({ code: 'custom', path: ['set_size'], message: `${d.id}: only P2 drills may leave set_size unset` });
  }
  if (d.priority !== 'P2' && d.time_limits_s === null && !d.stage_time_limits_s) {
    ctx.addIssue({ code: 'custom', path: ['time_limits_s'], message: `${d.id}: needs time_limits_s or stage_time_limits_s` });
  }
});

export const DrillsConfigSchema = z.object({
  version: z.string(),
  drills: z.array(DrillSchema),
});

export const RulesSchema = z.object({
  version: z.string(),
  pass_bar: Share,
  mastery: z.object({
    passing_score: Share,
    consecutive_sets: z.number().int().positive(),
    min_counting_tier: z.number().int().min(1).max(3),
    min_items_or_checks_per_skill: z.number().int().positive(),
  }),
  test_out: z.object({ level: z.literal(2), tier: z.number().int().min(1).max(3), drop_to_level1_below: Share }),
  tiers: z.object({
    start: z.number().int(), min: z.number().int(), max: z.number().int(),
    up_at_or_above: Share, down_below: Share,
  }),
  spaced_review: z.object({
    eligible_after_days: z.number().positive(),
    size_fraction: Share,
    full_size_at_or_below: z.number().int().positive(),
    reset_at_or_above: Share,
    demote_below: Share,
    retry_after_days: z.number().positive(),
  }),
  interview_mode: z.object({
    intense_within_days: z.number().int().positive(),
    review_only_within_days: z.number().int().positive(),
    suggest_case_every_n_sets: z.number().int().positive(),
  }),
  continue_training: z.object({ resume_window_hours: z.number().positive(), next_case_after_sets: z.number().int().positive() }),
  sets: z.object({ expire_after_hours: z.number().positive(), one_in_progress_per_student: z.boolean() }),
  timing: z.object({ grace_ms: z.number().int().nonnegative(), time_multipliers: z.array(z.number().positive()).min(1) }),
  prescriptions: z.object({
    max_per_case: z.number().int().positive(),
    weights: z.object({
      major: z.number(), minor: z.number(), repeat_previous_case: z.number(), regression: z.number(),
    }),
    in_drill_priority: z.number(),
    focus_when_tag_share_at_least: Share,
    focus_item_share: Share,
  }),
  serving: z.object({ authored_repeat_days: z.number().int().positive() }),
  item_health: z.object({
    min_attempts: z.number().int().positive(),
    pull_below_correct_rate: Share,
    too_easy_above: Share,
    retier: z.object({ t1_at_or_above: Share, t2_at_or_above: Share }),
  }),
  // The PRD's tag-to-drill map, keyed by skill: every tag maps to exactly one
  // skill, so the skill decides the drill, and the mastery rules decide which
  // level (l1 / l2) is served. Null where the catalog has no drill at that level.
  skill_drills: z.record(SkillId, z.object({ l1: DrillId.nullable(), l2: DrillId.nullable() })),
  // Tags a set can focus on ("70% of mental math items become zeros problems"),
  // and the drill that supports the focus.
  focusable_tags: z.record(TagId, DrillId),
  // Filled in once the case types are defined (PRD "Picking the next case").
  case_type_to_skill_area: z.record(z.string(), z.enum(AREA_CODES)),
});

export type Taxonomy = z.infer<typeof TaxonomySchema>;
export type Drill = z.infer<typeof DrillSchema>;
export type DrillsConfig = z.infer<typeof DrillsConfigSchema>;
export type Rules = z.infer<typeof RulesSchema>;
export type MistakeTag = Taxonomy['mistake_tags'][number];
export type Skill = Taxonomy['skills'][number];

export interface DrillsConfigBundle {
  taxonomy: Taxonomy;
  drills: DrillsConfig;
  rules: Rules;
}

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter(id => (seen.has(id) ? true : (seen.add(id), false)));
}

// Every cross-file rule from the PRD's taxonomy section. Returns problems rather
// than throwing so tests can assert on each one.
export function crossCheck({ taxonomy, drills, rules }: DrillsConfigBundle): string[] {
  const problems: string[] = [];
  const versions = new Set([taxonomy.version, drills.version, rules.version]);
  if (versions.size !== 1) problems.push(`Config versions differ: ${[...versions].join(', ')}`);

  const areaCodes = new Set(taxonomy.areas.map(a => a.code));
  const skillIds = new Set(taxonomy.skills.map(s => s.id));
  const tagIds = new Set(taxonomy.mistake_tags.map(t => t.id));
  const drillById = new Map(drills.drills.map(d => [d.id, d]));

  for (const d of dupes(taxonomy.areas.map(a => a.code))) problems.push(`Duplicate area ${d}`);
  for (const d of dupes(taxonomy.skills.map(s => s.id))) problems.push(`Duplicate skill ${d}`);
  for (const d of dupes([...taxonomy.mistake_tags, ...taxonomy.system_tags].map(t => t.id))) problems.push(`Duplicate tag ${d}`);
  for (const d of dupes(drills.drills.map(x => x.id))) problems.push(`Duplicate drill ${d}`);

  for (const s of taxonomy.skills) {
    if (!areaCodes.has(s.area)) problems.push(`Skill ${s.id}: unknown area ${s.area}`);
    if (!s.id.startsWith(`${s.area}.`)) problems.push(`Skill ${s.id}: id prefix doesn't match area ${s.area}`);
    if (!taxonomy.mistake_tags.some(t => t.skill === s.id)) problems.push(`Skill ${s.id}: has no mistake tags`);
    if (!drills.drills.some(d => d.skills.includes(s.id))) problems.push(`Skill ${s.id}: no drill trains it`);
  }
  for (const t of taxonomy.mistake_tags) {
    if (!skillIds.has(t.skill)) problems.push(`Tag ${t.id}: unknown skill ${t.skill}`);
  }
  for (const d of drills.drills) {
    for (const s of d.skills) if (!skillIds.has(s)) problems.push(`Drill ${d.id}: unknown skill ${s}`);
  }

  for (const s of skillIds) {
    if (!rules.skill_drills[s]) problems.push(`rules.skill_drills: missing skill ${s}`);
  }
  for (const [skill, levels] of Object.entries(rules.skill_drills)) {
    if (!skillIds.has(skill)) { problems.push(`rules.skill_drills: unknown skill ${skill}`); continue; }
    for (const level of [1, 2] as const) {
      const drillId = level === 1 ? levels.l1 : levels.l2;
      const trainedHere = drills.drills.some(d => d.level === level && d.skills.includes(skill));
      if (drillId === null) {
        if (trainedHere) problems.push(`rules.skill_drills.${skill}.l${level}: a level ${level} drill trains this skill but none is mapped`);
        continue;
      }
      const drill = drillById.get(drillId);
      if (!drill) problems.push(`rules.skill_drills.${skill}.l${level}: unknown drill ${drillId}`);
      else if (drill.level !== level || !drill.skills.includes(skill)) {
        problems.push(`rules.skill_drills.${skill}.l${level}: ${drillId} is not a level ${level} drill for ${skill}`);
      }
    }
  }
  const tagSkill = new Map(taxonomy.mistake_tags.map(t => [t.id, t.skill]));
  for (const [tag, drillId] of Object.entries(rules.focusable_tags)) {
    if (!tagIds.has(tag)) { problems.push(`rules.focusable_tags: unknown tag ${tag}`); continue; }
    if (!drillById.has(drillId)) problems.push(`rules.focusable_tags.${tag}: unknown drill ${drillId}`);
    // The focus drill must train the tag's skill, or a focused set couldn't
    // move that skill's state.
    else if (!drillById.get(drillId)!.skills.includes(tagSkill.get(tag)!)) {
      problems.push(`rules.focusable_tags.${tag}: ${drillId} doesn't train ${tagSkill.get(tag)}`);
    }
  }
  for (const [caseType, area] of Object.entries(rules.case_type_to_skill_area)) {
    if (!areaCodes.has(area)) problems.push(`rules.case_type_to_skill_area.${caseType}: unknown area ${area}`);
  }
  if (rules.tiers.min > rules.tiers.start || rules.tiers.start > rules.tiers.max) problems.push('rules.tiers: start must sit between min and max');
  return problems;
}

export function parseDrillsConfig(raw: { taxonomy: unknown; drills: unknown; rules: unknown }): DrillsConfigBundle {
  const parse = <T>(name: string, schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success) throw new Error(`Malformed drills config ${name}: ${result.error.message}`);
    return result.data;
  };
  const bundle = {
    taxonomy: parse('taxonomy', TaxonomySchema, raw.taxonomy),
    drills: parse('drills', DrillsConfigSchema, raw.drills),
    rules: parse('rules', RulesSchema, raw.rules),
  };
  const problems = crossCheck(bundle);
  if (problems.length) throw new Error(`Inconsistent drills config:\n- ${problems.join('\n- ')}`);
  return bundle;
}

export const DRILLS_CONFIG: DrillsConfigBundle = parseDrillsConfig({
  taxonomy: taxonomyJson,
  drills: drillsJson,
  rules: rulesJson,
});

export const TAXONOMY_VERSION = DRILLS_CONFIG.taxonomy.version;

const tagById = new Map(DRILLS_CONFIG.taxonomy.mistake_tags.map(t => [t.id, t]));
const systemTagIds = new Set(DRILLS_CONFIG.taxonomy.system_tags.map(t => t.id));
const drillById = new Map(DRILLS_CONFIG.drills.drills.map(d => [d.id, d]));

export function getMistakeTag(id: string): MistakeTag | undefined {
  return tagById.get(id);
}

export function isKnownTag(id: string): boolean {
  return tagById.has(id) || systemTagIds.has(id);
}

export function getDrill(id: string): Drill {
  const drill = drillById.get(id);
  if (!drill) throw new Error(`Unknown drill: ${id}`);
  return drill;
}

// "Skills with no live Level 2 drill start at Level 1, and Level 1 criteria
// grant Mastered" (PRD "Skill states and transitions").
export function hasLiveLevel2Drill(skillId: string): boolean {
  return DRILLS_CONFIG.drills.drills.some(d => d.live && d.level === 2 && d.skills.includes(skillId));
}
