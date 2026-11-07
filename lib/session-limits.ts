// How many interviews a student can start (security audit, 6 Nov). Lorenzo's limits: 2 in any 24 hours and 8 a
// calendar month (UTC) per student, and a site-wide ceiling for the month (≈ 150 against his ≈ 100 planned runs) so
// no one can spend the shared AI and voice budgets for everyone. A session bounds everything paid after it: turns
// run one at a time on the case clock, scoring once (scoring-claim.ts), voice within VOICE_TTS_RUN_CAP.
//
// Users in CASE_LIMIT_EXEMPT_USER_IDS (Lorenzo's own testing) are never limited and never count toward the site
// ceiling. Scripts that call startSession directly (evals, live-run) are not limited either.
//
// The count and the insert run in one transaction under a transaction-scoped advisory lock, so two starts at once
// can't both pass a count with one left. The lock is released at commit, holds no connection between requests, and
// works through Supabase's transaction-mode pooler; it serialises every limited start site-wide, which costs
// nothing at this traffic.
import { and, count, eq, gt, gte, notInArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';

export type SessionLimits = { perDay: number; perMonth: number; sitePerMonth: number; exempt: Set<string> };
export type SessionUsage = { last24h: Date[]; month: number; siteMonth: number };
export type LimitReason = 'daily' | 'monthly' | 'site';
export type SessionDecision = { ok: true } | { ok: false; reason: LimitReason; limit: number; retryAt: Date };

const DAY_MS = 86_400_000;
const DEFAULTS = { perDay: 2, perMonth: 8, sitePerMonth: 150 };

function positiveInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function sessionLimitsFromEnv(env: Record<string, string | undefined> = process.env): SessionLimits {
  return {
    perDay: positiveInt(env.CASE_SESSIONS_PER_DAY, DEFAULTS.perDay),
    perMonth: positiveInt(env.CASE_SESSIONS_PER_MONTH, DEFAULTS.perMonth),
    sitePerMonth: positiveInt(env.CASE_SESSIONS_SITE_PER_MONTH, DEFAULTS.sitePerMonth),
    exempt: new Set((env.CASE_LIMIT_EXEMPT_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)),
  };
}

const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const nextMonthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

export function decideSessionStart(usage: SessionUsage, limits: SessionLimits, now: Date): SessionDecision {
  if (usage.siteMonth >= limits.sitePerMonth) return { ok: false, reason: 'site', limit: limits.sitePerMonth, retryAt: nextMonthStart(now) };
  if (usage.month >= limits.perMonth) return { ok: false, reason: 'monthly', limit: limits.perMonth, retryAt: nextMonthStart(now) };
  if (usage.last24h.length >= limits.perDay) {
    // Free again once enough of the window's starts are 24 hours old.
    const sorted = [...usage.last24h].sort((a, b) => a.getTime() - b.getTime());
    const freeing = sorted[usage.last24h.length - limits.perDay];
    return { ok: false, reason: 'daily', limit: limits.perDay, retryAt: new Date(freeing.getTime() + DAY_MS) };
  }
  return { ok: true };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = Pick<Tx, 'select' | 'insert' | 'execute'>;

// The session row a start creates (the opening turn and the start event follow it: start-session.ts).
export async function insertSessionRow(exec: Pick<Exec, 'insert'>, userId: string, caseId: string): Promise<string> {
  const [row] = await exec.insert(sessions).values({ userId, caseId, phase: 'INTRO' }).returning({ id: sessions.id });
  return row.id;
}

export type StartDeps<X> = {
  now: () => Date;
  locked: <T>(fn: (tx: X) => Promise<T>) => Promise<T>;
  usage: (tx: X, userId: string, now: Date, exempt: Set<string>) => Promise<SessionUsage>;
  create: (tx: X, userId: string, caseId: string) => Promise<string>;
};

// Any constant: the key of the one advisory lock every limited start takes.
const LOCK_KEY = 726_100_601;

export const sessionStartDeps: StartDeps<Exec> = {
  now: () => new Date(),
  locked: fn => db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
    return fn(tx);
  }),
  usage: async (tx, userId, now, exempt) => {
    const since = monthStart(now);
    const [recent, [mine], [site]] = await Promise.all([
      tx.select({ startedAt: sessions.startedAt }).from(sessions)
        .where(and(eq(sessions.userId, userId), gt(sessions.startedAt, new Date(now.getTime() - DAY_MS)))),
      tx.select({ n: count() }).from(sessions).where(and(eq(sessions.userId, userId), gte(sessions.startedAt, since))),
      tx.select({ n: count() }).from(sessions).where(exempt.size
        ? and(gte(sessions.startedAt, since), notInArray(sessions.userId, [...exempt]))
        : gte(sessions.startedAt, since)),
    ]);
    return { last24h: recent.map(r => r.startedAt), month: mine.n, siteMonth: site.n };
  },
  create: insertSessionRow,
};

export async function startWithinLimits<X = Exec>(
  userId: string,
  caseId: string,
  limits: SessionLimits,
  deps: StartDeps<X> = sessionStartDeps as unknown as StartDeps<X>,
): Promise<{ ok: true; sessionId: string } | Extract<SessionDecision, { ok: false }>> {
  return deps.locked(async tx => {
    if (!limits.exempt.has(userId)) {
      const decision = decideSessionStart(await deps.usage(tx, userId, deps.now(), limits.exempt), limits, deps.now());
      if (!decision.ok) return decision;
    }
    return { ok: true as const, sessionId: await deps.create(tx, userId, caseId) };
  });
}
