import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logEvent } from '@/lib/analytics';
import { jsonRoute } from '@/lib/http/route-guard';

// The log-in form logs in in the browser (Supabase), then tells us here (pilot dashboard, Matt, 22 Nov: logged_in).
// Only the signed-in account itself can be recorded.
async function handlePOST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await logEvent('logged_in', {}, { userId: user.id });
  return NextResponse.json({ ok: true });
}

export const POST = jsonRoute(handlePOST);
