'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { START_HREF } from './content';

// True while the final call to action ("Find out where you stand") is on
// screen (Matt, 28 Oct): from `share` of it in view (a quarter by default)
// until it has scrolled out again. The buttons that would duplicate its own
// fade out meanwhile.
export function useAtClose(share = 0.25) {
  const [at, setAt] = useState(false);
  useEffect(() => {
    const close = document.querySelector('[data-shot="close"]');
    if (!close) return;
    const io = new IntersectionObserver(([e]) => setAt(prev => (e.intersectionRatio >= share ? true : e.isIntersecting ? prev : false)), { threshold: [0, share] });
    io.observe(close);
    return () => io.disconnect();
  }, [share]);
  return at;
}

// The primary call to action (site launch, 31 Oct; Lorenzo: "every call to
// action goes somewhere real"): Matt's "Take the free diagnostic" (2 Nov), a
// link to sign in and then the training home (START_HREF), where a new
// student sets up training and takes the diagnostic. Matt's mockup button
// only changed its label.
export function StartCta({ children, className, id }: { children: ReactNode; className: string; id?: string }) {
  return <Link href={START_HREF} id={id} className={className}>{children}</Link>;
}
