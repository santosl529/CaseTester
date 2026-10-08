import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { logEvent } from '@/lib/analytics';

// The candidate ends a voice interview (spec 2026-10-08-voice-phase-b §5.8):
// an active session becomes abandoned — excluded from scoring, as an accepted
// pause is. The browser disconnects after this; the agent cuts its turn, and
// Settle's status re-check keeps a late turn from reviving the session.
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
  if (session.status !== 'active') return NextResponse.json({ status: session.status });

  await db.update(sessions)
    .set({ status: 'abandoned', completedAt: new Date(), abandonPhase: session.phase })
    .where(and(eq(sessions.id, sessionId), eq(sessions.status, 'active')));
  await logEvent('case_abandoned', { reason: 'candidate_ended_voice', phase: session.phase }, { sessionId, userId: user.id });
  return NextResponse.json({ status: 'abandoned' });
}
