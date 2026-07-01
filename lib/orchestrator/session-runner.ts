import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, exhibitsShown } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCaseById } from '@/lib/cases/loader';
import { createLedger, canReveal, reveal, revealedValues, unrevealedLabels } from './data-ledger';
import { auditTurn } from './audit';
import { nextPhase, PHASE_BUDGETS_MS, type Phase } from './state-machine';
import { runInterviewerTurn } from '@/lib/agent/interviewer';
import { HaikuInterviewerModel } from '@/lib/agent/models/haiku';

const model = new HaikuInterviewerModel();

export type TurnResult = {
  interviewerText: string;
  exhibitId?: string;
  phase: Phase;
  ended: boolean;
  auditPassed: boolean;
};

export async function runTurn(sessionId: string, candidateText: string): Promise<TurnResult> {
  // Load session + history from DB
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  if (session.status !== 'active') throw new Error(`Session ${sessionId} is not active`);

  const caseData = getCaseById(session.caseId);
  const turnRows = await db.query.sessionTurns.findMany({
    where: eq(sessionTurns.sessionId, sessionId),
    orderBy: (t, { asc }) => [asc(t.turnIndex)],
  });
  const revealedRows = await db.query.revealedData.findMany({
    where: eq(revealedData.sessionId, sessionId),
  });

  // Reconstruct ledger state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ledger = createLedger(caseData.dataLedger as any);
  for (const r of revealedRows) {
    try { reveal(ledger, r.ledgerItemId); } catch { /* ignore */ }
  }

  const flags = session.flagsJsonb as Record<string, unknown>;
  const currentPhase = session.phase as Phase;
  const now = Date.now();
  const phaseElapsedMs = now - (session.phaseStartedAt?.getTime() ?? now);

  // Build message history for LLM (DB stores 'candidate'/'interviewer'; API needs 'user'/'assistant')
  const history = turnRows.map(t => ({
    role: (t.role === 'candidate' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: t.text,
  }));

  // Run one turn
  const actions = await runInterviewerTurn({
    model,
    candidateText,
    history,
    phase: currentPhase,
    promptCtx: {
      casePrompt: caseData.prompt,
      currentPhase,
      revealedValues: revealedValues(ledger),
      unrevealedLabels: unrevealedLabels(ledger),
      pushbackDone: Boolean(flags.pushbackDone),
      phaseElapsedMs,
      phaseBudgetMs: PHASE_BUDGETS_MS[currentPhase],
    },
  });

  // Execute actions
  let spokenText = '';
  let exhibitId: string | undefined;
  let nextPhaseValue: Phase = currentPhase;
  let ended = false;
  const newReveals: string[] = [];

  for (const action of actions) {
    if (action.type === 'speak') {
      spokenText += action.text + ' ';
    } else if (action.type === 'reveal_data') {
      if (canReveal(ledger, action.itemId, currentPhase)) {
        const value = reveal(ledger, action.itemId);
        newReveals.push(action.itemId);
        spokenText += `${value} `;
      }
    } else if (action.type === 'show_exhibit') {
      exhibitId = action.exhibitId;
    } else if (action.type === 'advance_phase') {
      nextPhaseValue = nextPhase(currentPhase) ?? currentPhase;
    } else if (action.type === 'end_case') {
      ended = true;
    }
  }

  spokenText = spokenText.trim();

  // Post-turn audit
  const auditResult = auditTurn(spokenText, revealedValues(ledger));
  // Log but don't block in production (gate in QA harness)

  const nextTurnIndex = turnRows.length;

  // Persist to DB
  await db.insert(sessionTurns).values([
    { sessionId, turnIndex: nextTurnIndex, role: 'candidate', text: candidateText, timestampMs: now },
    { sessionId, turnIndex: nextTurnIndex + 1, role: 'interviewer', text: spokenText, timestampMs: Date.now() },
  ]);

  for (const itemId of newReveals) {
    await db.insert(revealedData).values({ sessionId, ledgerItemId: itemId, revealedAtMs: now });
  }

  if (exhibitId) {
    await db.insert(exhibitsShown).values({ sessionId, exhibitId, shownAtMs: now });
  }

  // Update session phase
  if (nextPhaseValue !== currentPhase || ended) {
    await db.update(sessions)
      .set({
        phase: ended ? 'SCORING' : nextPhaseValue,
        status: ended ? 'completed' : 'active',
        completedAt: ended ? new Date() : undefined,
        phaseStartedAt: nextPhaseValue !== currentPhase ? new Date() : undefined,
      })
      .where(eq(sessions.id, sessionId));
  }

  return {
    interviewerText: spokenText,
    exhibitId,
    phase: ended ? 'SCORING' : nextPhaseValue,
    ended,
    auditPassed: auditResult.passed,
  };
}
