import { db } from '@/db/client';
import { sessions, sessionTurns, scores } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ReportCard } from '@/components/report-card';
import { PostCaseSurvey } from '@/components/post-case-survey';
import { PrepareReport } from '@/components/prepare-report';
import { SiteHeader } from '@/components/site-header';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { reportDimensions, topFixPlain } from '@/lib/scoring/report-dimensions';
import { RATING_LABELS, type Rating } from '@/lib/scoring/rubric';

const RATING_COLOR: Record<string, string> = {
  needs_work: 'destructive',
  meets_bar: 'secondary',
  strong: 'default',
};

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
  });
  if (!session) notFound();

  const score = await db.query.scores.findFirst({
    where: eq(scores.sessionId, sessionId),
  });
  // A completed case not scored yet (left before scoring ended, or it failed):
  // offer to prepare it (site flow, 19 Oct). Other sessions have no report.
  if (!score) {
    if (session.status !== 'completed') notFound();
    return (
      <>
        <SiteHeader />
        <main className="w-full max-w-2xl mx-auto py-8 px-4 space-y-6">
          <h1 className="text-2xl font-bold">Interview Feedback</h1>
          <PrepareReport sessionId={sessionId} />
        </main>
      </>
    );
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

  const DIMENSIONS = reportDimensions(score);
  const topFix = topFixPlain(score);
  // Rule 18A: the candidate ended the interview early — feedback on what was covered.
  const partial = Boolean((session.flagsJsonb as Record<string, unknown> | null)?.partial);

  return (
    <>
    <SiteHeader />
    <main className="w-full max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Interview Feedback</h1>
        {partial ? (
          <Badge variant="outline">Partial interview — no overall rating</Badge>
        ) : (
          <Badge variant={RATING_COLOR[score.overallRating ?? 'meets_bar'] as 'destructive' | 'secondary' | 'default'}>
            {score.overallRating ? RATING_LABELS[score.overallRating as Rating] : null}
          </Badge>
        )}
        <a
          href={`/api/report/${sessionId}/pdf`}
          download
          className={`${buttonVariants({ variant: 'outline', size: 'sm' })} ml-auto`}
        >
          Download PDF
        </a>
      </div>

      {score.topFix && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader><CardTitle className="text-base">Top improvement</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {topFix ? (
              <>
                <p className="text-neutral-500 mb-1">{topFix.where}</p>
                <p className="text-neutral-800 mb-1">{topFix.what} {topFix.why}</p>
                <p className="text-neutral-900 font-medium">{topFix.next}</p>
              </>
            ) : score.topFix}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {DIMENSIONS.map(d => (
          <ReportCard key={d.key} label={d.label} rating={d.rating} feedback={d.feedback} legacyEvidence={d.legacyEvidence} />
        ))}
      </div>

      {score.modelAnswerJsonb != null && (() => {
        const ma = score.modelAnswerJsonb as Record<string, string>;
        return (
          <Card>
            <CardHeader><CardTitle className="text-base">Model Answer</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-3">
              <div>
                <p className="font-medium mb-1">Structure</p>
                <p className="text-neutral-700">{ma.structure}</p>
              </div>
              <div>
                <p className="font-medium mb-1">Recommendation</p>
                <p className="text-neutral-700">{ma.recommendation}</p>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <PostCaseSurvey sessionId={sessionId} />

      {turns.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Transcript</CardTitle></CardHeader>
          <CardContent>
            <details>
              <summary className="text-sm text-neutral-600 cursor-pointer select-none">
                Show full conversation ({turns.length} turns)
              </summary>
              <div className="mt-4 space-y-3">
                {turns.map(t => (
                  <div key={t.id} className="text-sm">
                    <p className="font-medium text-neutral-500 text-xs mb-0.5">
                      {t.role === 'candidate' ? 'You' : 'Interviewer'} · {turnClock(t.timestampMs)}
                    </p>
                    <p className={`whitespace-pre-wrap rounded-md px-3 py-2 ${
                      t.role === 'candidate'
                        ? 'bg-blue-50 text-neutral-900'
                        : 'bg-neutral-100 text-neutral-900'
                    }`}>
                      {t.text}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </CardContent>
        </Card>
      )}
    </main>
    </>
  );
}
