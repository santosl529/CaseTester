import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { runJudge } from '@/lib/scoring/judge';
import { repairTranscript } from '@/lib/scoring/transcript-artifacts';
import { auditEvidence } from '@/lib/scoring/evidence-audit';
import { runClaimVerifier } from '@/lib/scoring/verifier';
import { runReconciliation } from '@/lib/scoring/reconcile';
import { checkMathSteps } from '@/lib/scoring/deterministic';
import { assembleReport } from '@/lib/scoring/report';
import { summarizeAssists, summarizeCoverage } from '@/lib/scoring/assists';
import { summarizeDataRequests } from '@/lib/scoring/data-coverage';
import { classifyDataRequests, findUnclassifiedExchanges } from '@/lib/orchestrator/data-requests';
import { logDataRequestClassification } from '@/lib/orchestrator/data-request-log';
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

  // Rule 11 data-coverage caveat (docs/scoring-qa.md). Backfill every exchange
  // that was never classified — the final exchange (the turn route skips it so
  // it can't race this route) and any exchange whose background pass failed or
  // was dropped. The `classified` marker separates "checked, nothing asked"
  // from "never checked", so nothing is classified twice, including on retry.
  const revealedIds = revealedRows.map(r => r.ledgerItemId);
  const catalog = caseData.dataLedger.map(d => ({ id: d.id, label: d.label }));
  const priorRequestRows = await db.query.sessionEvents.findMany({
    where: and(eq(sessionEvents.sessionId, sessionId), eq(sessionEvents.category, 'data_request')),
  });
  const unclassified = findUnclassifiedExchanges(transcript, priorRequestRows);
  await Promise.all(unclassified.map(async ({ candidate, interviewer }) => {
    const requests = await classifyDataRequests({
      candidateText: candidate.text,
      interviewerText: interviewer.text,
      catalog,
      onUsage: u => logUsage({ ...u }),
    });
    if (!requests) return; // failed again: stays unmarked; a retried scoring run picks it up
    await logDataRequestClassification({
      sessionId,
      phase: session.phase,
      requests,
      candidateTurnIndex: candidate.turnIndex,
      interviewerTurnIndex: interviewer.turnIndex,
      revealedIds: new Set(revealedIds),
    });
  }));
  if (unclassified.length > 0) {
    console.warn('[score] backfilled data-request classification for candidate turns:',
      JSON.stringify(unclassified.map(u => u.candidate.turnIndex)));
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
  const { rubric: verifiedRubric, dropped } = await runClaimVerifier(auditedRubric, transcript, u => logUsage({ ...u }));
  if (dropped.length > 0) {
    console.warn('[score] verifier dropped unsupported claims:', JSON.stringify(dropped));
  }

  // Dimension reconciliation LAST (docs/scoring-qa.md §4 — after the verifier,
  // because removing a claim can create or resolve a both-sides collision):
  // merge same-concept strength/weakness pairs, drop faults resting on
  // requested-but-never-provided data (Rule 11), log cross-dimension repeats.
  const { rubric, merges, gapDrops, crossDimension } = await runReconciliation(
    verifiedRubric, dataCoverage, u => logUsage({ ...u }),
  );
  if (merges.length > 0) console.warn('[score] reconciliation merged both-sides claims:', JSON.stringify(merges));
  if (gapDrops.length > 0) console.warn('[score] reconciliation dropped coverage-gap faults:', JSON.stringify(gapDrops));
  if (crossDimension.length > 0) console.warn('[score] cross-dimension repetition:', JSON.stringify(crossDimension));

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
    dataRequestBackfills: unclassified.length,
    // Report coherence (dimension reconciliation): same-concept-both-sides
    // merges, coverage-gap faults dropped, cross-dimension repeats (log only).
    reconcileMerges: merges.length,
    gapClaimDrops: gapDrops.length,
    crossDimensionRepeats: crossDimension.length,
  }, { sessionId, userId: user.id });

  return NextResponse.json({ scored: true });
}
