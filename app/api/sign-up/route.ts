import { NextRequest, NextResponse } from 'next/server';
import { clientIp, hitRateLimit, rateLimitedResponse, rateRule } from '@/lib/rate-limit';
import { parseSignUp, signUpDeps, signUpStudent } from '@/lib/site/sign-up';
import { siteOrigin } from '@/lib/site/url';
import { jsonRoute } from '@/lib/http/route-guard';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logEvent } from '@/lib/analytics';
import { visitorCode, visitorSecret } from '@/lib/site/page-view';

// Create an account with a valid club code (Lorenzo, 8 Nov; lib/site/sign-up.ts). Limited per IP (5 an hour) before
// anything else, so it can't be used to guess codes. Then either "check your email" (confirm first, 11 Nov) or, with
// no email sender configured, the student is logged in here and goes straight on (Matt, 17 Nov, pre-pilot audit S5;
// `signedIn`). If that log-in fails, the form falls back to /sign-in as before.
async function handlePOST(req: NextRequest) {
  const limited = await hitRateLimit(rateRule('signUp'), `ip:${clientIp(req)}`);
  if (!limited.ok) return rateLimitedResponse(limited);

  const form = await parseSignUp(await req.json().catch(() => null));
  if (!form.ok) return NextResponse.json({ error: form.error }, { status: form.error === 'invalid_club_code' ? 403 : 400 });

  try {
    const origin = siteOrigin(process.env.NEXT_PUBLIC_SITE_URL, new URL(req.url).origin)!;
    const result = await signUpStudent(form, await signUpDeps(origin));
    if (!result.ok) {
      const status = result.error === 'email_exists' ? 409 : result.error === 'email_unavailable' ? 503 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    // The pilot dashboard (Matt, 22 Nov): the club, and today's visitor code, which links this student to the
    // page views they made before signing up that day (lib/site/page-view.ts). Never fails the sign-up.
    await logEvent('signed_up', { org_id: form.orgId, visitor: visitorCode(clientIp(req), req.headers.get('user-agent') ?? '', new Date(), visitorSecret()) }, { userId: result.userId })
      .catch(err => console.error('[sign-up] signed_up event not logged', err));
    if (result.verify) return NextResponse.json({ ok: true, verify: true });
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    if (error) console.error('[sign-up] account created, but logging in straight away failed; the form sends them to log in', error.message);
    return NextResponse.json({ ok: true, verify: false, signedIn: !error });
  } catch (err) {
    console.error('[sign-up] could not create the account', err);
    return NextResponse.json({ error: 'sign_up_unavailable' }, { status: 503 });
  }
}

// A throw answers JSON 500 (lib/http/route-guard.ts).
export const POST = jsonRoute(handlePOST);
