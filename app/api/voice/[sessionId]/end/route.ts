import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { endByCandidate } from '@/lib/orchestrator/session-end';

// The candidate ends a voice interview (spec 2026-10-08-voice-phase-b §5.8;
// Rule 18A v4.10): the session ends without another case question. With
// something assessable done it is completed, with a report on what was
// covered; otherwise abandoned, no report (lib/orchestrator/session-end.ts).
// The browser disconnects after this; the agent cuts its turn, and Settle's
// status re-check keeps a late turn from reviving the session.
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

  const end = await endByCandidate(sessionId, user.id, 'voice_button');
  return NextResponse.json(end);
}
