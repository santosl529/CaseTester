// Error reporting on the server (pre-pilot audit M4): lib/monitoring/sentry-options.ts.
import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/monitoring/sentry-options';

Sentry.init(sentryOptions());
