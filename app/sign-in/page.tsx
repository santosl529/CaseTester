import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { storedClubOrg } from '@/lib/club';
import { safeNext } from '@/lib/site/safe-next';
import { SignInFlow } from '@/components/sign-in-flow';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to CasePace with your email, then your consulting club’s access code.',
  alternates: { canonical: '/sign-in' },
};

// Sign in once (site flow, 19 Oct; at /sign-in since the site launch, 31 Oct):
// a signed-in student whose profile holds a valid club code goes straight on,
// to `next` when it is a path on this site, else Today (/drills); signed in without one,
// the club step.
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && await storedClubOrg(user.id)) redirect(next);
  return <SignInFlow initialStep={user ? 'club' : 'auth'} next={next} />;
}
