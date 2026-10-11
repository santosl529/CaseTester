import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { endByCandidate } from '@/lib/orchestrator/session-end';

// The candidate ends a text interview with the End button (Rule 18A v4.10):
// the same rule as a typed "can we stop" — a report on what was covered when
// something assessable happened, none otherwise; the request is never graded
// (lib/orchestrator/session-end.ts). A turn still running when this lands is
// dropped by Settle's status re-check.
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

  const end = await endByCandidate(sessionId, user.id, 'button');
  return NextResponse.json(end);
}
