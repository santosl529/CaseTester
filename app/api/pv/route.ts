import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logEvent } from '@/lib/analytics';
import { jsonRoute } from '@/lib/http/route-guard';
import { clientIp, hitRateLimit, rateRule } from '@/lib/rate-limit';
import { isBot, normalizePath, visitorCode, visitorSecret } from '@/lib/site/page-view';

// One page view (lib/site/page-view.ts; Matt, 22 Nov). Sent by the page as a beacon; always answers 204 so a beacon
// never errors in the console. A logged-in student's view carries their id; a visitor's, today's anonymous code.
async function handlePOST(req: NextRequest) {
  const done = new NextResponse(null, { status: 204 });
  const ua = req.headers.get('user-agent');
  if (isBot(ua) || req.headers.get('purpose') === 'prefetch') return done;
  const body = await req.json().catch(() => ({})) as { path?: unknown };
  const path = normalizePath(body.path);
  if (!path) return done;
  const ip = clientIp(req);
  if (!(await hitRateLimit(rateRule('pageView'), `ip:${ip}`)).ok) return done;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await logEvent('page_view', { path }, { userId: user.id });
  else await logEvent('page_view', { path, visitor: visitorCode(ip, ua!, new Date(), visitorSecret()) });
  return done;
}

export const POST = jsonRoute(handlePOST);
