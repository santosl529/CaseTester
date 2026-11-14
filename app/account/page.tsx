import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentProfiles } from '@/db/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { clubOrgId } from '@/lib/club';
import { AppNav } from '@/components/app-nav';
import { AppPage } from '@/components/brand/page';
import { ChangeClubForm, DeleteAccountForm } from '@/components/account-forms';
import { ReportProblem } from '@/components/report-problem-link';

export const metadata: Metadata = { title: 'Account', robots: { index: false } };

// The student's account (Lorenzo, 9 Nov): email, club, change club code, delete account. Signed out: log in first.
export default async function AccountPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/account');
  const [profile] = await db.select({ orgId: studentProfiles.orgId }).from(studentProfiles).where(eq(studentProfiles.userId, user.id));
  const club = clubOrgId(profile?.orgId);

  return (
    <>
      <AppNav />
      <AppPage width="narrow" className="space-y-10">
        <h1 className="t-title">Your account</h1>
        <section className="t-body space-y-1">
          <p><span className="text-ink/70">Email:</span> {user.email}</p>
          <p><span className="text-ink/70">Club:</span> {club ?? 'None on file (you’ll be asked for a code to start an interview)'}</p>
        </section>
        <section className="space-y-3">
          <h2 className="t-heading font-semibold">Change club</h2>
          <p className="t-small text-ink/70">Moved to a different consulting club? Enter its access code.</p>
          <ChangeClubForm />
        </section>
        {/* The policies send questions, data requests and voice-consent withdrawals here (Lorenzo, 14 Nov). */}
        <section className="space-y-3">
          <h2 className="t-heading font-semibold">Need help?</h2>
          <p className="t-small text-ink/70">Questions, a copy or correction of your data, or withdrawing voice consent: send us a note and we’ll reply by email.</p>
          <ReportProblem />
        </section>
        <section className="space-y-3 border-t border-ink/14 pt-8">
          <h2 className="t-heading font-semibold text-alert">Delete account</h2>
          <DeleteAccountForm email={user.email ?? ''} />
        </section>
      </AppPage>
    </>
  );
}
