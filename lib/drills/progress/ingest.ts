// Case results ingestion, the in-process interface the case grader calls
// (docs/prd-drills.md "Internal interfaces"). Validates, stores and applies
// the payload in one transaction, then logs the events.
import 'server-only';
import { logDrillEvent } from '../events';
import { ingestCaseResultTx, type IngestResult } from './store';

export async function ingestCaseResult(payload: unknown): Promise<Omit<IngestResult, 'events'>> {
  const { events, ...result } = await ingestCaseResultTx(payload);
  const studentId = (payload as { student_id: string }).student_id;
  for (const e of events) await logDrillEvent(studentId, e.type, e.props);
  return result;
}
