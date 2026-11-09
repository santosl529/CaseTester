import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { assignClub, clubOrgId } from '@/lib/club';
import { clientIp, hitRateLimit, rateLimitedResponse, rateRule } from '@/lib/rate-limit';

// Checks the club code at the club step and records the student's org, so
// drills (which never start a case) see students who passed the gate.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Every attempt counts, per IP (10 an hour): a guesser can't try codes faster than that.
  const limited = await hitRateLimit(rateRule('clubCode'), `ip:${clientIp(req)}`);
  if (!limited.ok) return rateLimitedResponse(limited);

  const { clubCode } = await req.json().catch(() => ({}));
  const orgId = clubOrgId(clubCode);
  if (!orgId) return NextResponse.json({ error: 'Invalid club code' }, { status: 403 });

  // Replaces a stored code that is no longer valid (it used to keep the old one, so the student looped back here).
  await assignClub(user.id, orgId);
  return NextResponse.json({ ok: true });
}
