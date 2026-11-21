// Recording the case → drills step (Matt, 15 Nov): one case_result_runs row per
// graded case — every tagged point, the payload, and in shadow mode a preview of
// what ingesting it would do; when on, the payload also goes to drills. Called
// by scoreAndStore after the score is stored, once per scoring pass; a second
// call for the same session (a rescore) changes nothing.
import 'server-only';
import { after } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { caseResultRuns } from '@/db/schema';
import { runCaseResultStep, type CaseResultInput, type CaseResultStep } from '@/lib/scoring/case-result-step';
import type { OnUsage } from '@/lib/llm-usage';
import { ingestCaseResult } from './ingest';
import { previewCaseResult } from './store';
import { CASE_TAGS } from '@/lib/scoring/skill-tag-rules';
import { DrillError } from '../sets/service';

export type CaseRunOutcome = 'shadow' | 'applied' | 'failed' | 'duplicate';

export async function recordCaseRun(sessionId: string, step: CaseResultStep): Promise<CaseRunOutcome> {
  const inserted = await db.insert(caseResultRuns).values({
    sessionId, studentId: step.studentId, caseId: step.caseId, mode: step.mode, status: step.status,
    taggerConfig: step.taggerConfig, points: { judge: step.points, checker: step.checker }, payload: step.payload,
    costUsd: step.costUsd, error: step.error,
  }).onConflictDoNothing().returning({ id: caseResultRuns.sessionId });
  if (inserted.length === 0) return 'duplicate';
  if (step.status === 'failed' || !step.payload) return 'failed';

  if (step.mode === 'shadow') {
    const preview = await previewCaseResult(step.payload);
    await db.update(caseResultRuns).set({ preview }).where(eq(caseResultRuns.sessionId, sessionId));
    return 'shadow';
  }
  const result = await ingestCaseResult(step.payload);
  await db.update(caseResultRuns).set({ status: 'applied', appliedAt: new Date(), preview: result })
    .where(eq(caseResultRuns.sessionId, sessionId));
  return 'applied';
}

// The step and its record, after the response (Next's after(), like drill
// grading), so the student's report never waits for it; outside a request
// (scripts, tests) it runs in line. It logs and never throws.
export function runCaseRunAfterResponse(sessionId: string, input: CaseResultInput, deadlineMs: number, onUsage?: OnUsage): Promise<void> {
  const run = async () => {
    try {
      const step = await runCaseResultStep(input, { deadlineMs, onUsage });
      if (!step) return;
      const outcome = await recordCaseRun(sessionId, step);
      console.log(`[score] case → drills (${step.mode}): ${outcome}${step.error ? ` — ${step.error}` : ''}`);
    } catch (err) {
      console.error('[score] case → drills step failed; the report stands:', err);
    }
  };
  try {
    after(run);
    return Promise.resolve();
  } catch {
    return run();
  }
}

// ------------------------------------------------------------ the shadow review page (local development only)

// The reviewer's label per point: a tag, or null for "no tag". Labels follow the
// written rules (lib/scoring/skill-tag-rules.ts), never the tagger's answer; a
// group goes on only after its gate passes with these points added (Matt, 15 Nov).
export const CaseRunLabelsSchema = z.object({
  labels: z.record(z.string(), z.string().nullable()).refine(
    l => Object.values(l).every(t => t === null || CASE_TAGS.includes(t)), { message: 'Unknown tag' }),
});

export async function caseRunsForReview(limit = 100) {
  return db.select().from(caseResultRuns).orderBy(desc(caseResultRuns.createdAt)).limit(limit);
}

export async function labelCaseRun(sessionId: string, reviewer: string, body: z.infer<typeof CaseRunLabelsSchema>) {
  const [row] = await db.select({ labels: caseResultRuns.labels }).from(caseResultRuns).where(eq(caseResultRuns.sessionId, sessionId));
  if (!row) throw new DrillError('not_found', 404, 'No such case run');
  const labels = { ...(row.labels as Record<string, unknown>), ...body.labels, _by: reviewer, _at: new Date().toISOString() };
  await db.update(caseResultRuns).set({ labels }).where(eq(caseResultRuns.sessionId, sessionId));
  return { labels };
}

// The report's Try again when the step failed (Matt, 15 Nov). The failed run
// is claimed in one conditional update, so a double click or a second tab
// can't pay for a second tagging call: only the claimer runs it; anyone else
// gets 'busy'. Re-runs only the tagging step, on what scoring stored.
export async function retryCaseRun(sessionId: string, onUsage?: OnUsage): Promise<'done' | 'failed' | 'busy'> {
  const claimed = await db.update(caseResultRuns).set({ status: 'retrying', error: null })
    .where(and(eq(caseResultRuns.sessionId, sessionId), eq(caseResultRuns.status, 'failed'))).returning({ cost: caseResultRuns.costUsd });
  if (claimed.length === 0) return 'busy';
  try {
    const { storedCaseResultInput } = await import('@/lib/scoring/score-session');
    const input = await storedCaseResultInput(sessionId);
    const step = input ? await runCaseResultStep(input, { deadlineMs: Date.now() + RETRY_BUDGET_MS, onUsage }) : null;
    if (!step || step.status === 'failed' || !step.payload) {
      await db.update(caseResultRuns).set({ status: 'failed', error: step?.error ?? 'no input', costUsd: (claimed[0].cost ?? 0) + (step?.costUsd ?? 0) })
        .where(eq(caseResultRuns.sessionId, sessionId));
      return 'failed';
    }
    await db.update(caseResultRuns).set({
      status: 'built', taggerConfig: step.taggerConfig, points: { judge: step.points, checker: step.checker }, payload: step.payload,
      costUsd: (claimed[0].cost ?? 0) + step.costUsd, error: null,
    }).where(eq(caseResultRuns.sessionId, sessionId));
    if (step.mode === 'on') {
      const result = await ingestCaseResult(step.payload);
      await db.update(caseResultRuns).set({ status: 'applied', appliedAt: new Date(), preview: result }).where(eq(caseResultRuns.sessionId, sessionId));
    } else {
      await db.update(caseResultRuns).set({ preview: await previewCaseResult(step.payload) }).where(eq(caseResultRuns.sessionId, sessionId));
    }
    return 'done';
  } catch (err) {
    await db.update(caseResultRuns).set({ status: 'failed', error: (err as Error).message }).where(eq(caseResultRuns.sessionId, sessionId));
    throw err;
  }
}
const RETRY_BUDGET_MS = 240_000;
