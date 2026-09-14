import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { runJudge } from '@/lib/scoring/judge';
import { repairTranscript } from '@/lib/scoring/transcript-artifacts';
import { auditEvidence } from '@/lib/scoring/evidence-audit';
import { runClaimVerifier } from '@/lib/scoring/verifier';
import { checkMathSteps } from '@/lib/scoring/deterministic';
import { assembleReport } from '@/lib/scoring/report';
import { summarizeAssists, summarizeCoverage } from '@/lib/scoring/assists';
import { summarizeDataRequests } from '@/lib/scoring/data-coverage';
import { classifyDataRequests, toDataRequestEvents } from '@/lib/orchestrator/data-requests';
import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, scores, sessionEvents } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getCaseById } from '@/lib/cases/loader';
import { logEvent } from '@/lib/analytics';

// Scores a completed session. Split out of the turn route so the client can
// show an "evaluating" state during the ~30s judge run — and so a failed
// scoring pass can be retried (idempotent: returns early if a score exists).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
  });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.status !== 'completed') {
    return NextResponse.json({ error: 'Session is not completed' }, { status: 409 });
  }

  const existing = await db.query.scores.findFirst({
    where: eq(scores.sessionId, sessionId),
  });
  if (existing) return NextResponse.json({ scored: true });

  const start = Date.now();
  const caseData = getCaseById(session.caseId);
  const turns = await db.query.sessionTurns.findMany({
    where: eq(sessionTurns.sessionId, sessionId),
    orderBy: (t, { asc }) => [asc(t.turnIndex)],
  });
  const revealedRows = await db.query.revealedData.findMany({
    where: eq(revealedData.sessionId, sessionId),
  });
  // Intervention (stall-assist) events only — never conduct rows (Rule 18).
  const interventionRows = await db.query.sessionEvents.findMany({
    where: and(eq(sessionEvents.sessionId, sessionId), eq(sessionEvents.category, 'intervention')),
  });

  // Artifact detection FIRST (docs/scoring-qa.md §1 — order is load-bearing):
  // duplicated/empty turns are pipeline defects and must not reach the judge,
  // the math checks, or either verification pass.
  const { turns: repairedTranscript, artifacts } = repairTranscript(
    turns.map(t => ({ role: t.role, text: t.text, turnIndex: t.turnIndex })),
  );
  if (artifacts.length > 0) {
    console.warn('[score] transcript artifacts repaired:', JSON.stringify(artifacts));
  }
  const transcript = repairedTranscript;
  const mathResults = checkMathSteps(transcript, caseData.mathSteps);
  const interventions = interventionRows.map(r => ({ subtype: r.subtype, phase: r.phase, payloadJsonb: r.payloadJsonb }));
  const interventionSummary = [summarizeAssists(interventions), summarizeCoverage(interventions)]
    .filter(Boolean)
    .join('\n\n');
  const logUsage = (u: Record<string, unknown>) => { void logEvent('llm_usage', u, { sessionId, userId: user.id }); };

  // Rule 11 data-coverage caveat (docs/scoring-qa.md). The turn route logs
  // data_request events in the background for every exchange EXCEPT the final
  // one (it would race this route), so classify the final exchange here first.
  const revealedIds = revealedRows.map(r => r.ledgerItemId);
  const catalog = caseData.dataLedger.map(d => ({ id: d.id, label: d.label }));
  const lastInterviewer = transcript.at(-1);
  const lastCandidate = transcript.at(-2);
  // The runner already classifies recommendation-ask turns synchronously; don't
  // re-log an exchange that has rows (a retried scoring run would too).
  const priorRequestRows = await db.query.sessionEvents.findMany({
    where: and(eq(sessionEvents.sessionId, sessionId), eq(sessionEvents.category, 'data_request')),
  });
  const finalExchangeLogged = priorRequestRows.some(r => r.turnIndex === lastCandidate?.turnIndex);
  if (lastInterviewer?.role === 'interviewer' && lastCandidate?.role === 'candidate' && !finalExchangeLogged) {
    const finalRequests = await classifyDataRequests({
      candidateText: lastCandidate.text,
      interviewerText: lastInterviewer.text,
      catalog,
      onUsage: u => logUsage({ ...u }),
    });
    if (finalRequests && finalRequests.length > 0) {
      const events = toDataRequestEvents(finalRequests, {
        candidateTurnIndex: lastCandidate.turnIndex,
        interviewerTurnIndex: lastInterviewer.turnIndex,
        revealedIds: new Set(revealedIds),
      });
      await db.insert(sessionEvents).values(events.map(e => ({
        sessionId, category: e.category, subtype: e.subtype, turnIndex: e.turnIndex,
        phase: session.phase, payloadJsonb: e.payload,
      })));
    }
  }
  const dataRequestRows = await db.query.sessionEvents.findMany({
    where: and(eq(sessionEvents.sessionId, sessionId), eq(sessionEvents.category, 'data_request')),
  });
  const dataCoverage = summarizeDataRequests(
    dataRequestRows.map(r => ({ subtype: r.subtype, turnIndex: r.turnIndex, payloadJsonb: r.payloadJsonb })),
    catalog,
    revealedIds,
  );
  if (dataCoverage.requestedUnanswered.length > 0) {
    console.warn('[score] requested-but-unanswered ledger data (coverage gap):', JSON.stringify(dataCoverage.requestedUnanswered));
  }

  const rawRubric = await runJudge(
    transcript, caseData, revealedIds, mathResults, interventionSummary, dataCoverage,
    u => logUsage({ ...u }),
  );

  // Deterministic report-vs-transcript check: strip evidence quotes that don't
  // appear in candidate turns before anything renders.
  const candidateTexts = transcript.filter(t => t.role === 'candidate').map(t => t.text);
  const { rubric: auditedRubric, violations } = auditEvidence(rawRubric, candidateTexts);
  if (violations.length > 0) {
    console.warn('[score] evidence audit stripped fabricated quotes:', JSON.stringify(violations));
  }

  // Second pass: verify claims the quote audit can't (omission claims,
  // mischaracterizations); drop what the transcript contradicts.
  const { rubric, dropped } = await runClaimVerifier(auditedRubric, transcript, u => logUsage({ ...u }));
  if (dropped.length > 0) {
    console.warn('[score] verifier dropped unsupported claims:', JSON.stringify(dropped));
  }

  const report = assembleReport({
    sessionId,
    caseData,
    rubric,
    mathResults,
    scoringRuntimeMs: Date.now() - start,
  });

  await db.insert(scores).values({
    sessionId,
    structureRating: rubric.structure.rating,
    quantitativeRating: rubric.quantitative.rating,
    dataExhibitRating: rubric.dataExhibit.rating,
    judgmentRating: rubric.judgment.rating,
    creativityRating: rubric.creativity.rating,
    communicationRating: rubric.communication.rating,
    synthesisRating: rubric.synthesis.rating,
    pushbackRating: rubric.pushback.rating,
    overallRating: rubric.overallRating,
    rubricJsonb: rubric,
    topFix: rubric.topFix,
    deterministicJsonb: mathResults,
    modelAnswerJsonb: report.modelAnswer,
    scoringRuntimeMs: report.scoringRuntimeMs,
    judgeModel: report.judgeModel,
  });

  await logEvent('scoring_complete', { scoringRuntimeMs: report.scoringRuntimeMs, overallRating: rubric.overallRating },
    { sessionId, userId: user.id });

  // Scoring-QA metrics (docs/scoring-qa.md): one event per scoring run, zeros
  // included, so rates have a denominator. transcript_artifacts = pipeline
  // defect rate; evidence_strips = fabricated-quote rate; verifier_drops =
  // contradicted-claim (judge hallucination) rate.
  await logEvent('scoring_qa', {
    transcriptArtifacts: artifacts.length,
    artifactTypes: artifacts.map(a => a.type),
    evidenceStrips: violations.length,
    verifierDrops: dropped.length,
    // Rule 11: requested-and-unanswered ledger items (coverage gaps fed to the
    // judge) and requests for data the case doesn't have.
    dataRequestGaps: dataCoverage.requestedUnanswered.length,
    dataRequestsNotInCase: dataCoverage.requestedNotInCase.length,
  }, { sessionId, userId: user.id });

  return NextResponse.json({ scored: true });
}
