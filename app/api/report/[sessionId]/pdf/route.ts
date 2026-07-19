import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { db } from '@/db/client';
import { sessions, sessionTurns, scores, exhibitsShown } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getCaseById } from '@/lib/cases/loader';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { reportDimensions } from '@/lib/scoring/report-dimensions';
import { ReportPdf } from './report-pdf';

export async function GET(
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

  const score = await db.query.scores.findFirst({
    where: eq(scores.sessionId, sessionId),
  });
  if (!score) return NextResponse.json({ error: 'No report for this session' }, { status: 404 });

  const turns = await db.query.sessionTurns.findMany({
    where: eq(sessionTurns.sessionId, sessionId),
    orderBy: (t, { asc }) => [asc(t.turnIndex)],
  });

  const shownExhibits = await db.query.exhibitsShown.findMany({
    where: eq(exhibitsShown.sessionId, sessionId),
  });

  const caseData = getCaseById(session.caseId);
  const sessionStartMs = session.startedAt.getTime();
  const turnClock = (timestampMs: number) => {
    const s = Math.max(0, Math.round((timestampMs - sessionStartMs) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // exhibitsShown.shownAtMs is written with the same timestamp as the
  // preceding candidate turn (session-runner.ts inserts both from the same
  // `now`), so that's the join key back to "which interviewer turn delivered
  // this exhibit" — the PDF transcript otherwise renders only spoken text and
  // gives no sign an exhibit was shown at all.
  const exhibitTitleById = new Map(caseData.exhibits.map(e => [e.id, e.title]));
  const exhibitTitleByShownAtMs = new Map(
    shownExhibits.map(s => [s.shownAtMs, exhibitTitleById.get(s.exhibitId) ?? s.exhibitId]),
  );

  const buffer = await renderToBuffer(
    ReportPdf({
      caseTitle: caseData.title,
      completedAt: (session.completedAt ?? session.startedAt).toISOString().slice(0, 10),
      overallRating: score.overallRating,
      topFix: score.topFix,
      dimensions: reportDimensions(score),
      modelAnswer: score.modelAnswerJsonb as { structure?: string; recommendation?: string } | null,
      turns: turns.map((t, i) => {
        const prev = turns[i - 1];
        const exhibitTitle =
          t.role === 'interviewer' && prev?.role === 'candidate'
            ? exhibitTitleByShownAtMs.get(prev.timestampMs)
            : undefined;
        return { role: t.role, text: t.text, clock: turnClock(t.timestampMs), exhibitTitle };
      }),
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="case-report-${session.caseId}-${sessionId.slice(0, 8)}.pdf"`,
    },
  });
}
