import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { scoreSession } from '@/lib/scoring/score-session';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

// Scores a completed session. Split out of the turn route so the client can
// show an "evaluating" state during the ~30s judge run — and so a failed
// scoring pass can be retried (idempotent: returns early if a score exists).
// The pipeline itself lives in lib/scoring/score-session.ts.
//
// Scoring runs three Opus 5.5 passes with thinking (judge, verifier,
// reconciliation) — minutes, not the old ~30s — so the function gets an
// explicit budget instead of the platform default.
export const maxDuration = 300;

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

  const { status } = await scoreSession({ sessionId, userId: user.id });
  if (status === 'not_completed') {
    return NextResponse.json({ error: 'Session is not completed' }, { status: 409 });
  }
  if (status === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ scored: true });
}
