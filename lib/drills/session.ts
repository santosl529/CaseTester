// Page-side counterpart of lib/drills/http.ts: the signed-in student who has
// passed the club-code gate, or a redirect to log in (or the club step) and back to drills after (8 Nov audit:
// the student used to land on /home).
import 'server-only';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentProfiles } from '@/db/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function studentOrRedirect(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  // Verified locally, like lib/drills/http.ts.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/sign-in?next=/drills');
  const [profile] = await db.select({ userId: studentProfiles.userId }).from(studentProfiles).where(eq(studentProfiles.userId, userId));
  if (!profile) redirect('/sign-in?next=/drills');
  return userId;
}
