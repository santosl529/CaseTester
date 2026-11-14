// The routes behind a rate limit (8 Nov): past the limit each answers 429 with Retry-After before doing any work
// that costs money or CPU; under it, each counts one hit for the right rule and subject.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  decision: { ok: true } as { ok: true } | { ok: false; retryAfterSec: number },
  hits: [] as string[],
  work: [] as string[],
}));
// Voice consent on file unless a test says otherwise (lib/voice/consent.ts).
vi.mock('@/lib/voice/consent', () => ({ voiceConsentFor: async () => (globalThis as { __noVoiceConsent?: boolean }).__noVoiceConsent !== true }));
vi.mock('@/lib/rate-limit', async () => {
  const real = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit');
  return { ...real, hitRateLimit: async (rule: { name: string }, subject: string) => { h.hits.push(`${rule.name}:${subject}`); return h.decision; } };
});
vi.mock('next/server', async () => ({ ...(await vi.importActual<object>('next/server')), after: () => {} }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }) }));
vi.mock('@/db/client', () => ({ db: { query: { sessions: { findFirst: async () => ({ id: '51111111-1111-4111-8111-111111111111', userId: 'u1', caseId: 'prof-001', status: 'active' }) } } } }));
vi.mock('@/lib/club', () => ({ clubOrgId: (c: string) => (c === 'ALPHA' ? 'ALPHA' : null), assignClub: async () => { h.work.push('assignClub'); return { changed: true, from: null }; } }));
vi.mock('@/lib/orchestrator/post-turn', () => ({ runPostTurnBackground: async () => {} }));
vi.mock('@/lib/orchestrator/session-runner', () => ({ runTurn: async () => { h.work.push('runTurn'); return { interviewerText: 'ok', ended: false, exhibit: null }; } }));
vi.mock('@/lib/orchestrator/turn-claim', async () => {
  const real = await vi.importActual<typeof import('@/lib/orchestrator/turn-claim')>('@/lib/orchestrator/turn-claim');
  return { ...real, turnOnce: async (_id: string, run: () => Promise<unknown>) => ({ status: 'ran', result: await run() }) };
});
vi.mock('@/app/api/report/[sessionId]/pdf/render', () => ({ renderReportPdf: async () => { h.work.push('renderReportPdf'); return { buffer: Buffer.from('%PDF'), filename: 'r.pdf' }; } }));
vi.mock('@/lib/voice/room-lifecycle', () => ({ roomAdminFromEnv: () => { h.work.push('livekit'); return null; }, closeVoiceRoom: async () => {} }));

const { POST: club } = await import('@/app/api/club/route');
const { POST: turn } = await import('@/app/api/channel/[sessionId]/turn/route');
const { POST: token } = await import('@/app/api/voice/[sessionId]/token/route');
const { GET: pdf } = await import('@/app/api/report/[sessionId]/pdf/route');

const ctx = { params: Promise.resolve({ sessionId: '51111111-1111-4111-8111-111111111111' }) };
const req = (body?: unknown) => new Request('http://x', { method: 'POST', headers: { 'x-real-ip': '9.9.9.9' }, body: body === undefined ? undefined : JSON.stringify(body) }) as never;

const routes = [
  { name: 'club code', call: () => club(req({ clubCode: 'ALPHA' })), hit: 'clubCode:ip:9.9.9.9', work: 'assignClub' },
  { name: 'turn', call: () => turn(req({ text: 'hello' }), ctx), hit: 'turn:user:u1', work: 'runTurn' },
  { name: 'voice token', call: () => token(req(), ctx), hit: 'voiceToken:user:u1', work: 'livekit' },
  { name: 'report PDF', call: () => pdf(req(), ctx), hit: 'reportPdf:user:u1', work: 'renderReportPdf' },
];

beforeEach(() => { h.decision = { ok: true }; h.hits = []; h.work = []; });

describe.each(routes)('$name', r => {
  it('under the limit: one hit counted for the right rule and subject, and the work runs', async () => {
    await r.call();
    expect(h.hits).toEqual([r.hit]);
    expect(h.work).toContain(r.work);
  });
  it('past the limit: 429 with Retry-After, and nothing runs', async () => {
    h.decision = { ok: false, retryAfterSec: 90 };
    const res = await r.call();
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('90');
    expect(await res.json()).toEqual({ error: 'rate_limited', retryAfterSec: 90 });
    expect(h.work).toEqual([]);
  });
});
