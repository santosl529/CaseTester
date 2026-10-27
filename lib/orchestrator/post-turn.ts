import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, sessionEvents } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { assessCoverage } from '@/lib/scoring/coverage';
import { getCaseById } from '@/lib/cases/loader';
import { logEvent } from '@/lib/analytics';
import { classifyDataRequests } from './data-requests';
import { labelWithPeriod } from './data-ledger';
import { logDataRequestClassification } from './data-request-log';
import type { Phase } from './state-machine';
import type { TurnResult } from './session-runner';
import { switchOn } from '@/lib/cases/engine-switches';
import { askJudgeEligible, claimAskJudge, callAskJudge, runAskJudgeOnce, ASK_JUDGE_EVENT } from './ask-judge';

type PostTurnParams = {
  sessionId: string;
  userId: string;
  caseId: string;
  phase: Phase;        // the session's phase when the candidate turn arrived
  result: TurnResult;
};

// Per-turn background work. The turn route schedules this with after() (runs
// after the response is sent — zero added latency; the next turn reads the
// results a turn late); scripts/live-run.ts fires it without awaiting to match.
// Each pass catches its own errors, so one failing never takes the other down
// and this never rejects.
export async function runPostTurnBackground(params: PostTurnParams): Promise<void> {
  const { result } = params;
  await Promise.all([
    result.ended ? undefined : coveragePass(params),
    // Skipped on the ending turn: the client calls /score immediately, which
    // would race this pass, so scoring backfills the final exchange (a request
    // ignored by the close still counts). Terminated/abandoned sessions also
    // end here and are never scored. Also skipped when the runner already
    // classified this exchange synchronously (recommendation-ask turns).
    result.ended || result.dataRequestsClassified ? undefined : dataRequestPass(params),
    // Step 3 (`asyncAskJudge`): the background item judge on the exchange, claimed once per turn. Not at the close.
    result.ended ? undefined : askJudgePass(params),
  ]);
}

// The background item judge (lib/orchestrator/ask-judge.ts). Off: no read, no write, no call.
async function askJudgePass({ sessionId, userId, caseId, phase, result }: PostTurnParams): Promise<void> {
  try {
    const caseData = getCaseById(caseId);
    if (!switchOn(caseData, 'asyncAskJudge')) return;
    const turns = await db.query.sessionTurns.findMany({
      where: eq(sessionTurns.sessionId, sessionId),
      orderBy: [asc(sessionTurns.turnIndex)],
    });
    const interviewerTurn = turns.at(-1);
    const candidateTurn = turns.at(-2);
    if (interviewerTurn?.role !== 'interviewer' || candidateTurn?.role !== 'candidate') return;
    const revealedRows = await db.query.revealedData.findMany({ where: eq(revealedData.sessionId, sessionId) });
    const releasedThisTurn = Boolean(result.exhibit) || revealedRows.some(r => r.revealedAtMs >= candidateTurn.timestampMs);
    if (!askJudgeEligible(candidateTurn.text, interviewerTurn.text, releasedThisTurn)) return;
    await runAskJudgeOnce({
      claim: () => claimAskJudge(db, sessionId, candidateTurn.turnIndex, phase),   // only the insert that lands calls
      judge: () => callAskJudge(caseData, candidateTurn.text, revealedRows.map(r => r.ledgerItemId),
        u => { void logEvent('llm_usage', { ...u }, { sessionId, userId }); }),
      write: async v => { await db.insert(sessionEvents).values({ sessionId, category: ASK_JUDGE_EVENT.category, subtype: ASK_JUDGE_EVENT.subtype,
        turnIndex: candidateTurn.turnIndex, phase, payloadJsonb: { asks: v.asks, latencyMs: v.latencyMs } }); },
    });
  } catch (e) {
    console.error('[ask-judge] background pass failed:', e);
  }
}

// Live coverage agent (docs/scoring-qa.md): evidence sufficiency per rubric
// dimension, steering the interviewer and gating early end_case.
async function coveragePass({ sessionId, userId }: PostTurnParams): Promise<void> {
  try {
    const turns = await db.query.sessionTurns.findMany({
      where: eq(sessionTurns.sessionId, sessionId),
      orderBy: [asc(sessionTurns.turnIndex)],
    });
    const coverage = await assessCoverage(
      turns.map(t => ({ role: t.role, text: t.text })),
      u => { void logEvent('llm_usage', { ...u }, { sessionId, userId }); },
    );
    if (coverage) {
      await db.update(sessions).set({ coverageJsonb: coverage }).where(eq(sessions.id, sessionId));
    }
  } catch (e) {
    console.error('[coverage] background pass failed:', e);
  }
}

// Rule 11 data-request audit (docs/interviewer-behavior.md v4.1): classify
// this exchange's candidate data requests and how the interviewer handled
// them, logged as `data_request` session events (plus a `classified` marker)
// for the scoring-side data-coverage caveat and next-turn open-request hints.
async function dataRequestPass({ sessionId, userId, caseId, phase }: PostTurnParams): Promise<void> {
  try {
    const turns = await db.query.sessionTurns.findMany({
      where: eq(sessionTurns.sessionId, sessionId),
      orderBy: [asc(sessionTurns.turnIndex)],
    });
    const interviewerTurn = turns.at(-1);
    const candidateTurn = turns.at(-2);
    if (interviewerTurn?.role !== 'interviewer' || candidateTurn?.role !== 'candidate') return;

    const catalog = getCaseById(caseId).dataLedger.map(d => ({ id: d.id, label: labelWithPeriod(d) }));
    const requests = await classifyDataRequests({
      candidateText: candidateTurn.text,
      interviewerText: interviewerTurn.text,
      catalog,
      onUsage: u => { void logEvent('llm_usage', { ...u }, { sessionId, userId }); },
    });
    if (!requests) return; // classifier failed: no marker, so scoring backfills this exchange

    const revealedRows = await db.query.revealedData.findMany({ where: eq(revealedData.sessionId, sessionId) });
    const events = await logDataRequestClassification({
      sessionId,
      phase,
      requests,
      candidateTurnIndex: candidateTurn.turnIndex,
      interviewerTurnIndex: interviewerTurn.turnIndex,
      revealedIds: new Set(revealedRows.map(r => r.ledgerItemId)),
    });
    for (const e of events) {
      if (e.subtype === 'none' && e.payload.ledgerItemIds.length > 0 && !e.payload.revealedByNow) {
        console.warn('[data-requests] non-response to available ledger data:', JSON.stringify(e.payload));
      }
    }
  } catch (e) {
    console.error('[data-requests] background pass failed:', e);
  }
}
