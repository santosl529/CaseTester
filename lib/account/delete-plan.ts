// "Delete my account" (Lorenzo, 9 Nov): everything personal is deleted; the analytics events (model usage and
// cost, timings, ratings — numbers only) and the drill grading cost rows are kept with their links to the student
// removed, so spend totals stay right.
// One transaction, children before parents (tests/account/delete-plan.test.ts checks the order and that every table
// holding a student's data is here, against db/schema.ts).
import { eq, inArray, like, or, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import * as t from '@/db/schema';

// Which rows of a table are the student's.
export type Scope =
  | 'user' | 'student' | 'session' | 'userOrSession'
  | 'set' | 'studentOrSet' | 'attempt' | 'studentOrProgram' | 'rateLimitKeys';
// anonymize: keep the rows, set `nulls` (schema keys) to null.
export type Step = { table: PgTable; action: 'delete' | 'anonymize'; scope: Scope; nulls?: string[] };

export const DELETE_PLAN: Step[] = [
  { table: t.analyticsEvents, action: 'anonymize', scope: 'userOrSession', nulls: ['userId', 'sessionId'] },
  // An interview and what hangs off it.
  { table: t.sessionTurns, action: 'delete', scope: 'session' },
  { table: t.revealedData, action: 'delete', scope: 'session' },
  { table: t.exhibitsShown, action: 'delete', scope: 'session' },
  { table: t.scores, action: 'delete', scope: 'session' },
  { table: t.sessionEvents, action: 'delete', scope: 'session' },
  { table: t.voiceSessionLines, action: 'delete', scope: 'session' },
  { table: t.sessions, action: 'delete', scope: 'user' },
  // Drills: grading records, then attempts, sets, programs.
  { table: t.drillGradingCalls, action: 'delete', scope: 'attempt' },
  // Drill grading costs are kept, unlinked (Lorenzo, 9 Nov; migration 0025 made the links nullable, ON DELETE SET NULL).
  { table: t.drillGradingSpend, action: 'anonymize', scope: 'set', nulls: ['setId', 'jobId', 'attemptId'] },
  { table: t.drillItemReports, action: 'delete', scope: 'studentOrSet' },
  { table: t.drillFeedback, action: 'delete', scope: 'studentOrSet' },
  { table: t.drillCheckins, action: 'delete', scope: 'studentOrSet' },
  { table: t.gradingJobs, action: 'delete', scope: 'set' },
  { table: t.drillAttempts, action: 'delete', scope: 'studentOrSet' },
  { table: t.drillSets, action: 'delete', scope: 'student' },
  { table: t.workouts, action: 'delete', scope: 'studentOrProgram' },
  { table: t.studentPrograms, action: 'delete', scope: 'student' },
  { table: t.prescriptions, action: 'delete', scope: 'student' },
  { table: t.caseResults, action: 'delete', scope: 'student' },
  { table: t.diagnostics, action: 'delete', scope: 'student' },
  { table: t.drillQuestionnaires, action: 'delete', scope: 'student' },
  { table: t.drillTiers, action: 'delete', scope: 'student' },
  { table: t.lessonViews, action: 'delete', scope: 'student' },
  { table: t.skillStateEvents, action: 'delete', scope: 'student' },
  { table: t.skillStates, action: 'delete', scope: 'student' },
  { table: t.studentDrillSettings, action: 'delete', scope: 'student' },
  { table: t.studentProfiles, action: 'delete', scope: 'user' },
  { table: t.rateLimits, action: 'delete', scope: 'rateLimitKeys' },
];

// Tables with no student in them, kept whole (the test refuses a personal table here).
export const KEPT_TABLES: Record<string, string> = {
  drill_item_stats: 'per-item aggregates, no student',
  voice_tts_usage: 'monthly character totals, no student',
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const col = (table: PgTable, name: string) => (table as unknown as Record<string, PgColumn>)[name];

function where(tx: Tx, step: Step, userId: string): SQL {
  const sessionIds = tx.select({ id: t.sessions.id }).from(t.sessions).where(eq(t.sessions.userId, userId));
  const setIds = tx.select({ id: t.drillSets.id }).from(t.drillSets).where(eq(t.drillSets.studentId, userId));
  const programIds = tx.select({ id: t.studentPrograms.id }).from(t.studentPrograms).where(eq(t.studentPrograms.studentId, userId));
  const attemptIds = tx.select({ id: t.drillAttempts.id }).from(t.drillAttempts)
    .where(or(eq(t.drillAttempts.studentId, userId), inArray(t.drillAttempts.setId, setIds)));
  const s = step.table;
  switch (step.scope) {
    case 'user': return eq(col(s, 'userId'), userId);
    case 'student': return eq(col(s, 'studentId'), userId);
    case 'session': return inArray(col(s, 'sessionId'), sessionIds);
    case 'userOrSession': return or(eq(col(s, 'userId'), userId), inArray(col(s, 'sessionId'), sessionIds))!;
    case 'set': return inArray(col(s, 'setId'), setIds);
    case 'studentOrSet': return or(eq(col(s, 'studentId'), userId), inArray(col(s, 'setId'), setIds))!;
    case 'attempt': return inArray(col(s, 'attemptId'), attemptIds);
    case 'studentOrProgram': return or(eq(col(s, 'studentId'), userId), inArray(col(s, 'programId'), programIds))!;
    case 'rateLimitKeys': return like(t.rateLimits.key, `%:user:${userId}`);
  }
}

// Runs the plan in one transaction; returns rows touched per table (for the log). Safe to run again.
export async function deleteStudentData(userId: string, exec: Pick<typeof db, 'transaction'> = db): Promise<Record<string, number>> {
  return exec.transaction(async tx => {
    const counts: Record<string, number> = {};
    for (const step of DELETE_PLAN) {
      const w = where(tx, step, userId);
      const res = step.action === 'anonymize'
        ? await tx.update(step.table).set(Object.fromEntries((step.nulls ?? []).map(k => [k, null])) as never).where(w)
        : await tx.delete(step.table).where(w);
      const name = (step.table as unknown as Record<symbol, string>)[Symbol.for('drizzle:Name')];
      counts[name] = (counts[name] ?? 0) + Number((res as unknown as { count?: number }).count ?? 0);
    }
    return counts;
  });
}
