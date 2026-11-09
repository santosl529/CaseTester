import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { endByCandidate } from '@/lib/orchestrator/session-end';
import { voiceRoomName } from '@/lib/voice/capacity';
import { closeVoiceRoom, roomAdminFromEnv } from '@/lib/voice/room-lifecycle';
import { releaseVoiceDispatch } from '@/lib/voice/dispatch-claim';
import { sessionRoute } from '@/lib/http/route-guard';

// The candidate ends a voice interview (spec 2026-10-08-voice-phase-b §5.8;
// Rule 18A v4.10): the session ends without another case question. With
// something assessable done it is completed, with a report on what was
// covered; otherwise abandoned, no report (lib/orchestrator/session-end.ts).
// The browser disconnects after this; the agent cuts its turn, and Settle's
// status re-check keeps a late turn from reviving the session.
// Voice lifecycle (5 Nov): the room is freed here — a pending dispatch cancelled, the room deleted (the agent in it
// sees it close and finishes), the dispatch claim released — before the response, so a Start right after is never
// refused as busy.
async function handlePOST(
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
  await closeVoiceRoom(roomAdminFromEnv(), voiceRoomName(sessionId));
  await releaseVoiceDispatch(sessionId).catch(e => console.warn('[voice] dispatch claim not released', e));
  return NextResponse.json(end);
}

// A throw answers JSON 500, a malformed id JSON 404 (lib/http/route-guard.ts).
export const POST = sessionRoute(handlePOST);
