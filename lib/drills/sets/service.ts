// Drill sets against the database (docs/prd-drills.md "Services and APIs"):
// start, resume, fetch items in order, submit answers, complete, results.
// Enforces the PRD integrity rules: keys stay server-side until an item is
// submitted, time limits run on the server from served_at with a 2 s grace,
// submissions are idempotent, items come strictly in order, and a student has
// one set in progress at a time. Checklist drills (D2) record written answers
// as they come and are AI-graded once the set is complete.
import 'server-only';
import { randomUUID } from 'crypto';
import { and, asc, desc, eq, inArray, isNull, lt, max, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillAttempts, drillItems, drillSets, drillTiers, prescriptions, skillStateEvents, skillStates, studentDrillSettings, studentProfiles, workouts } from '@/db/schema';
import { DRILLS_CONFIG, TAXONOMY_VERSION, getDrill, getSkill, type Drill } from '../config';
import { ItemSchema, type Item, type Tier } from '../item-schema';
import { toPublicItem, type PublicItem } from '../public-item';
import { generatorsForDrill } from '../generators/registry';
import { aiAnswersInPlan, planAuthored, planGenerated, type ItemRef } from './plan';
import { ScoringError, StepResponseSchema, itemSteps, scoreItem, scoreStep, type ItemResult, type StepResponse, type StepResult } from './scoring';
import { mistakeSummary, nextTier, passed, setScore } from './summary';
import { drillLimitsMs, itemLimitsMs, startsStage, stepLimitMs, stepStartedAt } from './timing';
import { formatNumericAnswer, itemFeedback, stepFeedback, type ItemFeedback, type StepFeedback } from './feedback';
import {
  enqueueGrading, finalizeSet, kickGrading, planOf, resolveItem, resultOf, runAfterResponse,
} from '../grading/jobs';
import type { CheckResults } from '../grading/apply';
import { breakerMessage, capBlock } from '../grading/limits';
import { aiAnswersUsed, gradingBreaker } from '../grading/spend';
import { logDrillEvent } from '../events';
import { isLive, previewDrafts } from '../live';
import { lowerName, newProgress, nextSetFor, stageOfDrill, type SetKind } from '../progress/engine';
import { loadProgress, loadTiers, progressContext } from '../progress/store';
import { checkSize, type WorkoutBlock } from '../program/workout';
import type { DiagnosticPart } from '../program/diagnostic';
import { attachDiagnosticSet, diagnosticView, startDiagnostic } from '../program/diagnostic-store';
import { defendLessonFor, lessonSkills } from '../program/lessons-store';
import { allowedTiers } from '../program/tiers';
import { defendRuns, defendSeconds, defendStart, setSizeAt } from '../defend';
import type { RepairExtras } from '../item-schema';
import { z } from 'zod';

export type { ItemFeedback, StepFeedback };

export class DrillError extends Error {
  constructor(public code: string, public status: number, message: string, public data: Record<string, unknown> = {}) {
    super(message);
  }
}

type SetRow = typeof drillSets.$inferSelect;
interface PendingStep { steps: StepResult[]; keys: string[]; stage_started_at?: string }

const rules = DRILLS_CONFIG.rules;
const isAiGraded = (drill: Drill) => drill.scoring !== 'auto';

export { previewDrafts };

// ------------------------------------------------------------------ helpers

async function settingsFor(studentId: string) {
  const [row] = await db.select().from(studentDrillSettings).where(eq(studentDrillSettings.studentId, studentId));
  return { timeMultiplier: row?.timeMultiplier ?? 1, untimed: row?.untimed ?? false, hideTimer: row?.hideTimer ?? false, skippedExamples: row?.skippedExamples ?? [] };
}

async function loadSet(studentId: string, setId: string): Promise<SetRow> {
  if (!z.uuid().safeParse(setId).success) throw new DrillError('not_found', 404, 'Set not found');
  const [set] = await db.select().from(drillSets).where(and(eq(drillSets.id, setId), eq(drillSets.studentId, studentId)));
  if (!set) throw new DrillError('not_found', 404, 'Set not found');
  return set;
}

// "An unfinished set expires after 24 hours; completed attempts are kept."
async function expireStale(studentId: string) {
  const cutoff = new Date(Date.now() - rules.sets.expire_after_hours * 3_600_000);
  const expired = await db.update(drillSets).set({ status: 'expired' })
    .where(and(eq(drillSets.studentId, studentId), eq(drillSets.status, 'in_progress'), lt(drillSets.startedAt, cutoff)))
    .returning({ id: drillSets.id, position: drillSets.currentPosition });
  for (const s of expired) await logDrillEvent(studentId, 'drill_set_expired', { set_id: s.id, items_completed: s.position });
}

export async function inProgressSet(studentId: string): Promise<SetRow | null> {
  await expireStale(studentId);
  const [set] = await db.select().from(drillSets)
    .where(and(eq(drillSets.studentId, studentId), eq(drillSets.status, 'in_progress')));
  return set ?? null;
}

// ------------------------------------------------------------- start a set

export const StartSetSchema = z.object({
  skill_id: z.string().optional(),
  drill_id: z.string().optional(),   // "Retry this set"
  level: z.union([z.literal(1), z.literal(2)]).optional(),
  prescription_id: z.uuid().optional(),
  // A block of today's workout (D4).
  workout_id: z.uuid().optional(),
  block: z.number().int().nonnegative().optional(),
  // Quick start (Browse drills, Suggested next): the engine picks the drill,
  // stage and tier for skill_id.
  quick_start: z.boolean().optional(),
  // A part of the diagnostic (D4).
  diagnostic_part: z.number().int().nonnegative().optional(),
  // Browse drills, "Pick exactly": a tier up to one above the student's
  // current tier on the drill (tier 1 or 2 the first time).
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  // Started from Browse drills, or from the Suggested next card (analytics).
  browse: z.boolean().optional(),
  // The Suggested next card's reason and slot, logged with suggestion_started.
  // A self-directed quick check of a questionnaire placement (with quick_start).
  placement_check: z.boolean().optional(),
  suggestion: z.object({ reason: z.string().transform(s => s.slice(0, 300)), source: z.enum(['weak', 'unfamiliar', 'review']) }).optional(),
}).refine(b => b.skill_id || b.drill_id || b.prescription_id || b.workout_id || b.diagnostic_part !== undefined,
  'skill_id, drill_id, prescription_id, workout_id or diagnostic_part is required')
  .refine(b => !b.workout_id || b.block !== undefined, 'block is required with workout_id')
  .refine(b => !b.quick_start || b.skill_id, 'quick_start needs skill_id');

// What a new set is: the drill and tier, and for a prescribed set the
// progress engine's choice of stage, review or transfer check.
interface SetChoice {
  drill: Drill;
  tier: Tier;
  source: 'specific' | 'prescription' | 'review' | 'continue' | 'diagnostic';
  prescriptionId: string | null;
  focusSkill: string | null;
  focusTag: string | null;
  kind: SetKind;
  size?: number;
  workoutId?: string;
  block?: number;
  slot?: string;
  diagnostic?: { id: string; part: number };
  // A quick check of a questionnaire placement (its score re-places the skill).
  check?: boolean;
}

async function chooseSet(studentId: string, input: z.infer<typeof StartSetSchema>): Promise<SetChoice> {
  if (input.diagnostic_part !== undefined) {
    const diag = await startDiagnostic(studentId);
    const part = (diag.parts as DiagnosticPart[])[input.diagnostic_part];
    if (!part || part.done) throw new DrillError('not_found', 404, 'That part of the diagnostic is done');
    const drill = getDrill(part.drill_id);
    if (!isLive(drill)) throw new DrillError('no_live_drill', 404, 'That drill is not available');
    return {
      drill, tier: DRILLS_CONFIG.programs.diagnostic.tier as Tier, source: 'diagnostic', prescriptionId: null,
      focusSkill: null, focusTag: null, kind: 'normal', size: part.size, diagnostic: { id: diag.id, part: input.diagnostic_part },
    };
  }
  if (input.workout_id) {
    // The block was planned when today's workout was built; tier and size come from it.
    const [w] = await db.select().from(workouts).where(and(eq(workouts.id, input.workout_id), eq(workouts.studentId, studentId)));
    const block = (w?.blocks as WorkoutBlock[] | undefined)?.[input.block!];
    if (!w || !block || w.status === 'expired' || w.status === 'completed') throw new DrillError('not_found', 404, "That workout isn't open any more");
    const drill = getDrill(block.drill_id);
    if (!isLive(drill)) throw new DrillError('no_live_drill', 404, 'That drill is not available');
    const [state] = await db.select({ tag: skillStates.nextFocusTag }).from(skillStates)
      .where(and(eq(skillStates.studentId, studentId), eq(skillStates.skillId, block.skill_id)));
    const rx = block.prescription_id
      ? (await db.select({ focusTag: prescriptions.focusTag }).from(prescriptions).where(eq(prescriptions.id, block.prescription_id)))[0]
      : undefined;
    return {
      drill, tier: block.tier as Tier, source: block.kind === 'review' ? 'review' : 'continue', prescriptionId: block.prescription_id,
      focusSkill: block.skill_id, focusTag: focusFor(drill, rx?.focusTag ?? state?.tag ?? null), kind: block.kind, size: block.size,
      workoutId: w.id, block: input.block, slot: block.slot, check: block.check === true,
    };
  }
  if (input.quick_start) {
    const [progress, tiers, ctx] = await Promise.all([loadProgress(db, studentId), loadTiers(db, studentId), progressContext(db, studentId)]);
    const p = progress.get(input.skill_id!) ?? newProgress(input.skill_id!);
    const next = nextSetFor(p, tiers, ctx);
    if (!next) throw new DrillError('no_live_drill', 404, 'No drill is available for that skill yet');
    const drill = getDrill(next.drill_id);
    const [rx] = await db.select().from(prescriptions)
      .where(and(eq(prescriptions.studentId, studentId), eq(prescriptions.skillId, p.skill_id), eq(prescriptions.status, 'open')));
    return {
      drill, tier: next.tier as Tier, source: next.kind === 'review' ? 'review' : rx ? 'prescription' : 'specific',
      prescriptionId: rx?.id ?? null, focusSkill: p.skill_id, focusTag: focusFor(drill, rx?.focusTag ?? p.next_focus_tag), kind: next.kind,
      ...(input.placement_check && { check: true, size: checkSize(drill.id, next.tier) }),
    };
  }
  if (input.prescription_id) {
    const [rx] = await db.select().from(prescriptions)
      .where(and(eq(prescriptions.id, input.prescription_id), eq(prescriptions.studentId, studentId)));
    if (!rx || !['open', 'in_progress'].includes(rx.status)) throw new DrillError('not_found', 404, 'That prescription is no longer open');
    const [progress, tiers, ctx] = await Promise.all([loadProgress(db, studentId), loadTiers(db, studentId), progressContext(db, studentId)]);
    const p = progress.get(rx.skillId) ?? newProgress(rx.skillId);
    const next = nextSetFor(p, tiers, ctx);
    if (!next) throw new DrillError('no_live_drill', 404, 'No drill is available for that skill yet');
    const drill = getDrill(next.drill_id);
    return {
      drill, tier: next.tier as Tier, source: next.kind === 'review' ? 'review' : 'prescription', prescriptionId: rx.id,
      focusSkill: rx.skillId, focusTag: focusFor(drill, rx.focusTag ?? p.next_focus_tag), kind: next.kind,
    };
  }
  const drill = input.drill_id ? getDrill(input.drill_id) : drillForSkill(input.skill_id!, input.level);
  if (!drill || !isLive(drill)) throw new DrillError('no_live_drill', 404, 'No drill is available for that skill and level yet');
  if (input.skill_id && !drill.skills.includes(input.skill_id)) throw new DrillError('bad_request', 400, `${drill.id} doesn't train ${input.skill_id}`);
  const [tierRow] = await db.select().from(drillTiers).where(and(eq(drillTiers.studentId, studentId), eq(drillTiers.drillId, drill.id)));
  if (input.tier !== undefined && !allowedTiers(tierRow?.currentTier).includes(input.tier)) {
    const max = Math.max(...allowedTiers(tierRow?.currentTier));
    throw new DrillError('tier_not_allowed', 400, `You can pick up to tier ${max} on ${drill.name} for now`, { max_tier: max });
  }
  let focusTag: string | null = null;
  if (input.skill_id) {
    const [state] = await db.select({ tag: skillStates.nextFocusTag }).from(skillStates)
      .where(and(eq(skillStates.studentId, studentId), eq(skillStates.skillId, input.skill_id)));
    focusTag = focusFor(drill, state?.tag ?? null);
  }
  return {
    drill, tier: (input.tier ?? tierRow?.currentTier ?? rules.tiers.start) as Tier, source: 'specific', prescriptionId: null,
    focusSkill: input.skill_id ?? null, focusTag, kind: 'normal',
  };
}

// A tag focus applies only on the drill that can focus on it (QN-3).
const focusFor = (drill: Drill, tag: string | null) => (tag && rules.focusable_tags[tag] === drill.id ? tag : null);

// "A review set is half the normal set size, rounded up"; drills with 4 or
// fewer items keep their full size so the review still counts. Sets that run
// Defend are one item shorter at T2 and T3.
function setSizeFor(drill: Drill, kind: SetKind, tier: Tier, defend: boolean): number {
  const size = setSizeAt(drill, tier, defend);
  const r = rules.spaced_review;
  return kind === 'review' && size > r.full_size_at_or_below ? Math.ceil(size * r.size_fraction) : size;
}

// The drill for a skill at a level, if that drill is live.
export function drillForSkill(skillId: string, level?: 1 | 2): Drill | null {
  const map = rules.skill_drills[skillId];
  if (!map) return null;
  const live = (id: string | null) => (id && isLive(getDrill(id)) ? getDrill(id) : null);
  const l1 = live(map.l1), l2 = live(map.l2);
  if (level === 1) return l1;
  if (level === 2) return l2;
  return l2 ?? l1;
}

// PRD "Cost controls": a set with AI-graded answers starts only under the
// student's daily and monthly caps (rules.grading_limits, in their time zone)
// and while the spend circuit breaker is closed. The messages say that
// auto-checked drills stay open and when written drills reopen.
async function checkGradingLimits(studentId: string, needed: number, now = new Date()) {
  if (needed === 0) return;
  const [p] = await db.select({ timezone: studentProfiles.timezone }).from(studentProfiles).where(eq(studentProfiles.userId, studentId));
  const tz = p?.timezone ?? null;
  const breaker = await gradingBreaker(now);
  if (breaker.open) throw new DrillError('grading_paused', 429, breakerMessage(breaker, now, tz), { reopens_at: breaker.reopens_at.toISOString() });
  const aiDrills = DRILLS_CONFIG.drills.drills.filter(isAiGraded).map(d => d.id);
  const block = capBlock(await aiAnswersUsed(studentId, aiDrills, tz, now), needed, tz, now);
  if (block) throw new DrillError(block.code, 429, block.message, { reopens_at: block.reopens_at });
}

export async function startSet(studentId: string, input: z.infer<typeof StartSetSchema>): Promise<{ set_id: string }> {
  const choice = await chooseSet(studentId, input);
  const { drill, tier, kind } = choice;

  const existing = await inProgressSet(studentId);
  if (existing) throw new DrillError('set_in_progress', 409, 'Finish or leave your current set first', { set_id: existing.id });

  const setId = randomUUID();
  // The student's last timer choices are the set's defaults; "No time limit"
  // is fixed once the first item is served. Whether it runs Defend is fixed now.
  const { untimed, hideTimer } = await settingsFor(studentId);
  const defend = defendRuns(drill, tier, choice.source);
  const size = choice.size ?? setSizeFor(drill, kind, tier, defend);
  const fresh = kind === 'transfer' ? 'transfer' : choice.slot === 'unfamiliar' ? 'unfamiliar' : null;

  let plan: ItemRef[];
  if (drill.item_source === 'generated') {
    plan = planGenerated({ setId, drillId: drill.id, size, focusSkill: choice.focusSkill, focusTag: choice.focusTag });
  } else {
    plan = await planAuthoredSet(studentId, setId, drill, size, tier, fresh && choice.focusSkill ? { mode: fresh, skill: choice.focusSkill } : null, defend);
    if (plan.length === 0) throw new DrillError('no_items', 404, 'No items are live for this drill yet');
  }
  if (isAiGraded(drill)) await checkGradingLimits(studentId, aiAnswersInPlan(plan));
  const stage = choice.focusSkill ? stageOfDrill(drill.id, choice.focusSkill) : drill.stage;

  try {
    await db.insert(drillSets).values({
      id: setId, studentId, drillId: drill.id, level: drill.level, stage, tier, size: plan.length, untimed, timerHidden: hideTimer,
      source: choice.source, prescriptionId: choice.prescriptionId, isTransferCheck: kind === 'transfer',
      focusSkill: choice.focusSkill, focusTag: choice.focusTag, itemPlan: plan, taxonomyVersion: TAXONOMY_VERSION,
      isPlacementCheck: choice.check === true,
      workoutId: choice.workoutId ?? null, slot: choice.slot ?? null,
    });
    if (choice.workoutId !== undefined) await attachToWorkout(choice.workoutId, choice.block!, setId);
    if (choice.diagnostic) await attachDiagnosticSet(choice.diagnostic.id, choice.diagnostic.part, setId);
  } catch (e) {
    // Lost a race with another tab: the unique index allows one in-progress set.
    const other = await inProgressSet(studentId);
    if (other) throw new DrillError('set_in_progress', 409, 'Finish or leave your current set first', { set_id: other.id });
    throw e;
  }
  await logDrillEvent(studentId, 'drill_set_started', {
    set_id: setId, drill_id: drill.id, level: drill.level, stage, tier, source: choice.source,
    prescription_id: choice.prescriptionId, focus_tag: choice.focusTag, transfer_check: kind === 'transfer',
    slot: choice.slot ?? null, workout_id: choice.workoutId ?? null, quick_start: input.quick_start ?? false,
    defend: plan.some(r => r.kind === 'authored' && r.defend), untimed,
    browse: input.browse ?? false, suggested: input.browse ? await hasOpenPrescription(studentId, choice.focusSkill) : null,
  });
  if (input.suggestion) {
    await logDrillEvent(studentId, 'suggestion_started', { set_id: setId, drill_id: drill.id, skill_id: choice.focusSkill, kind, reason: input.suggestion.reason, source: input.suggestion.source });
  }
  return { set_id: setId };
}

async function hasOpenPrescription(studentId: string, skillId: string | null): Promise<boolean> {
  if (!skillId) return false;
  const [row] = await db.select({ id: prescriptions.id }).from(prescriptions).where(and(eq(prescriptions.studentId, studentId),
    eq(prescriptions.skillId, skillId), inArray(prescriptions.status, ['open', 'in_progress', 'paused']))).limit(1);
  return Boolean(row);
}

// Records the set on its workout block; the workout is now in progress.
async function attachToWorkout(workoutId: string, index: number, setId: string) {
  await db.update(workouts).set({
    blocks: sql`jsonb_set(${workouts.blocks}, ${`{${index},set_id}`}::text[], to_jsonb(${setId}::text))`,
    status: sql`case when ${workouts.status} = 'planned' then 'in_progress'::workout_status else ${workouts.status} end`,
  }).where(eq(workouts.id, workoutId));
}

// Transfer checks use only items the student has never seen, from case types
// and industries not in their last 3 sets on that drill; if too few qualify,
// the rest are the items seen longest ago (logged as transfer_pool_exhausted).
// A workout's unfamiliar slot prefers the same items but may reuse seen ones.
// A set that runs Defend marks each item that has a follow-up (ItemRef.defend).
async function planAuthoredSet(studentId: string, setId: string, drill: Drill, size: number, tier: Tier,
  fresh: { mode: 'transfer' | 'unfamiliar'; skill: string } | null = null, defend = false): Promise<ItemRef[]> {
  // Latest live version of each item, never the worked example.
  const statuses = previewDrafts() ? ['live', 'draft', 'in_review'] as const : ['live'] as const;
  const rows = await db.select().from(drillItems)
    .where(and(eq(drillItems.drillId, drill.id), inArray(drillItems.status, [...statuses]), eq(drillItems.isExample, false)))
    .orderBy(desc(drillItems.version));
  const latest = new Map<string, typeof rows[number]>();
  for (const r of rows) if (!latest.has(r.itemId)) latest.set(r.itemId, r);
  let pool = [...latest.values()].map(r => ({
    item_id: r.itemId, version: r.version, tier: r.tier,
    case_type: (r.payload as Item).case_type ?? null, industry: r.industry,
    derived_from: drill.stage === 'repair' ? (r.payload as Item & { extras: RepairExtras }).extras.derived_from : null,
  }));
  const withDefend = new Set(defend ? [...latest.values()].filter(r => (r.payload as Item).defend).map(r => r.itemId) : []);
  const mark = (refs: ItemRef[]): ItemRef[] => refs.map(r => (r.kind === 'authored' && withDefend.has(r.item_id) ? { ...r, defend: true as const } : r));
  if (drill.stage === 'repair') pool = await withoutRecentSources(studentId, drill, pool, size);
  const seen = pool.length
    ? await db.select({ itemId: drillAttempts.itemId, at: max(drillAttempts.submittedAt) }).from(drillAttempts)
      .where(and(eq(drillAttempts.studentId, studentId), inArray(drillAttempts.itemId, pool.map(p => p.item_id))))
      .groupBy(drillAttempts.itemId)
    : [];
  const lastSeen = new Map(seen.filter(s => s.itemId && s.at).map(s => [s.itemId!, new Date(s.at!)]));
  if (!fresh) return mark(planAuthored({ setId, pool, lastSeen, size, tier, now: new Date() }));

  const recent = await db.select({ plan: drillSets.itemPlan }).from(drillSets)
    .where(and(eq(drillSets.studentId, studentId), eq(drillSets.drillId, drill.id), eq(drillSets.status, 'completed')))
    .orderBy(desc(drillSets.completedAt)).limit(rules.transfer.avoid_case_types_from_last_sets);
  const byId = new Map(pool.map(p => [p.item_id, p]));
  const recentItems = recent.flatMap(r => (r.plan as ItemRef[]).flatMap(ref => (ref.kind === 'authored' && byId.has(ref.item_id) ? [byId.get(ref.item_id)!] : [])));
  const avoidTypes = new Set(recentItems.map(i => i.case_type).filter(Boolean));
  const avoidIndustries = new Set(recentItems.map(i => i.industry).filter(Boolean));
  const familiar = (p: typeof pool[number]) => avoidTypes.has(p.case_type) || (p.industry !== null && avoidIndustries.has(p.industry));
  const unseen = pool.filter(p => !lastSeen.has(p.item_id) && !familiar(p));
  if (unseen.length >= size) return mark(planAuthored({ setId, pool: unseen, lastSeen, size, tier, now: new Date() }));
  if (fresh.mode === 'transfer') await logDrillEvent(studentId, 'transfer_pool_exhausted', { skill_id: fresh.skill, drill_id: drill.id });
  const oldest = (items: typeof pool) => [...items].sort((a, b) => (lastSeen.get(a.item_id)?.getTime() ?? 0) - (lastSeen.get(b.item_id)?.getTime() ?? 0));
  const fill = [...unseen, ...oldest(pool.filter(p => lastSeen.has(p.item_id) && !familiar(p))), ...oldest(pool.filter(familiar))];
  return mark(fill.slice(0, size).map(i => ({ kind: 'authored' as const, item_id: i.item_id, version: i.version })));
}

// PRD "Serving rules": no Repair item derived from a Level 1 item the student
// saw in the last 14 days. If that leaves fewer items than a short set needs
// (3), the rest come from items whose source was seen longest ago, logged as
// repair_pool_exhausted.
const REPAIR_MIN_SET = 3;
async function withoutRecentSources<T extends { item_id: string; derived_from: string | null }>(studentId: string, drill: Drill, pool: T[], size: number): Promise<T[]> {
  const sources = [...new Set(pool.map(p => p.derived_from).filter((x): x is string => Boolean(x)))];
  if (sources.length === 0) return pool;
  const since = new Date(Date.now() - rules.repair.derived_exclusion_days * 86_400_000);
  const recent = await db.select({ itemId: drillAttempts.itemId, at: max(drillAttempts.submittedAt) }).from(drillAttempts)
    .where(and(eq(drillAttempts.studentId, studentId), inArray(drillAttempts.itemId, sources), sql`${drillAttempts.submittedAt} > ${since.toISOString()}::timestamptz`))
    .groupBy(drillAttempts.itemId);
  const seenAt = new Map(recent.map(r => [r.itemId!, new Date(r.at!).getTime()]));
  const allowed = pool.filter(p => !p.derived_from || !seenAt.has(p.derived_from));
  const need = Math.min(size, REPAIR_MIN_SET);
  if (allowed.length >= need || allowed.length === pool.length) return allowed;
  await logDrillEvent(studentId, 'repair_pool_exhausted', { drill_id: drill.id, available: allowed.length });
  const excluded = pool.filter(p => !allowed.includes(p)).sort((a, b) => seenAt.get(a.derived_from!)! - seenAt.get(b.derived_from!)!);
  return [...allowed, ...excluded.slice(0, need - allowed.length)];
}

// --------------------------------------------------------- the set screen

export interface WorkedExample {
  prompt: string;
  exhibit: Item['exhibit'];
  options: { id: string; text: string; correct: boolean }[];
  answer: string;
  explanation: string;
}

function exampleAnswer(item: Item): string {
  if (item.model_answer) return item.model_answer;
  const parts: string[] = [];
  const option = item.options.find(o => o.correct);
  if (option) parts.push(option.text);
  if (item.numeric) parts.push(formatNumericAnswer(item));
  return parts.join(' → ');
}

// Shown on the intro screen the first time (PRD "Drill intro screen"). A
// worked example is never served in a set, so showing its key is fine.
async function workedExample(drill: Drill): Promise<WorkedExample | null> {
  let item: Item | null = null;
  if (drill.item_source === 'generated') {
    item = generatorsForDrill(drill.id)[0]?.generate(1, 1) ?? null;
  } else {
    const [row] = await db.select().from(drillItems)
      .where(and(eq(drillItems.drillId, drill.id), eq(drillItems.isExample, true), eq(drillItems.status, 'live')))
      .orderBy(desc(drillItems.version)).limit(1);
    item = row ? ItemSchema.parse(row.payload) : null;
  }
  if (!item) return null;
  return {
    prompt: item.prompt, exhibit: item.exhibit,
    options: item.options.map(o => ({ id: o.id, text: o.text, correct: o.correct })),
    answer: exampleAnswer(item), explanation: item.explanation,
  };
}

export async function setView(studentId: string, setId: string) {
  await expireStale(studentId);
  const set = await loadSet(studentId, setId);
  const drill = getDrill(set.drillId);
  const settings = await settingsFor(studentId);
  const skills = DRILLS_CONFIG.taxonomy.skills.filter(s => drill.skills.includes(s.id));
  const showExample = set.currentPosition === 0 && set.currentServedAt === null && !settings.skippedExamples.includes(drill.id);
  const example = showExample ? await workedExample(drill) : null;
  if (example) await logDrillEvent(studentId, 'drill_example_viewed', { drill_id: drill.id });
  // An untimed set shows the timed limits (at 1×) only as a pace target.
  const mult = set.untimed ? 1 : settings.timeMultiplier;
  const limits = drillLimitsMs(drill, set.tier as Tier, mult);
  const diagnostic = set.source === 'diagnostic' ? await diagnosticPartOf(studentId, set.id) : null;
  // "Read the short lesson" on the intro: the set's skill, or the drill's first
  // primary skill that has a lesson.
  const withLesson = diagnostic ? new Set<string>() : await lessonSkills();
  const lessonSkill = [set.focusSkill, ...drill.primary_skills].find(id => id && withLesson.has(id)) ?? null;
  const defend = drill.defend && planOf(set).some(r => r.kind === 'authored' && r.defend)
    ? { type: drill.defend.type, seconds: Math.round(defendSeconds(set.tier) * mult), max_words: rules.defend.max_words } : null;
  return {
    // PRD "Drill intro screen": how much a Repair set tells the student.
    repair_hint: drill.stage === 'repair' ? REPAIR_INTRO[Math.min(set.tier, 3) as 1 | 2 | 3] : null,
    defend,
    diagnostic,
    lesson_skill: lessonSkill,
    set_id: set.id, status: set.status, position: set.currentPosition, size: set.size, tier: set.tier,
    drill: { id: drill.id, name: drill.name, level: drill.level },
    skills: skills.map(s => ({ id: s.id, name: s.name })),
    focus_skill: set.focusSkill ? skills.find(s => s.id === set.focusSkill)?.name ?? null : null,
    untimed: set.untimed,
    timer_hidden: set.timerHidden,
    // The timed/untimed choice is open until the first item is served.
    timer_choice_open: set.currentPosition === 0 && set.currentServedAt === null,
    time_limit_ms: limits[0],
    stage_limits_ms: limits,
    ai_graded: isAiGraded(drill),
    pass_bar: drill.pass_bar,
    example: diagnostic ? null : example,
  };
}

const REPAIR_INTRO = {
  1: 'Each answer has a flaw, and you\'ll be told what it is. Fix it, and keep what was right.',
  2: 'Each answer has a flaw, but you won\'t be told what it is. Find it, fix it, and keep what was right.',
  3: 'Each answer may have one or two flaws, and you won\'t be told what they are. Fix them, and keep what was right.',
};

async function diagnosticPartOf(studentId: string, setId: string) {
  const view = await diagnosticView(studentId);
  const part = view?.parts.find(p => p.set_id === setId);
  return part ? { part: part.index + 1, of: view!.parts.length } : null;
}

// -------------------------------------------------------- fetch an item

export async function fetchItem(studentId: string, setId: string, position: number) {
  if (!z.uuid().safeParse(setId).success) throw new DrillError('not_found', 404, 'Set not found');
  const [row] = await db.select({ set: drillSets, timeMultiplier: studentDrillSettings.timeMultiplier })
    .from(drillSets)
    .leftJoin(studentDrillSettings, eq(studentDrillSettings.studentId, drillSets.studentId))
    .where(and(eq(drillSets.id, setId), eq(drillSets.studentId, studentId)));
  if (!row) throw new DrillError('not_found', 404, 'Set not found');
  const { set } = row;
  // A pause left open (a reload with a dialog open) ends here.
  if (set.pausedAt && await resumePaused(set.id, studentId, 'reload')) return fetchItem(studentId, setId, position);
  if (set.status !== 'in_progress') throw new DrillError('set_closed', 409, `This set is ${set.status}`);
  if (position !== set.currentPosition) {
    throw new DrillError('out_of_order', 409, 'Items are served in order', { position: set.currentPosition });
  }
  if (position >= set.size) throw new DrillError('set_finished', 409, 'Every item has been answered');

  // The timer starts the first time the item is fetched; a reload keeps it.
  let servedAt = set.currentServedAt;
  if (!servedAt) {
    const now = new Date();
    const [updated] = await db.update(drillSets).set({ currentServedAt: now })
      .where(and(eq(drillSets.id, set.id), eq(drillSets.currentPosition, position), isNull(drillSets.currentServedAt)))
      .returning({ servedAt: drillSets.currentServedAt });
    servedAt = updated?.servedAt ?? now;
    if (updated) void logDrillEvent(studentId, 'drill_item_served', { set_id: set.id, position, item_ref: planOf(set)[position] });
  }

  const drill = getDrill(set.drillId);
  const item = await resolveItem(planOf(set)[position], set.tier as Tier);
  const pending = set.pendingStep as PendingStep | null;
  const step = pending?.steps.length ?? 0;
  const timing = stepTiming(drill, item, set.tier as Tier, set.untimed ? 1 : row.timeMultiplier ?? 1, step, servedAt, pending?.stage_started_at);
  return {
    position, size: set.size, ai_graded: isAiGraded(drill), untimed: set.untimed,
    item: toPublicItem(item, set.tier) satisfies PublicItem,
    ...timing,
    completed_steps: (pending?.steps ?? []).map((s, i) => stepFeedback(item, i, s, pending!.steps.slice(0, i))),
  };
}

function stepTiming(drill: Drill, item: Item, tier: Tier, mult: number, step: number, servedAt: Date, stageStartedAt?: string) {
  const limit = stepLimitMs(drill, item, tier, mult, step);
  const start = stepStartedAt(item, step, servedAt, stageStartedAt);
  return { time_limit_ms: limit, remaining_ms: Math.max(0, limit - (Date.now() - start.getTime())) };
}

// ---------------------------------------------------------- submit an answer

export const SubmitSchema = z.object({
  position: z.number().int().nonnegative(),
  idempotency_key: z.string().min(8).max(100),
  step: z.number().int().nonnegative().default(0),
  response: StepResponseSchema.nullable().default(null),
  skip: z.boolean().default(false),
  // The client auto-submits when its countdown hits zero (PRD "Item screen").
  timed_out: z.boolean().default(false),
});

export type StepReply = { done: false; step: StepFeedback; next_step: number; time_limit_ms: number; remaining_ms: number };

// One read, one write (PRD: auto-checked feedback < 300 ms p95). The read
// fetches the set, the student's time multiplier and any earlier attempt with
// this idempotency key in a single query. The write is a single statement:
// it advances the set only if it is still on this item, and inserts the
// attempt only if that update happened, so two racing submits can't both
// land. If the write loses a race, re-reading returns the original result
// (same key) or an out-of-order error (different key).
const textArray = (values: string[]) =>
  values.length ? sql`ARRAY[${sql.join(values.map(v => sql`${v}`), sql`, `)}]::text[]` : sql`'{}'::text[]`;

export async function submitAttempt(studentId: string, setId: string, body: z.infer<typeof SubmitSchema>, retried = false):
  Promise<ItemFeedback | StepReply> {
  if (!z.uuid().safeParse(setId).success) throw new DrillError('not_found', 404, 'Set not found');
  const [row] = await db.select({ set: drillSets, timeMultiplier: studentDrillSettings.timeMultiplier, prior: drillAttempts })
    .from(drillSets)
    .leftJoin(studentDrillSettings, eq(studentDrillSettings.studentId, drillSets.studentId))
    .leftJoin(drillAttempts, and(eq(drillAttempts.setId, drillSets.id), eq(drillAttempts.idempotencyKey, body.idempotency_key)))
    .where(and(eq(drillSets.id, setId), eq(drillSets.studentId, studentId)));
  if (!row) throw new DrillError('not_found', 404, 'Set not found');
  const { set, prior } = row;
  // Submitting ends a pause; the clock is read again after it.
  if (set.pausedAt && !prior && await resumePaused(set.id, studentId, 'submit')) return submitAttempt(studentId, setId, body, retried);

  // A repeated key returns the original result.
  if (prior) return itemFeedback(await resolveItem(planOf(set)[prior.position], set.tier as Tier), resultOf(prior), prior.checkResults as CheckResults | null);

  if (set.status !== 'in_progress') throw new DrillError('set_closed', 409, `This set is ${set.status}`);
  if (body.position !== set.currentPosition) throw new DrillError('out_of_order', 409, 'Answer the current item', { position: set.currentPosition });
  if (!set.currentServedAt) throw new DrillError('not_served', 409, 'Fetch the item first');
  const position = set.currentPosition;
  const servedAt = set.currentServedAt;
  const item = await resolveItem(planOf(set)[position], set.tier as Tier);
  const drill = getDrill(set.drillId);
  // An untimed set records the 1× limits as a pace target; nothing times out.
  const mult = set.untimed ? 1 : row.timeMultiplier ?? 1;

  const pending = (set.pendingStep as PendingStep | null) ?? { steps: [], keys: [] };
  const steps = itemSteps(item);
  if (pending.keys.includes(body.idempotency_key)) {
    const i = pending.keys.indexOf(body.idempotency_key);
    return {
      done: false, step: stepFeedback(item, i, pending.steps[i], pending.steps.slice(0, i)), next_step: pending.steps.length,
      ...stepTiming(drill, item, set.tier as Tier, mult, pending.steps.length, servedAt, pending.stage_started_at),
    };
  }

  // The current step's clock: the item's, or (HY-2 stage 2) the stage's.
  const index = pending.steps.length;
  const limit = stepLimitMs(drill, item, set.tier as Tier, mult, index);
  const stepElapsed = Date.now() - stepStartedAt(item, index, servedAt, pending.stage_started_at).getTime();
  const elapsed = Date.now() - servedAt.getTime();
  // Past the limit plus the network grace, the answer doesn't count.
  const late = !set.untimed && stepElapsed > limit + rules.timing.grace_ms;
  const timedOut = !set.untimed && (body.timed_out || stepElapsed > limit);
  const retry = () => {
    if (retried) throw new DrillError('conflict', 409, 'This item changed; reload it', { position });
    return submitAttempt(studentId, setId, body, true);
  };

  let result: ItemResult;
  let done: StepResult[] = pending.steps;
  const followupFrom = defendStart(item);
  if (body.skip && followupFrom >= 0 && pending.steps.length >= followupFrom) {
    // Skipping the follow-up skips only the follow-up: the main answer is
    // graded, and the Defend part scores 0 with M.skipped.
    done = [...pending.steps];
    for (let i = done.length; i < steps.length; i++) done.push({ ...scoreStep(item, i, { type: 'empty' }, true, done), tag: 'M.skipped' });
    result = scoreItem(item, { skipped: false, timedOut, steps: done });
  } else if (body.skip) {
    result = scoreItem(item, { skipped: true, timedOut, steps: [] });
  } else {
    if (body.step !== index) throw new DrillError('wrong_step', 409, `Submit step ${index}`, { step: index });
    const response: StepResponse = late || !body.response ? { type: 'empty' } : body.response;
    try {
      done = [...pending.steps, scoreStep(item, index, response, timedOut, pending.steps)];
    } catch (e) {
      if (e instanceof ScoringError) throw new DrillError(e.code, 422, e.message);
      throw e;
    }
    if (done.length < steps.length && !timedOut) {
      // Save the finished step, unless another request changed it first. A
      // step that starts a new stage (HY-2 stage 2) starts its clock now.
      const now = new Date();
      const next: PendingStep = {
        steps: done, keys: [...pending.keys, body.idempotency_key],
        stage_started_at: startsStage(item, done.length) ? now.toISOString() : pending.stage_started_at,
      };
      const saved = await db.update(drillSets)
        .set({ pendingStep: next })
        .where(and(eq(drillSets.id, set.id), eq(drillSets.currentPosition, position),
          set.pendingStep === null ? isNull(drillSets.pendingStep) : sql`${drillSets.pendingStep} = ${JSON.stringify(set.pendingStep)}::jsonb`))
        .returning({ id: drillSets.id });
      if (saved.length === 0) return retry();
      return {
        done: false, step: stepFeedback(item, index, done[index], done.slice(0, index)), next_step: done.length,
        ...stepTiming(drill, item, set.tier as Tier, mult, done.length, servedAt, next.stage_started_at),
      };
    }
    // Time ran out mid-item: the remaining steps score 0 as timeouts.
    for (let i = done.length; i < steps.length; i++) done.push(scoreStep(item, i, { type: 'empty' }, true, done));
    result = scoreItem(item, { skipped: false, timedOut, steps: done });
  }

  const ref = planOf(set)[position];
  const [itemId, itemVersion, templateId, templateVersion, seed] = ref.kind === 'authored'
    ? [ref.item_id, ref.version, null, null, null]
    : [null, null, ref.template_id, ref.template_version, ref.seed];
  // AI-graded items wait for the set's grading, skips included (they are
  // scored with the set, so the set finishes in one pass).
  const awaiting = isAiGraded(drill);
  const totalLimit = itemLimitsMs(drill, item, set.tier as Tier, mult).reduce((a, b) => a + b, 0);
  // The Defend reply, in its own columns, once the follow-up was shown.
  const shown = followupFrom >= 0 && done.length > followupFrom && pending.steps.length >= followupFrom;
  const defendResponse = shown ? JSON.stringify({
    decision: done.slice(followupFrom).find(st => st.response.type === 'choice')?.response ?? null,
    text: done[done.length - 1].response.type === 'text' ? (done[done.length - 1].response as { value: string }).value : null,
  }) : null;
  const defendTimeMs = shown && pending.stage_started_at ? Date.now() - Date.parse(pending.stage_started_at) : null;
  let inserted: { id: string }[];
  try {
    inserted = (await db.execute<{ id: string }>(sql`
      with advanced as (
        update ${drillSets}
        set current_position = current_position + 1, current_served_at = null, pending_step = null
        where id = ${set.id} and current_position = ${position} and status = 'in_progress'
        returning id
      )
      insert into ${drillAttempts} (
        set_id, student_id, position, idempotency_key, item_id, item_version, template_id, template_version, seed,
        response, served_at, time_ms, time_limit_ms, timed_out, skipped, score, step_scores, mistake_tags, grading_status,
        defend_response, defend_time_ms
      )
      select advanced.id, ${studentId}, ${position}, ${body.idempotency_key}, ${itemId}, ${itemVersion}, ${templateId}, ${templateVersion}, ${seed},
        ${JSON.stringify({ steps: done.map(s => s.response), skip: body.skip })}::jsonb, ${servedAt.toISOString()}::timestamptz,
        ${elapsed}, ${totalLimit}, ${result.timed_out}, ${result.skipped}, ${awaiting ? null : result.score},
        ${JSON.stringify(result.steps)}::jsonb, ${textArray(awaiting ? [] : result.mistake_tags)}, ${awaiting ? 'pending' : 'not_needed'},
        ${defendResponse}::jsonb, ${defendTimeMs}
      from advanced
      returning id
    `)) as unknown as { id: string }[];
  } catch (e) {
    // The same key landed in a concurrent request: replay its result.
    if ((e as { cause?: { code?: string } }).cause?.code === '23505' || (e as { code?: string }).code === '23505') return retry();
    throw e;
  }
  if (inserted.length === 0) return retry();

  void logDrillEvent(studentId, 'drill_attempt_submitted', {
    attempt_id: inserted[0].id, score: awaiting ? null : result.score, time_ms: elapsed, timed_out: result.timed_out,
    skipped: result.skipped, mistake_tags: awaiting ? [] : result.mistake_tags, grading: awaiting ? 'pending' : 'not_needed',
  });
  return itemFeedback(item, awaiting ? { ...result, pending: true } : result);
}

// ------------------------------------------------------------ complete a set

export async function completeSet(studentId: string, setId: string): Promise<{ status: 'completed' | 'grading' }> {
  const set = await loadSet(studentId, setId);
  if (set.status === 'completed') return { status: 'completed' };
  if (set.status === 'grading') return { status: 'grading' };
  if (set.status !== 'in_progress') throw new DrillError('set_closed', 409, `This set is ${set.status}`);
  if (set.currentPosition < set.size) throw new DrillError('set_unfinished', 409, 'Answer every item first', { position: set.currentPosition });

  // Written answers are graded in one call after the last item (PRD
  // "Feedback timing"); the results page polls until the grade is in.
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(drillAttempts)
    .where(and(eq(drillAttempts.setId, set.id), inArray(drillAttempts.gradingStatus, ['pending', 'delayed'])));
  if (n > 0) {
    const jobId = await enqueueGrading(set.id);
    await runAfterResponse(jobId);
    return { status: 'grading' };
  }
  await db.update(drillSets).set({ status: 'grading' }).where(and(eq(drillSets.id, set.id), eq(drillSets.status, 'in_progress')));
  await finalizeSet(set.id);
  return { status: 'completed' };
}

// ------------------------------------------------------------------ results

export async function setResults(studentId: string, setId: string) {
  const set = await loadSet(studentId, setId);
  const drill = getDrill(set.drillId);
  if (set.status === 'grading') {
    // Still grading: report progress, and re-run grading that failed or died.
    const state = await kickGrading(set.id);
    return { set_id: set.id, status: 'grading' as const, delayed: state.delayed, drill: { id: drill.id, name: drill.name, level: drill.level } };
  }
  if (set.status !== 'completed') throw new DrillError('set_not_completed', 409, `This set is ${set.status}`);
  const attempts = await db.select().from(drillAttempts).where(eq(drillAttempts.setId, set.id)).orderBy(asc(drillAttempts.position));
  const items = await Promise.all(planOf(set).map(ref => resolveItem(ref, set.tier as Tier)));
  const results = attempts.map(resultOf);
  // Answers left ungraded ("Grading delayed") count toward nothing.
  const counted = results.filter(r => !r.ungraded);
  const score = set.setScore ?? (counted.length ? setScore(counted) : null);
  return {
    skill_changes: await skillChanges(studentId, set.id),
    from_workout: set.workoutId !== null,
    // A set below 50% offers the skill's lesson (PRD "Lessons").
    lesson_skill: score === null ? null : await lowScoreLesson(set, score),
    // "Defending your answer" after the student's first follow-up reply.
    defend_lesson: attempts.some(a => answeredFollowUp(a.defendResponse)) ? await defendLessonFor(studentId) : null,
    set_id: set.id,
    status: 'completed' as const,
    drill: { id: drill.id, name: drill.name, level: drill.level },
    ai_graded: isAiGraded(drill),
    focus_skill: set.focusSkill,
    // Null when no answer could be graded.
    score, passed: score === null ? null : set.passed ?? passed(drill, score), pass_bar: drill.pass_bar,
    ungraded: results.filter(r => r.ungraded).length,
    // Untimed: the real time taken, against the timed target, to work on pace.
    untimed: set.untimed,
    time_ms: attempts.reduce((s, a) => s + (set.untimed ? a.timeMs : Math.min(a.timeMs, a.timeLimitMs)), 0),
    target_ms: attempts.reduce((s, a) => s + a.timeLimitMs, 0),
    mistakes: mistakeSummary(counted),
    tier: { before: set.tier, after: score === null ? set.tier : nextTier(set.tier as Tier, score) },
    skill_scores: (set.skillScores as Record<string, { score: number; count: number }> | null) ?? {},
    items: attempts.map((a, i) => {
      const item = items[a.position];
      return {
        position: a.position, prompt: item.prompt, exhibit: item.exhibit,
        options: item.options.map(o => ({ id: o.id, text: o.text, correct: o.correct })),
        time_ms: a.timeMs, time_limit_ms: a.timeLimitMs,
        feedback: itemFeedback(item, results[i], a.checkResults as CheckResults | null),
      };
    }),
  };
}

// A follow-up counts once the student wrote a reply (a skipped or empty one
// doesn't).
export function answeredFollowUp(defendResponse: unknown): boolean {
  const text = (defendResponse as { text?: unknown } | null)?.text;
  return typeof text === 'string' && text.trim().length > 0;
}

async function lowScoreLesson(set: SetRow, score: number): Promise<{ id: string; name: string } | null> {
  if (score >= DRILLS_CONFIG.rules.stages.construct_to_recognize_below - 1e-9) return null;
  const withLesson = await lessonSkills();
  const id = [set.focusSkill, ...getDrill(set.drillId).primary_skills].find(x => x && withLesson.has(x));
  // Mid-sentence: "the lesson on MECE structure", "on math setup".
  return id ? { id, name: lowerName(id) } : null;
}

// "Breakeven: now Practiced. Transfer check unlocks Thursday."
async function skillChanges(studentId: string, setId: string) {
  const events = await db.select().from(skillStateEvents)
    .where(and(eq(skillStateEvents.studentId, studentId), eq(skillStateEvents.sourceId, setId)))
    .orderBy(asc(skillStateEvents.createdAt));
  if (events.length === 0) return [];
  const states = await db.select().from(skillStates)
    .where(and(eq(skillStates.studentId, studentId), inArray(skillStates.skillId, events.map(e => e.skillId))));
  return events.map(e => {
    const now = states.find(s => s.skillId === e.skillId);
    return {
      skill_id: e.skillId, skill_name: getSkill(e.skillId).name, from: e.fromState, to: e.toState,
      transfer_due_at: e.toState === 'practiced' && now?.state === 'practiced' ? now.transferDueAt : null,
    };
  });
}

// ----------------------------------------------------------------- settings

export const SettingsSchema = z.object({
  time_multiplier: z.union([z.literal(1), z.literal(1.5), z.literal(2)]).optional(),
  // "No time limit" (WCAG 2.2.1); applies to sets started afterwards.
  untimed: z.boolean().optional(),
  // "Hide timer": the default for new sets.
  hide_timer: z.boolean().optional(),
  skip_example_for: z.string().optional(),
});

export async function updateSettings(studentId: string, body: z.infer<typeof SettingsSchema>) {
  const current = await settingsFor(studentId);
  if (body.skip_example_for) getDrill(body.skip_example_for);
  const skipped = body.skip_example_for && !current.skippedExamples.includes(body.skip_example_for)
    ? [...current.skippedExamples, body.skip_example_for] : current.skippedExamples;
  const values = {
    timeMultiplier: body.time_multiplier ?? current.timeMultiplier, untimed: body.untimed ?? current.untimed, hideTimer: body.hide_timer ?? current.hideTimer,
    skippedExamples: skipped, updatedAt: new Date(),
  };
  await db.insert(studentDrillSettings).values({ studentId, ...values })
    .onConflictDoUpdate({ target: studentDrillSettings.studentId, set: values });
  if (body.skip_example_for) await logDrillEvent(studentId, 'drill_example_skipped', { drill_id: body.skip_example_for });
  return { time_multiplier: values.timeMultiplier, untimed: values.untimed, hide_timer: values.hideTimer, skipped_examples: skipped };
}

export { settingsFor, formatNumericAnswer };

// ----------------------------------------------------------- timer options

// Timed or No timer, and Hide timer (D6 round 2). The timed/untimed choice is
// made on the intro screen and fixed once the first item is served; the timer
// can be shown or hidden at any time. Both become the student's defaults.
export const TimerSchema = z.object({
  untimed: z.boolean().optional(),
  hidden: z.boolean().optional(),
  // Sent with the intro screen's Start: logs the choice.
  at_start: z.boolean().default(false),
});

export async function setTimer(studentId: string, setId: string, body: z.input<typeof TimerSchema>) {
  if (!z.uuid().safeParse(setId).success) throw new DrillError('not_found', 404, 'Set not found');
  const set = await loadSet(studentId, setId);
  if (set.status !== 'in_progress') throw new DrillError('set_closed', 409, `This set is ${set.status}`);
  const open = set.currentPosition === 0 && set.currentServedAt === null;
  const untimed = body.untimed !== undefined && open ? body.untimed : set.untimed;
  const hidden = body.hidden ?? set.timerHidden;
  await db.update(drillSets).set({ untimed, timerHidden: hidden }).where(eq(drillSets.id, set.id));
  await updateSettings(studentId, { hide_timer: hidden, ...(body.untimed !== undefined && open && { untimed }) });
  if (body.at_start) await logDrillEvent(studentId, 'timer_chosen', { set_id: set.id, untimed, timer_hidden: hidden });
  else if (hidden !== set.timerHidden) await logDrillEvent(studentId, 'timer_visibility_changed', { set_id: set.id, position: set.currentPosition, timer_hidden: hidden });
  return { untimed, timer_hidden: hidden };
}

// ------------------------------------------------------------------ pauses

// The clock pauses while Report a problem or the feedback box is open (D6
// round 2). Resuming moves the item's start (and a stage's) forward by the
// pause, so every limit check and the time recorded leave it out. Each pause
// is logged (timer_paused / timer_resumed) so the reports can spot abuse.
export const PauseSchema = z.object({
  action: z.enum(['pause', 'resume']),
  reason: z.enum(['feedback', 'report']),
});

export async function pauseTimer(studentId: string, setId: string, body: z.infer<typeof PauseSchema>) {
  if (!z.uuid().safeParse(setId).success) throw new DrillError('not_found', 404, 'Set not found');
  const set = await loadSet(studentId, setId);
  // Nothing to pause: no item on the clock, or no clock.
  if (set.status !== 'in_progress' || !set.currentServedAt || set.untimed) return { paused: false };
  if (body.action === 'pause') {
    const [paused] = await db.update(drillSets).set({ pausedAt: new Date() })
      .where(and(eq(drillSets.id, set.id), isNull(drillSets.pausedAt), eq(drillSets.currentPosition, set.currentPosition)))
      .returning({ id: drillSets.id });
    if (paused) await logDrillEvent(studentId, 'timer_paused', { set_id: set.id, position: set.currentPosition, reason: body.reason });
    return { paused: true };
  }
  await resumePaused(set.id, studentId, body.reason);
  // The clock after the pause, for the countdown.
  const fresh = await loadSet(studentId, setId);
  const [settings] = await db.select({ m: studentDrillSettings.timeMultiplier }).from(studentDrillSettings).where(eq(studentDrillSettings.studentId, studentId));
  const item = await resolveItem(planOf(fresh)[fresh.currentPosition], fresh.tier as Tier);
  const pending = fresh.pendingStep as PendingStep | null;
  return { paused: false, ...stepTiming(getDrill(fresh.drillId), item, fresh.tier as Tier, settings?.m ?? 1, pending?.steps.length ?? 0, fresh.currentServedAt!, pending?.stage_started_at) };
}

// Ends a pause, if one is open. Returns true when it did.
async function resumePaused(setId: string, studentId: string, reason: string): Promise<boolean> {
  const done = await db.transaction(async tx => {
    const [s] = await tx.select().from(drillSets).where(and(eq(drillSets.id, setId), eq(drillSets.studentId, studentId))).for('update');
    if (!s?.pausedAt) return null;
    const ms = Math.max(0, Date.now() - s.pausedAt.getTime());
    const pending = s.pendingStep as PendingStep | null;
    await tx.update(drillSets).set({
      pausedAt: null, pausedMs: s.pausedMs + ms,
      currentServedAt: s.currentServedAt ? new Date(s.currentServedAt.getTime() + ms) : null,
      pendingStep: pending?.stage_started_at ? { ...pending, stage_started_at: new Date(Date.parse(pending.stage_started_at) + ms).toISOString() } : pending,
    }).where(eq(drillSets.id, s.id));
    return { position: s.currentPosition, ms };
  });
  if (!done) return false;
  await logDrillEvent(studentId, 'timer_resumed', { set_id: setId, position: done.position, reason, paused_ms: done.ms });
  return true;
}

