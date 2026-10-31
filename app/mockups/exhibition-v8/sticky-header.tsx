'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DIAGNOSTIC_HREF } from '../_shared/copy';
import { HOME_HREF, PRODUCT_HREF } from './content';
import s from './exhibition.module.css';

// The sticky header (Matt's v3 brief, 23 Oct 2026; two pages, 24 Oct). It
// appears once the page's first button (the hero's, or the product intro's)
// has scrolled out of view, and stays pinned from then on: hide-on-scroll-down
// was dropped, because the chapters ask for long, steady scrolls. It turns
// dark while the technology section is under it. Desktop: logo, Product,
// Technology, the compact primary button. Phones: logo, Product as a small
// link, the compact button. On the product page, Product is marked current.
export function StickyHeader({ watch, page }: { watch: string; page: 'home' | 'product' }) {
  const [on, setOn] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.getElementById(watch);
    if (!el) return;
    // Shown when the button is above the viewport (not when it is below,
    // e.g. after a reload partway down the page, which the rect also covers).
    const io = new IntersectionObserver(([e]) => setOn(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [watch]);
  // Dark while an Ink section covers the header's middle line (from v5).
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.6;
      const next = [...document.querySelectorAll('[data-on-ink]')].some(el => {
        const r = el.getBoundingClientRect();
        return r.top <= line && r.bottom >= line;
      });
      setDark(prev => (prev === next ? prev : next));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, []);
  const product = page === 'product';
  return (
    // A div, not a second <header>: the page's own header is the banner landmark.
    <div data-sticky-header data-on={on} data-dark={dark} inert={!on} className={`${s.header} fixed inset-x-0 top-0 z-40 h-(--hdr)`}>
      <div className="mx-auto flex h-full w-full max-w-[1240px] items-center justify-between gap-4 px-6 lg:px-12">
        <Link href={HOME_HREF} className="t-card font-semibold tracking-[-0.02em]">CaseTester</Link>
        <nav aria-label="Site" className="flex items-center gap-4 lg:gap-6">
          <Link href={PRODUCT_HREF} aria-current={product ? 'page' : undefined} className={`${s.navLink} link t-small`}>Product</Link>
          {/* Same page: an anchor, so the reveal script shows the section on arrival. */}
          <a href={product ? `${HOME_HREF}#technology` : '#technology'} className="link t-small hidden lg:inline">Technology</a>
          <Link href={DIAGNOSTIC_HREF} className="btn-primary compact">
            <span className="sm:hidden">Free diagnostic</span><span className="hidden sm:inline">Take the free diagnostic</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}
