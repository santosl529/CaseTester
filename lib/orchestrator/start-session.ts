import { db } from '@/db/client';
import { sessions, sessionTurns } from '@/db/schema';
import { getCaseById } from '@/lib/cases/loader';
import { buildOpeningMessage } from '@/lib/agent/prompts/scripts';
import { logEvent } from '@/lib/analytics';

// Create a session and its deterministic opening turn. Shared by POST
// /api/session (after auth + the club-code gate) and scripts/live-run.ts.
// Throws on an unknown case id.
export async function startSession(userId: string, caseId: string): Promise<{ sessionId: string; openingText: string }> {
  const caseData = getCaseById(caseId);

  const [session] = await db.insert(sessions).values({
    userId,
    caseId,
    phase: 'INTRO',
  }).returning();

  // Opening message is deterministic: the candidate must see the EXACT case
  // prompt (numbers and all). Relying on a model turn to state it was
  // unreliable — a live run opened with "walk me through your thinking" and
  // never presented the scenario, so the candidate structured blind.
  const openingText = buildOpeningMessage(caseData.prompt, session.id);

  await db.insert(sessionTurns).values({
    sessionId: session.id,
    turnIndex: 0,
    role: 'interviewer',
    text: openingText,
    timestampMs: Date.now(),
  });

  await logEvent('case_start', { caseId }, { sessionId: session.id, userId });

  return { sessionId: session.id, openingText };
}
