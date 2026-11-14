import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentProfiles } from '@/db/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { clubOrgId } from '@/lib/club';
import { linkOnlyCase } from '@/lib/cases/listed';
import { getCaseById } from '@/lib/cases/loader';
import { caseTotalMs } from '@/lib/orchestrator/state-machine';
import { StartCaseScreen } from '@/components/views/case';

// A start-link case's page, /start/<caseId> (Lorenzo, 4 Nov: the live demo's 7-minute Brew & Bean; also listed on
// /home since 12 Nov, which starts it directly). Signed in with a valid club code, as /home; otherwise sign-in, then back here.
export default async function StartCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const c = linkOnlyCase(caseId);
  if (!c) notFound();
  const here = `/start/${c.id}`;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  const [profile] = await db.select({ orgId: studentProfiles.orgId }).from(studentProfiles).where(eq(studentProfiles.userId, user.id));
  if (!clubOrgId(profile?.orgId)) redirect(`/sign-in?next=${encodeURIComponent(here)}`);

  const minutes = Math.round(caseTotalMs(getCaseById(c.id)) / 60_000);
  return <StartCaseScreen c={c} minutes={minutes} />;
}
