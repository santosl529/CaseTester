'use client';
import { useEffect, useRef } from 'react';

// Marks itself `data-shown` the first time it scrolls into view; each concept's
// CSS animates from there. Under reduced motion (and without JS) the concepts'
// CSS shows the final state and this never matters.
export function Reveal({ as: Tag = 'div', threshold = 0.25, className, children, ...rest }: { as?: 'div' | 'section' | 'ul' | 'ol' | 'li' | 'figure' | 'dl'; threshold?: number; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.dataset.shown = ''; io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return <Tag ref={ref as never} className={className} {...rest}>{children}</Tag>;
}
