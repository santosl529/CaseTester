// One scoring pass per session (site flow, 19 Oct). The score route was
// idempotent only after a score existed: two calls inside the minutes a pass
// takes (two tabs, a double click, "Prepare my report" beside the end screen)
// both ran the Opus passes and both inserted a score row. Now the first call
// claims the session (`flags_jsonb.scoringClaimAt`, set by one conditional
// UPDATE — Postgres row locking makes it atomic, so of two concurrent claims
// exactly one matches); a second call waits for that pass's score.
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { scores, sessions } from '@/db/schema';

// A claim older than this belongs to a pass that died: the score route's
// maxDuration is 300s, so no live pass is older.
export const SCORING_CLAIM_STALE_MS = 6 * 60_000;
const WAIT_MS = 270_000; // inside the route's 300s, after the checker wait
const POLL_MS = 3_000;

export type ScoreOnceDeps = {
  claim: (sessionId: string, nowMs: number) => Promise<boolean>;
  release: (sessionId: string) => Promise<void>;
  scored: (sessionId: string) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  waitMs?: number;
};

export async function claimScoring(sessionId: string, nowMs: number): Promise<boolean> {
  const claimed = await db.update(sessions)
    .set({ flagsJsonb: sql`${sessions.flagsJsonb} || jsonb_build_object('scoringClaimAt', ${nowMs}::bigint)` })
    .where(and(
      eq(sessions.id, sessionId),
      sql`(${sessions.flagsJsonb}->>'scoringClaimAt' IS NULL OR (${sessions.flagsJsonb}->>'scoringClaimAt')::bigint < ${nowMs - SCORING_CLAIM_STALE_MS})`,
    ))
    .returning({ id: sessions.id });
  return claimed.length > 0;
}

export async function releaseScoring(sessionId: string): Promise<void> {
  await db.update(sessions)
    .set({ flagsJsonb: sql`${sessions.flagsJsonb} - 'scoringClaimAt'` })
    .where(eq(sessions.id, sessionId));
}

const dbDeps: ScoreOnceDeps = {
  claim: claimScoring,
  release: releaseScoring,
  scored: async sessionId => Boolean(await db.query.scores.findFirst({ where: eq(scores.sessionId, sessionId), columns: { id: true } })),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

// Runs `score` at most once at a time per session: 'scored' when this call
// ran it, 'already_scored' when a score exists (now or after waiting for
// another pass), 'in_progress' when another pass outlived the wait.
export async function scoreOnce(
  sessionId: string,
  score: () => Promise<void>,
  deps: ScoreOnceDeps = dbDeps,
): Promise<'scored' | 'already_scored' | 'in_progress'> {
  const deadline = deps.now() + (deps.waitMs ?? WAIT_MS);
  for (;;) {
    if (await deps.scored(sessionId)) return 'already_scored';
    if (await deps.claim(sessionId, deps.now())) break;
    if (deps.now() >= deadline) return 'in_progress';
    await deps.sleep(POLL_MS);
  }
  try {
    // A pass that finished between the check and the claim.
    if (await deps.scored(sessionId)) return 'already_scored';
    await score();
    return 'scored';
  } finally {
    await deps.release(sessionId);
  }
}
