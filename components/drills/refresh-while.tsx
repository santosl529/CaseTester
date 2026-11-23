'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Refreshes the page now and then while something is being prepared on the server (Today while a plan is built from
// a case: Matt, 22 Nov). Stops after `forMs`; the page itself decides what to show.
export function RefreshWhile({ everyMs = 20_000, forMs = 15 * 60_000 }: { everyMs?: number; forMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > forMs) { clearInterval(id); return; }
      router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, forMs]);
  return null;
}
