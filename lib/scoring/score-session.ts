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
import { summarizeAssists, summarizeCoverage, summarizePressureTest } from './assists';
import { summarizeDataRequests, volunteeredItems } from './data-coverage';
import { buildInterviewerMarks, formatInterviewerMarksSection, dropClaimsOnMarkedTurns, type InterviewerMark } from './interviewer-errors';
import { buildChallengeMarks, verifyCandidateTurns, genuineErrorSpans, formatClaimChecksSection } from './challenge-marks';
import { formatCheckerSection, checkerFlaggedFigures, dropCheckerStamps } from './checker-record';
import { caseNumbersOf } from '@/lib/orchestrator/math-checker-live';
import { applyStageCaps, formatStageRecordSection, reconstructStages, stagesNotInCase } from './stage-caps';
import { exhibitsShown } from '@/db/schema';
import type { StageRecord } from '@/lib/orchestrator/stage-evidence';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { applyCaveatFloor } from './caveat-floor';
import { applyAnswerKeyPass } from './answer-key-pass';
import { applyStrongGate } from './strong-gate';
import { RUBRIC_DIMENSION_KEYS } from './rubric';
import { scoreOnce, storeIfClaimed, type ScoringClaim } from './scoring-claim';

export type ScoreSessionStatus = 'scored' | 'already_scored' | 'in_progress' | 'not_completed' | 'not_found';

// Score a completed session. Shared by POST /api/channel/[sessionId]/score
// (which checks ownership first) and scripts/live-run.ts. Idempotent: returns
// early if a score already exists, so a failed scoring pass can be retried;
// one pass at a time per session — a second call waits for the running pass's
// score (scoring-claim.ts). A dead Opus stream is retried inside the pass
// (stream-retry.ts, Phase 1 4.11), and the row is written only by the pass
// that still holds the claim: one report, whatever retries.
// A not-assessed dimension (Rule 9, v4.3) has no rating: NULL column.
function ratingColumn(d: { rating: RubricScores['structure']['rating']; notAssessed?: boolean }) {
  return d.notAssessed ? null : d.rating;
}

export async function scoreSession({ sessionId, userId }: { sessionId: string; userId: string }): Promise<{ status: ScoreSessionStatus }> {
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return { status: 'not_found' };
  if (session.status !== 'completed') return { status: 'not_completed' };

  try {
    return { status: await scoreOnce(sessionId, claim => scoreAndStore(claim, userId)) };
  } catch (err) {
    // The claim was taken over mid-pass (it went stale): that pass's row stands; this one wrote nothing.
    if (err instanceof ClaimLostError) return { status: 'in_progress' };
    throw err;
  }
}

export class ClaimLostError extends Error {
  constructor(sessionId: string) { super(`scoring claim lost for ${sessionId}: no score written`); }
}

export async function scoreAndStore(claim: ScoringClaim, userId: string, deps: { compute?: typeof computeScore; store?: typeof storeIfClaimed } = {}): Promise<void> {
  const { sessionId } = claim;
  const computed = await (deps.compute ?? computeScore)({ sessionId, userId });
  const { rubric, report, mathResults, qa } = computed;

  const stored = await (deps.store ?? storeIfClaimed)(claim, tx => tx.insert(scores).values({
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
  }).then(() => {}));
  if (!stored) throw new ClaimLostError(sessionId);

  await logEvent('scoring_complete', { scoringRuntimeMs: report.scoringRuntimeMs, overallRating: rubric.overallRating },
    { sessionId, userId });

  // Scoring-QA metrics (docs/scoring-qa.md): one event per scoring run, zeros
  // included, so rates have a denominator.
  await logEvent('scoring_qa', qa, { sessionId, userId });
}

// The scoring pipeline without persisting a score (round-3: lets
// scripts/regrade.ts re-grade stored sessions as a dry run). Writes only the
// idempotent data-request backfill and llm_usage events.
export async function computeScore({ sessionId, userId }: { sessionId: string; userId: string }) {
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) throw new Error(`Session not found: ${sessionId}`);
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
  // Rule 9 / 18A (v4.10): what actually happened, stage by stage — the
  // session's own record, or rebuilt from the transcript for sessions recorded
  // before it existed — and whether the candidate ended the interview early.
  const flags = session.flagsJsonb as Record<string, unknown>;
  const partial = Boolean(flags.partial);
  const exhibitRows = await db.query.exhibitsShown.findMany({ where: eq(exhibitsShown.sessionId, sessionId) });
  const phaseRows = await db.query.sessionEvents.findMany({ where: and(eq(sessionEvents.sessionId, sessionId), eq(sessionEvents.category, 'check')) });
  const phaseAt = (turnIndex: number) => (phaseRows.find(e => e.turnIndex === turnIndex)?.phase ?? 'ANALYSIS') as Phase;
  const stageRecord = (flags.stageEvidence as StageRecord | undefined) ?? reconstructStages({
    turns: turns.map(t => ({ role: t.role, text: t.text, turnIndex: t.turnIndex, timestampMs: t.timestampMs })),
    exhibitShownAtMs: exhibitRows.map(e => e.shownAtMs), revealedAtMs: revealedRows.map(r => r.revealedAtMs),
    pressureTest: flags.pressureTest as never, caseTexts: [caseData.prompt, ...caseData.dataLedger.map(d => d.value)], phaseAt,
  });
  // A case with no brainstorm module (Quillpath): the stage is not part of it.
  const notInCase = stagesNotInCase(caseData);
  const stageSection = formatStageRecordSection(stageRecord, partial ? { exitTurn: flags.exitTurn as number | undefined } : null, { notInCase });
  const interventionSummary = [summarizeAssists(interventions), summarizeCoverage(interventions), summarizePressureTest(interventions, transcript)]
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
  const dataCoverage = {
    ...summarizeDataRequests(
      dataRequestRows.map(r => ({ subtype: r.subtype, turnIndex: r.turnIndex, payloadJsonb: r.payloadJsonb })),
      catalog,
      revealedIds,
    ),
    // Must-reach items the interviewer volunteered (round 6 Task 72): the judge doesn't credit asking for them.
    volunteered: volunteeredItems(interventionRows.map(r => ({ subtype: r.subtype, turnIndex: r.turnIndex, payloadJsonb: r.payloadJsonb })), catalog),
  };
  if (dataCoverage.requestedUnanswered.length > 0) {
    console.warn('[score] requested-but-unanswered ledger data (coverage gap):', JSON.stringify(dataCoverage.requestedUnanswered));
  }

  // Interviewer-error marking (docs/scoring-qa.md, v4.3) — after artifact
  // detection, before any check reads candidate evidence. Conduct rows are read
  // here only to PROTECT the candidate (warnings and C5 exchanges can't count
  // against them); they never feed a penalty (Rule 18).
  const markEvents = await db.query.sessionEvents.findMany({ where: eq(sessionEvents.sessionId, sessionId) });
  // Round-3: challenges to the candidate's math as delivered — confirmed
  // interviewer errors (doubt on verified math) protect the reply; unsupported
  // challenges are logged apart (challenge-marks.ts). Verification is
  // recomputed from the transcript with what was revealed by each turn.
  const turnMs = new Map(turns.map(t => [t.turnIndex, t.timestampMs]));
  const revealedBefore = (turnIndex: number) => revealedRows.filter(r => r.revealedAtMs <= (turnMs.get(turnIndex) ?? Infinity)).map(r => r.ledgerItemId);
  // The math checker's record (checker-record.ts): its flags and their
  // outcomes for the judge; a stamp it found wrong no longer counts.
  const checkerRows = markEvents.filter(e => e.category === 'math_checker');
  const caseNumbers = caseNumbersOf(caseData, revealedIds);
  const verification = dropCheckerStamps(verifyCandidateTurns(transcript, caseData, revealedBefore), checkerRows, caseNumbers);
  // A redo the interview never read — after a flag closed — credited in the record, figure-bound (Lorenzo, 20 Oct, round-5b job 2).
  const checkerRedo = { candidateTurns: transcript.filter(t => t.role === 'candidate').map(t => ({ turnIndex: t.turnIndex, text: t.text })), caseData, revealedIds };
  const marks = [
    ...buildInterviewerMarks(
      transcript,
      markEvents.map(e => ({ category: e.category, subtype: e.subtype, turnIndex: e.turnIndex })),
      dataCoverage.requestedUnanswered,
    ),
    ...buildChallengeMarks(transcript, caseData, revealedBefore, verification, checkerFlaggedFigures(checkerRows, caseNumbers)),
    ...exitMarks(transcript, interventionRows),
  ];
  if (marks.length > 0) console.warn('[score] interviewer-error marks:', JSON.stringify(marks.map(m => [m.kind, m.interviewerTurn])));

  const rawRubric = await runJudge(
    transcript, caseData, revealedIds, mathResults, [interventionSummary, stageSection, formatClaimChecksSection(verification), formatCheckerSection(checkerRows, checkerRedo)].filter(Boolean).join('\n\n'), dataCoverage,
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
    quoteAuditedRubric, RUBRIC_DIMENSION_KEYS, transcript, marks, genuineErrorSpans(verification),
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
    auditedRubric, transcript, u => logUsage({ ...u }), { mathResults, marksSection: formatInterviewerMarksSection(marks), caseData },
  );
  if (dropped.length > 0) {
    console.warn('[score] verifier dropped unsupported claims:', JSON.stringify(dropped));
  }

  // Answer-key and caveat-text pass (Rule 3 v4.5), deterministic, before
  // reconciliation: no missing-idea weaknesses, no faulting a stage that was
  // never run; a dimension emptied by the pass is re-rated one level up.
  const answerKey = applyAnswerKeyPass(verifiedRubric, {
    ideas: caseData.answerKeyIdeas,
    candidateTexts,
  });
  if (answerKey.removed.length > 0) console.warn('[score] answer-key pass removed missing-idea weaknesses:', JSON.stringify(answerKey.removed));
  if (answerKey.caveatRemoved.length > 0) console.warn('[score] caveat-text pass removed un-administered-stage faults:', JSON.stringify(answerKey.caveatRemoved));
  if (answerKey.reRated.length > 0) console.warn('[score] re-rated after the answer-key pass:', JSON.stringify(answerKey.reRated));

  // Dimension reconciliation LAST (docs/scoring-qa.md §4 — after the verifier,
  // because removing a claim can create or resolve a both-sides collision):
  // merge same-concept strength/weakness pairs, drop faults resting on
  // requested-but-never-provided data (Rule 11), log cross-dimension repeats.
  const { rubric: reconciledRubric, merges, gapDrops, crossDimension } = await runReconciliation(
    answerKey.rubric, dataCoverage, u => logUsage({ ...u }),
  );
  // Round-3 fix 3: "strong" only on a checklist of the strong anchor's
  // elements, each evidenced by a real candidate quote; overall capped.
  const strongGate = applyStrongGate(reconciledRubric, candidateTexts);
  if (strongGate.downgraded.length > 0) console.warn('[score] strong ratings lowered by the checklist gate:', JSON.stringify(strongGate.downgraded));
  if (strongGate.overallCapped) console.warn('[score] overall rating capped:', JSON.stringify(strongGate.overallCapped));
  // Rule 9 (v4.10): a dimension whose stage never happened is rated only on
  // real evidence, else not assessed; a partial interview has no overall.
  const caps = applyStageCaps(strongGate.rubric, stageRecord, { partial, notInCase });
  if (caps.notAssessed.length > 0) console.warn('[score] not assessed — stage never happened, no evidence:', JSON.stringify(caps.notAssessed));
  // Rule 9 floor (v4.3 → v4.10: evidence-based) — enforced in code, after every text pass.
  const { rubric, floored, unassessed } = applyCaveatFloor(caps.rubric);
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

  const qa = {
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
    interviewerErrorMarks: marks.filter(m => m.kind !== 'unsupported_challenge').length,
    // Round-3: delivered doubts on the candidate's math, by verification.
    confirmedChallengeErrors: marks.filter(m => m.kind === 'confirmed_interviewer_error').length,
    unsupportedChallenges: marks.filter(m => m.kind === 'unsupported_challenge').length,
    markClaimDrops: markDrops.length,
    caveatFloors: floored.length,
    caveatUnassessed: unassessed.length,
    // v4.10: stage evidence and partial interviews.
    stageNotAssessed: caps.notAssessed.length,
    stageCaveated: caps.caveated.length,
    partial,
    gapClaimDrops: gapDrops.length,
    // v4.5: answer-key anchoring rate and un-administered-stage faults removed.
    answerKeyDrops: answerKey.removed.length,
    caveatTextDrops: answerKey.caveatRemoved.length,
    answerKeyReRates: answerKey.reRated.length,
    // Round-3 fix 3: rating calibration.
    strongDowngrades: strongGate.downgraded.length,
    overallCapped: strongGate.overallCapped !== null,
    crossDimensionRepeats: crossDimension.length,
  };

  return { rubric, report, mathResults, qa, strongGate, answerKey };
}

// Rule 18A (v4.10): the candidate's request to stop — and the exchange about
// it — is never evidence (interviewer-errors.ts marks).
function exitMarks(transcript: { role: string; turnIndex: number }[], rows: { subtype: string; turnIndex: number | null }[]): InterviewerMark[] {
  const turnsOf = (subtypes: string[]) => rows.filter(r => subtypes.includes(r.subtype) && r.turnIndex !== null).map(r => r.turnIndex!);
  const asked = turnsOf(['exit_clarify', 'refusal_offer']);
  const replies = asked.map(t => transcript.find(x => x.role === 'candidate' && x.turnIndex > t + 1)?.turnIndex).filter((t): t is number => t !== undefined);
  const turns = [...new Set([...turnsOf(['candidate_exit']), ...asked, ...replies])].filter(t => transcript.some(x => x.role === 'candidate' && x.turnIndex === t));
  if (turns.length === 0) return [];
  return [{ kind: 'candidate_exit', interviewerTurn: null, candidateTurns: turns,
    note: 'The candidate asked to stop, or was asked whether to stop. Asking to stop is never graded: do not mention, rate or penalize it, and do not use these turns as evidence.' }];
}
