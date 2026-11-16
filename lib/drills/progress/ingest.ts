// Case results ingestion, the in-process interface the case grader calls
// (docs/prd-drills.md "Internal interfaces"). Validates, stores and applies
// the payload in one transaction, then logs the events.
import 'server-only';
import { logPendingEvents } from '../events';
import { ingestCaseResultTx, type IngestResult } from './store';
import { recordPlanSource } from '../program/plan-source';
import { refreshTodayWorkout } from '../program/store';
import { recordNextSteps } from './next-steps-store';
import { CaseResultPayloadSchema } from '../case-result';

export async function ingestCaseResult(payload: unknown): Promise<Omit<IngestResult, 'events'>> {
  const { events, ...result } = await ingestCaseResultTx(payload);
  const studentId = (payload as { student_id: string }).student_id;
  await logPendingEvents(studentId, events);
  // A case is the most reliable plan source (D6 round 2).
  if (result.status === 'ingested') {
    await recordPlanSource(studentId, 'case');
    // Today's workout reflects the case straight away (Matt, 15 Nov); the case result stands if this fails.
    await refreshTodayWorkout(studentId).catch(err => console.error('[drills] workout refresh after a case failed:', err));
    // The report's "Your next steps", fixed now (Matt, 15 Nov, D5).
    await recordNextSteps(CaseResultPayloadSchema.parse(payload), result.retake ?? false)
      .catch(err => console.error('[drills] next steps after a case failed:', err));
  }
  return result;
}
