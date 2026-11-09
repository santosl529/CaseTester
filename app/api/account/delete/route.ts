import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { deleteAccount } from '@/lib/account/delete-account';

// Delete my account (Lorenzo, 9 Nov; lib/account/delete-account.ts). The student types their email to confirm.
// On success they're signed out; on failure they stay signed in so they can try again.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { confirmEmail } = await req.json().catch(() => ({}));
  const typed = typeof confirmEmail === 'string' ? confirmEmail.trim().toLowerCase() : '';
  if (!typed || typed !== (user.email ?? '').toLowerCase()) return NextResponse.json({ error: 'email_mismatch' }, { status: 400 });

  const result = await deleteAccount(user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });

  // The login is gone; clear this browser's session cookies too.
  await supabase.auth.signOut().catch(() => {});
  return NextResponse.json({ ok: true });
}
