// One scoring pass per session (site flow, 19 Oct; main 58911e63, brought to the Phase 1 branch with 4.11). The score
// route was idempotent only after a score existed: two calls inside the minutes a pass takes (two tabs, a double
// click, "Prepare my report" beside the end screen) both ran the Opus passes and both inserted a score row. Now the
// first call claims the session (`flags_jsonb.scoringClaimAt`, set by one conditional UPDATE — Postgres row locking
// makes it atomic, so of two concurrent claims exactly one matches); a second call waits for that pass's score.
//
// Phase 1 4.11 (Lorenzo, 22 Oct: "Scoring: retry with backoff when the scoring stream dies", inside this claim;
// his ruling: "approved with no switch only if a retry can NEVER write a second report"). A stream that dies is
// retried inside the pass (stream-retry.ts), so a pass can run longer than before. Two guards keep it to one report:
//   - the pass keeps its claim alive while it runs (`scoringClaimBeat`, renewed every CLAIM_BEAT_MS): a claim is
//     stale only when its last beat is older than SCORING_CLAIM_STALE_MS, so no second caller takes over a pass
//     that is still retrying;
//   - the score row is written only while the claim is still this pass's own (`storeIfClaimed`: one transaction
//     that locks the session row on the claim token, then inserts) — a pass whose claim was taken over writes
//     nothing, and a second claimer blocks on the lock until the first row has committed, then finds it scored.
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { scores, sessions } from '@/db/schema';

// A claim whose last beat is older than this belongs to a pass that died: the score route's maxDuration is 300s,
// and a live pass beats every CLAIM_BEAT_MS.
export const SCORING_CLAIM_STALE_MS = 6 * 60_000;
export const CLAIM_BEAT_MS = 60_000;
const WAIT_MS = 270_000; // inside the route's 300s, after the checker wait
const POLL_MS = 3_000;

// The pass's hold on the session: `token` is the claim's `scoringClaimAt`, fixed for the pass.
export type ScoringClaim = { sessionId: string; token: number };

export type ScoreOnceDeps = {
  claim: (sessionId: string, nowMs: number) => Promise<boolean>;
  release: (sessionId: string, token: number) => Promise<void>;
  scored: (sessionId: string) => Promise<boolean>;
  beat: (sessionId: string, token: number, nowMs: number) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  every: (ms: number, fn: () => void) => () => void;   // a repeating timer; returns its cancel
  waitMs?: number;
};

const claimAt = sql`(${sessions.flagsJsonb}->>'scoringClaimAt')::bigint`;
const lastBeat = sql`COALESCE((${sessions.flagsJsonb}->>'scoringClaimBeat')::bigint, ${claimAt})`;

export async function claimScoring(sessionId: string, nowMs: number): Promise<boolean> {
  const claimed = await db.update(sessions)
    .set({ flagsJsonb: sql`${sessions.flagsJsonb} || jsonb_build_object('scoringClaimAt', ${nowMs}::bigint, 'scoringClaimBeat', ${nowMs}::bigint)` })
    .where(and(eq(sessions.id, sessionId), sql`(${sessions.flagsJsonb}->>'scoringClaimAt' IS NULL OR ${lastBeat} < ${nowMs - SCORING_CLAIM_STALE_MS})`))
    .returning({ id: sessions.id });
  return claimed.length > 0;
}

// The claim's beat, only while it is still this pass's (the token matches).
export async function beatScoring(sessionId: string, token: number, nowMs: number): Promise<boolean> {
  const beat = await db.update(sessions)
    .set({ flagsJsonb: sql`${sessions.flagsJsonb} || jsonb_build_object('scoringClaimBeat', ${nowMs}::bigint)` })
    .where(and(eq(sessions.id, sessionId), sql`${claimAt} = ${token}`))
    .returning({ id: sessions.id });
  return beat.length > 0;
}

// Released only by its own pass: a pass whose claim was taken over leaves the new one alone.
export async function releaseScoring(sessionId: string, token: number): Promise<void> {
  await db.update(sessions)
    .set({ flagsJsonb: sql`${sessions.flagsJsonb} - 'scoringClaimAt' - 'scoringClaimBeat'` })
    .where(and(eq(sessions.id, sessionId), sql`${claimAt} = ${token}`));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
// The score row, written only while the claim is this pass's: the session row is locked on the claim token for the
// transaction (a no-op UPDATE), so a concurrent claim waits for the commit. False: the claim was lost, nothing written.
export async function storeIfClaimed(claim: ScoringClaim, write: (tx: Tx) => Promise<void>): Promise<boolean> {
  return db.transaction(async tx => {
    const own = await tx.update(sessions)
      .set({ flagsJsonb: sql`${sessions.flagsJsonb}` })
      .where(and(eq(sessions.id, claim.sessionId), sql`${claimAt} = ${claim.token}`))
      .returning({ id: sessions.id });
    if (own.length === 0) return false;
    await write(tx);
    return true;
  });
}

const dbDeps: ScoreOnceDeps = {
  claim: claimScoring,
  release: releaseScoring,
  beat: beatScoring,
  scored: async sessionId => Boolean(await db.query.scores.findFirst({ where: eq(scores.sessionId, sessionId), columns: { id: true } })),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  now: () => Date.now(),
  every: (ms, fn) => { const t = setInterval(fn, ms); return () => clearInterval(t); },
};

// Runs `score` at most once at a time per session: 'scored' when this call ran it, 'already_scored' when a score
// exists (now or after waiting for another pass), 'in_progress' when another pass outlived the wait. The claim stays
// alive (its beat) while `score` runs, retries included.
export async function scoreOnce(
  sessionId: string,
  score: (claim: ScoringClaim) => Promise<void>,
  deps: ScoreOnceDeps = dbDeps,
): Promise<'scored' | 'already_scored' | 'in_progress'> {
  const deadline = deps.now() + (deps.waitMs ?? WAIT_MS);
  let token: number;
  for (;;) {
    if (await deps.scored(sessionId)) return 'already_scored';
    const at = deps.now();
    if (await deps.claim(sessionId, at)) { token = at; break; }
    if (deps.now() >= deadline) return 'in_progress';
    await deps.sleep(POLL_MS);
  }
  const stop = deps.every(CLAIM_BEAT_MS, () => { void deps.beat(sessionId, token, deps.now()).catch(() => {}); });
  try {
    // A pass that finished between the check and the claim.
    if (await deps.scored(sessionId)) return 'already_scored';
    await score({ sessionId, token });
    return 'scored';
  } finally {
    stop();
    await deps.release(sessionId, token);
  }
}
