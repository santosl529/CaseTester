import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { logEvent } from '@/lib/analytics';
import { sessionRoute } from '@/lib/http/route-guard';

// The voice page could not run a voice interview (pilot dashboard, Matt, 22 Nov): the microphone was blocked, the audio
// couldn't connect, the interviewer never came, or the connection dropped. Sent by the page as a beacon; the owner only.
// Logged as voice_connect_failed (kind); the dashboard counts sessions with one against voice sessions started.
const KINDS = ['mic_blocked', 'connect', 'no_interviewer', 'dropped'] as const;

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { sessionId } = await params;
  const body = await req.json().catch(() => ({})) as { kind?: unknown };
  const kind = KINDS.find(k => k === body.kind);
  if (!kind) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const session = await db.query.sessions.findFirst({ where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)), columns: { id: true } });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await logEvent('voice_connect_failed', { kind }, { sessionId, userId: user.id });
  return NextResponse.json({ ok: true });
}

export const POST = sessionRoute(handlePOST);
