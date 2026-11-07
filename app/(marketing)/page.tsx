import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { storedClubOrg } from '@/lib/club';
import { LandingPage } from '@/components/landing/landing-page';

export const metadata: Metadata = {
  title: 'CaseTester: case interview training, built around you',
  description: 'Diagnostic, lessons, skill drills, and AI mock interviews, all in one personalized plan that adapts as you improve.',
};

// The public homepage (20 Oct 2026; sign-in moved to /sign-in). A signed-in
// student whose profile holds a valid club code still goes straight to /home.
export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && await storedClubOrg(user.id)) redirect('/home');
  return <LandingPage />;
}
