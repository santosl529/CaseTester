// Page-side counterpart of lib/drills/http.ts: the signed-in student who has
// passed the club-code gate, or a redirect to the landing page.
import 'server-only';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentProfiles } from '@/db/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function studentOrRedirect(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const [profile] = await db.select({ userId: studentProfiles.userId }).from(studentProfiles).where(eq(studentProfiles.userId, user.id));
  if (!profile) redirect('/');
  return user.id;
}
