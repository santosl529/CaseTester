// Drill sets against the database (docs/prd-drills.md "Services and APIs"):
// start, resume, fetch items in order, submit answers, complete, results.
// Enforces the PRD integrity rules: keys stay server-side until an item is
// submitted, time limits run on the server from served_at with a 2 s grace,
// submissions are idempotent, items come strictly in order, and a student has
// one set in progress at a time.
import 'server-only';
import { randomUUID } from 'crypto';
import { and, asc, desc, eq, inArray, isNull, lt, max, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillAttempts, drillItems, drillSets, drillTiers, studentDrillSettings } from '@/db/schema';
import { DRILLS_CONFIG, TAXONOMY_VERSION, getDrill, type Drill } from '../config';
import { ItemSchema, type Item, type Tier } from '../item-schema';
import { toPublicItem, type PublicItem } from '../public-item';
import { generatorsForDrill, rebuildItem } from '../generators/registry';
import { planAuthored, planGenerated, type ItemRef } from './plan';
import {
  ScoringError, StepResponseSchema, itemSteps, scoreItem, scoreStep, tagFeedback, tagLabel,
  type ItemResult, type StepResponse, type StepResult,
} from './scoring';
import { mistakeSummary, nextTier, passed, setScore, skillScores, timeLimitMs } from './summary';
import { logDrillEvent } from '../events';
import { z } from 'zod';

export class DrillError extends Error {
  constructor(public code: string, public status: number, message: string, public data: Record<string, unknown> = {}) {
    super(message);
  }
}

type SetRow = typeof drillSets.$inferSelect;
interface PendingStep { steps: StepResult[]; keys: string[] }

const rules = DRILLS_CONFIG.rules;
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

// ------------------------------------------------------------------ helpers

async function settingsFor(studentId: string) {
  const [row] = await db.select().from(studentDrillSettings).where(eq(studentDrillSettings.studentId, studentId));
  return { timeMultiplier: row?.timeMultiplier ?? 1, skippedExamples: row?.skippedExamples ?? [] };
}

async function loadSet(studentId: string, setId: string): Promise<SetRow> {
  if (!z.uuid().safeParse(setId).success) throw new DrillError('not_found', 404, 'Set not found');
  const [set] = await db.select().from(drillSets).where(and(eq(drillSets.id, setId), eq(drillSets.studentId, studentId)));
  if (!set) throw new DrillError('not_found', 404, 'Set not found');
  return set;
}

async function resolveItem(ref: ItemRef, tier: Tier): Promise<Item> {
  if (ref.kind === 'generated') return rebuildItem(ref, tier);
  const [row] = await db.select().from(drillItems)
    .where(and(eq(drillItems.itemId, ref.item_id), eq(drillItems.version, ref.version)));
  if (!row) throw new Error(`Drill item ${ref.item_id}@${ref.version} is missing`);
  return ItemSchema.parse(row.payload);
}

const planOf = (set: SetRow) => set.itemPlan as ItemRef[];

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
}).refine(b => b.skill_id || b.drill_id, 'skill_id or drill_id is required');

// The drill for a skill at a level, if that drill is live.
export function drillForSkill(skillId: string, level?: 1 | 2): Drill | null {
  const map = rules.skill_drills[skillId];
  if (!map) return null;
  const live = (id: string | null) => (id && getDrill(id).live ? getDrill(id) : null);
  const l1 = live(map.l1), l2 = live(map.l2);
  if (level === 1) return l1;
  if (level === 2) return l2;
  return l2 ?? l1;
}

export async function startSet(studentId: string, input: z.infer<typeof StartSetSchema>): Promise<{ set_id: string }> {
  const drill = input.drill_id ? getDrill(input.drill_id) : drillForSkill(input.skill_id!, input.level);
  if (!drill || !drill.live) throw new DrillError('no_live_drill', 404, 'No drill is available for that skill and level yet');
  if (input.skill_id && !drill.skills.includes(input.skill_id)) throw new DrillError('bad_request', 400, `${drill.id} doesn't train ${input.skill_id}`);

  const existing = await inProgressSet(studentId);
  if (existing) throw new DrillError('set_in_progress', 409, 'Finish or leave your current set first', { set_id: existing.id });

  const [tierRow] = await db.select().from(drillTiers).where(and(eq(drillTiers.studentId, studentId), eq(drillTiers.drillId, drill.id)));
  const tier = (tierRow?.currentTier ?? rules.tiers.start) as Tier;
  const setId = randomUUID();
  const size = drill.set_size!;

  let plan: ItemRef[];
  if (drill.item_source === 'generated') {
    plan = planGenerated({ setId, drillId: drill.id, size, focusSkill: input.skill_id ?? null });
  } else {
    plan = await planAuthoredSet(studentId, setId, drill, size, tier);
    if (plan.length === 0) throw new DrillError('no_items', 404, 'No items are live for this drill yet');
  }

  try {
    await db.insert(drillSets).values({
      id: setId, studentId, drillId: drill.id, level: drill.level, tier, size: plan.length,
      source: 'specific', focusSkill: input.skill_id ?? null, itemPlan: plan, taxonomyVersion: TAXONOMY_VERSION,
    });
  } catch (e) {
    // Lost a race with another tab: the unique index allows one in-progress set.
    const other = await inProgressSet(studentId);
    if (other) throw new DrillError('set_in_progress', 409, 'Finish or leave your current set first', { set_id: other.id });
    throw e;
  }
  await logDrillEvent(studentId, 'drill_set_started', {
    set_id: setId, drill_id: drill.id, level: drill.level, tier, source: 'specific', prescription_id: null, focus_tag: null,
  });
  return { set_id: setId };
}

async function planAuthoredSet(studentId: string, setId: string, drill: Drill, size: number, tier: Tier): Promise<ItemRef[]> {
  // Latest live version of each item, never the worked example.
  const rows = await db.select().from(drillItems)
    .where(and(eq(drillItems.drillId, drill.id), eq(drillItems.status, 'live'), eq(drillItems.isExample, false)))
    .orderBy(desc(drillItems.version));
  const latest = new Map<string, typeof rows[number]>();
  for (const r of rows) if (!latest.has(r.itemId)) latest.set(r.itemId, r);
  const pool = [...latest.values()].map(r => ({
    item_id: r.itemId, version: r.version, tier: r.tier,
    case_type: (r.payload as Item).case_type ?? null,
  }));
  const seen = pool.length
    ? await db.select({ itemId: drillAttempts.itemId, at: max(drillAttempts.submittedAt) }).from(drillAttempts)
      .where(and(eq(drillAttempts.studentId, studentId), inArray(drillAttempts.itemId, pool.map(p => p.item_id))))
      .groupBy(drillAttempts.itemId)
    : [];
  const lastSeen = new Map(seen.filter(s => s.itemId && s.at).map(s => [s.itemId!, new Date(s.at!)]));
  return planAuthored({ setId, pool, lastSeen, size, tier, now: new Date() });
}

// --------------------------------------------------------- the set screen

export interface WorkedExample {
  prompt: string;
  exhibit: Item['exhibit'];
  options: { id: string; text: string; correct: boolean }[];
  answer: string;
  explanation: string;
}

function answerText(item: Item): string {
  const parts: string[] = [];
  const option = item.options.find(o => o.correct);
  if (option) parts.push(option.text);
  if (item.numeric) parts.push(formatNumericAnswer(item));
  return parts.join(' → ');
}

export function formatNumericAnswer(item: Item): string {
  const key = item.numeric!;
  if (item.extras.asks === 'points') return `${fmt(key.answer)} percentage ${key.answer === 1 ? 'point' : 'points'}`;
  return key.percent_format === 'none' ? fmt(key.answer) : `${fmt(key.answer)}%`;
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
    answer: answerText(item), explanation: item.explanation,
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
  return {
    set_id: set.id, status: set.status, position: set.currentPosition, size: set.size, tier: set.tier,
    drill: { id: drill.id, name: drill.name, level: drill.level },
    skills: skills.map(s => ({ id: s.id, name: s.name })),
    focus_skill: set.focusSkill ? skills.find(s => s.id === set.focusSkill)?.name ?? null : null,
    time_limit_ms: timeLimitMs(drill, set.tier as Tier, settings.timeMultiplier),
    pass_bar: drill.pass_bar,
    example,
  };
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
  const limit = timeLimitMs(drill, set.tier as Tier, row.timeMultiplier ?? 1);
  const pending = set.pendingStep as PendingStep | null;
  return {
    position, size: set.size,
    item: toPublicItem(item) satisfies PublicItem,
    time_limit_ms: limit,
    remaining_ms: Math.max(0, limit - (Date.now() - servedAt.getTime())),
    completed_steps: (pending?.steps ?? []).map((s, i) => stepFeedback(item, i, s)),
  };
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

export interface StepFeedback {
  type: string;
  correct: boolean;
  your_answer: string | null;
  correct_answer: string;
  feedback: string;
  correct_option_id: string | null;
}

function stepFeedback(item: Item, i: number, step: StepResult | null): StepFeedback {
  const type = itemSteps(item)[i].type;
  const right = step?.score === 1;
  if (type === 'single_choice') {
    const correct = item.options.find(o => o.correct)!;
    const chosen = step?.response.type === 'choice' ? item.options.find(o => o.id === (step.response as { option_id: string }).option_id) : undefined;
    return {
      type, correct: right, your_answer: chosen?.text ?? null, correct_answer: correct.text,
      feedback: chosen ? chosen.feedback : step?.tag ? tagFeedback(step.tag) : '',
      correct_option_id: correct.id,
    };
  }
  const typed = step?.response.type === 'numeric' ? step.response.value : null;
  return {
    type, correct: right, your_answer: typed, correct_answer: formatNumericAnswer(item),
    feedback: right ? 'Correct.' : step?.tag ? tagFeedback(step.tag) : '',
    correct_option_id: null,
  };
}

export interface ItemFeedback {
  done: true;
  correct: boolean;
  score: number;
  skipped: boolean;
  timed_out: boolean;
  steps: StepFeedback[];
  mistakes: { tag: string; label: string }[];
  explanation: string;
}

function itemFeedback(item: Item, result: ItemResult): ItemFeedback {
  return {
    done: true, correct: result.score >= 1 - 1e-9, score: result.score, skipped: result.skipped, timed_out: result.timed_out,
    steps: itemSteps(item).map((_, i) => stepFeedback(item, i, result.steps[i] ?? null)),
    mistakes: result.mistake_tags.filter(t => t !== 'M.skipped').map(tag => ({ tag, label: tagLabel(tag) })),
    explanation: item.explanation,
  };
}

const resultOf = (row: typeof drillAttempts.$inferSelect): ItemResult => ({
  score: row.score ?? 0,
  steps: (row.stepScores as StepResult[] | null) ?? [],
  mistake_tags: row.mistakeTags,
  skipped: row.skipped,
  timed_out: row.timedOut,
});

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
  Promise<ItemFeedback | { done: false; step: StepFeedback; next_step: number }> {
  if (!z.uuid().safeParse(setId).success) throw new DrillError('not_found', 404, 'Set not found');
  const [row] = await db.select({ set: drillSets, timeMultiplier: studentDrillSettings.timeMultiplier, prior: drillAttempts })
    .from(drillSets)
    .leftJoin(studentDrillSettings, eq(studentDrillSettings.studentId, drillSets.studentId))
    .leftJoin(drillAttempts, and(eq(drillAttempts.setId, drillSets.id), eq(drillAttempts.idempotencyKey, body.idempotency_key)))
    .where(and(eq(drillSets.id, setId), eq(drillSets.studentId, studentId)));
  if (!row) throw new DrillError('not_found', 404, 'Set not found');
  const { set, prior } = row;

  // A repeated key returns the original result.
  if (prior) return itemFeedback(await resolveItem(planOf(set)[prior.position], set.tier as Tier), resultOf(prior));

  if (set.status !== 'in_progress') throw new DrillError('set_closed', 409, `This set is ${set.status}`);
  if (body.position !== set.currentPosition) throw new DrillError('out_of_order', 409, 'Answer the current item', { position: set.currentPosition });
  if (!set.currentServedAt) throw new DrillError('not_served', 409, 'Fetch the item first');
  const position = set.currentPosition;
  const servedAt = set.currentServedAt;
  const item = await resolveItem(planOf(set)[position], set.tier as Tier);

  const pending = (set.pendingStep as PendingStep | null) ?? { steps: [], keys: [] };
  const steps = itemSteps(item);
  if (pending.keys.includes(body.idempotency_key)) {
    const i = pending.keys.indexOf(body.idempotency_key);
    return { done: false, step: stepFeedback(item, i, pending.steps[i]), next_step: pending.steps.length };
  }

  const drill = getDrill(set.drillId);
  const limit = timeLimitMs(drill, set.tier as Tier, row.timeMultiplier ?? 1);
  const elapsed = Date.now() - servedAt.getTime();
  // Past the limit plus the network grace, the answer doesn't count.
  const late = elapsed > limit + rules.timing.grace_ms;
  const timedOut = body.timed_out || elapsed > limit;
  const retry = () => {
    if (retried) throw new DrillError('conflict', 409, 'This item changed; reload it', { position });
    return submitAttempt(studentId, setId, body, true);
  };

  let result: ItemResult;
  let done: StepResult[] = pending.steps;
  if (body.skip) {
    result = scoreItem(item, { skipped: true, timedOut, steps: [] });
  } else {
    const index = pending.steps.length;
    if (body.step !== index) throw new DrillError('wrong_step', 409, `Submit step ${index}`, { step: index });
    const response: StepResponse = late || !body.response ? { type: 'empty' } : body.response;
    try {
      done = [...pending.steps, scoreStep(item, index, response, timedOut)];
    } catch (e) {
      if (e instanceof ScoringError) throw new DrillError(e.code, 422, e.message);
      throw e;
    }
    if (done.length < steps.length && !timedOut) {
      // Save the finished step, unless another request changed it first.
      const saved = await db.update(drillSets)
        .set({ pendingStep: { steps: done, keys: [...pending.keys, body.idempotency_key] } })
        .where(and(eq(drillSets.id, set.id), eq(drillSets.currentPosition, position),
          set.pendingStep === null ? isNull(drillSets.pendingStep) : sql`${drillSets.pendingStep} = ${JSON.stringify(set.pendingStep)}::jsonb`))
        .returning({ id: drillSets.id });
      if (saved.length === 0) return retry();
      return { done: false, step: stepFeedback(item, index, done[index]), next_step: done.length };
    }
    // Time ran out mid-item: the remaining steps score 0 as timeouts.
    for (let i = done.length; i < steps.length; i++) done.push(scoreStep(item, i, { type: 'empty' }, true));
    result = scoreItem(item, { skipped: false, timedOut, steps: done });
  }

  const ref = planOf(set)[position];
  const [itemId, itemVersion, templateId, templateVersion, seed] = ref.kind === 'authored'
    ? [ref.item_id, ref.version, null, null, null]
    : [null, null, ref.template_id, ref.template_version, ref.seed];
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
        response, served_at, time_ms, time_limit_ms, timed_out, skipped, score, step_scores, mistake_tags, grading_status
      )
      select advanced.id, ${studentId}, ${position}, ${body.idempotency_key}, ${itemId}, ${itemVersion}, ${templateId}, ${templateVersion}, ${seed},
        ${JSON.stringify({ steps: done.map(s => s.response), skip: body.skip })}::jsonb, ${servedAt.toISOString()}::timestamptz,
        ${elapsed}, ${limit}, ${result.timed_out}, ${result.skipped}, ${result.score},
        ${JSON.stringify(result.steps)}::jsonb, ${textArray(result.mistake_tags)}, 'not_needed'
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
    attempt_id: inserted[0].id, score: result.score, time_ms: elapsed, timed_out: result.timed_out, skipped: result.skipped, mistake_tags: result.mistake_tags,
  });
  return itemFeedback(item, result);
}

// ------------------------------------------------------------ complete a set

export async function completeSet(studentId: string, setId: string): Promise<{ status: 'completed' }> {
  const event = await db.transaction(async tx => {
    const [set] = await tx.select().from(drillSets)
      .where(and(eq(drillSets.id, setId), eq(drillSets.studentId, studentId))).for('update');
    if (!set) throw new DrillError('not_found', 404, 'Set not found');
    if (set.status === 'completed') return null;
    if (set.status !== 'in_progress') throw new DrillError('set_closed', 409, `This set is ${set.status}`);
    if (set.currentPosition < set.size) throw new DrillError('set_unfinished', 409, 'Answer every item first', { position: set.currentPosition });

    const attempts = await tx.select().from(drillAttempts).where(eq(drillAttempts.setId, set.id)).orderBy(asc(drillAttempts.position));
    const items = await Promise.all(planOf(set).map(ref => resolveItem(ref, set.tier as Tier)));
    const results = attempts.map(resultOf);
    const score = setScore(results);
    const drill = getDrill(set.drillId);
    const skills = skillScores(attempts.map((a, i) => ({ skills: items[a.position]?.skills ?? items[i].skills, result: results[i] })));
    const tier = nextTier(set.tier as Tier, score);
    const now = new Date();

    await tx.update(drillSets).set({
      status: 'completed', setScore: score, passed: passed(drill, score), skillScores: skills, completedAt: now,
    }).where(eq(drillSets.id, set.id));
    await tx.insert(drillTiers).values({ studentId, drillId: drill.id, currentTier: tier, updatedAt: now })
      .onConflictDoUpdate({ target: [drillTiers.studentId, drillTiers.drillId], set: { currentTier: tier, updatedAt: now } });
    return {
      set_id: set.id, set_score: score, passed: passed(drill, score),
      duration_ms: now.getTime() - set.startedAt.getTime(), skill_scores: skills,
    };
  });
  if (event) await logDrillEvent(studentId, 'drill_set_completed', event);
  return { status: 'completed' };
}

// ------------------------------------------------------------------ results

export async function setResults(studentId: string, setId: string) {
  const set = await loadSet(studentId, setId);
  if (set.status !== 'completed') throw new DrillError('set_not_completed', 409, `This set is ${set.status}`);
  const drill = getDrill(set.drillId);
  const attempts = await db.select().from(drillAttempts).where(eq(drillAttempts.setId, set.id)).orderBy(asc(drillAttempts.position));
  const items = await Promise.all(planOf(set).map(ref => resolveItem(ref, set.tier as Tier)));
  const results = attempts.map(resultOf);
  const score = set.setScore ?? setScore(results);
  return {
    set_id: set.id,
    drill: { id: drill.id, name: drill.name, level: drill.level },
    focus_skill: set.focusSkill,
    score, passed: set.passed ?? passed(drill, score), pass_bar: drill.pass_bar,
    time_ms: attempts.reduce((s, a) => s + Math.min(a.timeMs, a.timeLimitMs), 0),
    target_ms: attempts.reduce((s, a) => s + a.timeLimitMs, 0),
    mistakes: mistakeSummary(results),
    tier: { before: set.tier, after: nextTier(set.tier as Tier, score) },
    skill_scores: (set.skillScores as Record<string, { score: number; count: number }> | null) ?? {},
    items: attempts.map((a, i) => {
      const item = items[a.position];
      return {
        position: a.position, prompt: item.prompt, exhibit: item.exhibit,
        options: item.options.map(o => ({ id: o.id, text: o.text, correct: o.correct })),
        time_ms: a.timeMs, time_limit_ms: a.timeLimitMs,
        feedback: itemFeedback(item, results[i]),
      };
    }),
  };
}

// ----------------------------------------------------------------- settings

export const SettingsSchema = z.object({
  time_multiplier: z.union([z.literal(1), z.literal(1.5), z.literal(2)]).optional(),
  skip_example_for: z.string().optional(),
});

export async function updateSettings(studentId: string, body: z.infer<typeof SettingsSchema>) {
  const current = await settingsFor(studentId);
  if (body.skip_example_for) getDrill(body.skip_example_for);
  const skipped = body.skip_example_for && !current.skippedExamples.includes(body.skip_example_for)
    ? [...current.skippedExamples, body.skip_example_for] : current.skippedExamples;
  const values = { timeMultiplier: body.time_multiplier ?? current.timeMultiplier, skippedExamples: skipped, updatedAt: new Date() };
  await db.insert(studentDrillSettings).values({ studentId, ...values })
    .onConflictDoUpdate({ target: studentDrillSettings.studentId, set: values });
  if (body.skip_example_for) await logDrillEvent(studentId, 'drill_example_skipped', { drill_id: body.skip_example_for });
  return { time_multiplier: values.timeMultiplier, skipped_examples: skipped };
}

export { settingsFor };
