// How a session ends when the candidate ends it (docs/interviewer-behavior.md
// Rule 18A, round-3 fixes, 11 Oct 2026) — by asking (plan-turn.ts planExit)
// or with the End button (app/api/*/end routes). One rule for both:
//   - something assessable happened (a structure, analysis, a recommendation…)
//     → completed, with a report on what was covered; when the case was cut
//     short it is a partial report: no overall rating, dimensions whose stage
//     never happened "not assessed";
//   - nothing assessable → abandoned, no report.
// The request to stop is never graded. Before 11 Oct the End button always
// abandoned the session, so a candidate who had done most of the case lost it.
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions, sessionEvents, sessionTurns } from '@/db/schema';
import { logEvent } from '@/lib/analytics';
import { caseFinished, hasAssessableEvidence } from './session-outcome';

export type CandidateEnd = { status: string; report: boolean; partial: boolean };

// The End button. Idempotent: an ended session is left as it is.
export async function endByCandidate(sessionId: string, userId: string, via: 'button' | 'voice_button'): Promise<CandidateEnd> {
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  if (session.status !== 'active') return { status: session.status, report: session.status === 'completed', partial: Boolean((session.flagsJsonb as Record<string, unknown>)?.partial) };
  const flags = session.flagsJsonb as Record<string, unknown>;
  const report = hasAssessableEvidence(flags);
  const turns = await db.query.sessionTurns.findMany({ where: eq(sessionTurns.sessionId, sessionId) });
  const partial = report && !caseFinished(flags);
  const status = report ? 'completed' : 'abandoned';
  await db.update(sessions).set({
    status, completedAt: new Date(), ...(report ? {} : { abandonPhase: session.phase }),
    flagsJsonb: { ...flags, endReason: 'candidate_end_button', partial, exitTurn: turns.length },
  }).where(and(eq(sessions.id, sessionId), eq(sessions.status, 'active')));
  await db.insert(sessionEvents).values({
    sessionId, category: 'intervention', subtype: 'candidate_exit', turnIndex: turns.length, phase: session.phase,
    payloadJsonb: { decision: 'stop', via, report, partial },
  });
  await logEvent(report ? 'case_complete' : 'case_abandoned', { reason: `candidate_ended_${via}`, phase: session.phase, partial }, { sessionId, userId });
  return { status, report, partial };
}
