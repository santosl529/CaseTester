import { NextRequest, NextResponse } from 'next/server';
import { parseNewPassword } from '@/lib/site/password-reset';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { jsonRoute } from '@/lib/http/route-guard';

// Set a new password (Lorenzo, 10 Nov). The student is signed in by the reset link (/auth/confirm); without that
// session, 401 and the page says the link has expired.
async function handlePOST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = parseNewPassword(await req.json().catch(() => null));
  if (!form.ok) return NextResponse.json({ error: form.error }, { status: 400 });

  const { error } = await supabase.auth.updateUser({ password: form.password });
  if (error?.code === 'same_password') return NextResponse.json({ error: 'same_password' }, { status: 422 });
  if (error?.code === 'weak_password') return NextResponse.json({ error: 'weak_password' }, { status: 400 });
  if (error) {
    console.error('[password-reset] the password was not changed', { status: error.status, code: error.code });
    return NextResponse.json({ error: 'update_failed' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}

// A throw answers JSON 500 (lib/http/route-guard.ts).
export const POST = jsonRoute(handlePOST);
