import { NextRequest, NextResponse, after } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { runTurn } from '@/lib/orchestrator/session-runner';
import { assessCoverage } from '@/lib/scoring/coverage';
import { db } from '@/db/client';
import { sessions, sessionTurns } from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { logEvent } from '@/lib/analytics';

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

  // Background coverage pass (runs AFTER the response is sent, so it adds no
  // latency; the next turn reads the result). Lagging ~a turn is acceptable.
  if (!result.ended) {
    after(async () => {
      try {
        const turns = await db.query.sessionTurns.findMany({
          where: eq(sessionTurns.sessionId, sessionId),
          orderBy: [asc(sessionTurns.turnIndex)],
        });
        const coverage = await assessCoverage(
          turns.map(t => ({ role: t.role, text: t.text })),
          u => { void logEvent('llm_usage', { ...u }, { sessionId, userId: user.id }); },
        );
        if (coverage) {
          await db.update(sessions).set({ coverageJsonb: coverage }).where(eq(sessions.id, sessionId));
        }
      } catch (e) {
        console.error('[coverage] background pass failed:', e);
      }
    });
  }

  // Scoring runs in a separate request (POST …/score) so this response returns
  // as soon as the final turn completes and the client can show an
  // "evaluating" state.
  return NextResponse.json(result);
}
