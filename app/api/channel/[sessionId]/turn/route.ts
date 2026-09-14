import { NextRequest, NextResponse, after } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { runTurn } from '@/lib/orchestrator/session-runner';
import { runPostTurnBackground } from '@/lib/orchestrator/post-turn';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: 'Empty turn' }, { status: 400 });

  // Verify the session belongs to this user
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
  });
  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const result = await runTurn(sessionId, text.trim());
  console.log('[turn route] result:', JSON.stringify({ exhibit: result.exhibit?.id ?? null, ended: result.ended }));

  // Background passes — live coverage agent + Rule 11 data-request audit — run
  // AFTER the response is sent, so they add no latency; the next turn reads
  // their results a turn late (lib/orchestrator/post-turn.ts).
  after(() => runPostTurnBackground({
    sessionId,
    userId: user.id,
    caseId: session.caseId,
    phase: session.phase,
    result,
  }));

  // Scoring runs in a separate request (POST …/score) so this response returns
  // as soon as the final turn completes and the client can show an
  // "evaluating" state.
  return NextResponse.json(result);
}
