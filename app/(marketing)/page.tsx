import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { storedClubOrg } from '@/lib/club';
import { SignInFlow } from '@/components/sign-in-flow';

// Sign in once (site flow, 19 Oct): a signed-in student whose profile holds a
// valid club code goes straight to /home; signed in without one, the club step.
export default async function LandingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && await storedClubOrg(user.id)) redirect('/home');
  return <SignInFlow initialStep={user ? 'club' : 'auth'} />;
}
