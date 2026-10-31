'use client';
import { useEffect, useRef } from 'react';

// Drives the Skill Map's spine: each `[data-level]` section is learning until
// its top reaches the lower third of the window, practiced while it's being
// read, mastered once its bottom passes the middle; the Cobalt fill follows
// the reader. Reduced motion keeps the server's final state (all mastered).
export function Spine({ className, spineClass, children }: { className?: string; spineClass: string; children: React.ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const line = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const h = window.innerHeight;
      // At the end of the page the last section can't scroll past the middle: everything's mastered.
      const end = window.scrollY + h >= document.documentElement.scrollHeight - 4;
      el.querySelectorAll<HTMLElement>('[data-level]').forEach(section => {
        const r = section.getBoundingClientRect();
        section.dataset.level = end || r.bottom < h * 0.5 ? 'mastered' : r.top < h * 0.7 ? 'practiced' : 'learning';
      });
      const spine = line.current;
      if (spine) {
        const r = spine.getBoundingClientRect();
        const p = end ? 1 : Math.min(1, Math.max(0, (h * 0.6 - r.top) / r.height));
        spine.style.setProperty('--progress', p.toFixed(3));
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, []);
  return (
    <main ref={root} className={className}>
      <div ref={line} aria-hidden="true" className={spineClass} />
      {children}
    </main>
  );
}
