import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentProfiles } from '@/db/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { clubOrgId } from '@/lib/club';
import { SiteHeader } from '@/components/site-header';
import { ChangeClubForm, DeleteAccountForm } from '@/components/account-forms';

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
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl space-y-8 px-4 py-6">
        <h1 className="text-xl font-semibold">Account</h1>
        <section className="space-y-1 text-sm">
          <p><span className="text-neutral-500">Email:</span> {user.email}</p>
          <p><span className="text-neutral-500">Club:</span> {club ?? 'None on file (you’ll be asked for a code to start an interview)'}</p>
        </section>
        <section className="space-y-2">
          <h2 className="font-medium">Change club</h2>
          <p className="text-sm text-neutral-600">Moved to a different consulting club? Enter its access code.</p>
          <ChangeClubForm />
        </section>
        <section className="space-y-2 border-t pt-6">
          <h2 className="font-medium text-red-700">Delete account</h2>
          <DeleteAccountForm email={user.email ?? ''} />
        </section>
      </main>
    </>
  );
}
