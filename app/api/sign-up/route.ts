import { NextRequest, NextResponse } from 'next/server';
import { clientIp, hitRateLimit, rateLimitedResponse, rateRule } from '@/lib/rate-limit';
import { parseSignUp, signUpDeps, signUpStudent } from '@/lib/site/sign-up';
import { siteOrigin } from '@/lib/site/url';
import { jsonRoute } from '@/lib/http/route-guard';

// Create an account with a valid club code (Lorenzo, 8 Nov; lib/site/sign-up.ts). Limited per IP (5 an hour) before
// anything else, so it can't be used to guess codes. Then either "check your email" (confirm first, 11 Nov) or, with
// no email sender configured, straight on to /sign-in.
async function handlePOST(req: NextRequest) {
  const limited = await hitRateLimit(rateRule('signUp'), `ip:${clientIp(req)}`);
  if (!limited.ok) return rateLimitedResponse(limited);

  const form = parseSignUp(await req.json().catch(() => null));
  if (!form.ok) return NextResponse.json({ error: form.error }, { status: form.error === 'invalid_club_code' ? 403 : 400 });

  try {
    const origin = siteOrigin(process.env.NEXT_PUBLIC_SITE_URL, new URL(req.url).origin)!;
    const result = await signUpStudent(form, await signUpDeps(origin));
    if (!result.ok) {
      const status = result.error === 'email_exists' ? 409 : result.error === 'email_unavailable' ? 503 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, verify: result.verify });
  } catch (err) {
    console.error('[sign-up] could not create the account', err);
    return NextResponse.json({ error: 'sign_up_unavailable' }, { status: 503 });
  }
}

// A throw answers JSON 500 (lib/http/route-guard.ts).
export const POST = jsonRoute(handlePOST);
