// AI grading jobs and set completion (docs/prd-drills.md "Grading worker",
// "Failure states", "Event flow after a set completes", "Cost controls").
// grading_jobs is the queue. A job runs right after the set completes (after
// the response, via after()); each answer is saved as soon as it is graded.
// An answer whose grading gives up (a call at its request cap, a refusal, a
// spend-limit or billing error, the word-limit backstop) is saved as failed:
// it shows "Grading delayed" and counts toward nothing. A run that fails
// outright is re-run whenever the results page polls, or from the scheduled
// endpoint (app/api/internal/drills/grading); after MAX_RUNS the set completes
// with whatever is left marked failed.
import 'server-only';
import { after } from 'next/server';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillAttempts, drillGradingCalls, drillGradingSpend, drillItems, drillSets, drillTiers, gradingJobs } from '@/db/schema';
import { getDrill } from '../config';
import { ItemSchema, type Item, type Tier } from '../item-schema';
import { rebuildItem } from '../generators/registry';
import { logDrillEvent, logPendingEvents } from '../events';
import type { ItemRef } from '../sets/plan';
import type { ItemResult, StepResult } from '../sets/scoring';
import { nextTier, passed, setScore, skillScores } from '../sets/summary';
import { applyGrade, unchangedRepair, type CheckResults } from './apply';
import { defendParts, withDefend } from '../defend';
import { applySetProgress } from '../progress/store';
import { afterDiagnostic, markWorkoutProgress } from '../program/store';
import { latestDiagnostic, markDiagnosticMove, onDiagnosticSetDone } from '../program/diagnostic-store';
import { applyPlacementCheck, recordPlanSource } from '../program/plan-source';
import { DRILLS_CONFIG } from '../config';
import { GRADER_PROMPT_VERSION, gradeAnswers, type AnswerOutcome, type CallModel, type GradingLedger, type UngradedReason } from './grader';
import { gradingBreaker } from './spend';
import { gradingRunProblem } from './run-checks';

type SetRow = typeof drillSets.$inferSelect;
type AttemptRow = typeof drillAttempts.$inferSelect;

// Give up after this many failed runs (a run fails outright only on errors
// outside the grading calls, which cap their own requests).
const MAX_RUNS = 6;
// A queued or running job this old is taken to have died with its request.
const STALE_MS = 2 * 60_000;
// Wait this long before re-running a failed job.
const RETRY_AFTER_MS = 30_000;

// The item as the set serves it: with its Defend steps when the set runs them.
export async function resolveItem(ref: ItemRef, tier: Tier): Promise<Item> {
  if (ref.kind === 'generated') return rebuildItem(ref, tier);
  const [row] = await db.select().from(drillItems)
    .where(and(eq(drillItems.itemId, ref.item_id), eq(drillItems.version, ref.version)));
  if (!row) throw new Error(`Drill item ${ref.item_id}@${ref.version} is missing`);
  const item = ItemSchema.parse(row.payload);
  return ref.defend ? withDefend(item) : item;
}

// The Defend part of a graded attempt, for its own columns: its score as a
// share of the Defend part, and its checks and decision.
export function defendResult(item: Item, steps: StepResult[], checks: CheckResults | null) {
  const d = defendParts(item);
  if (!d || !checks) return { defendScore: null, defendCheckResults: null };
  const spec = steps.slice(d.start);
  const total = spec.reduce((a, s) => a + s.weight, 0);
  const ids = new Set(item.checks.filter(c => c.step >= d.start).map(c => c.check_id));
  return {
    defendScore: total ? Number((spec.reduce((a, s) => a + s.weight * s.score, 0) / total).toFixed(6)) : 0,
    defendCheckResults: { checks: checks.checks.filter(c => ids.has(c.check_id)), decision: checks.defend_decision ?? null },
  };
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
    ...(row.gradingStatus === 'failed' && { ungraded: true }),
    ...(checks?.contributions && { contributions: checks.contributions }),
  };
};

// Scores a set whose attempts are all scored: set score, pass, skill scores,
// the next tier, then runs the progress engine. Only a set the student has
// finished (status 'grading'): an answer graded as it is submitted
// (Immediate feedback) mustn't complete a set still in progress. Idempotent.
export async function finalizeSet(setId: string): Promise<boolean> {
  const event = await db.transaction(async tx => {
    const [set] = await tx.select().from(drillSets).where(eq(drillSets.id, setId)).for('update');
    if (!set || set.status !== 'grading') return null;
    const attempts = await tx.select().from(drillAttempts).where(eq(drillAttempts.setId, set.id)).orderBy(asc(drillAttempts.position));
    if (attempts.some(a => a.gradingStatus === 'pending' || a.gradingStatus === 'delayed')) return null;
    const items = await Promise.all(planOf(set).map(ref => resolveItem(ref, set.tier as Tier)));
    // Answers left ungraded ("Grading delayed") count toward nothing, either way.
    const counted = attempts.map((a, i) => ({ skills: items[a.position]?.skills ?? [], result: resultOf(a), i })).filter(x => !x.result.ungraded);
    const results = counted.map(x => x.result);
    const drill = getDrill(set.drillId);
    const score = results.length ? setScore(results) : null;
    const skills = skillScores(counted);
    const now = new Date();
    await tx.update(drillSets).set({ status: 'completed', setScore: score, passed: score === null ? null : passed(drill, score), skillScores: skills, completedAt: now })
      .where(eq(drillSets.id, set.id));
    const props = { set_id: set.id, set_score: score, passed: score === null ? null : passed(drill, score), duration_ms: now.getTime() - set.startedAt.getTime(), skill_scores: skills };
    // A diagnostic part changes no tier or skill state; it places the student.
    if (set.source === 'diagnostic') {
      const diag = await onDiagnosticSetDone(tx, set, counted);
      return { studentId: set.studentId, diagnosticScore: diag.completed, props, progress: diag.events };
    }
    // Nothing graded: no tier, skill or placement change; the workout still moves on.
    if (score === null) {
      const workout = set.workoutId ? await markWorkoutProgress(tx, set.workoutId) : null;
      return { studentId: set.studentId, diagnosticScore: null as number | null, props, progress: workout ? [{ type: 'workout_completed' as const, props: workout.props }] : [] };
    }
    const tier = nextTier(set.tier as Tier, score);
    await tx.insert(drillTiers).values({ studentId: set.studentId, drillId: drill.id, currentTier: tier, updatedAt: now })
      .onConflictDoUpdate({ target: [drillTiers.studentId, drillTiers.drillId], set: { currentTier: tier, updatedAt: now } });
    // Skill states, stages, transfer and review dates, prescriptions.
    const progress = await applySetProgress(tx, set, results, skills);
    // A quick check of a questionnaire placement re-places its skill.
    if (set.isPlacementCheck) progress.events.push(...await applyPlacementCheck(tx, set, skills));
    const workout = set.workoutId ? await markWorkoutProgress(tx, set.workoutId) : null;
    if (workout) progress.events.push({ type: 'workout_completed', props: workout.props });
    return { studentId: set.studentId, diagnosticScore: null as number | null, props, progress: progress.events };
  });
  if (event) {
    await logDrillEvent(event.studentId, 'drill_set_completed', event.props);
    await logPendingEvents(event.studentId, event.progress);
    if (event.diagnosticScore !== null) await diagnosticFinished(event.studentId, event.diagnosticScore);
  }
  return event !== null;
}

// The last diagnostic part is done: a low score may move a new Standard
// student to Foundations, and the diagnostic makes (or updates) the plan.
async function diagnosticFinished(studentId: string, overall: number) {
  if (await afterDiagnostic(studentId, overall)) await markDiagnosticMove(studentId, 'foundations');
  await recordPlanSource(studentId, 'diagnostic');
}

// Records diagnostic parts whose set finished without being recorded (a lost
// update fixed 2026-10-18 left one student's diagnostic unfinished), as
// finalizeSet would have. Run when the home or the diagnostic page loads.
export async function healDiagnostic(studentId: string): Promise<boolean> {
  const diag = await latestDiagnostic(studentId);
  if (!diag || diag.status === 'completed') return false;
  const stuck = (diag.parts as { set_id?: string; done?: boolean }[]).filter(p => p.set_id && !p.done).map(p => p.set_id!);
  if (!stuck.length) return false;
  const sets = await db.select().from(drillSets).where(and(inArray(drillSets.id, stuck), eq(drillSets.status, 'completed')));
  for (const set of sets) {
    const out = await db.transaction(async tx => {
      const attempts = await tx.select().from(drillAttempts).where(eq(drillAttempts.setId, set.id)).orderBy(asc(drillAttempts.position));
      const items = await Promise.all(planOf(set).map(ref => resolveItem(ref, set.tier as Tier)));
      return onDiagnosticSetDone(tx, set, attempts.map(a => ({ skills: items[a.position]?.skills ?? [], result: resultOf(a) })).filter(x => !x.result.ungraded));
    });
    await logPendingEvents(set.studentId, out.events);
    if (out.completed !== null) await diagnosticFinished(set.studentId, out.completed);
  }
  return sets.length > 0;
}

// Moves a finished set to grading and queues its job. Returns the job id.
export async function enqueueGrading(setId: string): Promise<string> {
  return db.transaction(async tx => {
    await tx.update(drillSets).set({ status: 'grading' }).where(and(eq(drillSets.id, setId), eq(drillSets.status, 'in_progress')));
    const [existing] = await tx.select().from(gradingJobs).where(and(eq(gradingJobs.setId, setId), isNull(gradingJobs.attemptId)))
      .orderBy(desc(gradingJobs.createdAt)).limit(1);
    if (existing && existing.status !== 'failed') return existing.id;
    const [job] = await tx.insert(gradingJobs).values({ setId }).returning({ id: gradingJobs.id });
    return job.id;
  });
}

// Immediate feedback: queues the job that grades one answer as soon as it is
// submitted (the same calls the set's job would make). Returns the job id.
export async function enqueueAnswerGrading(setId: string, attemptId: string): Promise<string> {
  const [job] = await db.insert(gradingJobs).values({ setId, attemptId }).returning({ id: gradingJobs.id });
  return job.id;
}

// Answers a live per-answer job is grading (queued or running, not stale):
// the set's job leaves them to it.
async function answersBeingGraded(setId: string): Promise<Set<string>> {
  const rows = await db.select({ attemptId: gradingJobs.attemptId }).from(gradingJobs)
    .where(and(eq(gradingJobs.setId, setId), isNotNull(gradingJobs.attemptId), inArray(gradingJobs.status, ['queued', 'running']),
      sql`coalesce(${gradingJobs.startedAt}, ${gradingJobs.createdAt}) > ${new Date(Date.now() - STALE_MS).toISOString()}::timestamptz`));
  return new Set(rows.map(r => r.attemptId!));
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

// The database ledger for one job (cost safeguards): each answer's calls
// reserve their requests in drill_grading_calls, one conditional upsert that
// fails once the call is at its cap, so concurrent or later runs share it;
// every request's spend and outcome goes to drill_grading_spend.
export function dbLedger(job: { id: string; setId: string }, attemptOf: (key: string) => string): GradingLedger {
  const cap = DRILLS_CONFIG.rules.grading_limits.requests_per_call;
  return {
    async reserve(key, call) {
      const rows = await db.insert(drillGradingCalls).values({ attemptId: attemptOf(key), call, requests: 1 })
        .onConflictDoUpdate({
          target: [drillGradingCalls.attemptId, drillGradingCalls.call],
          set: { requests: sql`${drillGradingCalls.requests} + 1`, updatedAt: new Date() },
          setWhere: sql`${drillGradingCalls.requests} < ${cap}`,
        })
        .returning({ requests: drillGradingCalls.requests });
      return rows.length > 0;
    },
    async record(r) {
      await db.insert(drillGradingSpend).values({
        setId: job.setId, jobId: job.id, attemptId: attemptOf(r.key), call: r.call, modelId: r.model, outcome: r.outcome,
        inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens,
        cacheWriteTokens: r.usage.cache_creation_input_tokens, cacheReadTokens: r.usage.cache_read_input_tokens,
        costUsd: r.cost_usd, latencyMs: r.latency_ms, error: r.error?.slice(0, 500) ?? null,
      });
    },
  };
}

// The job's recorded spend, every run included.
async function jobSpend(jobId: string) {
  const [row] = await db.select({
    cost: sql<number>`coalesce(sum(${drillGradingSpend.costUsd}), 0)::float8`,
    input: sql<number>`coalesce(sum(${drillGradingSpend.inputTokens} + ${drillGradingSpend.cacheWriteTokens} + ${drillGradingSpend.cacheReadTokens}), 0)::int`,
    output: sql<number>`coalesce(sum(${drillGradingSpend.outputTokens}), 0)::int`,
  }).from(drillGradingSpend).where(eq(drillGradingSpend.jobId, jobId));
  return { cost_usd: Number(row?.cost ?? 0), input_tokens: Number(row?.input ?? 0), output_tokens: Number(row?.output ?? 0) };
}

export type GradingIssue = UngradedReason | 'failed_runs';

// Saves an answer grading gave up on: "Grading delayed", counted nowhere. A
// refused one is also flagged for Matt's review (the review page lists them).
async function markUngraded(attemptIds: string[], issue: GradingIssue) {
  if (!attemptIds.length) return;
  await db.update(drillAttempts).set({ gradingStatus: 'failed', gradingIssue: issue, score: null })
    .where(and(inArray(drillAttempts.id, attemptIds), inArray(drillAttempts.gradingStatus, ['pending', 'delayed'])));
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
  const waiting = await db.select().from(drillAttempts)
    .where(and(eq(drillAttempts.setId, job.setId), inArray(drillAttempts.gradingStatus, ['pending', 'delayed']),
      ...(job.attemptId ? [eq(drillAttempts.id, job.attemptId)] : [])))
    .orderBy(asc(drillAttempts.position));
  // The set's job leaves answers a live per-answer job is grading to it.
  const covered = job.attemptId ? new Set<string>() : await answersBeingGraded(job.setId);
  const attempts = waiting.filter(a => !covered.has(a.id));
  const started = Date.now();
  // Nothing to grade is an error, not a success (run-checks.ts). If every
  // answer is already graded (a run that died after grading them), the set is
  // still finished so the student isn't left waiting, but the job fails. A
  // per-answer job checks none of this: its set is still in progress, and an
  // answer the set's job graded first leaves it nothing to do. Nor does the
  // set's job when per-answer jobs graded everything first.
  const [{ answered }] = await db.select({ answered: sql<number>`count(*)::int` }).from(drillAttempts).where(eq(drillAttempts.setId, job.setId));
  const byAnswerJobs = !job.attemptId && waiting.length === 0 && answered >= set.size
    && (await db.select({ id: gradingJobs.id }).from(gradingJobs).where(and(eq(gradingJobs.setId, job.setId), isNotNull(gradingJobs.attemptId))).limit(1)).length > 0;
  const problem = job.attemptId || byAnswerJobs ? null : gradingRunProblem(set.size, answered, waiting.length);
  if (problem) {
    await db.update(gradingJobs).set({ status: 'failed', retries: job.retries + 1, error: problem, latencyMs: Date.now() - started })
      .where(eq(gradingJobs.id, job.id));
    void logDrillEvent(set.studentId, 'grading_job_completed', { job_id: job.id, status: 'failed', retries: job.retries + 1, latency_ms: Date.now() - started, input_tokens: 0, output_tokens: 0, cost_usd: 0, error: problem });
    console.error(`drills: grading job ${job.id} failed`, problem);
    if (answered >= set.size) await finalizeSet(job.setId);
    return 'failed';
  }
  try {
    const items = await Promise.all(attempts.map(a => resolveItem(planOf(set)[a.position], set.tier as Tier)));
    const entries = attempts.map((a, i) => ({ key: `a${a.position + 1}`, item: items[i], steps: (a.stepScores as StepResult[]) ?? [] }));
    const byKey = new Map(attempts.map((a, i) => [entries[i].key, { attempt: a, entry: entries[i] }]));
    // Skipped or blank answers don't go to the model, nor do Repair answers
    // left unchanged (code scores them 0).
    const toGrade = entries.filter((e, i) => !attempts[i].skipped && e.steps.some(s => s.response.type === 'text' || s.response.type === 'buckets')
      && !unchangedRepair(e.item, e.steps));
    const sent = new Set(toGrade.map(e => e.key));

    // Feedback timing: each answer's grading time (this run's start to its
    // save) and the student's wait (submitted to saved).
    const logGraded = (a: AttemptRow, status: string) => {
      const now = Date.now();
      void logDrillEvent(a.studentId, 'answer_graded', {
        attempt_id: a.id, drill_id: set.drillId, feedback_mode: set.feedbackMode, job: job.attemptId ? 'answer' : 'set',
        grading_ms: now - started, wait_ms: now - a.submittedAt.getTime(), status,
      });
    };
    const save = async (key: string, outcome: AnswerOutcome | null, meta: { prompt_version: string; model_id: string } | null) => {
      const { attempt: a, entry: e } = byKey.get(key)!;
      if (outcome && 'ungraded' in outcome) {
        await markUngraded([a.id], outcome.ungraded.reason);
        logGraded(a, outcome.ungraded.reason);
        console.error(`drills: attempt ${a.id} not graded (${outcome.ungraded.reason})`, outcome.ungraded.error);
        return;
      }
      const result = a.skipped
        ? { score: 0, mistake_tags: ['M.skipped'], steps: e.steps, check_results: null }
        : applyGrade(e.item, e.steps, a.timedOut, outcome?.graded ?? null);
      const defend = defendResult(e.item, result.steps, result.check_results);
      await db.update(drillAttempts).set({
        score: result.score, mistakeTags: result.mistake_tags, stepScores: result.steps,
        checkResults: result.check_results, redFlags: result.check_results?.red_flags.filter(f => f.present).map(f => f.id) ?? [],
        ...defend,
        gradingStatus: 'graded', gradingIssue: null, graderPromptVersion: meta?.prompt_version ?? null, modelId: meta?.model_id ?? null,
      }).where(eq(drillAttempts.id, a.id));
      logGraded(a, outcome ? 'graded' : 'not_sent');
      if (result.check_results?.injection_suspected) void logDrillEvent(a.studentId, 'grading_injection_suspected', { attempt_id: a.id });
      // Logged once the reply is graded, so the event carries its score.
      if (defend.defendScore !== null && a.defendResponse) {
        void logDrillEvent(a.studentId, 'defend_submitted', {
          attempt_id: a.id, type: e.item.defend?.type ?? null, decision: result.check_results?.defend_decision?.chose ?? null, score: defend.defendScore,
        });
      }
    };
    // What code scores alone is saved first.
    for (const e of entries) if (!sent.has(e.key)) await save(e.key, null, null);

    let ungraded = 0;
    if (toGrade.length) {
      // Nothing is sent once a spend-limit or billing error came back today.
      const breaker = call ? { open: false as const } : await gradingBreaker();
      const blocked: GradingIssue | null = breaker.open && breaker.reason === 'billing' ? 'billing' : null;
      if (blocked) {
        await markUngraded(toGrade.map(e => byKey.get(e.key)!.attempt.id), blocked);
        for (const e of toGrade) logGraded(byKey.get(e.key)!.attempt, blocked);
        ungraded = toGrade.length;
        console.error(`drills: grading job ${job.id}: nothing sent (${blocked})`);
      } else {
        const ledger = dbLedger(job, key => byKey.get(key)!.attempt.id);
        await gradeAnswers(toGrade, call, {
          ledger,
          onAnswer: async (key, outcome) => {
            if ('ungraded' in outcome) ungraded++;
            await save(key, outcome, 'graded' in outcome ? { prompt_version: GRADER_PROMPT_VERSION, model_id: outcome.model_id } : null);
          },
        });
      }
    }
    const spend = await jobSpend(job.id);
    await db.update(gradingJobs).set({
      status: 'succeeded', retries: job.retries, inputTokens: spend.input_tokens, outputTokens: spend.output_tokens,
      costUsd: spend.cost_usd, latencyMs: Date.now() - started, error: ungraded ? `${ungraded} answer(s) not graded` : null, completedAt: new Date(),
    }).where(eq(gradingJobs.id, job.id));
    void logDrillEvent(set.studentId, 'grading_job_completed', {
      job_id: job.id, status: 'succeeded', retries: job.retries, latency_ms: Date.now() - started,
      input_tokens: spend.input_tokens, output_tokens: spend.output_tokens, cost_usd: spend.cost_usd,
    });
    await finalizeSet(job.setId);
    return 'succeeded';
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const retries = job.retries + 1;
    const spend = await jobSpend(job.id).catch(() => null);
    await db.update(gradingJobs).set({
      status: 'failed', retries, error: message.slice(0, 2000), latencyMs: Date.now() - started,
      ...(spend && { inputTokens: spend.input_tokens, outputTokens: spend.output_tokens, costUsd: spend.cost_usd }),
    }).where(eq(gradingJobs.id, job.id));
    await db.update(drillAttempts).set({ gradingStatus: 'delayed' })
      .where(and(eq(drillAttempts.setId, job.setId), eq(drillAttempts.gradingStatus, 'pending'), ...(job.attemptId ? [eq(drillAttempts.id, job.attemptId)] : [])));
    void logDrillEvent(set.studentId, 'grading_job_completed', {
      job_id: job.id, status: 'failed', retries, latency_ms: Date.now() - started,
      input_tokens: spend?.input_tokens ?? null, output_tokens: spend?.output_tokens ?? null, cost_usd: spend?.cost_usd ?? null, error: message.slice(0, 200),
    });
    console.error(`drills: grading job ${job.id} failed`, message);
    // A failed per-answer job isn't re-run: the set's job grades the answer.
    if (!job.attemptId && retries >= MAX_RUNS) await giveUp(job.setId);
    if (job.attemptId) await finalizeSet(job.setId).catch(() => false);
    return 'failed';
  }
}

// After MAX_RUNS failed runs: what is still waiting is marked failed
// ("Grading delayed") and the set completes, so the student isn't left on
// the grading screen.
export async function giveUp(setId: string): Promise<void> {
  const left = await db.select({ id: drillAttempts.id }).from(drillAttempts)
    .where(and(eq(drillAttempts.setId, setId), inArray(drillAttempts.gradingStatus, ['pending', 'delayed'])));
  await markUngraded(left.map(a => a.id), 'failed_runs');
  await finalizeSet(setId);
}

export interface GradingState { status: 'queued' | 'running' | 'succeeded' | 'failed' | 'none'; delayed: boolean }

// Called when the results page polls a set that is still grading: re-runs a
// job that failed (after a pause) or died mid-run, or gives up after
// MAX_RUNS. Returns what the student should see.
export async function kickGrading(setId: string, call?: CallModel): Promise<GradingState> {
  const [job] = await db.select().from(gradingJobs).where(and(eq(gradingJobs.setId, setId), isNull(gradingJobs.attemptId)))
    .orderBy(desc(gradingJobs.createdAt)).limit(1);
  if (!job) return { status: 'none', delayed: false };
  const age = Date.now() - (job.startedAt ?? job.createdAt).getTime();
  if (job.status === 'failed' && job.retries >= MAX_RUNS) {
    await giveUp(setId);
    return { status: job.status, delayed: true };
  }
  const rerun = (job.status === 'failed' && age > RETRY_AFTER_MS)
    || ((job.status === 'queued' || job.status === 'running') && age > STALE_MS);
  if (rerun) await runAfterResponse(job.id, call);
  // The set's job left answers to per-answer jobs that then died or failed:
  // a new set job grades them.
  if (job.status === 'succeeded') {
    const covered = await answersBeingGraded(setId);
    const left = await db.select({ id: drillAttempts.id }).from(drillAttempts)
      .where(and(eq(drillAttempts.setId, setId), inArray(drillAttempts.gradingStatus, ['pending', 'delayed'])));
    if (left.some(a => !covered.has(a.id))) {
      const [fresh] = await db.insert(gradingJobs).values({ setId }).returning({ id: gradingJobs.id });
      await runAfterResponse(fresh.id, call);
    }
  }
  return { status: job.status, delayed: job.status === 'failed' || job.retries > 0 };
}

// The scheduled pass: every set still grading gets a kick.
export async function retryStaleGrading(call?: CallModel): Promise<number> {
  const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.status, 'grading'));
  for (const s of sets) await kickGrading(s.id, call);
  return sets.length;
}

// Answers grading gave up on, for the review page: refused ones first (Matt
// reviews each), then the newest.
export async function ungradedAnswers(limit = 100) {
  const rows = await db.select({
    attempt: drillAttempts, drillId: drillSets.drillId, tier: drillSets.tier, plan: drillSets.itemPlan,
  }).from(drillAttempts).innerJoin(drillSets, eq(drillSets.id, drillAttempts.setId))
    .where(eq(drillAttempts.gradingStatus, 'failed'))
    .orderBy(sql`${drillAttempts.gradingIssue} = 'refused' desc`, desc(drillAttempts.submittedAt)).limit(limit);
  return rows;
}
