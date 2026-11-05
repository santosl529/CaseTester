// One interviewer per voice session (voice lifecycle, 5 Nov; the 2 Nov audit: two token requests at once both saw
// no dispatch and both created one). The token route claims the session before it dispatches — one conditional
// UPDATE on `flags_jsonb.voiceDispatchAt`, atomic under Postgres row locking as in lib/scoring/scoring-claim.ts — so
// of two concurrent requests exactly one dispatches. No new table.
//
// The claim is released when the session's voice room is freed (the agent finishing, End, the candidate leaving), so
// a fresh Start dispatches again. A claim nobody released (an agent that died) goes stale after
// DISPATCH_CLAIM_STALE_MS — longer than a cold start (≈ 25 s) plus the browser's wait (60 s).
//
// Known limit: the turn runner writes `flags_jsonb` whole from what it read at the start of a turn, so a turn that
// started before a claim can drop it. Turns only run once the agent is in the room, after the claim has done its
// job; the token route also checks LiveKit's dispatch list first.
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';

export const DISPATCH_CLAIM_STALE_MS = 90_000;

const claimAt = sql`(${sessions.flagsJsonb}->>'voiceDispatchAt')::bigint`;

// True for exactly one of any number of concurrent callers (until released or stale).
export async function claimVoiceDispatch(sessionId: string, nowMs: number): Promise<boolean> {
  const claimed = await db.update(sessions)
    .set({ flagsJsonb: sql`COALESCE(${sessions.flagsJsonb}, '{}'::jsonb) || jsonb_build_object('voiceDispatchAt', ${nowMs}::bigint)` })
    .where(and(eq(sessions.id, sessionId), sql`(${sessions.flagsJsonb}->>'voiceDispatchAt' IS NULL OR ${claimAt} < ${nowMs - DISPATCH_CLAIM_STALE_MS})`))
    .returning({ id: sessions.id });
  return claimed.length > 0;
}

export async function releaseVoiceDispatch(sessionId: string): Promise<void> {
  await db.update(sessions)
    .set({ flagsJsonb: sql`${sessions.flagsJsonb} - 'voiceDispatchAt'` })
    .where(eq(sessions.id, sessionId));
}
