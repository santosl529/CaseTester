// Rate limits (Lorenzo, 8 Nov: "add rate limiting"; numbers his go, 8 Nov). A fixed window per rule and subject
// (an IP for sign-ups and club codes, a user for the rest), counted in Postgres by one atomic upsert so every Vercel
// instance sees the same count. Past the limit a route answers 429 with Retry-After (rateLimitedResponse).
//
// If the database can't be reached the request is let through and the error logged: the routes' own checks (and
// the start limits, the one-turn-at-a-time claim) still apply, and a limiter outage shouldn't lock every student out.
// Sign-in itself goes from the browser straight to Supabase, whose own auth rate limits cover it.
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { rateLimits } from '@/db/schema';

const HOUR = 3_600_000;

export const RATE_LIMIT_DEFAULTS = {
  signUp: { limit: 5, windowMs: HOUR, env: 'RATE_LIMIT_SIGN_UPS_PER_HOUR' },
  clubCode: { limit: 10, windowMs: HOUR, env: 'RATE_LIMIT_CLUB_CODES_PER_HOUR' },
  turn: { limit: 20, windowMs: 60_000, env: 'RATE_LIMIT_TURNS_PER_MINUTE' },
  voiceToken: { limit: 30, windowMs: HOUR, env: 'RATE_LIMIT_VOICE_TOKENS_PER_HOUR' },
  reportPdf: { limit: 10, windowMs: HOUR, env: 'RATE_LIMIT_REPORT_PDFS_PER_HOUR' },
  passwordReset: { limit: 5, windowMs: HOUR, env: 'RATE_LIMIT_PASSWORD_RESETS_PER_HOUR' },
  verifyResend: { limit: 5, windowMs: HOUR, env: 'RATE_LIMIT_VERIFY_EMAILS_PER_HOUR' },
} as const;
export type RateRuleName = keyof typeof RATE_LIMIT_DEFAULTS;
export type RateRule = { name: string; limit: number; windowMs: number };
export type RateDecision = { ok: true } | { ok: false; retryAfterSec: number };

export function rateRule(name: RateRuleName, env: Record<string, string | undefined> = process.env): RateRule {
  const d = RATE_LIMIT_DEFAULTS[name];
  const n = Number(env[d.env]);
  return { name, limit: Number.isInteger(n) && n > 0 ? n : d.limit, windowMs: d.windowMs };
}

export function decideHit(row: { hits: number; windowStart: Date }, rule: RateRule, now: Date): RateDecision {
  if (row.hits <= rule.limit) return { ok: true };
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((row.windowStart.getTime() + rule.windowMs - now.getTime()) / 1000)) };
}

export type RateDeps = {
  now: () => Date;
  upsert: (key: string, now: Date, windowMs: number) => Promise<{ hits: number; windowStart: Date }>;
};

// One statement: a new key or an expired window starts at 1, otherwise the count goes up by one.
export function rateLimitUpsertQuery(exec: Pick<typeof db, 'insert'>, key: string, now: Date, windowMs: number) {
  // Timestamps go in as ISO text with a cast: postgres-js can't send a raw Date inside a sql`` fragment.
  const at = sql`${now.toISOString()}::timestamptz`;
  const expired = sql`${rateLimits.windowStart} <= ${new Date(now.getTime() - windowMs).toISOString()}::timestamptz`;
  return exec.insert(rateLimits).values({ key, windowStart: now, hits: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        hits: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.hits} + 1 END`,
        windowStart: sql`CASE WHEN ${expired} THEN ${at} ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning({ hits: rateLimits.hits, windowStart: rateLimits.windowStart });
}

const dbDeps: RateDeps = {
  now: () => new Date(),
  upsert: async (key, now, windowMs) => (await rateLimitUpsertQuery(db, key, now, windowMs))[0],
};

// Count one hit for `subject` ('ip:<ip>' or 'user:<id>') under `rule`.
export async function hitRateLimit(rule: RateRule, subject: string, deps: RateDeps = dbDeps): Promise<RateDecision> {
  const now = deps.now();
  try {
    return decideHit(await deps.upsert(`${rule.name}:${subject}`, now, rule.windowMs), rule, now);
  } catch (err) {
    console.error(`rate limit ${rule.name} unavailable; letting the request through`, err);
    return { ok: true };
  }
}

// The caller's IP on Vercel (which sets both headers itself); 'unknown' locally.
export function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first || 'unknown';
}

export function rateLimitedResponse(d: Extract<RateDecision, { ok: false }>): NextResponse {
  return NextResponse.json({ error: 'rate_limited', retryAfterSec: d.retryAfterSec }, { status: 429, headers: { 'Retry-After': String(d.retryAfterSec) } });
}
