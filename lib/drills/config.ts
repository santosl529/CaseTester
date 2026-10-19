// Drills config (docs/prd-drills.md "Data model → Config files"). Three
// versioned JSON files hold the taxonomy, the drill catalog and the progression
// rules; nothing else may hard-code a tag, skill or threshold. Each file is
// zod-validated and cross-checked against the others when this module loads,
// so a malformed config fails the boot, like a malformed case file
// (lib/cases/loader.ts).
import { z } from 'zod';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import { CASE_TYPES } from '@/lib/case-types';
import taxonomyJson from './config/taxonomy.v1.json';
import drillsJson from './config/drills.v1.json';
import rulesJson from './config/rules.v1.json';
import programsJson from './config/programs.v1.json';

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
    // The skill tree (PRD "Skill tree"): skills this one builds on. No cycles.
    prerequisites: z.array(SkillId),
  })),
  mistake_tags: z.array(z.object({
    id: TagId,
    skill: SkillId,
    // Plain-word name for results copy ("2 of your 3 misses were unit errors").
    label: z.string().min(1),
    // Default severity; the case grader may adjust it per finding (PRD
    // "What the case grader must send").
    severity: z.enum(['minor', 'major']),
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

export const STAGES = ['recognize', 'repair', 'construct'] as const;
export type DrillStage = (typeof STAGES)[number];

export const DrillSchema = z.object({
  id: DrillId,
  name: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2)]),
  // Where the drill sits in a skill's chain (PRD "Drill chains"). Unset means
  // Recognize for level 1 and Construct for level 2. Repair drills (PS-4,
  // HY-3, EX-5, SY-3) take written answers, so they are stored as level 2.
  stage: z.enum(STAGES).optional(),
  // Every skill the drill scores. Only primary skills change state from its
  // sets (PRD "Skill states and transitions"); a secondary skill's scores and
  // mistakes still count toward its skill score, top mistakes and
  // prescriptions. QN-4 scores arithmetic, but only QN-3 can make it Practiced.
  skills: z.array(z.object({ id: SkillId, primary: z.boolean() })).min(1),
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
  // The Defend step on Construct drills (PRD "Defend step"): a follow-up
  // after the main answer at tiers 2–3. `live` switches it on once the
  // follow-ups are reviewed; `set_size` is the set size per tier while it
  // runs (one item fewer at T2 and T3).
  defend: z.object({
    type: z.enum(['justify', 'challenge']),
    live: z.boolean(),
    set_size: z.tuple([z.number().int().min(1), z.number().int().min(1), z.number().int().min(1)]),
  }).optional(),
}).superRefine((d, ctx) => {
  if (!d.skills.some(s => s.primary)) ctx.addIssue({ code: 'custom', path: ['skills'], message: `${d.id}: needs at least one primary skill` });
  if (d.stage === 'repair' && d.level !== 2) ctx.addIssue({ code: 'custom', path: ['level'], message: `${d.id}: Repair drills are level 2` });
  if (d.defend && (d.level !== 2 || d.stage === 'repair')) ctx.addIssue({ code: 'custom', path: ['defend'], message: `${d.id}: only Construct drills have a Defend step` });
  if (d.priority !== 'P2' && d.set_size === null) {
    ctx.addIssue({ code: 'custom', path: ['set_size'], message: `${d.id}: only P2 drills may leave set_size unset` });
  }
  if (d.priority !== 'P2' && d.time_limits_s === null && !d.stage_time_limits_s) {
    ctx.addIssue({ code: 'custom', path: ['time_limits_s'], message: `${d.id}: needs time_limits_s or stage_time_limits_s` });
  }
});

export const DrillsConfigSchema = z.object({
  version: z.string(),
  drills: z.array(DrillSchema.transform(({ skills, ...d }) => ({
    ...d, stage: d.stage ?? (d.level === 1 ? 'recognize' : 'construct') as DrillStage,
    skills: skills.map(s => s.id), primary_skills: skills.filter(s => s.primary).map(s => s.id),
  }))),
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
  // Stage moves (PRD "Where a student starts and how they move between stages").
  stages: z.object({
    repair_to_construct_at_or_above: Share,
    max_repair_sets: z.number().int().positive(),
    construct_to_repair_below: Share,
    construct_to_recognize_below: Share,
  }),
  // PRD "Serving rules": no Repair item derived from a Level 1 item the
  // student saw in this many days.
  repair: z.object({ derived_exclusion_days: z.number().int().nonnegative() }),
  // PRD "Defend step": tiers it runs at, its share of the item, its word cap
  // and its time per tier.
  defend: z.object({
    min_tier: z.number().int().min(1).max(3),
    weight: Share,
    max_words: z.number().int().positive(),
    time_limits_s: z.object({ t2: z.number().positive(), t3: z.number().positive() }),
  }),
  transfer: z.object({
    unlock_after_days: z.number().nonnegative(),
    tier: z.number().int().min(1).max(3),
    level1_tier: z.number().int().min(1).max(3),   // skills with no live Construct drill
    pass_at_or_above: Share,
    demote_below: Share,
    retry_after_days: z.number().nonnegative(),
    avoid_case_types_from_last_sets: z.number().int().nonnegative(),
  }),
  // The stuck rule (PRD "Skill tree").
  stuck: z.object({
    low_score_below: Share,
    consecutive_sets: z.number().int().positive(),
    resume_after_prereq_sets: z.number().int().positive(),
  }),
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
  // PRD "Cost controls": per-student caps on AI-graded answers (the day and
  // the calendar month in the student's time zone), the most requests one
  // grading call may make, and the daily spend that pauses new written sets
  // (the day starting at midnight in spend_day_time_zone).
  grading_limits: z.object({
    ai_answers_per_day: z.number().int().positive(),
    ai_answers_per_month: z.number().int().positive(),
    requests_per_call: z.number().int().positive(),
    daily_spend_limit_usd: z.number().positive(),
    spend_day_time_zone: z.string().min(1),
  }),
  // Your progress dashboard: the summary's windows and thresholds (trend
  // rules A1–A4, Matt 2026-10-18), the skill map's periods, readiness, and
  // where case results come from: 'case_results' (sent by the case grader) or
  // 'case_sessions' (the case product's own scores; read-only, off until
  // Lorenzo agrees).
  dashboard: z.object({
    compare_windows_days: z.array(z.number().int().positive()).min(1),
    min_sets_per_window: z.number().int().positive(),
    min_answers_per_window: z.number().int().positive(),
    slipping_rate_rise: z.number().positive(),
    slipping_min_rise_per_10: z.number().nonnegative(),
    arrow_sets_per_side: z.number().int().positive(),
    arrow_min_change: Share,
    periods_days: z.record(z.string(), z.number().int().positive().nullable()),
    trend_weeks: z.number().int().positive(),
    score_points_max: z.number().int().positive(),
    top_n: z.number().int().positive(),
    strengths_min_state: z.enum(['learning', 'recognizes', 'practiced', 'mastered', 'validated']),
    readiness: z.object({
      milestone_min_state: z.enum(['practiced', 'mastered', 'validated']),
      other_min_state: z.enum(['recognizes', 'practiced', 'mastered', 'validated']),
      cases_needed: z.number().int().positive(),
      case_min_tier: z.number().int().min(1).max(3),
      statuses: z.array(z.object({ min_met: z.number().int().nonnegative(), label: z.string().min(1) })).min(1),
    }),
    case_source: z.enum(['case_results', 'case_sessions']),
    case_difficulty_tiers: z.record(z.string(), z.number().int().min(1).max(3)),
  }),
  item_health: z.object({
    min_attempts: z.number().int().positive(),
    pull_below_correct_rate: Share,
    too_easy_above: Share,
    retier: z.object({ t1_at_or_above: Share, t2_at_or_above: Share }),
  }),
  // The PRD's tag-to-drill map, keyed by skill: every tag maps to exactly one
  // skill, so the skill decides the drill, and the mastery rules decide which
  // stage is served: l1 = Recognize, repair = Repair, l2 = Construct. Null
  // where the catalog has no drill for that stage.
  skill_drills: z.record(SkillId, z.object({ l1: DrillId.nullable(), repair: DrillId.nullable(), l2: DrillId.nullable() })),
  // Tags a set can focus on ("70% of mental math items become zeros problems"),
  // and the drill that supports the focus.
  focusable_tags: z.record(TagId, DrillId),
  // Each case type's main skill area (PRD "Picking the next case";
  // docs/drills-case-type-map.md). Every case type must be mapped.
  case_type_to_skill_area: z.record(z.enum(CASE_TYPES), z.enum(AREA_CODES)),
});

const Milestone = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plan_set') }),
  z.object({ type: z.literal('skills'), skills: z.array(SkillId).min(1), state: z.enum(['practiced', 'mastered']) }),
  z.object({ type: z.literal('earlier_milestones'), state: z.enum(['practiced', 'mastered']) }),
  z.object({
    type: z.literal('prescriptions'), state: z.enum(['practiced', 'mastered']),
    tier3_passes: z.number().int().positive().optional(), final_case: z.boolean().optional(),
  }),
]);
const TrackStart = z.enum(['recognize', 'placement', 'construct']);
const WeekCounts = z.array(z.number().int().nonnegative()).length(7);   // weeks 0–6

// The training program (PRD "Training program"): tracks, the six-week plan,
// the Sprint days and the workout mix.
export const ProgramsSchema = z.object({
  version: z.string(),
  assignment: z.object({ sprint_within_days: z.number().int().positive(), foundations_below_diagnostic: Share }),
  // The diagnostic (PRD "Onboarding and diagnostic"): short parts, one drill each.
  diagnostic: z.object({
    tier: z.number().int().min(1).max(3),
    parts: z.array(z.object({ drill: DrillId, items: z.number().int().positive() })).min(1),
    min_items_or_checks: z.number().int().positive(),
    recognize_below: Share,
    construct_at_or_above: Share,
    max_prescriptions: z.number().int().positive(),
  }),
  availability: z.array(z.object({
    id: z.string().min(1), label: z.string().min(1), workouts_per_week: z.number().int().positive(), default: z.boolean().optional(),
  })).min(1),
  workout: z.object({
    target_minutes: z.number().positive(), sprint_target_minutes: z.number().positive(),
    day_before_interview_minutes: z.number().positive(), min_sets: z.number().int().positive(),
    max_sets: z.number().int().positive(), mix: z.object({ weak: Share, review: Share, unfamiliar: Share }),
    minutes_per_item_factor: z.number().positive(), case_minutes: z.number().positive(),
  }),
  tracks: z.object({
    foundations: z.object({ length_weeks: z.number().int().positive(), start: TrackStart, start_tier: z.number().int().min(1).max(3), lessons: z.enum(['auto', 'offered']), construct_gate: z.boolean(), cases_per_week: WeekCounts }),
    standard: z.object({ length_weeks: z.number().int().positive(), start: TrackStart, start_tier: z.number().int().min(1).max(3), lessons: z.enum(['auto', 'offered']), construct_gate: z.boolean(), cases_per_week: WeekCounts }),
    sprint: z.object({ length_days: z.number().int().positive(), start: TrackStart, start_tier: z.number().int().min(1).max(3), lessons: z.enum(['auto', 'offered']), construct_gate: z.boolean(), tiers: z.array(z.number().int().min(1).max(3)), review_only_within_days: z.number().int().nonnegative() }),
    self_directed: z.object({ start: TrackStart, start_tier: z.number().int().min(1).max(3), lessons: z.enum(['auto', 'offered']), construct_gate: z.boolean() }),
  }),
  weeks: z.array(z.object({
    week: z.number().int().nonnegative(), theme: z.string().min(1),
    focus_areas: z.array(z.enum(AREA_CODES)), focus_skills: z.array(SkillId),
    prefer_tier: z.number().int().min(1).max(3).optional(), transfer_all: z.boolean().optional(),
    milestone: Milestone,
  })),
  sprint_days: z.array(z.object({
    day: z.number().int().positive(),
    activities: z.array(z.enum(['diagnostic', 'case', 'workout', 'review', 'light_review'])),
    workout_minutes: z.number().nonnegative(), cases: z.number().int().nonnegative(),
  })),
  plan_prescription_priority: z.number(),
  focus_priority_bonus: z.number(),
  missed_milestone_bonus: z.number(),
});

export type Taxonomy = z.infer<typeof TaxonomySchema>;
export type Programs = z.infer<typeof ProgramsSchema>;
export type Drill = z.infer<typeof DrillsConfigSchema>['drills'][number];
export type DrillsConfig = z.infer<typeof DrillsConfigSchema>;
export type Rules = z.infer<typeof RulesSchema>;
export type MistakeTag = Taxonomy['mistake_tags'][number];
export type Skill = Taxonomy['skills'][number];

export interface DrillsConfigBundle {
  taxonomy: Taxonomy;
  drills: DrillsConfig;
  rules: Rules;
  programs: Programs;
}

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter(id => (seen.has(id) ? true : (seen.add(id), false)));
}

// Every cross-file rule from the PRD's taxonomy section. Returns problems rather
// than throwing so tests can assert on each one.
export function crossCheck({ taxonomy, drills, rules, programs }: DrillsConfigBundle): string[] {
  const problems: string[] = [];
  const versions = new Set([taxonomy.version, drills.version, rules.version, programs.version]);
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
    else if (!drills.drills.some(d => d.primary_skills.includes(s.id))) problems.push(`Skill ${s.id}: no drill has it as a primary skill`);
  }
  for (const t of taxonomy.mistake_tags) {
    if (!skillIds.has(t.skill)) problems.push(`Tag ${t.id}: unknown skill ${t.skill}`);
  }
  for (const s of taxonomy.skills) {
    for (const p of s.prerequisites) {
      if (!skillIds.has(p)) problems.push(`Skill ${s.id}: unknown prerequisite ${p}`);
      if (p === s.id) problems.push(`Skill ${s.id}: lists itself as a prerequisite`);
    }
  }
  const cycle = prerequisiteCycle(taxonomy);
  if (cycle) problems.push(`Skill tree has a cycle: ${cycle.join(' → ')}`);
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
      const stage = level === 1 ? 'recognize' : 'construct';
      const trainedHere = drills.drills.some(d => d.stage === stage && d.skills.includes(skill));
      if (drillId === null) {
        if (trainedHere) problems.push(`rules.skill_drills.${skill}.l${level}: a level ${level} drill trains this skill but none is mapped`);
        continue;
      }
      const drill = drillById.get(drillId);
      if (!drill) problems.push(`rules.skill_drills.${skill}.l${level}: unknown drill ${drillId}`);
      else if (drill.stage !== stage || !drill.skills.includes(skill)) {
        problems.push(`rules.skill_drills.${skill}.l${level}: ${drillId} is not a level ${level} drill for ${skill}`);
      } else if (!drill.primary_skills.includes(skill)) {
        problems.push(`rules.skill_drills.${skill}.l${level}: ${skill} is not a primary skill of ${drillId}`);
      }
    }
    if (levels.repair !== null) {
      const drill = drillById.get(levels.repair);
      if (!drill) problems.push(`rules.skill_drills.${skill}.repair: unknown drill ${levels.repair}`);
      else if (drill.stage !== 'repair') problems.push(`rules.skill_drills.${skill}.repair: ${levels.repair} is not a Repair drill`);
      else if (!drill.primary_skills.includes(skill)) problems.push(`rules.skill_drills.${skill}.repair: ${skill} is not a primary skill of ${levels.repair}`);
    } else if (drills.drills.some(d => d.stage === 'repair' && d.skills.includes(skill))) {
      problems.push(`rules.skill_drills.${skill}.repair: a Repair drill trains this skill but none is mapped`);
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
  for (const t of CASE_TYPES) if (!(t in rules.case_type_to_skill_area)) problems.push(`rules.case_type_to_skill_area: missing ${t}`);
  if (rules.tiers.min > rules.tiers.start || rules.tiers.start > rules.tiers.max) problems.push('rules.tiers: start must sit between min and max');
  for (const d of drills.drills) {
    if (d.defend && d.set_size !== null && d.defend.set_size.some(n => n > d.set_size!)) problems.push(`${d.id}: a set with Defend can't be larger than one without`);
  }

  programs.weeks.forEach((w, i) => {
    if (w.week !== i) problems.push(`programs.weeks: week ${w.week} out of order (expected ${i})`);
    for (const s of w.focus_skills) if (!skillIds.has(s)) problems.push(`programs.weeks.${w.week}: unknown focus skill ${s}`);
    if (w.milestone.type === 'skills') for (const s of w.milestone.skills) if (!skillIds.has(s)) problems.push(`programs.weeks.${w.week}: unknown milestone skill ${s}`);
  });
  if (programs.weeks.length !== programs.tracks.standard.length_weeks + 1) problems.push('programs.weeks: needs week 0 plus one entry per plan week');
  programs.sprint_days.forEach((d, i) => { if (d.day !== i + 1) problems.push(`programs.sprint_days: day ${d.day} out of order`); });
  if (programs.sprint_days.length !== programs.tracks.sprint.length_days) problems.push('programs.sprint_days: one entry per Sprint day');
  const mix = programs.workout.mix;
  if (Math.abs(mix.weak + mix.review + mix.unfamiliar - 1) > 1e-9) problems.push('programs.workout.mix: shares must add up to 1');
  if (programs.availability.filter(a => a.default).length !== 1) problems.push('programs.availability: exactly one default');
  for (const part of programs.diagnostic.parts) if (!drillById.has(part.drill)) problems.push(`programs.diagnostic: unknown drill ${part.drill}`);
  return problems;
}

// The first cycle in the skill tree, as a path that ends where it starts, or
// null if there is none.
export function prerequisiteCycle(taxonomy: Taxonomy): string[] | null {
  const prereqs = new Map(taxonomy.skills.map(s => [s.id, s.prerequisites]));
  const done = new Set<string>();
  const visit = (id: string, path: string[]): string[] | null => {
    if (path.includes(id)) return [...path.slice(path.indexOf(id)), id];
    if (done.has(id)) return null;
    for (const p of prereqs.get(id) ?? []) {
      const found = visit(p, [...path, id]);
      if (found) return found;
    }
    done.add(id);
    return null;
  };
  for (const id of prereqs.keys()) {
    const found = visit(id, []);
    if (found) return found;
  }
  return null;
}

export function parseDrillsConfig(raw: { taxonomy: unknown; drills: unknown; rules: unknown; programs: unknown }): DrillsConfigBundle {
  const parse = <T>(name: string, schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success) throw new Error(`Malformed drills config ${name}: ${result.error.message}`);
    return result.data;
  };
  const bundle = {
    taxonomy: parse('taxonomy', TaxonomySchema, raw.taxonomy),
    drills: parse('drills', DrillsConfigSchema, raw.drills),
    rules: parse('rules', RulesSchema, raw.rules),
    programs: parse('programs', ProgramsSchema, raw.programs),
  };
  const problems = crossCheck(bundle);
  if (problems.length) throw new Error(`Inconsistent drills config:\n- ${problems.join('\n- ')}`);
  return bundle;
}

export const DRILLS_CONFIG: DrillsConfigBundle = parseDrillsConfig({
  taxonomy: taxonomyJson,
  drills: drillsJson,
  rules: rulesJson,
  programs: programsJson,
});

export const TAXONOMY_VERSION = DRILLS_CONFIG.taxonomy.version;

const tagById = new Map(DRILLS_CONFIG.taxonomy.mistake_tags.map(t => [t.id, t]));
const skillById = new Map(DRILLS_CONFIG.taxonomy.skills.map(s => [s.id, s]));
const systemTagIds = new Set(DRILLS_CONFIG.taxonomy.system_tags.map(t => t.id));
const drillById = new Map(DRILLS_CONFIG.drills.drills.map(d => [d.id, d]));

export function getMistakeTag(id: string): MistakeTag | undefined {
  return tagById.get(id);
}

export function isKnownTag(id: string): boolean {
  return tagById.has(id) || systemTagIds.has(id);
}

export function getSkill(id: string): Skill {
  const skill = skillById.get(id);
  if (!skill) throw new Error(`Unknown skill: ${id}`);
  return skill;
}

export function getDrill(id: string): Drill {
  const drill = drillById.get(id);
  if (!drill) throw new Error(`Unknown drill: ${id}`);
  return drill;
}

// "Skills with no live Level 2 drill start at Level 1, and Level 1 criteria
// grant Mastered" (PRD "Skill states and transitions"). Repair drills don't count.
export function hasLiveLevel2Drill(skillId: string): boolean {
  return DRILLS_CONFIG.drills.drills.some(d => d.live && d.stage === 'construct' && d.primary_skills.includes(skillId));
}
