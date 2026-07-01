import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { runTurn } from '@/lib/orchestrator/session-runner';
import { runJudge } from '@/lib/scoring/judge';
import { checkMathSteps } from '@/lib/scoring/deterministic';
import { assembleReport } from '@/lib/scoring/report';
import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, scores } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCaseById } from '@/lib/cases/loader';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: 'Empty turn' }, { status: 400 });

  const result = await runTurn(sessionId, text.trim());

  if (result.ended) {
    // Trigger scoring inline for M1
    const start = Date.now();
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });
    if (session) {
      const caseData = getCaseById(session.caseId);
      const turns = await db.query.sessionTurns.findMany({
        where: eq(sessionTurns.sessionId, sessionId),
        orderBy: (t, { asc }) => [asc(t.turnIndex)],
      });
      const revealedRows = await db.query.revealedData.findMany({
        where: eq(revealedData.sessionId, sessionId),
      });

      const transcript = turns.map(t => ({ role: t.role, text: t.text, turnIndex: t.turnIndex }));
      const mathResults = checkMathSteps(transcript, caseData.mathSteps);
      const rubric = await runJudge(transcript, caseData, revealedRows.map(r => r.ledgerItemId));
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
        structureEvidence: rubric.structure.evidence,
        quantitativeRating: rubric.quantitative.rating,
        quantitativeEvidence: rubric.quantitative.evidence,
        judgmentRating: rubric.judgment.rating,
        judgmentEvidence: rubric.judgment.evidence,
        communicationRating: rubric.communication.rating,
        communicationEvidence: rubric.communication.evidence,
        synthesisRating: rubric.synthesis.rating,
        synthesisEvidence: rubric.synthesis.evidence,
        overallRating: rubric.overallRating,
        topFix: rubric.topFix,
        deterministicJsonb: mathResults,
        modelAnswerJsonb: report.modelAnswer,
        scoringRuntimeMs: report.scoringRuntimeMs,
        judgeModel: report.judgeModel,
      });
    }
  }

  return NextResponse.json(result);
}
