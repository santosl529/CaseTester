// Scoring waits for a math-checker verdict still running (Lorenzo, 18 Oct;
// batch 31 Marisol t19: "a 45% price increase" — its verdict landed after
// the close). Score pressed at once: the verdict is in the report.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type Row = { category: string; subtype: string; turnIndex: number | null; payloadJsonb: unknown };
const fixture = JSON.parse(readFileSync(path.join(__dirname, '../fixtures/marisol-b31-checker-rows.json'), 'utf8')) as { rows: Row[] };
const isT19Verdict = (r: Row) => r.category === 'math_checker' && r.subtype === 'verdict' && (r.payloadJsonb as { candidateTurnIndex: number }).candidateTurnIndex === 19;

const h = vi.hoisted(() => ({ rows: [] as unknown[], events: [] as unknown[][], scoredWith: null as string | null, user: { id: 'u1' } as { id: string } | null }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock('@/db/client', () => ({ db: { query: {
  sessions: { findFirst: async () => ({ id: 's1', userId: 'u1', status: 'completed' }) },
  sessionEvents: { findMany: async () => [...h.rows] },
} } }));
vi.mock('@/lib/analytics', () => ({ logEvent: async (...a: unknown[]) => { h.events.push(a); } }));
// The report's checker section, as scoring would read it at that moment.
vi.mock('@/lib/scoring/score-session', async () => {
  const { formatCheckerSection } = await import('@/lib/scoring/checker-record');
  return { scoreSession: async () => { h.scoredWith = formatCheckerSection(h.rows as never); return { status: 'scored' }; } };
});

const { POST: score } = await import('@/app/api/channel/[sessionId]/score/route');
const { POST: finalize } = await import('@/app/api/channel/[sessionId]/finalize/route');
const { pendingCheckerTurns, waitForCheckerVerdicts } = await import('@/lib/scoring/checker-wait');
const call = (route: (r: never, c: { params: Promise<{ sessionId: string }> }) => Promise<Response>) => route(new Request('http://x', { method: 'POST' }) as never, { params: Promise.resolve({ sessionId: 's1' }) });

beforeEach(() => { h.rows = fixture.rows.filter(r => !isT19Verdict(r)); h.events.length = 0; h.scoredWith = null; h.user = { id: 'u1' }; });
afterEach(() => { vi.useRealTimers(); });

describe('pending checks', () => {
  it('the closing message\'s check started, its verdict not yet written: t19 pending', () => {
    expect(pendingCheckerTurns(h.rows as Row[])).toEqual([19]);
    expect(pendingCheckerTurns(fixture.rows)).toEqual([]);
  });
});

describe('Score pressed right after the close (Marisol t19\'s shape)', () => {
  it('the route waits for the verdict; the report has t19\'s "45%"', async () => {
    setTimeout(() => { h.rows.push(...fixture.rows.filter(isT19Verdict)); }, 700);   // lands 0.7s after the press
    const t0 = Date.now();
    const res = await call(score);
    expect(res.status).toBe(200);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(650);
    expect(h.scoredWith).toMatch(/turn 19: "a 45% price increase" — WRONG/);
    expect(h.events.some(e => e[0] === 'checker_wait_timeout')).toBe(false);
  });
  it('…finalize reports what it waited for (the "Finalizing your report…" state)', async () => {
    setTimeout(() => { h.rows.push(...fixture.rows.filter(isT19Verdict)); }, 300);
    const body = await (await call(finalize)).json();
    expect(body).toMatchObject({ pending: 0, timedOut: false });
    expect(body.waitedMs).toBeGreaterThanOrEqual(250);
  });
  it('a verdict that never lands: scoring goes ahead after 30s, the timeout logged', async () => {
    vi.useFakeTimers();
    const done = call(score);
    await vi.advanceTimersByTimeAsync(31_000);
    expect((await done).status).toBe(200);
    expect(h.events).toContainEqual(['checker_wait_timeout', expect.objectContaining({ pending: [19] }), { sessionId: 's1', userId: 'u1' }]);
    expect(h.scoredWith).not.toMatch(/turn 19:/);
  });
  it('nothing pending: no wait', async () => {
    h.rows = [...fixture.rows];
    const w = await waitForCheckerVerdicts(async () => h.rows as Row[]);
    expect(w).toEqual({ pending: [], waitedMs: expect.any(Number), timedOut: false });
    expect(w.waitedMs).toBeLessThan(50);
  });
});
