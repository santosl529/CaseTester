import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentProfiles } from '@/db/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { clubOrgId } from '@/lib/club';
import { linkOnlyCase } from '@/lib/cases/listed';
import { getCaseById } from '@/lib/cases/loader';
import { caseTotalMs } from '@/lib/orchestrator/state-machine';
import { SiteHeader } from '@/components/site-header';
import { StartCaseButton } from '@/components/start-case-button';

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
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl space-y-3 px-4 py-6">
        <h1 className="text-lg font-semibold">{c.title}</h1>
        <p className="text-sm text-neutral-600">An interviewer-led case, about {minutes} minutes. You get a scored feedback report at the end.</p>
        <StartCaseButton caseId={c.id} label="Start this case" />
      </main>
    </>
  );
}
