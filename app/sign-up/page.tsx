import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { storedClubOrg } from '@/lib/club';
import { safeNext } from '@/lib/site/safe-next';
import { SignUpForm } from '@/components/sign-up-form';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create a CasePace account with your consulting club’s access code.',
  alternates: { canonical: '/sign-up' },
};

// Sign up with a club code (Lorenzo, 8 Nov). Already signed in with a valid code: straight on to `next`.
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && await storedClubOrg(user.id)) redirect(next);
  return <SignUpForm next={next} />;
}
