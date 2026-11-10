import { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EXPIRED_PATH, RESET_PATH } from '@/lib/site/password-reset';

// A password-reset link lands here (Lorenzo, 10 Nov; lib/site/password-reset.ts). A token hash (the reset email
// template Lorenzo sets in Supabase, or the manual script's link) works in any browser; a `code` (Supabase's default
// template) only in the browser that asked. Either signs the student in for the reset and goes on to /reset-password.
// An expired, used or malformed link goes back to /forgot-password with a notice. `next` is ignored on purpose.
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const tokenHash = params.get('token_hash');
  const code = params.get('code');
  let ok = false;
  try {
    const supabase = await createServerSupabaseClient();
    if (tokenHash && params.get('type') === 'recovery') {
      ok = !(await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })).error;
    } else if (code) {
      ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    }
  } catch (err) {
    console.error('[password-reset] the link could not be checked', err instanceof Error ? err.message : 'unknown error');
  }
  redirect(ok ? RESET_PATH : EXPIRED_PATH);
}
