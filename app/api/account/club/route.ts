import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { assignClub, clubOrgId } from '@/lib/club';
import { clientIp, hitRateLimit, rateLimitedResponse, rateRule } from '@/lib/rate-limit';
import { jsonRoute } from '@/lib/http/route-guard';

// Change club code from /account (Lorenzo, 9 Nov). Shares the club-code limit (per IP) with the club step, so it
// can't be used to guess codes. Every change is logged (lib/club.ts assignClub).
async function handlePOST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limited = await hitRateLimit(rateRule('clubCode'), `ip:${clientIp(req)}`);
  if (!limited.ok) return rateLimitedResponse(limited);

  const { clubCode } = await req.json().catch(() => ({}));
  const orgId = clubOrgId(clubCode);
  if (!orgId) return NextResponse.json({ error: 'invalid_club_code' }, { status: 403 });

  const { changed } = await assignClub(user.id, orgId);
  return NextResponse.json({ ok: true, club: orgId, changed });
}

// A throw answers JSON 500 (lib/http/route-guard.ts).
export const POST = jsonRoute(handlePOST);
