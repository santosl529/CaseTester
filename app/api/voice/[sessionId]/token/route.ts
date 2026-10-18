import { NextRequest, NextResponse } from 'next/server';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { and, eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { AGENT_NAME } from '@/lib/voice/protocol';
import { liveVoiceRooms, maxConcurrentVoice, voiceRoomName } from '@/lib/voice/capacity';

// A LiveKit token for the session owner, and one dispatch of the voice agent
// into the session's room (spec 2026-10-08-voice-phase-b §4). The key and
// secret stay on the server; the browser gets the wss:// URL and a token.
// Past VOICE_MAX_CONCURRENT live voice rooms (default 1; lib/voice/capacity.ts)
// a new session is refused before any dispatch: 429 { error: 'busy' }.
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
  if (session.status !== 'active') return NextResponse.json({ error: 'Session is not active' }, { status: 409 });

  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
  if (!url || !key || !secret) return NextResponse.json({ error: 'Voice is not configured' }, { status: 503 });

  const room = voiceRoomName(sessionId);
  const httpUrl = url.replace(/^ws/, 'http');
  const others = liveVoiceRooms(await new RoomServiceClient(httpUrl, key, secret).listRooms(), room, Math.floor(Date.now() / 1000));
  if (others.length >= maxConcurrentVoice()) return NextResponse.json({ error: 'busy' }, { status: 429 });

  const at = new AccessToken(key, secret, { identity: user.id, ttl: '30m' });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });

  // One agent per room: a reload or a second Start does not dispatch another.
  const dispatcher = new AgentDispatchClient(httpUrl, key, secret);
  const existing = await dispatcher.listDispatch(room).catch(() => []);
  if (!existing.some(d => d.agentName === AGENT_NAME)) {
    await dispatcher.createDispatch(room, AGENT_NAME, { metadata: JSON.stringify({ sessionId }) });
  }
  return NextResponse.json({ url, token: await at.toJwt() });
}
