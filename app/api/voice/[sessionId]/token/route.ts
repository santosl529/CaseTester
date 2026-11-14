import { NextRequest, NextResponse } from 'next/server';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { and, eq, inArray } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { AGENT_NAME } from '@/lib/voice/protocol';
import { liveVoiceRooms, maxConcurrentVoice, sessionIdOfRoom, voiceRoomName } from '@/lib/voice/capacity';
import { closeVoiceRoom, roomAdminFromEnv } from '@/lib/voice/room-lifecycle';
import { claimVoiceDispatch } from '@/lib/voice/dispatch-claim';
import { liveKitEnvProblem } from '@/lib/voice/livekit-env';
import { hitRateLimit, rateLimitedResponse, rateRule } from '@/lib/rate-limit';
import { sessionRoute } from '@/lib/http/route-guard';
import { voiceConsentFor } from '@/lib/voice/consent';

// A LiveKit token for the session owner, and one dispatch of the voice agent
// into the session's room (spec 2026-10-08-voice-phase-b §4). The key and
// secret stay on the server; the browser gets the wss:// URL and a token.
// Past VOICE_MAX_CONCURRENT live voice rooms (default 1; lib/voice/capacity.ts)
// a new session is refused before any dispatch: 429 { error: 'busy' }. Without voice consent on file: 403
// { error: 'consent_required' } (lib/voice/consent.ts).
// Voice lifecycle (5 Nov): a room whose session is no longer active doesn't count (and is closed); the dispatch is
// claimed first (lib/voice/dispatch-claim.ts), so two requests at once start one agent.
async function handlePOST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Per student (30 an hour): every token can dispatch an agent; reloads and rejoins fit well under it.
  const limited = await hitRateLimit(rateRule('voiceToken'), `user:${user.id}`);
  if (!limited.ok) return rateLimitedResponse(limited);

  const { sessionId } = await params;
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
  });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.status !== 'active') return NextResponse.json({ error: 'Session is not active' }, { status: 409 });
  // No voice without the student's consent on file for the current policy (lib/voice/consent.ts; Lorenzo, 14 Nov).
  if (!(await voiceConsentFor(user.id))) return NextResponse.json({ error: 'consent_required' }, { status: 403 });

  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
  const admin = roomAdminFromEnv();
  if (!url || !key || !secret || !admin) return NextResponse.json({ error: 'Voice is not configured' }, { status: 503 });
  // Local dev against production's LiveKit project (lib/voice/livekit-env.ts).
  const envProblem = liveKitEnvProblem(process.env);
  if (envProblem) { console.error(`[voice] ${envProblem}`); return NextResponse.json({ error: 'Voice is not configured' }, { status: 503 }); }

  const room = voiceRoomName(sessionId);
  const candidates = liveVoiceRooms(await admin.listRooms(), room, Math.floor(Date.now() / 1000));
  const live = await activeRooms(candidates, admin);
  if (live.length >= maxConcurrentVoice()) return NextResponse.json({ error: 'busy' }, { status: 429 });

  const at = new AccessToken(key, secret, { identity: user.id, ttl: '30m' });
  // The candidate publishes their microphone and nothing else (security audit, 6 Nov); data messages stay on for the
  // page's check-ins, which the agent reads only from this identity.
  at.addGrant({ roomJoin: true, room, canPublish: true, canPublishSources: [TrackSource.MICROPHONE], canSubscribe: true, canPublishData: true });

  // One agent per room: a reload or a second Start does not dispatch another, and of two requests at once only
  // the one holding the claim dispatches.
  const existing = await admin.listDispatch(room).catch(() => []);
  if (!existing.some(d => d.agentName === AGENT_NAME) && await claimVoiceDispatch(sessionId, Date.now())) {
    await admin.createDispatch(room, AGENT_NAME, { metadata: JSON.stringify({ sessionId }) });
  }
  return NextResponse.json({ url, token: await at.toJwt() });
}

// The counted rooms, less those whose session is over (ended, abandoned, or no such session): those are closed in
// the background and never count. A room whose name isn't a session id still counts.
async function activeRooms(rooms: string[], admin: NonNullable<ReturnType<typeof roomAdminFromEnv>>): Promise<string[]> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = rooms.map(sessionIdOfRoom).filter((x): x is string => x !== null && UUID.test(x));
  const active = ids.length === 0 ? [] : await db.select({ id: sessions.id }).from(sessions)
    .where(and(inArray(sessions.id, ids), eq(sessions.status, 'active')));
  const activeIds = new Set(active.map(r => r.id));
  const over = (r: string) => { const id = sessionIdOfRoom(r); return id !== null && UUID.test(id) && !activeIds.has(id); };
  for (const r of rooms) if (over(r)) void closeVoiceRoom(admin, r);
  return rooms.filter(r => !over(r));
}

// A throw answers JSON 500, a malformed id JSON 404 (lib/http/route-guard.ts).
export const POST = sessionRoute(handlePOST);
