import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EXPIRED_PATH } from '@/lib/site/password-reset';
import { ResetPasswordForm } from '@/components/reset-password-form';

export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false },
};

// Set a new password (Lorenzo, 10 Nov). Reached from a reset link, which signed the student in (/auth/confirm);
// without that session the link has expired: back to /forgot-password with the notice.
export default async function ResetPasswordPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(EXPIRED_PATH);
  return <ResetPasswordForm />;
}
