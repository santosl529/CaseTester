// Reads what buildCaseHistory needs for an interview's page (text and voice; M2, 17 Nov).
import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { exhibitsShown, sessionTurns } from '@/db/schema';
import { getCaseById } from '@/lib/cases/loader';
import { buildCaseHistory, type HistoryMessage } from './case-history';

export async function loadCaseHistory(sessionId: string, caseId: string): Promise<HistoryMessage[]> {
  const [turns, shown] = await Promise.all([
    db.select({ turnIndex: sessionTurns.turnIndex, role: sessionTurns.role, text: sessionTurns.text, timestampMs: sessionTurns.timestampMs })
      .from(sessionTurns).where(eq(sessionTurns.sessionId, sessionId)).orderBy(asc(sessionTurns.turnIndex)),
    db.select({ exhibitId: exhibitsShown.exhibitId, shownAtMs: exhibitsShown.shownAtMs }).from(exhibitsShown).where(eq(exhibitsShown.sessionId, sessionId)),
  ]);
  let exhibits: Parameters<typeof buildCaseHistory>[2] = [];
  try { exhibits = getCaseById(caseId).exhibits; } catch { exhibits = []; }
  return buildCaseHistory(turns, shown, exhibits);
}
