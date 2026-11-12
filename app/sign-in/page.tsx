import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { storedClubOrg } from '@/lib/club';
import { safeNext } from '@/lib/site/safe-next';
import { SignInFlow } from '@/components/sign-in-flow';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Log in to CasePace.',
  alternates: { canonical: '/sign-in' },
};

// Log in (site flow, 19 Oct; at /sign-in since the site launch, 31 Oct; log-in only since 8 Nov — new accounts
// are made at /sign-up with a club code). A signed-in student whose profile holds a valid club code goes straight
// on, to `next` when it is a path on this site, else /home; signed in without one (an account from before 8 Nov,
// or a code since removed from CLUB_CODES), the club step. `created` = just signed up; `deleted` = just deleted
// their account (/account); `link_expired` = a confirmation link /auth/confirm could not use (11 Nov).
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; created?: string | string[]; deleted?: string | string[]; link_expired?: string | string[] }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && await storedClubOrg(user.id)) redirect(next);
  return <SignInFlow initialStep={user ? 'club' : 'auth'} next={next} created={params.created === '1'} deleted={params.deleted === '1'} linkExpired={params.link_expired === '1'} />;
}
