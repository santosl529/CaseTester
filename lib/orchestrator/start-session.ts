import { db } from '@/db/client';
import { sessionTurns } from '@/db/schema';
import { getCaseById } from '@/lib/cases/loader';
import { buildOpeningMessage } from '@/lib/agent/prompts/scripts';
import { logEvent } from '@/lib/analytics';
import { insertSessionRow, sessionLimitsFromEnv, startWithinLimits, type SessionDecision } from '@/lib/session-limits';

// Create a session and its deterministic opening turn. Shared by POST
// /api/session (after auth + the club-code gate) and scripts/live-run.ts.
// Throws on an unknown case id.
export async function startSession(userId: string, caseId: string): Promise<{ sessionId: string; openingText: string }> {
  const caseData = getCaseById(caseId);
  const sessionId = await insertSessionRow(db, userId, caseId);
  return openSession(sessionId, caseData.prompt, userId, caseId);
}

// POST /api/session's start: the same, only within the student's limits (lib/session-limits.ts) — refused with the
// reason and when to retry, nothing created.
export async function startSessionLimited(
  userId: string,
  caseId: string,
): Promise<{ ok: true; sessionId: string; openingText: string } | Extract<SessionDecision, { ok: false }>> {
  const caseData = getCaseById(caseId);
  const started = await startWithinLimits(userId, caseId, sessionLimitsFromEnv());
  if (!started.ok) return started;
  return { ok: true, ...await openSession(started.sessionId, caseData.prompt, userId, caseId) };
}

// The deterministic opening turn and the start event, once the session row exists.
async function openSession(sessionId: string, prompt: string, userId: string, caseId: string): Promise<{ sessionId: string; openingText: string }> {
  // Opening message is deterministic: the candidate must see the EXACT case
  // prompt (numbers and all). Relying on a model turn to state it was
  // unreliable — a live run opened with "walk me through your thinking" and
  // never presented the scenario, so the candidate structured blind.
  const openingText = buildOpeningMessage(prompt, sessionId);

  await db.insert(sessionTurns).values({
    sessionId: sessionId,
    turnIndex: 0,
    role: 'interviewer',
    text: openingText,
    timestampMs: Date.now(),
  });

  await logEvent('case_start', { caseId }, { sessionId: sessionId, userId });

  return { sessionId: sessionId, openingText };
}
