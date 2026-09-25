import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { runSilence } from '@/lib/orchestrator/session-runner';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

// Text-mode silence tick (Rules 13/16/19, lib/orchestrator/silence.ts): the
// channel reports how long the candidate has been silent since the
// interviewer's last turn. Returns a scripted check-in or pause line, or
// nothing. Idempotent per silence.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const { silentMs } = await req.json();
  if (typeof silentMs !== 'number' || !Number.isFinite(silentMs) || silentMs < 0) {
    return NextResponse.json({ error: 'silentMs must be a non-negative number' }, { status: 400 });
  }

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
  });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(await runSilence(sessionId, silentMs));
}
