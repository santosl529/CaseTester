// Rate limits (Lorenzo, 8 Nov: "add rate limiting"): fixed windows counted in Postgres (`rate_limits`), one atomic
// upsert per hit, so every Vercel instance sees the same count. A limiter that can't reach the database lets the
// request through (the route's own checks still run) rather than locking every student out.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
const { RATE_LIMIT_DEFAULTS, rateRule, decideHit, hitRateLimit, clientIp, rateLimitedResponse } = await import('@/lib/rate-limit');

const NOW = new Date('2026-11-08T12:00:00Z');
const HOUR = 3_600_000;

describe('rateRule', () => {
  it("defaults (Lorenzo's go, 8 Nov): sign-ups 5/h per IP, club codes 10/h per IP, turns 20/min, voice tokens 30/h, PDFs 10/h", () => {
    expect(RATE_LIMIT_DEFAULTS).toEqual({
      signUp: { limit: 5, windowMs: HOUR, env: 'RATE_LIMIT_SIGN_UPS_PER_HOUR' },
      clubCode: { limit: 10, windowMs: HOUR, env: 'RATE_LIMIT_CLUB_CODES_PER_HOUR' },
      turn: { limit: 20, windowMs: 60_000, env: 'RATE_LIMIT_TURNS_PER_MINUTE' },
      voiceToken: { limit: 30, windowMs: HOUR, env: 'RATE_LIMIT_VOICE_TOKENS_PER_HOUR' },
      reportPdf: { limit: 10, windowMs: HOUR, env: 'RATE_LIMIT_REPORT_PDFS_PER_HOUR' },
      passwordReset: { limit: 5, windowMs: HOUR, env: 'RATE_LIMIT_PASSWORD_RESETS_PER_HOUR' },   // 10 Nov, Claude's proposal
      verifyResend: { limit: 5, windowMs: HOUR, env: 'RATE_LIMIT_VERIFY_EMAILS_PER_HOUR' },   // 11 Nov, Claude's proposal
      problemReport: { limit: 5, windowMs: HOUR, env: 'RATE_LIMIT_PROBLEM_REPORTS_PER_HOUR' },   // 14 Nov, Claude's proposal
    });
    expect(rateRule('turn', {})).toEqual({ name: 'turn', limit: 20, windowMs: 60_000 });
  });
  it('an env override; a value that is not a positive whole number keeps the default', () => {
    expect(rateRule('signUp', { RATE_LIMIT_SIGN_UPS_PER_HOUR: '12' }).limit).toBe(12);
    expect(rateRule('signUp', { RATE_LIMIT_SIGN_UPS_PER_HOUR: '0' }).limit).toBe(5);
  });
});

describe('decideHit', () => {
  const rule = { name: 'signUp', limit: 5, windowMs: HOUR };
  it('the 5th hit in the window is allowed', () => {
    expect(decideHit({ hits: 5, windowStart: new Date(NOW.getTime() - 10 * 60_000) }, rule, NOW)).toEqual({ ok: true });
  });
  it('the 6th is refused until the window ends (seconds, rounded up)', () => {
    expect(decideHit({ hits: 6, windowStart: new Date(NOW.getTime() - 10 * 60_000) }, rule, NOW)).toEqual({ ok: false, retryAfterSec: 50 * 60 });
    expect(decideHit({ hits: 6, windowStart: new Date(NOW.getTime() - HOUR + 1_500) }, rule, NOW)).toEqual({ ok: false, retryAfterSec: 2 });
  });
});

// The store as Postgres's upsert behaves: a key's window restarts once it is over.
function fakeStore() {
  const rows = new Map<string, { hits: number; windowStart: Date }>();
  return {
    rows,
    deps: {
      now: () => NOW,
      upsert: async (key: string, now: Date, windowMs: number) => {
        const r = rows.get(key);
        const next = !r || r.windowStart.getTime() <= now.getTime() - windowMs ? { hits: 1, windowStart: now } : { hits: r.hits + 1, windowStart: r.windowStart };
        rows.set(key, next);
        return next;
      },
    },
  };
}

describe('hitRateLimit', () => {
  const rule = { name: 'clubCode', limit: 3, windowMs: HOUR };
  it('counts per rule and subject: the 4th from one IP is refused, another IP is not', async () => {
    const f = fakeStore();
    for (let i = 0; i < 3; i++) expect(await hitRateLimit(rule, 'ip:1.1.1.1', f.deps)).toEqual({ ok: true });
    expect(await hitRateLimit(rule, 'ip:1.1.1.1', f.deps)).toMatchObject({ ok: false });
    expect(await hitRateLimit(rule, 'ip:2.2.2.2', f.deps)).toEqual({ ok: true });
    expect([...f.rows.keys()]).toEqual(['clubCode:ip:1.1.1.1', 'clubCode:ip:2.2.2.2']);
  });
  it('a new window starts once the old one is over', async () => {
    const f = fakeStore();
    f.rows.set('clubCode:ip:1.1.1.1', { hits: 9, windowStart: new Date(NOW.getTime() - HOUR) });
    expect(await hitRateLimit(rule, 'ip:1.1.1.1', f.deps)).toEqual({ ok: true });
  });
  it('the database unreachable: allowed (fail open), and logged', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = { now: () => NOW, upsert: async () => { throw new Error('connection refused'); } };
    expect(await hitRateLimit(rule, 'ip:1.1.1.1', deps)).toEqual({ ok: true });
    expect(err).toHaveBeenCalledWith(expect.stringContaining('rate limit'), expect.anything());
    err.mockRestore();
  });
});

describe('clientIp', () => {
  const req = (h: Record<string, string>) => new Request('http://x', { headers: h });
  it("Vercel's x-real-ip first, else the first x-forwarded-for entry, else 'unknown'", () => {
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('9.9.9.9');
    expect(clientIp(req({ 'x-forwarded-for': ' 1.1.1.1 , 2.2.2.2' }))).toBe('1.1.1.1');
    expect(clientIp(req({}))).toBe('unknown');
  });
});

describe('rateLimitedResponse', () => {
  it('429 with Retry-After and a reason the client can show', async () => {
    const res = rateLimitedResponse({ ok: false, retryAfterSec: 120 });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('120');
    expect(await res.json()).toEqual({ error: 'rate_limited', retryAfterSec: 120 });
  });
});

// The real statement (8 Nov): a Date inside a raw sql`` fragment reaches postgres-js unconverted and the query
// fails ("Received an instance of Date") — which fail-open would have hidden. Every parameter must be a plain value.
describe('the upsert statement', () => {
  it('sends no Date objects to the driver', async () => {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { rateLimitUpsertQuery } = await import('@/lib/rate-limit');
    const q = rateLimitUpsertQuery(drizzle.mock(), 'turn:user:u1', NOW, HOUR).toSQL();
    expect(q.params.filter(p => p instanceof Date)).toEqual([]);
    expect(q.params).toContain('2026-11-08T11:00:00.000Z');
  });
});
