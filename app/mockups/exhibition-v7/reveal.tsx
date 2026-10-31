'use client';
import { useEffect } from 'react';

// Apple-style reveals (Matt's brief, 24 Oct 2026, tuned against
// apple.com/iphone-duo): as a section comes into view its parts fade in and
// glide up a short way, one after another in reading order, once. One
// utility for the whole page, driven by data attributes:
//
//   data-reveal="text"   eyebrow, headline, body, bullets, buttons: glide up
//   data-reveal="media"  large visuals: fade with a gentle scale, no glide
//   data-reveal="card"   cards and stats: glide up, staggered as a group
//
// Progressive enhancement: nothing is hidden in the HTML. The hidden starting
// state applies only once this script has marked the page `reveal-ready`,
// after first revealing (without motion) everything already on screen.
// Reduced motion: the page is never marked, so everything just shows.

const TRIGGER = 0.88;            // reveal when an element's top crosses 88% of the viewport
const STAGGER = 100;             // ms between elements entering together
const DONE_AFTER = 1000;         // ms: longest reveal (900) plus a margin
const FAST = 1.5;                // px per ms: above this, a quick fade with no stagger
const FLING = 4;                 // px per ms: above this, just appear (nothing left blank mid-flick)

let velocity = 0;

// Reveal one element now. `instant` skips the motion (focus, jumps, scrubbing).
export function revealNow(el: Element, delay = 0, instant = false) {
  if (!(el instanceof HTMLElement) || el.hasAttribute('data-revealed')) {
    if (instant && el instanceof HTMLElement && !el.hasAttribute('data-reveal-done')) settle(el, true);
    return;
  }
  if (!instant && velocity > FLING) instant = true;
  const fast = !instant && velocity > FAST;
  if (instant) el.setAttribute('data-instant', '');
  else if (fast) el.setAttribute('data-fast', '');
  else {
    el.style.setProperty('--reveal-delay', `${delay}ms`);
    el.style.willChange = 'opacity, transform';
  }
  el.setAttribute('data-revealed', '');
  el.dispatchEvent(new CustomEvent('reveal', { detail: { delay: instant || fast ? 0 : delay, instant } }));
  if (instant) settle(el, false);
  else window.setTimeout(() => settle(el, false), (fast ? 300 : DONE_AFTER) + delay);
}

function settle(el: HTMLElement, instant: boolean) {
  if (instant) { el.setAttribute('data-instant', ''); el.setAttribute('data-revealed', ''); }
  el.style.willChange = '';
  el.style.removeProperty('--reveal-delay');
  el.setAttribute('data-reveal-done', '');
}

// Reveal everything inside `root` without motion (anchor jumps, focus).
function revealAllIn(root: Element) {
  root.querySelectorAll('[data-reveal]').forEach(el => revealNow(el, 0, true));
  const own = root.closest('[data-reveal]');
  if (own) revealNow(own, 0, true);
}

export function RevealRoot() {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('[data-exhibition]');
    if (!page || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const items = [...page.querySelectorAll<HTMLElement>('[data-reveal]')];

    // Anything whose content is on screen at load (or above it): shown as it
    // is, no motion. An element showing only its empty top padding at the
    // fold (the stats cells on a 1440 × 900 screen) waits for the scroll, so
    // its reveal and count-up still play.
    const vh = window.innerHeight;
    for (const el of items) {
      const c = getComputedStyle(el);
      const contentTop = el.getBoundingClientRect().top + parseFloat(c.paddingTop) + parseFloat(c.borderTopWidth);
      if (contentTop < vh - 16) revealNow(el, 0, true);
    }
    page.classList.add('reveal-ready');

    // Elements entering together reveal in reading order, 100ms apart.
    const io = new IntersectionObserver(entries => {
      const entering = entries.filter(e => e.isIntersecting).map(e => e.target).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      entering.forEach((el, k) => { revealNow(el, k * STAGGER); io.unobserve(el); });
    }, { rootMargin: `0px 0px -${Math.round((1 - TRIGGER) * 100)}% 0px` });
    items.filter(el => !el.hasAttribute('data-revealed')).forEach(el => io.observe(el));

    // Scroll speed, so a fast flick reveals quickly instead of leaving blanks.
    let lastY = window.scrollY, lastT = performance.now();
    let calm = 0;
    const onScroll = () => {
      const now = performance.now(), y = window.scrollY;
      velocity = Math.abs(y - lastY) / Math.max(1, now - lastT);
      lastY = y; lastT = now;
      window.clearTimeout(calm);
      calm = window.setTimeout(() => { velocity = 0; }, 120);
    };

    // Keyboard focus never lands on something still hidden.
    const onFocus = (e: FocusEvent) => { const host = (e.target as Element | null)?.closest?.('[data-reveal]'); if (host) revealNow(host, 0, true); };

    // Jumps (loop nodes, rail, skip link, header links): the destination's
    // content is there on arrival.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      const id = a?.getAttribute('href')?.slice(1);
      const target = id ? document.getElementById(id) : null;
      if (target) revealAllIn(target);
    };
    const onHash = () => { const target = document.getElementById(window.location.hash.slice(1)); if (target) revealAllIn(target); };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('focusin', onFocus);
    document.addEventListener('click', onClick, true);
    window.addEventListener('hashchange', onHash);
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('hashchange', onHash);
    };
  }, []);
  return null;
}
