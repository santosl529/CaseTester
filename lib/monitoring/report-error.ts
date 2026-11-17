// Server-side reports (M4): an error caught by a route wrapper (lib/http/route-guard.ts, which answers 500 itself, so
// Next's onRequestError never sees it) and one Next reports (instrumentation.ts onRequestError). Both are labelled with
// the student's account id (from the session cookie) and the page.
import * as Sentry from '@sentry/nextjs';
import { userIdFromCookie } from './user-from-cookie';
import { withoutQuery } from './scrub';

const header = (h: Headers | Record<string, string | string[] | undefined>, name: string) =>
  (h instanceof Headers ? h.get(name) : ([] as (string | undefined)[]).concat(h[name] ?? []).join('; ')) || null;

export function reportRouteError(err: unknown, req: unknown): void {
  const r = req instanceof Request ? req : null;
  Sentry.withScope(scope => {
    const id = r ? userIdFromCookie(header(r.headers, 'cookie')) : null;
    if (id) scope.setUser({ id });
    if (r) scope.setTag('page', withoutQuery(new URL(r.url).pathname));
    Sentry.captureException(err);
  });
}

export function reportRequestError(err: unknown, request: Parameters<typeof Sentry.captureRequestError>[1], context: Parameters<typeof Sentry.captureRequestError>[2]): void {
  Sentry.withScope(scope => {
    const id = userIdFromCookie(header(request.headers, 'cookie'));
    if (id) scope.setUser({ id });
    scope.setTag('page', withoutQuery(request.path));
    Sentry.captureRequestError(err, request, context);
  });
}
