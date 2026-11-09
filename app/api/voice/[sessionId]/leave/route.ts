import { NextRequest, NextResponse, after } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { voiceRoomName } from '@/lib/voice/capacity';
import { roomAdminFromEnv } from '@/lib/voice/room-lifecycle';
import { releaseVoiceDispatch } from '@/lib/voice/dispatch-claim';
import { freeRoomUnlessBack, LEAVE_GRACE_MS } from '@/lib/voice/leave-grace';
import { sessionRoute } from '@/lib/http/route-guard';

// The candidate leaves the voice page without ending the case — the tab closes, they navigate away, they reload, or
// the page gives up waiting for the interviewer (voice lifecycle, 5 Nov). Sent with navigator.sendBeacon on
// pagehide. The answer is immediate; after it, a LEAVE_GRACE_MS grace (lib/voice/leave-grace.ts): if the candidate
// is back in the room by then (a reload), nothing changes and the interview carries on; if not, the room is freed —
// a dispatch still pending is cancelled (a cold-starting agent never joins), the room is deleted, the dispatch claim
// released. The session itself stays active: the candidate can come back and press Start.
export const maxDuration = 60;

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
    columns: { id: true },
  });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  after(() => freeRoomUnlessBack(
    { sessionId, room: voiceRoomName(sessionId), candidate: user.id },
    { admin: roomAdminFromEnv(), release: releaseVoiceDispatch, sleep: ms => new Promise(r => setTimeout(r, ms)) },
  ).then(() => {}));
  return NextResponse.json({ ok: true, graceMs: LEAVE_GRACE_MS });
}

// A throw answers JSON 500, a malformed id JSON 404 (lib/http/route-guard.ts).
export const POST = sessionRoute(handlePOST);
