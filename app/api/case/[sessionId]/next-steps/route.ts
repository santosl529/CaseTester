import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { sessionRoute } from '@/lib/http/route-guard';
import { logEvent } from '@/lib/analytics';
import { retryCaseRun } from '@/lib/drills/progress/case-runs';

// Try again for a report's next steps when the tagging step failed (Matt, 15 Nov). One tagging call at most per
// failure: retryCaseRun claims the failed run first.
export const maxDuration = 300;

async function handlePOST(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { sessionId } = await params;
  const session = await db.query.sessions.findFirst({ where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)) });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const status = await retryCaseRun(sessionId, u => void logEvent('llm_usage', u, { sessionId, userId: user.id }));
  return NextResponse.json({ status });
}

export const POST = sessionRoute(handlePOST);
