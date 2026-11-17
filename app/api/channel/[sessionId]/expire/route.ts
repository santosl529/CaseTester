import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { getCaseById } from '@/lib/cases/loader';
import { caseTotalMs } from '@/lib/orchestrator/state-machine';
import { endByCandidate } from '@/lib/orchestrator/session-end';
import { interviewClock } from '@/lib/site/interview-clock';
import { sessionRoute } from '@/lib/http/route-guard';

// "Get my report" on an interview left unfinished past its case's time (Matt, 17 Nov, pre-pilot audit M3): ends it by
// the End button's rule (a report on what was covered when something assessable happened; lib/orchestrator/
// session-end.ts), under endReason 'time_up'. Only once the time is really up (409 time_left before); an ended one is
// left as it is. Grading itself starts on the report page, under the scoring claim.
async function handlePOST(
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
  if (session.status === 'active' && interviewClock(session.startedAt, session.flagsJsonb, caseTotalMs(getCaseById(session.caseId)), new Date()).state === 'running') {
    return NextResponse.json({ error: 'time_left' }, { status: 409 });
  }
  return NextResponse.json(await endByCandidate(sessionId, user.id, 'time_up'));
}

// A throw answers JSON 500, a malformed id JSON 404 (lib/http/route-guard.ts).
export const POST = sessionRoute(handlePOST);
