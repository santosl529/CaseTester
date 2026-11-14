import { db } from '@/db/client';
import { sessions, sessionTurns, scores } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { reportDimensions, topFixLine, topFixPlain } from '@/lib/scoring/report-dimensions';
import { ReportScreen, UnscoredReportScreen } from '@/components/views/report';
import { getCaseById } from '@/lib/cases/loader';

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/case/${sessionId}/report`)}`);

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
  });
  if (!session) notFound();
  // The breadcrumb's case title (Cases / <title> report).
  let caseTitle = 'Case';
  try { caseTitle = getCaseById(session.caseId).title; } catch { /* a retired case: the generic name */ }

  const score = await db.query.scores.findFirst({
    where: eq(scores.sessionId, sessionId),
  });
  // A completed case not scored yet (left before scoring ended, or it failed):
  // offer to prepare it (site flow, 19 Oct). Other sessions have no report.
  if (!score) {
    if (session.status !== 'completed') notFound();
    return <UnscoredReportScreen sessionId={sessionId} caseTitle={caseTitle} />;
  }

  const turns = await db.query.sessionTurns.findMany({
    where: eq(sessionTurns.sessionId, sessionId),
    orderBy: (t, { asc }) => [asc(t.turnIndex)],
  });
  const sessionStartMs = session.startedAt.getTime();
  const turnClock = (timestampMs: number) => {
    const s = Math.max(0, Math.round((timestampMs - sessionStartMs) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <ReportScreen sessionId={sessionId} caseTitle={caseTitle}
      // Rule 18A: the candidate ended the interview early — feedback on what was covered.
      partial={Boolean((session.flagsJsonb as Record<string, unknown> | null)?.partial)}
      overallRating={score.overallRating} hasTopFix={Boolean(score.topFix)} topFix={topFixPlain(score)} topFixLine={topFixLine(score)}
      dimensions={reportDimensions(score)} modelAnswer={score.modelAnswerJsonb as Record<string, string> | null}
      turns={turns.map(t => ({ id: t.id, role: t.role, text: t.text, clock: turnClock(t.timestampMs) }))} />
  );
}
