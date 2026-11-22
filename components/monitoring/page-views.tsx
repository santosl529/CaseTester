'use client';
// Page views for the pilot dashboard (Matt, 22 Nov): one beacon per page shown, no cookie and no browser storage
// (the server makes a daily anonymous code for logged-out visitors; lib/site/page-view.ts).
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function PageViews() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith('/dev')) return;
    const body = new Blob([JSON.stringify({ path: pathname })], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/pv', body)) void fetch('/api/pv', { method: 'POST', body, keepalive: true }).catch(() => {});
  }, [pathname]);
  return null;
}
