import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentProfiles } from '@/db/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { clubOrgId } from '@/lib/club';
import { listedCases } from '@/lib/cases/listed';
import { loadPastSessions } from '@/lib/site/past-sessions';
import { HomeView } from '@/components/home-view';

// The home after sign-in (site flow, 19 Oct): start a case, go to drills, past
// sessions. Signed in with a valid club code on the profile, or back to /.
export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const [profile] = await db.select({ orgId: studentProfiles.orgId, timezone: studentProfiles.timezone })
    .from(studentProfiles).where(eq(studentProfiles.userId, user.id));
  if (!clubOrgId(profile?.orgId)) redirect('/');

  const cases = listedCases();
  const past = await loadPastSessions(user.id, profile.timezone);

  return <HomeView cases={cases} past={past} />;
}
