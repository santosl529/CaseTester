import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { finalizeCheckerVerdicts } from '@/lib/scoring/checker-wait-db';

// Before scoring: waits for any math-checker verdict still running for the
// session, up to the checker's 30s timeout (Lorenzo, 18 Oct; batch 31 Marisol
// t19's verdict landed after the close). The client shows "Finalizing your
// report…" while this runs, then calls …/score (which waits again — the guarantee).
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { sessionId } = await params;
  const session = await db.query.sessions.findFirst({ where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)) });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const wait = await finalizeCheckerVerdicts(sessionId, user.id);
  return NextResponse.json({ pending: wait.pending.length, waitedMs: wait.waitedMs, timedOut: wait.timedOut });
}
