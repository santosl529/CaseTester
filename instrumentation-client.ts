// Error reporting in the browser (pre-pilot audit M4): lib/monitoring/sentry-options.ts. The student's account id and
// the page are added by components/monitoring/sentry-user.tsx.
import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/monitoring/sentry-options';

Sentry.init(sentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
