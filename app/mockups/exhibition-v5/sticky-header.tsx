'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DIAGNOSTIC_HREF } from '../_shared/copy';
import s from './exhibition.module.css';

// The sticky header (Matt's v3 brief, 23 Oct 2026). It appears once the hero's
// primary button has scrolled out of view, and stays pinned from then on:
// hide-on-scroll-down was tried in thought and dropped, because the chapters
// ask for long, steady scrolls and a header that comes and goes would flicker
// through all of them. Desktop: logo, two section links, the compact primary
// button. Phones: logo and the button.
export function StickyHeader({ watch }: { watch: string }) {
  const [on, setOn] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  // v4: the header takes the theme of whatever section is under it (dark
  // over the technology, light again over the close), read from the page
  // beneath its middle line.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.6);
      const under = document.elementsFromPoint(window.innerWidth / 2, y).find(el => !el.closest('[data-sticky-header]'));
      const next = under?.closest('[data-theme]')?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      setTheme(prev => (prev === next ? prev : next));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('exhibition-theme', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); window.removeEventListener('exhibition-theme', onScroll); cancelAnimationFrame(frame); };
  }, []);
  // Lets transitions run once the scenes have taken their first reading.
  useEffect(() => {
    const id = window.setTimeout(() => document.querySelector('[data-exhibition]')?.setAttribute('data-settled', ''), 400);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    const el = document.getElementById(watch);
    if (!el) return;
    // Shown when the hero button is above the viewport (not when it is below,
    // e.g. after a reload partway down the page, which the rect also covers).
    const io = new IntersectionObserver(([e]) => setOn(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [watch]);
  return (
    // A div, not a second <header>: the page's own header is the banner landmark.
    <div data-sticky-header data-on={on} inert={!on} data-theme={theme} className={`${s.header} fixed inset-x-0 top-0 z-40 h-(--hdr)`}>
      <div className="mx-auto flex h-full w-full max-w-[1240px] items-center justify-between gap-4 px-6 lg:px-12">
        <Link href="/mockups" className="t-card font-semibold tracking-[-0.02em]">CaseTester</Link>
        <nav aria-label="Sections" className="flex items-center gap-6">
          <a href="#how" className="link t-small hidden lg:inline">How it works</a>
          <a href="#technology" className="link t-small hidden lg:inline">Technology</a>
          <Link href={DIAGNOSTIC_HREF} className="btn-primary compact">Take the free diagnostic</Link>
        </nav>
      </div>
    </div>
  );
}
