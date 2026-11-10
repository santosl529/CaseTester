import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Get a link to set a new CasePace password.',
  alternates: { canonical: '/forgot-password' },
};

// Ask for a password-reset link (Lorenzo, 10 Nov; lib/site/password-reset.ts). `expired` = a reset link that
// /auth/confirm could not use.
export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ expired?: string | string[] }> }) {
  return <ForgotPasswordForm expired={(await searchParams).expired === '1'} />;
}
