// Sentry settings shared by the server, edge and browser setups (M4, 17 Nov). Off unless NEXT_PUBLIC_SENTRY_DSN is
// set. Errors only: no performance tracing, no session replay. No personal data: sendDefaultPii off, and every event
// and breadcrumb is scrubbed (scrub.ts) before it is sent.
import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from './scrub';

export function sentryOptions() {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: (e: ErrorEvent) => scrubEvent(e as unknown as Parameters<typeof scrubEvent>[0]) as unknown as ErrorEvent,
    beforeBreadcrumb: (b: Breadcrumb) => scrubBreadcrumb(b as unknown as Parameters<typeof scrubBreadcrumb>[0]) as Breadcrumb | null,
  };
}
