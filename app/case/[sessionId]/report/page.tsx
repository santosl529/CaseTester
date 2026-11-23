import { db } from '@/db/client';
import { sessions, sessionTurns, scores } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { after } from 'next/server';
import { noteReportViewed } from '@/lib/site/report-viewed';
import { isUuid } from '@/lib/http/route-guard';
import { noReportView } from '@/lib/site/report-fallback';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { reportDimensions, topFixLine, topFixPlain } from '@/lib/scoring/report-dimensions';
import { NoReportScreen, ReportScreen, UnscoredReportScreen } from '@/components/views/report';
import { getCaseById } from '@/lib/cases/loader';
import { reportDrillsView } from '@/lib/drills/progress/report-view';
import type { RubricScores } from '@/lib/scoring/judge';

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  // A malformed id is a 404, not a database error (lib/http/route-guard.ts).
  if (!isUuid(sessionId)) notFound();

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
    if (session.status !== 'completed') return <NoReportScreen caseTitle={caseTitle} {...noReportView(session.status, sessionId)} />;
    return <UnscoredReportScreen sessionId={sessionId} caseTitle={caseTitle} />;
  }

  // The pilot dashboard's "read the report" (Matt, 22 Nov): the owner's first view of a graded report, logged once,
  // after the page is sent (the page refreshes itself while next steps are prepared).
  after(() => noteReportViewed(user.id, sessionId).catch(err => console.error('[report] report_viewed not logged', err)));

  const turns = await db.query.sessionTurns.findMany({
    where: eq(sessionTurns.sessionId, sessionId),
    orderBy: (t, { asc }) => [asc(t.turnIndex)],
  });
  const sessionStartMs = session.startedAt.getTime();
  const turnClock = (timestampMs: number) => {
    const s = Math.max(0, Math.round((timestampMs - sessionStartMs) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // Case results → drills (Matt, 15 Nov): nothing unless CASE_TO_DRILLS is on, and never able to break the report.
  const drills = await reportDrillsView(user.id, sessionId, score.rubricJsonb as RubricScores | null, { caseId: session.caseId, scoredAt: score.createdAt })
    .catch(err => { console.error('[report] drills view failed:', err); return null; });

  return (
    <ReportScreen sessionId={sessionId} caseTitle={caseTitle} drills={drills}
      // Rule 18A: the candidate ended the interview early — feedback on what was covered.
      partial={Boolean((session.flagsJsonb as Record<string, unknown> | null)?.partial)}
      overallRating={score.overallRating} hasTopFix={Boolean(score.topFix)} topFix={topFixPlain(score)} topFixLine={topFixLine(score)}
      dimensions={reportDimensions(score)} modelAnswer={score.modelAnswerJsonb as Record<string, string> | null}
      turns={turns.map(t => ({ id: t.id, role: t.role, text: t.text, clock: turnClock(t.timestampMs) }))} />
  );
}
