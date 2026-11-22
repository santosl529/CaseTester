// Page views for the pilot dashboard (Matt, 22 Nov 2026: our own event, not Vercel Web Analytics; cookie-free).
// A logged-in student's view carries their account id. A logged-out visitor gets a daily code: a hash of the day, their
// IP address, their browser and a server secret. It changes every day, and neither the IP address nor the browser
// string is stored. Known bots are skipped. Paths are stored without query strings, with ids replaced by ":id".
import { createHash } from 'node:crypto';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|whatsapp|monitor|uptime|curl|wget|python-requests|axios|node-fetch/i;

// The page, as the dashboard groups it: no query or hash, ids as :id, no trailing slash.
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 300) return null;
  const path = raw.split(/[?#]/)[0].replace(UUID, ':id').replace(/\/+$/, '') || '/';
  if (path.startsWith('/api') || path.startsWith('/_next') || path.startsWith('/dev') || path.startsWith('/monitoring')) return null;
  return path;
}

export const isBot = (userAgent: string | null | undefined) => !userAgent || BOT.test(userAgent);

// The day in US Eastern (the dashboard's weeks), so a visitor's code changes at the same moment for everyone.
export const etDay = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);

// The logged-out visitor's code for today. `secret` is a server-only value (never sent to the browser).
export function visitorCode(ip: string, userAgent: string, now: Date, secret: string): string {
  return createHash('sha256').update(`${etDay(now)}|${ip}|${userAgent}|${secret}`).digest('base64url').slice(0, 22);
}

// The secret behind visitor codes: PAGE_VIEW_SECRET, or else one derived from the server's Supabase secret key.
export function visitorSecret(env: Record<string, string | undefined> = process.env): string {
  return env.PAGE_VIEW_SECRET || createHash('sha256').update(`page-view|${env.SUPABASE_SECRET_KEY ?? 'dev'}`).digest('hex');
}
