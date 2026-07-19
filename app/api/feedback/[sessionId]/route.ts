import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { logEvent } from '@/lib/analytics';

// PRD §13: post-case ratings (realism, usefulness) and blind-comparison
// opt-ins. Pure analytics — appended to analytics_events, no dedicated table;
// analysis dedupes by session (last submission wins).
export async function POST(
  req: NextRequest,
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

  const body = await req.json();
  const realism = Number(body.realism);
  const usefulness = Number(body.usefulness);
  const blindOptIn = Boolean(body.blindOptIn);
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;
  if (!inRange(realism) || !inRange(usefulness)) {
    return NextResponse.json({ error: 'Ratings must be integers 1-5' }, { status: 400 });
  }

  await logEvent('post_case_rating', { realism, usefulness }, { sessionId, userId: user.id });
  if (blindOptIn) {
    await logEvent('blind_comparison_opt_in', {}, { sessionId, userId: user.id });
  }

  return NextResponse.json({ ok: true });
}
