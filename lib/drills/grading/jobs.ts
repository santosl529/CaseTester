// AI grading jobs and set completion (docs/prd-drills.md "Grading worker",
// "Failure states", "Event flow after a set completes"). grading_jobs is the
// queue. A job runs right after the set completes (after the response, via
// after()); if it fails, it is retried twice, then the set shows "Grading
// delayed" and later runs pick it up: whenever the results page polls, or from
// the scheduled endpoint (app/api/internal/drills/grading).
import 'server-only';
import { after } from 'next/server';
import { and, asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillAttempts, drillItems, drillSets, drillTiers, gradingJobs } from '@/db/schema';
import { getDrill } from '../config';
import { ItemSchema, type Item, type Tier } from '../item-schema';
import { rebuildItem } from '../generators/registry';
import { logDrillEvent } from '../events';
import type { ItemRef } from '../sets/plan';
import type { ItemResult, StepResult } from '../sets/scoring';
import { nextTier, passed, setScore, skillScores } from '../sets/summary';
import { applyGrade, type CheckResults } from './apply';
import { gradeSet, type CallModel } from './grader';

type SetRow = typeof drillSets.$inferSelect;
type AttemptRow = typeof drillAttempts.$inferSelect;

// Give up after this many failed runs; each run already retries twice.
const MAX_RUNS = 6;
// A queued or running job this old is taken to have died with its request.
const STALE_MS = 2 * 60_000;
// Wait this long before re-running a failed job.
const RETRY_AFTER_MS = 30_000;

export async function resolveItem(ref: ItemRef, tier: Tier): Promise<Item> {
  if (ref.kind === 'generated') return rebuildItem(ref, tier);
  const [row] = await db.select().from(drillItems)
    .where(and(eq(drillItems.itemId, ref.item_id), eq(drillItems.version, ref.version)));
  if (!row) throw new Error(`Drill item ${ref.item_id}@${ref.version} is missing`);
  return ItemSchema.parse(row.payload);
}

export const planOf = (set: SetRow) => set.itemPlan as ItemRef[];

export const resultOf = (row: AttemptRow): ItemResult => {
  const checks = row.checkResults as CheckResults | null;
  return {
    score: row.score ?? 0,
    steps: (row.stepScores as StepResult[] | null) ?? [],
    mistake_tags: row.mistakeTags,
    skipped: row.skipped,
    timed_out: row.timedOut,
    pending: row.gradingStatus === 'pending' || row.gradingStatus === 'delayed',
    ...(checks?.contributions && { contributions: checks.contributions }),
  };
};

// Scores a set whose attempts are all scored: set score, pass, skill scores,
// the next tier. Idempotent: a completed set is left alone.
export async function finalizeSet(setId: string): Promise<boolean> {
  const event = await db.transaction(async tx => {
    const [set] = await tx.select().from(drillSets).where(eq(drillSets.id, setId)).for('update');
    if (!set || set.status === 'completed') return null;
    const attempts = await tx.select().from(drillAttempts).where(eq(drillAttempts.setId, set.id)).orderBy(asc(drillAttempts.position));
    if (attempts.some(a => a.gradingStatus === 'pending' || a.gradingStatus === 'delayed')) return null;
    const items = await Promise.all(planOf(set).map(ref => resolveItem(ref, set.tier as Tier)));
    const results = attempts.map(resultOf);
    const score = setScore(results);
    const drill = getDrill(set.drillId);
    const skills = skillScores(attempts.map((a, i) => ({ skills: items[a.position]?.skills ?? [], result: results[i] })));
    const tier = nextTier(set.tier as Tier, score);
    const now = new Date();
    await tx.update(drillSets).set({ status: 'completed', setScore: score, passed: passed(drill, score), skillScores: skills, completedAt: now })
      .where(eq(drillSets.id, set.id));
    await tx.insert(drillTiers).values({ studentId: set.studentId, drillId: drill.id, currentTier: tier, updatedAt: now })
      .onConflictDoUpdate({ target: [drillTiers.studentId, drillTiers.drillId], set: { currentTier: tier, updatedAt: now } });
    return {
      studentId: set.studentId,
      props: { set_id: set.id, set_score: score, passed: passed(drill, score), duration_ms: now.getTime() - set.startedAt.getTime(), skill_scores: skills },
    };
  });
  if (event) await logDrillEvent(event.studentId, 'drill_set_completed', event.props);
  return event !== null;
}

// Moves a finished set to grading and queues its job. Returns the job id.
export async function enqueueGrading(setId: string): Promise<string> {
  return db.transaction(async tx => {
    await tx.update(drillSets).set({ status: 'grading' }).where(and(eq(drillSets.id, setId), eq(drillSets.status, 'in_progress')));
    const [existing] = await tx.select().from(gradingJobs).where(eq(gradingJobs.setId, setId)).orderBy(desc(gradingJobs.createdAt)).limit(1);
    if (existing && existing.status !== 'failed') return existing.id;
    const [job] = await tx.insert(gradingJobs).values({ setId }).returning({ id: gradingJobs.id });
    return job.id;
  });
}

// Runs a job after the current response is sent; straight away outside a
// request (scripts, tests).
export function runAfterResponse(jobId: string, call?: CallModel): Promise<void> {
  const run = () => runGradingJob(jobId, call).then(() => undefined);
  try {
    after(run);
    return Promise.resolve();
  } catch {
    return run();
  }
}

// Claims and runs one job. Two runs can't grade the same set: the claim is a
// conditional update only one of them wins.
export async function runGradingJob(jobId: string, call?: CallModel): Promise<'succeeded' | 'failed' | 'skipped'> {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const [job] = await db.update(gradingJobs).set({ status: 'running', startedAt: new Date() })
    .where(and(eq(gradingJobs.id, jobId), or(
      eq(gradingJobs.status, 'queued'), eq(gradingJobs.status, 'failed'),
      and(eq(gradingJobs.status, 'running'), lt(gradingJobs.startedAt, staleBefore)),
    )))
    .returning();
  if (!job) return 'skipped';

  const [set] = await db.select().from(drillSets).where(eq(drillSets.id, job.setId));
  const attempts = await db.select().from(drillAttempts)
    .where(and(eq(drillAttempts.setId, job.setId), inArray(drillAttempts.gradingStatus, ['pending', 'delayed'])))
    .orderBy(asc(drillAttempts.position));
  const started = Date.now();
  try {
    const items = await Promise.all(attempts.map(a => resolveItem(planOf(set)[a.position], set.tier as Tier)));
    const entries = attempts.map((a, i) => ({ key: `a${a.position + 1}`, item: items[i], steps: (a.stepScores as StepResult[]) ?? [] }));
    // Skipped or blank answers don't go to the model.
    const toGrade = entries.filter((e, i) => !attempts[i].skipped && e.steps.some(s => s.response.type === 'text' || s.response.type === 'buckets'));
    const graded = toGrade.length ? await gradeSet(toGrade, call) : null;

    for (const [i, a] of attempts.entries()) {
      const e = entries[i];
      const result = a.skipped
        ? { score: 0, mistake_tags: ['M.skipped'], steps: e.steps, check_results: null }
        : applyGrade(e.item, e.steps, a.timedOut, graded?.grades.get(e.key) ?? null);
      await db.update(drillAttempts).set({
        score: result.score, mistakeTags: result.mistake_tags, stepScores: result.steps,
        checkResults: result.check_results, redFlags: result.check_results?.red_flags.filter(f => f.present).map(f => f.id) ?? [],
        gradingStatus: 'graded', graderPromptVersion: graded?.prompt_version ?? null, modelId: graded?.model_id ?? null,
      }).where(eq(drillAttempts.id, a.id));
      if (result.check_results?.injection_suspected) void logDrillEvent(a.studentId, 'grading_injection_suspected', { attempt_id: a.id });
    }
    await db.update(gradingJobs).set({
      status: 'succeeded', retries: job.retries, inputTokens: graded?.usage.input_tokens ?? 0, outputTokens: graded?.usage.output_tokens ?? 0,
      costUsd: graded?.cost_usd ?? 0, latencyMs: Date.now() - started, error: null, completedAt: new Date(),
    }).where(eq(gradingJobs.id, job.id));
    void logDrillEvent(set.studentId, 'grading_job_completed', {
      job_id: job.id, status: 'succeeded', retries: job.retries, latency_ms: Date.now() - started,
      input_tokens: graded?.usage.input_tokens ?? 0, output_tokens: graded?.usage.output_tokens ?? 0, cost_usd: graded?.cost_usd ?? 0,
    });
    await finalizeSet(job.setId);
    return 'succeeded';
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(gradingJobs).set({ status: 'failed', retries: job.retries + 1, error: message.slice(0, 2000), latencyMs: Date.now() - started })
      .where(eq(gradingJobs.id, job.id));
    await db.update(drillAttempts).set({ gradingStatus: 'delayed' })
      .where(and(eq(drillAttempts.setId, job.setId), eq(drillAttempts.gradingStatus, 'pending')));
    void logDrillEvent(set.studentId, 'grading_job_completed', { job_id: job.id, status: 'failed', retries: job.retries + 1, latency_ms: Date.now() - started, error: message.slice(0, 200) });
    console.error(`drills: grading job ${job.id} failed`, message);
    return 'failed';
  }
}

export interface GradingState { status: 'queued' | 'running' | 'succeeded' | 'failed' | 'none'; delayed: boolean }

// Called when the results page polls a set that is still grading: re-runs a
// job that failed (after a pause) or died mid-run. Returns what the student
// should see.
export async function kickGrading(setId: string, call?: CallModel): Promise<GradingState> {
  const [job] = await db.select().from(gradingJobs).where(eq(gradingJobs.setId, setId)).orderBy(desc(gradingJobs.createdAt)).limit(1);
  if (!job) return { status: 'none', delayed: false };
  const age = Date.now() - (job.startedAt ?? job.createdAt).getTime();
  const rerun = (job.status === 'failed' && job.retries < MAX_RUNS && age > RETRY_AFTER_MS)
    || ((job.status === 'queued' || job.status === 'running') && age > STALE_MS);
  if (rerun) await runAfterResponse(job.id, call);
  return { status: job.status, delayed: job.status === 'failed' || job.retries > 0 };
}

// The scheduled pass: every set still grading gets a kick.
export async function retryStaleGrading(call?: CallModel): Promise<number> {
  const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.status, 'grading'));
  for (const s of sets) await kickGrading(s.id, call);
  return sets.length;
}

// PRD cost control: at most this many AI-graded sets per student per day.
export async function aiSetsToday(studentId: string, drillIds: string[]): Promise<number> {
  if (drillIds.length === 0) return 0;
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(drillSets)
    .where(and(eq(drillSets.studentId, studentId), inArray(drillSets.drillId, drillIds), sql`${drillSets.startedAt} > now() - interval '24 hours'`));
  return row?.n ?? 0;
}
