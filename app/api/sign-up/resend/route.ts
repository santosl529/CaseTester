import { NextRequest, NextResponse } from 'next/server';
import { clientIp, hitRateLimit, rateLimitedResponse, rateRule } from '@/lib/rate-limit';
import { parseResetEmail } from '@/lib/site/password-reset';
import { resendVerification, verifyDeps } from '@/lib/site/verify-email';
import { siteOrigin } from '@/lib/site/url';
import { jsonRoute } from '@/lib/http/route-guard';

// Send a new confirmation link (Lorenzo, 11 Nov: confirm-first sign-up). Limited per IP (5 an hour) first. Said plainly
// (his ruling): 404 no_account, 409 already_confirmed. No link is ever made for those (lib/site/verify-email.ts).
async function handlePOST(req: NextRequest) {
  const limited = await hitRateLimit(rateRule('verifyResend'), `ip:${clientIp(req)}`);
  if (!limited.ok) return rateLimitedResponse(limited);

  const form = parseResetEmail(await req.json().catch(() => null));
  if (!form.ok) return NextResponse.json({ error: form.error }, { status: 400 });

  const deps = await verifyDeps(siteOrigin(process.env.NEXT_PUBLIC_SITE_URL, new URL(req.url).origin)!);
  if (!deps) {
    console.error('[verify-email] resend asked, but no email sender is configured (RESEND_API_KEY)');
    return NextResponse.json({ error: 'email_unavailable' }, { status: 503 });
  }
  try {
    const outcome = await resendVerification(form.email, deps);
    if (outcome === 'no_account') return NextResponse.json({ error: 'no_account' }, { status: 404 });
    if (outcome === 'already_confirmed') return NextResponse.json({ error: 'already_confirmed' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[verify-email] the confirmation email was not sent', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'email_unavailable' }, { status: 503 });
  }
}

// A throw answers JSON 500 (lib/http/route-guard.ts).
export const POST = jsonRoute(handlePOST);
