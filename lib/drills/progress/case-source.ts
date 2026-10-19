// Full cases for Your progress, from one of two sources (rules.dashboard.
// case_source):
// - 'case_results' (default): what the case grader sends drills, with skill
//   findings and quotes. The grader doesn't send it yet, so this is empty.
// - 'case_sessions': the case product's own completed sessions and their
//   rubric ratings (sessions, scores), read-only, with each case file's
//   difficulty as its tier (easy 1, medium 2, hard 3). Ratings only: no skill
//   findings. A stopgap, off until Lorenzo agrees (Matt, 2026-10-18).
import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { caseResults, scores, sessions } from '@/db/schema';
import { loadCases } from '@/lib/cases/loader';
import { DRILLS_CONFIG } from '../config';
import type { CaseResultPayload } from '../case-result';
import type { DashCase } from './dashboard';

export const caseSource = () => DRILLS_CONFIG.rules.dashboard.case_source;

// The scores columns behind each rubric key (lib/scoring/rubric.ts).
const RATING_COLUMNS = {
  structure: scores.structureRating, quantitative: scores.quantitativeRating, dataExhibit: scores.dataExhibitRating,
  judgment: scores.judgmentRating, creativity: scores.creativityRating, synthesis: scores.synthesisRating,
  communication: scores.communicationRating, pushback: scores.pushbackRating,
} as const;

export async function dashboardCases(studentId: string): Promise<DashCase[]> {
  if (caseSource() === 'case_results') {
    const rows = await db.select().from(caseResults).where(eq(caseResults.studentId, studentId)).orderBy(asc(caseResults.completedAt));
    return rows.map(r => ({
      key: r.caseAttemptId, caseId: r.caseId, tier: r.difficultyTier, completedAt: r.completedAt,
      ratings: r.rubricScores as Record<string, string>,
      findings: (r.findings as CaseResultPayload['findings']).map(f => ({ tag: f.tag, evidence: f.evidence })),
    }));
  }
  const done = await db.select({ id: sessions.id, caseId: sessions.caseId, completedAt: sessions.completedAt }).from(sessions)
    .where(and(eq(sessions.userId, studentId), eq(sessions.status, 'completed'))).orderBy(asc(sessions.completedAt));
  if (done.length === 0) return [];
  const rated = await db.select({ sessionId: scores.sessionId, createdAt: scores.createdAt, ...RATING_COLUMNS }).from(scores)
    .where(inArray(scores.sessionId, done.map(s => s.id))).orderBy(desc(scores.createdAt));
  const tiers = DRILLS_CONFIG.rules.dashboard.case_difficulty_tiers;
  const difficulty = new Map(loadCases().map(c => [c.id, c.difficulty as string]));
  return done.flatMap(s => {
    // The latest score of the session (a rescore replaces the first).
    const row = rated.find(r => r.sessionId === s.id);
    const tier = tiers[difficulty.get(s.caseId) ?? ''];
    if (!row || !tier || !s.completedAt) return [];
    const ratings = Object.fromEntries(Object.keys(RATING_COLUMNS).flatMap(k => {
      const v = row[k as keyof typeof RATING_COLUMNS];
      return v ? [[k, v]] : [];
    }));
    return [{ key: s.id, caseId: s.caseId, tier, completedAt: s.completedAt, ratings, findings: [] }];
  });
}
