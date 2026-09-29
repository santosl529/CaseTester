import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, scores, sessionEvents } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getCaseById } from '@/lib/cases/loader';
import { logEvent } from '@/lib/analytics';
import { classifyDataRequests, findUnclassifiedExchanges } from '@/lib/orchestrator/data-requests';
import { logDataRequestClassification } from '@/lib/orchestrator/data-request-log';
import { runJudge, type RubricScores } from './judge';
import { repairTranscript } from './transcript-artifacts';
import { auditEvidence } from './evidence-audit';
import { runClaimVerifier } from './verifier';
import { runReconciliation } from './reconcile';
import { checkMathSteps } from './deterministic';
import { assembleReport } from './report';
import { summarizeAssists, summarizeCoverage } from './assists';
import { summarizeDataRequests } from './data-coverage';
import { buildInterviewerMarks, formatInterviewerMarksSection, dropClaimsOnMarkedTurns } from './interviewer-errors';
import { applyCaveatFloor } from './caveat-floor';
import { RUBRIC_DIMENSION_KEYS } from './rubric';

export type ScoreSessionStatus = 'scored' | 'already_scored' | 'not_completed' | 'not_found';

// Score a completed session. Shared by POST /api/channel/[sessionId]/score
// (which checks ownership first) and scripts/live-run.ts. Idempotent: returns
// early if a score already exists, so a failed scoring pass can be retried.
// A not-assessed dimension (Rule 9, v4.3) has no rating: NULL column.
function ratingColumn(d: { rating: RubricScores['structure']['rating']; notAssessed?: boolean }) {
  return d.notAssessed ? null : d.rating;
}

export async function scoreSession({ sessionId, userId }: { sessionId: string; userId: string }): Promise<{ status: ScoreSessionStatus }> {
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return { status: 'not_found' };
  if (session.status !== 'completed') return { status: 'not_completed' };

  const existing = await db.query.scores.findFirst({
    where: eq(scores.sessionId, sessionId),
  });
  if (existing) return { status: 'already_scored' };

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
  const mathResults = checkMathSteps(transcript, caseData.mathSteps, revealedRows.map(r => r.ledgerItemId));
  const interventions = interventionRows.map(r => ({ subtype: r.subtype, phase: r.phase, payloadJsonb: r.payloadJsonb }));
  const interventionSummary = [summarizeAssists(interventions), summarizeCoverage(interventions)]
    .filter(Boolean)
    .join('\n\n');
  const logUsage = (u: Record<string, unknown>) => { void logEvent('llm_usage', u, { sessionId, userId }); };

  // Rule 11 data-coverage caveat (docs/scoring-qa.md). Backfill every exchange
  // that was never classified — the final exchange (the turn route skips it so
  // it can't race scoring) and any exchange whose background pass failed or
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

  // Interviewer-error marking (docs/scoring-qa.md, v4.3) — after artifact
  // detection, before any check reads candidate evidence. Conduct rows are read
  // here only to PROTECT the candidate (warnings and C5 exchanges can't count
  // against them); they never feed a penalty (Rule 18).
  const markEvents = await db.query.sessionEvents.findMany({ where: eq(sessionEvents.sessionId, sessionId) });
  const marks = buildInterviewerMarks(
    transcript,
    markEvents.map(e => ({ category: e.category, subtype: e.subtype, turnIndex: e.turnIndex })),
    dataCoverage.requestedUnanswered,
  );
  if (marks.length > 0) console.warn('[score] interviewer-error marks:', JSON.stringify(marks.map(m => [m.kind, m.interviewerTurn])));

  const rawRubric = await runJudge(
    transcript, caseData, revealedIds, mathResults, interventionSummary, dataCoverage,
    formatInterviewerMarksSection(marks),
    u => logUsage({ ...u }),
  );

  // Deterministic report-vs-transcript check: strip evidence quotes that don't
  // appear in candidate turns before anything renders.
  const candidateTexts = transcript.filter(t => t.role === 'candidate').map(t => t.text);
  const { rubric: quoteAuditedRubric, violations, droppedPoints } = auditEvidence(rawRubric, candidateTexts);
  // Enforcement of the marks: a needs-work item whose only evidence is a
  // candidate turn responding to an interviewer error (or a C5 exchange) goes.
  const { rubric: auditedRubric, dropped: markDrops } = dropClaimsOnMarkedTurns(
    quoteAuditedRubric, RUBRIC_DIMENSION_KEYS, transcript, marks,
  );
  if (markDrops.length > 0) console.warn('[score] dropped claims resting on interviewer errors:', JSON.stringify(markDrops));
  if (violations.length > 0) {
    console.warn('[score] evidence audit stripped fabricated quotes:', JSON.stringify(violations));
  }
  if (droppedPoints.length > 0) {
    console.warn('[score] evidence audit dropped points left without evidence:', JSON.stringify(droppedPoints));
  }

  // Second pass: verify claims the quote audit can't (omission claims,
  // mischaracterizations); drop what the transcript contradicts.
  const { rubric: verifiedRubric, dropped } = await runClaimVerifier(
    auditedRubric, transcript, u => logUsage({ ...u }), { mathResults, marksSection: formatInterviewerMarksSection(marks) },
  );
  if (dropped.length > 0) {
    console.warn('[score] verifier dropped unsupported claims:', JSON.stringify(dropped));
  }

  // Dimension reconciliation LAST (docs/scoring-qa.md §4 — after the verifier,
  // because removing a claim can create or resolve a both-sides collision):
  // merge same-concept strength/weakness pairs, drop faults resting on
  // requested-but-never-provided data (Rule 11), log cross-dimension repeats.
  const { rubric: reconciledRubric, merges, gapDrops, crossDimension } = await runReconciliation(
    verifiedRubric, dataCoverage, u => logUsage({ ...u }),
  );
  // Rule 9 floor (v4.3) — enforced in code, after every text pass.
  const { rubric, floored } = applyCaveatFloor(reconciledRubric);
  if (floored.length > 0) console.warn('[score] caveated dimensions floored at meets_bar:', JSON.stringify(floored));
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
    structureRating: ratingColumn(rubric.structure),
    quantitativeRating: ratingColumn(rubric.quantitative),
    dataExhibitRating: ratingColumn(rubric.dataExhibit),
    judgmentRating: ratingColumn(rubric.judgment),
    creativityRating: ratingColumn(rubric.creativity),
    communicationRating: ratingColumn(rubric.communication),
    synthesisRating: ratingColumn(rubric.synthesis),
    pushbackRating: ratingColumn(rubric.pushback),
    overallRating: rubric.overallRating,
    rubricJsonb: rubric,
    topFix: rubric.topFix,
    deterministicJsonb: mathResults,
    modelAnswerJsonb: report.modelAnswer,
    scoringRuntimeMs: report.scoringRuntimeMs,
    judgeModel: report.judgeModel,
  });

  await logEvent('scoring_complete', { scoringRuntimeMs: report.scoringRuntimeMs, overallRating: rubric.overallRating },
    { sessionId, userId });

  // Scoring-QA metrics (docs/scoring-qa.md): one event per scoring run, zeros
  // included, so rates have a denominator. transcript_artifacts = pipeline
  // defect rate; evidence_strips = fabricated-quote rate; verifier_drops =
  // contradicted-claim (judge hallucination) rate.
  await logEvent('scoring_qa', {
    transcriptArtifacts: artifacts.length,
    artifactTypes: artifacts.map(a => a.type),
    evidenceStrips: violations.length,
    evidencePointDrops: droppedPoints.length,
    verifierDrops: dropped.length,
    // Rule 11: requested-and-unanswered ledger items (coverage gaps fed to the
    // judge) and requests for data the case doesn't have.
    dataRequestGaps: dataCoverage.requestedUnanswered.length,
    dataRequestsNotInCase: dataCoverage.requestedNotInCase.length,
    dataRequestBackfills: unclassified.length,
    // Report coherence (dimension reconciliation): same-concept-both-sides
    // merges, coverage-gap faults dropped, cross-dimension repeats (log only).
    reconcileMerges: merges.length,
    // v4.3: claims dropped for resting on interviewer errors, and caveated
    // dimensions raised to the meets_bar floor.
    interviewerErrorMarks: marks.length,
    markClaimDrops: markDrops.length,
    caveatFloors: floored.length,
    gapClaimDrops: gapDrops.length,
    crossDimensionRepeats: crossDimension.length,
  }, { sessionId, userId });

  return { status: 'scored' };
}
