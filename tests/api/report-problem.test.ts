// POST /api/report-problem (Lorenzo, 14 Nov): signed in only; rate-limited per student before any email; a session id
// is used only when it is the student's own; no recipient or no email key answers 503 and sends nothing.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'ann@example.com' } as { id: string; email: string } | null,
  session: null as null | { id: string; userId: string; caseId: string; status: string },
  sessionQueries: [] as unknown[],
  decision: { ok: true } as { ok: true } | { ok: false; retryAfterSec: number },
  hits: [] as string[],
  sent: [] as { to: string; subject: string; text: string; replyTo?: string }[],
  sendFails: false,
  cfg: { apiKey: 'k', from: 'CasePace <noreply@casepace.io>' } as null | { apiKey: string; from: string },
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock('@/db/client', () => ({ db: { query: { sessions: { findFirst: async (q: unknown) => { h.sessionQueries.push(q); return h.session; } } } } }));
vi.mock('@/lib/rate-limit', async () => {
  const real = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit');
  return { ...real, hitRateLimit: async (rule: { name: string }, subject: string) => { h.hits.push(`${rule.name}:${subject}`); return h.decision; } };
});
vi.mock('@/lib/email/send', () => ({
  emailConfig: () => h.cfg,
  sendEmail: async (_cfg: unknown, msg: { to: string; subject: string; text: string; replyTo?: string }) => { if (h.sendFails) throw new Error('Resend refused the email: 500'); h.sent.push(msg); },
}));

const { POST } = await import('@/app/api/report-problem/route');
const SID = '51111111-1111-4111-8111-111111111111';
const call = (body: unknown) => POST(new Request('http://x/api/report-problem', { method: 'POST', body: JSON.stringify(body) }) as never);

beforeEach(() => {
  h.user = { id: 'u1', email: 'ann@example.com' }; h.session = null; h.sessionQueries = []; h.decision = { ok: true };
  h.hits = []; h.sent = []; h.sendFails = false; h.cfg = { apiKey: 'k', from: 'CasePace <noreply@casepace.io>' };
  process.env.REPORT_EMAIL_TO = 'founders@casepace.io';
});

describe('POST /api/report-problem', () => {
  it('signed out: 401, nothing counted or sent', async () => {
    h.user = null;
    expect((await call({ message: 'hi' })).status).toBe(401);
    expect(h.hits).toEqual([]); expect(h.sent).toEqual([]);
  });
  it('emails the founders, reply-to the student, counting one hit for the student', async () => {
    const res = await call({ message: 'The report never loaded.', page: '/account' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.hits).toEqual(['problemReport:user:u1']);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ to: 'founders@casepace.io', replyTo: 'ann@example.com' });
    expect(h.sent[0].text).toContain('The report never loaded.');
  });
  it('their own session is named in the email (the lookup is scoped to the student)', async () => {
    h.session = { id: SID, userId: 'u1', caseId: 'prof-001-demo', status: 'completed' };
    await call({ message: 'Grade seems off.', sessionId: SID });
    expect(h.sessionQueries).toHaveLength(1);
    expect(h.sent[0].subject).toContain('Brew & Bean Profitability');
    expect(h.sent[0].text).toContain(SID);
  });
  it('a session that is not theirs is left out, the report still sent', async () => {
    h.session = null;
    await call({ message: 'hi', sessionId: SID });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].text).not.toContain(SID);
  });
  it('past the limit: 429 and nothing sent', async () => {
    h.decision = { ok: false, retryAfterSec: 120 };
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(429);
    expect(h.sent).toEqual([]);
  });
  it('an empty message: 400 empty_message, nothing sent', async () => {
    const res = await call({ message: '  ' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'empty_message' });
    expect(h.sent).toEqual([]);
  });
  it('no recipient or no email key: 503 report_unavailable, nothing sent', async () => {
    delete process.env.REPORT_EMAIL_TO;
    expect((await call({ message: 'hi' })).status).toBe(503);
    process.env.REPORT_EMAIL_TO = 'founders@casepace.io'; h.cfg = null;
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'report_unavailable' });
    expect(h.sent).toEqual([]);
  });
  it('Resend refuses: 503 report_unavailable', async () => {
    h.sendFails = true;
    const res = await call({ message: 'hi' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'report_unavailable' });
  });
});
