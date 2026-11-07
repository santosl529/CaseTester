import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { storedClubOrg } from '@/lib/club';
import { safeNext } from '@/lib/site/safe-next';
import { SignInFlow } from '@/components/sign-in-flow';

// Sign in once (site flow, 19 Oct; moved from / to /sign-in for the homepage,
// 20 Oct): a signed-in student whose profile holds a valid club code goes
// straight on (to `next` when the homepage sent one, else /home); signed in
// without one, the club step.
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && await storedClubOrg(user.id)) redirect(next ?? '/home');
  return <SignInFlow initialStep={user ? 'club' : 'auth'} next={next} />;
}
