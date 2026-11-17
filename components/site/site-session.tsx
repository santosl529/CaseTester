'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { AppNav } from '@/components/app-nav';
import { BRAND, HOME_HREF } from './content';

// Signed in or not, on the public pages (Lorenzo, 15 Nov: "if im already signed in, there should not be a sign in
// button in the corner, instead it should just have the normal signed in nav bar"). Checked in the browser so the
// marketing pages stay static (their stats band is counted at build time): null until known. A display choice
// only — every page the nav links to checks the session on the server.
export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getSession()
      .then(({ data }) => { if (live) setSignedIn(Boolean(data.session)); })
      .catch(() => { if (live) setSignedIn(false); });
    return () => { live = false; };
  }, []);
  return signedIn;
}

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';

// The top bar: signed in, the app's navigation bar; otherwise the logo and Sign in (hidden, not absent, until the
// session is known, so neither version flashes).
export function SiteTopBar() {
  const signedIn = useSignedIn();
  if (signedIn) return <AppNav />;
  return (
    <header className={`${WRAP} flex h-16 items-center justify-between`}>
      <Link href={HOME_HREF} className="t-card font-semibold tracking-[-0.02em]">{BRAND}</Link>
      <Link href="/sign-in" className={`link t-small ${signedIn === null ? 'invisible' : ''}`}>Log in</Link>
    </header>
  );
}
