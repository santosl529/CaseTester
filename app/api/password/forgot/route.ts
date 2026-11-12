import { NextRequest, NextResponse } from 'next/server';
import { clientIp, hitRateLimit, rateLimitedResponse, rateRule } from '@/lib/rate-limit';
import { confirmUrl, parseResetEmail } from '@/lib/site/password-reset';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { jsonRoute } from '@/lib/http/route-guard';
import { findAuthUserByEmail } from '@/lib/account/auth-user';

// Email a password-reset link (Lorenzo, 10 Nov; lib/site/password-reset.ts). Limited per IP (5 an hour) before
// anything else. No account for the email: said plainly, 404 no_account (Lorenzo, 11 Nov: clear over hiding whether
// an address is registered). Errors are logged without the email.
async function handlePOST(req: NextRequest) {
  const limited = await hitRateLimit(rateRule('passwordReset'), `ip:${clientIp(req)}`);
  if (!limited.ok) return rateLimitedResponse(limited);

  const form = parseResetEmail(await req.json().catch(() => null));
  if (!form.ok) return NextResponse.json({ error: form.error }, { status: 400 });

  try {
    if (!(await findAuthUserByEmail(form.email))) return NextResponse.json({ error: 'no_account' }, { status: 404 });
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
      redirectTo: confirmUrl(process.env.NEXT_PUBLIC_SITE_URL, new URL(req.url).origin),
    });
    if (error?.status === 429) return NextResponse.json({ error: 'rate_limited', retryAfterSec: 3600 }, { status: 429 });
    if (error) {
      console.error('[password-reset] the reset email was not sent', { status: error.status, code: error.code, message: error.message });
      return NextResponse.json({ error: 'reset_unavailable' }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[password-reset] the reset email was not sent', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'reset_unavailable' }, { status: 503 });
  }
}

// A throw answers JSON 500 (lib/http/route-guard.ts).
export const POST = jsonRoute(handlePOST);
