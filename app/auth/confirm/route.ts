import { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EXPIRED_PATH, RESET_PATH } from '@/lib/site/password-reset';

// An email link lands here. Confirmation (type=email, 11 Nov; lib/site/verify-email.ts): confirms the account and
// signs the student in → /sign-in?confirmed=1 (which sends them home); expired or used → /sign-in?link_expired=1, where
// logging in offers a new link. Password reset (Lorenzo, 10 Nov; lib/site/password-reset.ts): A token hash (the reset email
// template Lorenzo sets in Supabase, or the manual script's link) works in any browser; a `code` (Supabase's default
// template) only in the browser that asked. Either signs the student in for the reset and goes on to /reset-password.
// An expired, used or malformed link goes back to /forgot-password with a notice. `next` is ignored on purpose.
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const tokenHash = params.get('token_hash');
  const code = params.get('code');
  const confirming = params.get('type') === 'email';
  let ok = false;
  try {
    const supabase = await createServerSupabaseClient();
    if (tokenHash && confirming) {
      ok = !(await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash })).error;
    } else if (tokenHash && params.get('type') === 'recovery') {
      ok = !(await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })).error;
    } else if (code) {
      ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    }
  } catch (err) {
    console.error('[password-reset] the link could not be checked', err instanceof Error ? err.message : 'unknown error');
  }
  if (confirming) redirect(ok ? '/sign-in?confirmed=1' : '/sign-in?link_expired=1');
  redirect(ok ? RESET_PATH : EXPIRED_PATH);
}
