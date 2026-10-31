'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { CONTACT } from './content';

// "Take the free diagnostic" for now (Matt, 27 Oct 2026): every such button
// on the mockup stays on the page and, once clicked, reads "Contact our team
// to learn more!" instead. A button, not a link, since it goes nowhere; the
// new label is announced (aria-live).
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

export function DiagnosticCta({ children, className, id }: { children: ReactNode; className: string; id?: string }) {
  const [asked, setAsked] = useState(false);
  return (
    <button type="button" id={id} className={className} data-asked={asked} onClick={() => setAsked(true)}>
      <span aria-live="polite">{asked ? CONTACT : children}</span>
    </button>
  );
}
