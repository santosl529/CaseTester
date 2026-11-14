import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentProfiles } from '@/db/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { clubOrgId } from '@/lib/club';
import { FIRST_CASE_ID, byDifficulty, listedCases } from '@/lib/cases/listed';
import { loadCaseAttempts, loadPastSessions } from '@/lib/site/past-sessions';
import { getCaseById } from '@/lib/cases/loader';
import { caseTotalMs } from '@/lib/orchestrator/state-machine';
import { casesLeft, decideSessionStart, sessionLimitsFromEnv, sessionStartDeps } from '@/lib/session-limits';
import { HomeView } from '@/components/home-view';

// The home after sign-in (site flow, 19 Oct): start a case, go to drills, past
// sessions. Signed in with a valid club code on the profile, or back to /.
export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const [profile] = await db.select({ orgId: studentProfiles.orgId, timezone: studentProfiles.timezone })
    .from(studentProfiles).where(eq(studentProfiles.userId, user.id));
  if (!clubOrgId(profile?.orgId)) redirect('/sign-in');

  const [past, attempts] = await Promise.all([loadPastSessions(user.id, profile.timezone), loadCaseAttempts(user.id)]);
  const cases = byDifficulty(listedCases()).map(c => ({
    ...c, minutes: Math.round(caseTotalMs(getCaseById(c.id)) / 60_000),
    done: attempts[c.id]?.done ?? 0, last: attempts[c.id]?.last ?? null, first: c.id === FIRST_CASE_ID,
  }));
  // How many more can start now (read only; the start itself still checks under its lock). Exempt users: no line.
  const limits = sessionLimitsFromEnv();
  let left = null;
  if (!limits.exempt.has(user.id)) {
    const now = new Date();
    const usage = await sessionStartDeps.usage(db, user.id, now, limits.exempt);
    const decision = decideSessionStart(usage, limits, now);
    left = { ...casesLeft(usage, limits), perDay: limits.perDay, block: decision.ok ? null : { reason: decision.reason, limit: decision.limit, retryAt: decision.retryAt.toISOString() } };
  }

  return <HomeView cases={cases} past={past} left={left} />;
}
