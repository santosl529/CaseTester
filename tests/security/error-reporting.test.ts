// Error reporting (Matt, 17 Nov, pre-pilot audit M4): reports carry the student's account id and the page, never
// personal data or answer text, and errors a route wrapper swallows are still reported.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrubBreadcrumb, scrubEvent } from '@/lib/monitoring/scrub';
import { userIdFromCookie } from '@/lib/monitoring/user-from-cookie';
import { sentryOptions } from '@/lib/monitoring/sentry-options';

const ID = '0b7c8a52-3f1e-4c2a-9d0e-5a1b2c3d4e5f';
const b64url = (s: string) => Buffer.from(s).toString('base64url');
const jwt = (payload: object) => `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(payload))}.sig`;
const sessionCookie = (name = 'sb-abc-auth-token') => `${name}=base64-${b64url(JSON.stringify({ access_token: jwt({ sub: ID, email: 'ann@school.edu' }), user: { email: 'ann@school.edu' } }))}`;

describe('what a report may carry', () => {
  const event = {
    user: { id: ID, email: 'ann@school.edu', username: 'Ann', ip_address: '1.2.3.4' },
    request: { url: 'https://casepace.io/case/x/report?email=ann@school.edu', method: 'POST', data: '{"text":"My answer: revenue fell 12%"}', cookies: { sb: 'secret' }, query_string: 'email=ann@school.edu', headers: { cookie: 'sb=secret', 'user-agent': 'Safari', authorization: 'Bearer x' } },
    breadcrumbs: [
      { category: 'console', message: 'candidate typed: my answer' },
      { category: 'ui.input', message: 'textarea' },
      { category: 'fetch', data: { url: '/api/channel/x/turn?draft=1', method: 'POST', status_code: 500, request_body: 'My answer', response_body: 'x' } },
      { category: 'navigation', data: { from: '/sign-in?next=/drills', to: '/drills' } },
    ],
    exception: { values: [{ type: 'Error', value: 'No account for ann@school.edu' }] },
    extra: { body: 'My answer' },
    tags: {},
  };
  const out = scrubEvent(event);
  it('the account id only: no email, name or address', () => { expect(out.user).toEqual({ id: ID }); });
  it('no request body, cookies, query string or headers but the browser', () => {
    expect(out.request).toEqual({ url: 'https://casepace.io/case/x/report', method: 'POST', headers: { 'user-agent': 'Safari' } });
  });
  it('no console lines or typed input; network crumbs keep the address, method and status only', () => {
    expect(out.breadcrumbs).toEqual([
      { category: 'fetch', data: { url: '/api/channel/x/turn', method: 'POST', status_code: 500 } },
      { category: 'navigation', data: { from: '/sign-in', to: '/drills' } },
    ]);
  });
  it('no extra data; emails in the error text blanked', () => {
    expect(out.extra).toBeUndefined();
    expect(out.exception?.values?.[0].value).toBe('No account for [email]');
  });
  it('tagged with the page', () => { expect((out.tags as Record<string, unknown> | undefined)?.page).toBe('/case/x/report'); });
  it('nothing in the scrubbed report mentions the email or the answer', () => {
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/ann@school\.edu|My answer|secret|Bearer/);
  });
  it('a crumb on its own: the same rules', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'x' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'xhr', data: { url: '/a?b=c', request_body: 'x' } })).toEqual({ category: 'xhr', data: { url: '/a' } });
  });
});

describe('the account id from the session cookie', () => {
  it('reads the id (and nothing else) from the Supabase cookie', () => { expect(userIdFromCookie(`other=1; ${sessionCookie()}`)).toBe(ID); });
  it('a cookie split into chunks', () => {
    const value = sessionCookie().split('=').slice(1).join('=');
    const half = Math.floor(value.length / 2);
    expect(userIdFromCookie(`sb-abc-auth-token.0=${value.slice(0, half)}; sb-abc-auth-token.1=${value.slice(half)}`)).toBe(ID);
  });
  it('no cookie, another cookie, or a broken one: none', () => {
    expect(userIdFromCookie(undefined)).toBeNull();
    expect(userIdFromCookie('theme=dark')).toBeNull();
    expect(userIdFromCookie('sb-abc-auth-token=base64-!!!')).toBeNull();
  });
});

describe('Sentry settings', () => {
  it('off without a DSN; no personal data, no tracing', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    expect(sentryOptions()).toMatchObject({ enabled: false, sendDefaultPii: false, tracesSampleRate: 0 });
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://k@o1.ingest.sentry.io/1');
    expect(sentryOptions()).toMatchObject({ enabled: true, dsn: 'https://k@o1.ingest.sentry.io/1' });
    vi.unstubAllEnvs();
  });
});

// A route wrapper answers 500 itself; the error still reaches Sentry, with the account id and page.
const sent = vi.hoisted(() => ({ errors: [] as unknown[], user: null as unknown, page: null as unknown }));
vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (s: { setUser: (u: unknown) => void; setTag: (k: string, v: unknown) => void }) => void) => fn({ setUser: u => { sent.user = u; }, setTag: (_k, v) => { sent.page = v; } }),
  captureException: (e: unknown) => { sent.errors.push(e); },
  captureRequestError: (e: unknown) => { sent.errors.push(e); },
}));
describe('route errors are reported', () => {
  beforeEach(() => { sent.errors = []; sent.user = null; sent.page = null; });
  it('jsonRoute: 500 for the student, the error to Sentry with the id and page', async () => {
    const { jsonRoute } = await import('@/lib/http/route-guard');
    const route = jsonRoute(async (req: Request) => { void req; throw new Error("boom"); });
    const res = await route(new Request('https://casepace.io/api/drills/sets?x=1', { headers: { cookie: sessionCookie() } }));
    expect(res.status).toBe(500);
    expect((sent.errors[0] as Error).message).toBe('boom');
    expect(sent.user).toEqual({ id: ID });
    expect(sent.page).toBe('/api/drills/sets');
  });
  it("Next's onRequestError: reported with the id and page", async () => {
    const { onRequestError } = await import('@/instrumentation');
    await onRequestError(new Error('page boom'), { path: '/drills?x=1', method: 'GET', headers: { cookie: sessionCookie() } }, { routerKind: 'App Router', routePath: '/drills', routeType: 'render' });
    expect((sent.errors[0] as Error).message).toBe('page boom');
    expect(sent.user).toEqual({ id: ID });
    expect(sent.page).toBe('/drills');
  });
});
