// One text turn at a time per session, and a cap on the candidate's message (security audit, 6 Nov). Before this,
// two turn requests on one session (a script, a retry, two tabs) each ran the interviewer and its background checks
// and could write duplicate turn indexes; and nothing bounded the message, which every later turn and scoring
// re-send to the models.
//
// The claim is `flags_jsonb.turnClaimAt`, set by one conditional UPDATE — atomic under Postgres row locking, as in
// lib/scoring/scoring-claim.ts and lib/voice/dispatch-claim.ts — so of two concurrent claims exactly one matches.
// The turn itself reads flags_jsonb after the claim is set and writes it back whole (plan-turn / settle-turn), so it
// carries the claim through; the release after the turn removes it, on its own token only. A claim left by a
// request that died goes stale after TURN_CLAIM_STALE_MS. The voice agent runs turns directly, not through this
// route, so voice is unaffected.
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { MAX_TURN_CHARS } from '@/lib/turn-limits';

// Longer than any turn (interviewer + checks, retries included), short enough that a dead request blocks the
// session only briefly.
export const TURN_CLAIM_STALE_MS = 120_000;
export { MAX_TURN_CHARS };

const claimAt = sql`(${sessions.flagsJsonb}->>'turnClaimAt')::bigint`;

export async function claimTurn(sessionId: string, nowMs: number): Promise<boolean> {
  const claimed = await db.update(sessions)
    .set({ flagsJsonb: sql`COALESCE(${sessions.flagsJsonb}, '{}'::jsonb) || jsonb_build_object('turnClaimAt', ${nowMs}::bigint)` })
    .where(and(eq(sessions.id, sessionId), sql`(${sessions.flagsJsonb}->>'turnClaimAt' IS NULL OR ${claimAt} < ${nowMs - TURN_CLAIM_STALE_MS})`))
    .returning({ id: sessions.id });
  return claimed.length > 0;
}

// Released only by its own turn: a turn whose stale claim was taken over leaves the new one alone.
export async function releaseTurn(sessionId: string, token: number): Promise<void> {
  await db.update(sessions)
    .set({ flagsJsonb: sql`${sessions.flagsJsonb} - 'turnClaimAt'` })
    .where(and(eq(sessions.id, sessionId), sql`${claimAt} = ${token}`));
}

export type TurnClaimDeps = {
  now: () => number;
  claim: (sessionId: string, nowMs: number) => Promise<boolean>;
  release: (sessionId: string, token: number) => Promise<void>;
};

const dbDeps: TurnClaimDeps = { now: () => Date.now(), claim: claimTurn, release: releaseTurn };

// Runs `run` only if no other turn holds the session; 'busy' (nothing run) otherwise.
export async function turnOnce<T>(
  sessionId: string,
  run: () => Promise<T>,
  deps: TurnClaimDeps = dbDeps,
): Promise<{ status: 'ran'; result: T } | { status: 'busy' }> {
  const token = deps.now();
  if (!await deps.claim(sessionId, token)) return { status: 'busy' };
  try {
    return { status: 'ran', result: await run() };
  } finally {
    await deps.release(sessionId, token);
  }
}

// The candidate's message from the request body: a non-empty string of at most MAX_TURN_CHARS, trimmed.
export function parseTurnText(body: unknown): { ok: true; text: string } | { ok: false; error: 'Empty turn' | 'Message too long' } {
  const raw = body && typeof body === 'object' ? (body as { text?: unknown }).text : undefined;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { ok: false, error: 'Empty turn' };
  if (text.length > MAX_TURN_CHARS) return { ok: false, error: 'Message too long' };
  return { ok: true, text };
}
