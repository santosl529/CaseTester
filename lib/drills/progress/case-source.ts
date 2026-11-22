// Full cases for Your progress: what the case grader sends drills
// (case_results), with skill findings and quotes — and, from the one-time
// backfill, ratings only for cases graded before (backfilled). The
// case_sessions stopgap that read the case product's scores directly is
// retired (Matt, 15 Nov). Only when CASE_TO_DRILLS is on: in shadow mode and
// off, Your progress shows no case data, whatever case_results holds.
import { startingPointFor } from '../program/starting-point-store';
import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { caseResults } from '@/db/schema';
import { caseResultsWired } from '../case-to-drills';
import type { CaseResultPayload } from '../case-result';
import type { DashCase } from './dashboard';

export async function dashboardCases(studentId: string): Promise<DashCase[]> {
  if (!caseResultsWired()) return [];
  const rows = await db.select().from(caseResults).where(eq(caseResults.studentId, studentId)).orderBy(asc(caseResults.completedAt));
  const sp = await startingPointFor(db, studentId);
  return rows.map(r => ({
    setAside: Boolean(sp?.setAside && sp.caseAttemptId === r.caseAttemptId),
    key: r.caseAttemptId, caseId: r.caseId, tier: r.difficultyTier, completedAt: r.completedAt,
    ratings: r.rubricScores as Record<string, string>,
    findings: (r.findings as CaseResultPayload['findings']).map(f => ({ tag: f.tag, evidence: f.evidence })),
    partial: r.partial,
  }));
}
