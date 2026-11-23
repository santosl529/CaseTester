// The starting-point case against the database (rules: ./starting-point.ts). Read-only.
import 'server-only';
import { and, asc, desc, eq, isNotNull, min, notInArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { caseResults, diagnostics, drillQuestionnaires, sessions } from '@/db/schema';
import { HOME_DEMO_CASE_IDS, LINK_ONLY_CASE_IDS } from '@/lib/cases/listed';
import { caseResultsWired } from '../case-to-drills';
import { isBuildingFromCase, isSetAside, startingPointCase, type StoredCase } from './starting-point';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

export interface StartingPoint extends StoredCase { setAside: boolean }

// When the student first finished the quiz or the questions (the other plan sources), if ever.
async function otherSourceAt(x: Exec, studentId: string): Promise<Date | null> {
  const [[q], [dg]] = await Promise.all([
    x.select({ at: min(drillQuestionnaires.createdAt) }).from(drillQuestionnaires).where(eq(drillQuestionnaires.studentId, studentId)),
    x.select({ at: min(diagnostics.completedAt) }).from(diagnostics).where(and(eq(diagnostics.studentId, studentId), eq(diagnostics.status, 'completed'))),
  ]);
  const times = [q?.at, dg?.at].filter((t): t is Date => t instanceof Date);
  return times.length ? new Date(Math.min(...times.map(t => t.getTime()))) : null;
}

export async function startingPointFor(x: Exec, studentId: string): Promise<StartingPoint | null> {
  const rows = await x.select({
    caseAttemptId: caseResults.caseAttemptId, caseId: caseResults.caseId, completedAt: caseResults.completedAt,
    backfilled: caseResults.backfilled, partial: caseResults.partial, rubric: caseResults.rubricScores,
  }).from(caseResults).where(eq(caseResults.studentId, studentId)).orderBy(asc(caseResults.completedAt));
  if (rows.length === 0) return null;
  const sp = startingPointCase(rows.map(r => ({ ...r, rubric: r.rubric as Record<string, string> | null })), await otherSourceAt(x, studentId));
  return sp ? { ...sp, setAside: isSetAside(sp) } : null;
}

// Today's "building your plan" state (isBuildingFromCase).
export async function buildingFromCase(studentId: string, planSource: string | null, now = new Date()): Promise<boolean> {
  if (planSource !== 'case' || !caseResultsWired()) return false;
  const [graded] = await db.select({ id: caseResults.caseAttemptId }).from(caseResults)
    .where(and(eq(caseResults.studentId, studentId), eq(caseResults.backfilled, false))).limit(1);
  const [last] = graded ? [] : await db.select({ at: sessions.completedAt }).from(sessions).where(and(
    eq(sessions.userId, studentId), eq(sessions.status, 'completed'), isNotNull(sessions.completedAt),
    notInArray(sessions.caseId, [...new Set([...HOME_DEMO_CASE_IDS, ...LINK_ONLY_CASE_IDS])]))).orderBy(desc(sessions.completedAt)).limit(1);
  return isBuildingFromCase({ planSource, wired: true, hasCaseResult: Boolean(graded), lastCaseCompletedAt: last?.at ?? null, now });
}

