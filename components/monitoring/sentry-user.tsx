'use client';
// Labels browser error reports with the student's account id and the page (M4, 17 Nov) — the id only, never the email.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export function SentryUser() {
  const pathname = usePathname();
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    createBrowserSupabaseClient().auth.getSession()
      .then(({ data }) => Sentry.setUser(data.session?.user.id ? { id: data.session.user.id } : null))
      .catch(() => {});
  }, []);
  useEffect(() => { Sentry.setTag('page', pathname ?? ''); }, [pathname]);
  return null;
}
