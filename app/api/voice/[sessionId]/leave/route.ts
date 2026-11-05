import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { voiceRoomName } from '@/lib/voice/capacity';
import { closeVoiceRoom, roomAdminFromEnv } from '@/lib/voice/room-lifecycle';
import { releaseVoiceDispatch } from '@/lib/voice/dispatch-claim';

// The candidate leaves the voice page without ending the case — the tab closes, they navigate away, or the page
// gives up waiting for the interviewer (voice lifecycle, 5 Nov). Sent with navigator.sendBeacon on pagehide. The
// room is freed: a dispatch still pending is cancelled (a cold-starting agent never joins), the room is deleted
// (an agent already in it finishes), and the dispatch claim is released so a later Start dispatches afresh. The
// session itself stays active: the candidate can come back and press Start.
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
    columns: { id: true },
  });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const freed = await closeVoiceRoom(roomAdminFromEnv(), voiceRoomName(sessionId));
  await releaseVoiceDispatch(sessionId).catch(e => console.warn('[voice] dispatch claim not released', e));
  return NextResponse.json({ ok: true, ...freed });
}
