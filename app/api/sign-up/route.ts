import { NextRequest, NextResponse } from 'next/server';
import { clientIp, hitRateLimit, rateLimitedResponse, rateRule } from '@/lib/rate-limit';
import { parseSignUp, signUpStudent } from '@/lib/site/sign-up';

// Create an account with a valid club code (Lorenzo, 8 Nov; lib/site/sign-up.ts). Limited per IP (5 an hour) before
// anything else, so it can't be used to guess codes. The form then sends the student to /sign-in.
export async function POST(req: NextRequest) {
  const limited = await hitRateLimit(rateRule('signUp'), `ip:${clientIp(req)}`);
  if (!limited.ok) return rateLimitedResponse(limited);

  const form = parseSignUp(await req.json().catch(() => null));
  if (!form.ok) return NextResponse.json({ error: form.error }, { status: form.error === 'invalid_club_code' ? 403 : 400 });

  try {
    const result = await signUpStudent(form);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'email_exists' ? 409 : 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[sign-up] could not create the account', err);
    return NextResponse.json({ error: 'sign_up_unavailable' }, { status: 503 });
  }
}
