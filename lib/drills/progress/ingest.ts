// Case results ingestion, the in-process interface the case grader calls
// (docs/prd-drills.md "Internal interfaces"). Validates, stores and applies
// the payload in one transaction, then logs the events.
import 'server-only';
import { logPendingEvents } from '../events';
import { ingestCaseResultTx, type IngestResult } from './store';
import { recordPlanSource } from '../program/plan-source';

export async function ingestCaseResult(payload: unknown): Promise<Omit<IngestResult, 'events'>> {
  const { events, ...result } = await ingestCaseResultTx(payload);
  const studentId = (payload as { student_id: string }).student_id;
  await logPendingEvents(studentId, events);
  // A case is the most reliable plan source (D6 round 2).
  if (result.status === 'ingested') await recordPlanSource(studentId, 'case');
  return result;
}
