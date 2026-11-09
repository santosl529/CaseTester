// How many interviews a student can start (security audit, 6 Nov; Lorenzo: 2 a day, 8 a month), and a site-wide
// monthly ceiling so no one can spend the shared AI and voice budgets for everyone. Exempt users (Lorenzo's own
// testing) are never limited and never counted toward the site ceiling.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
const { decideSessionStart, sessionLimitsFromEnv, startWithinLimits } = await import('@/lib/session-limits');

const NOW = new Date('2026-11-06T18:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const limits = { perDay: 2, perMonth: 8, sitePerMonth: 150, maxInProgress: 5, exempt: new Set(['admin']) };

describe('sessionLimitsFromEnv', () => {
  it('defaults: 2 a day, 8 a month, 150 site-wide a month, 5 in progress at once, nobody exempt', () => {
    expect(sessionLimitsFromEnv({})).toEqual({ perDay: 2, perMonth: 8, sitePerMonth: 150, maxInProgress: 5, exempt: new Set() });
  });
  it('overrides and the exempt list from the environment', () => {
    const l = sessionLimitsFromEnv({ CASE_SESSIONS_PER_DAY: '3', CASE_SESSIONS_PER_MONTH: '10', CASE_SESSIONS_SITE_PER_MONTH: '200', CASE_MAX_IN_PROGRESS: '7', CASE_LIMIT_EXEMPT_USER_IDS: ' a , b ' });
    expect(l).toEqual({ perDay: 3, perMonth: 10, sitePerMonth: 200, maxInProgress: 7, exempt: new Set(['a', 'b']) });
  });
  it('a value that is not a positive whole number keeps the default', () => {
    expect(sessionLimitsFromEnv({ CASE_SESSIONS_PER_DAY: 'abc', CASE_SESSIONS_PER_MONTH: '-1', CASE_SESSIONS_SITE_PER_MONTH: '0' })).toMatchObject({ perDay: 2, perMonth: 8, sitePerMonth: 150 });
  });
});

describe('decideSessionStart', () => {
  const usage = (o: Partial<{ last24h: Date[]; month: number; siteMonth: number; inProgress: number }> = {}) => ({ last24h: [], month: 0, siteMonth: 0, inProgress: 0, ...o });

  it('under every limit: allowed', () => {
    expect(decideSessionStart(usage({ last24h: [hoursAgo(3)], month: 4, siteMonth: 60 }), limits, NOW)).toEqual({ ok: true });
  });
  it('2 started in the last 24 hours: refused until the older one is 24 hours old', () => {
    const d = decideSessionStart(usage({ last24h: [hoursAgo(20), hoursAgo(2)], month: 2 }), limits, NOW);
    expect(d).toEqual({ ok: false, reason: 'daily', limit: 2, retryAt: new Date(hoursAgo(20).getTime() + 24 * 3_600_000) });
  });
  it('8 this month: refused until the 1st of next month (UTC)', () => {
    expect(decideSessionStart(usage({ month: 8 }), limits, NOW)).toEqual({ ok: false, reason: 'monthly', limit: 8, retryAt: new Date('2026-12-01T00:00:00Z') });
  });
  it('the site has had 150 this month: refused for everyone', () => {
    expect(decideSessionStart(usage({ siteMonth: 150 }), limits, NOW)).toEqual({ ok: false, reason: 'site', limit: 150, retryAt: new Date('2026-12-01T00:00:00Z') });
  });
  it('5 interviews in progress on the site (Lorenzo, 7 Nov): refused as busy, retry in a few minutes', () => {
    expect(decideSessionStart(usage({ inProgress: 5 }), limits, NOW)).toEqual({ ok: false, reason: 'busy', limit: 5, retryAt: new Date(NOW.getTime() + 5 * 60_000) });
  });
  it('4 in progress: allowed', () => {
    expect(decideSessionStart(usage({ inProgress: 4 }), limits, NOW)).toEqual({ ok: true });
  });
  it("the student's own monthly limit is reported before busy (busy passes; the limit doesn't)", () => {
    expect(decideSessionStart(usage({ inProgress: 5, month: 8 }), limits, NOW)).toMatchObject({ reason: 'monthly' });
  });
  it('December rolls over to January', () => {
    const dec = new Date('2026-12-31T23:00:00Z');
    expect(decideSessionStart(usage({ month: 8 }), limits, dec)).toMatchObject({ retryAt: new Date('2027-01-01T00:00:00Z') });
  });
});

// The check and the insert under one lock: of two starts at once with one left, exactly one gets through.
function fakeStore(rows: { userId: string; startedAt: Date; status?: string }[] = []) {
  let chain = Promise.resolve();
  const deps = {
    now: () => NOW,
    locked: <T>(fn: (tx: unknown) => Promise<T>) => {
      const run = chain.then(() => fn('tx'));
      chain = run.then(() => {}, () => {});
      return run;
    },
    usage: async (_tx: unknown, userId: string, now: Date, exempt: Set<string>) => {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const read = {
        last24h: rows.filter(r => r.userId === userId && r.startedAt > new Date(now.getTime() - 86_400_000)).map(r => r.startedAt),
        month: rows.filter(r => r.userId === userId && r.startedAt >= monthStart).length,
        siteMonth: rows.filter(r => !exempt.has(r.userId) && r.startedAt >= monthStart).length,
        inProgress: rows.filter(r => !exempt.has(r.userId) && (r.status ?? 'active') === 'active' && r.startedAt > new Date(now.getTime() - 600_000)).length,
      };
      // The round trip back: without the lock, a second caller reads the same count before this one inserts.
      await new Promise(r => setTimeout(r, 5));
      return read;
    },
    create: async (_tx: unknown, userId: string) => { rows.push({ userId, startedAt: NOW }); return `s${rows.length}`; },
  };
  return { rows, deps };
}

describe('startWithinLimits', () => {
  it('allowed: the session row is created', async () => {
    const f = fakeStore();
    expect(await startWithinLimits('u1', 'prof-001', limits, f.deps)).toEqual({ ok: true, sessionId: 's1' });
    expect(f.rows).toHaveLength(1);
  });
  it('refused: nothing created', async () => {
    const f = fakeStore([{ userId: 'u1', startedAt: hoursAgo(1) }, { userId: 'u1', startedAt: hoursAgo(2) }]);
    expect(await startWithinLimits('u1', 'prof-001', limits, f.deps)).toMatchObject({ ok: false, reason: 'daily' });
    expect(f.rows).toHaveLength(2);
  });
  it('two starts at once with one left today: exactly one is created', async () => {
    const f = fakeStore([{ userId: 'u1', startedAt: hoursAgo(1) }]);
    const results = await Promise.all([startWithinLimits('u1', 'prof-001', limits, f.deps), startWithinLimits('u1', 'prof-001', limits, f.deps)]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(f.rows.filter(r => r.userId === 'u1')).toHaveLength(2);
  });
  it('an exempt user is never limited', async () => {
    const f = fakeStore(Array.from({ length: 20 }, () => ({ userId: 'admin', startedAt: hoursAgo(1) })));
    expect(await startWithinLimits('admin', 'prof-001', limits, f.deps)).toMatchObject({ ok: true });
  });
  it("exempt users' sessions don't count toward the site ceiling", async () => {
    const f = fakeStore(Array.from({ length: 150 }, () => ({ userId: 'admin', startedAt: hoursAgo(1) })));
    expect(await startWithinLimits('u1', 'prof-001', limits, f.deps)).toMatchObject({ ok: true });
  });
  it('two different students start at once with one slot left: exactly one gets it, the other is told busy', async () => {
    const f = fakeStore(['a', 'b', 'c', 'd'].map(userId => ({ userId, startedAt: NOW })));
    const results = await Promise.all([startWithinLimits('u1', 'prof-001', limits, f.deps), startWithinLimits('u2', 'prof-001', limits, f.deps)]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.filter(r => !r.ok)).toEqual([expect.objectContaining({ reason: 'busy' })]);
  });
  it('finished interviews free their slot', async () => {
    const f = fakeStore(['a', 'b', 'c', 'd', 'e'].map(userId => ({ userId, startedAt: NOW, status: 'completed' })));
    expect(await startWithinLimits('u1', 'prof-001', limits, f.deps)).toMatchObject({ ok: true });
  });
  it("exempt users (Lorenzo's testing) neither take a slot nor are refused one", async () => {
    const f = fakeStore(Array.from({ length: 5 }, () => ({ userId: 'admin', startedAt: NOW })));
    expect(await startWithinLimits('u1', 'prof-001', limits, f.deps)).toMatchObject({ ok: true });
    const full = fakeStore(['a', 'b', 'c', 'd', 'e'].map(userId => ({ userId, startedAt: NOW })));
    expect(await startWithinLimits('admin', 'prof-001', limits, full.deps)).toMatchObject({ ok: true });
  });
});
