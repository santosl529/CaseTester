// A deliberate error, to check error reporting end to end (Matt, 17 Nov, pre-pilot audit M4). Founders only, as for the
// pilot reports (REPORTS_ALLOWED_EMAILS in production); anyone else gets a 404. GET throws past the route, so Next's
// onRequestError reports it (instrumentation.ts); POST throws inside the route wrapper, which reports it itself.
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { reportsAllowedFor } from '@/lib/drills/reports/access';
import { jsonRoute } from '@/lib/http/route-guard';

export const dynamic = 'force-dynamic';

async function allowed(): Promise<boolean> {
  const { data: { user } } = await (await createServerSupabaseClient()).auth.getUser();
  return Boolean(user) && reportsAllowedFor(user!.email);
}

export async function GET() {
  if (!(await allowed())) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  throw new Error('Sentry check: a deliberate server error (reported by Next)');
}

export const POST = jsonRoute(async () => {
  if (!(await allowed())) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  throw new Error('Sentry check: a deliberate server error (reported by the route wrapper)');
});
