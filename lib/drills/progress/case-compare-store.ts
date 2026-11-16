// The data for case to case (lib/drills/case-compare.ts): the student's
// completed cases with their latest ratings, read from the case product's own
// sessions and scores (read-only, as Your progress's stopgap did), so the
// comparison covers cases graded before case results reached drills; and the
// drill sets completed in between.
import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillSets, scores, sessions } from '@/db/schema';
import { loadCases } from '@/lib/cases/loader';
import { DIFFICULTY_TIER } from '../program/next-case';
import { compareCases, type ComparedCase, type Comparison } from '../case-compare';

const RATING_COLUMNS = {
  structure: scores.structureRating, quantitative: scores.quantitativeRating, dataExhibit: scores.dataExhibitRating,
  judgment: scores.judgmentRating, creativity: scores.creativityRating, synthesis: scores.synthesisRating,
  communication: scores.communicationRating, pushback: scores.pushbackRating,
} as const;

export async function gradedCases(studentId: string): Promise<ComparedCase[]> {
  const done = await db.select({ id: sessions.id, caseId: sessions.caseId, completedAt: sessions.completedAt, flags: sessions.flagsJsonb }).from(sessions)
    .where(and(eq(sessions.userId, studentId), eq(sessions.status, 'completed'))).orderBy(asc(sessions.completedAt));
  if (done.length === 0) return [];
  const rated = await db.select({ sessionId: scores.sessionId, createdAt: scores.createdAt, ...RATING_COLUMNS }).from(scores)
    .where(inArray(scores.sessionId, done.map(s => s.id))).orderBy(desc(scores.createdAt));
  const difficulty = new Map(loadCases().map(c => [c.id, c.difficulty]));
  return done.flatMap(s => {
    const row = rated.find(r => r.sessionId === s.id);
    const d = difficulty.get(s.caseId);
    if (!row || !d || !s.completedAt) return [];
    const ratings = Object.fromEntries(Object.keys(RATING_COLUMNS).flatMap(k => {
      const v = row[k as keyof typeof RATING_COLUMNS];
      return v ? [[k, v]] : [];
    }));
    return [{ sessionId: s.id, caseId: s.caseId, tier: DIFFICULTY_TIER[d], completedAt: s.completedAt, ratings, partial: Boolean((s.flags as { partial?: unknown } | null)?.partial) }];
  });
}

export async function comparisonFor(studentId: string, sessionId: string): Promise<Comparison | null> {
  const history = await gradedCases(studentId);
  const current = history.find(h => h.sessionId === sessionId);
  if (!current) return null;
  const sets = (await db.select({ drillId: drillSets.drillId, focus: drillSets.focusSkill, completedAt: drillSets.completedAt }).from(drillSets)
    .where(and(eq(drillSets.studentId, studentId), eq(drillSets.status, 'completed'))))
    .flatMap(s => (s.completedAt ? [{ drillId: s.drillId, focus: s.focus, completedAt: s.completedAt }] : []));
  return compareCases(current, history, sets);
}
