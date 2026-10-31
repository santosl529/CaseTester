'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { useReducedMotion } from './motion';
import { TechSection } from './tech';

// The way into the technology (Matt's v4 brief, 23 Oct 2026), two versions
// to compare, chosen with ?into=a|b or the small toggle at the bottom right:
//   A · a clean edge: a hard cut from Paper to Ink, with room at the top.
//   B · a scroll-linked fade: over the last 40% of a screen before the
//       section, chapter 06's background turns from Paper to Ink (one solid
//       colour at a time, set from the scroll position, reversing on the way
//       up) and meets the section with no seam.
// Readable throughout: Ink text keeps 4.5:1 down to a background luminance
// of 0.2065 and white text from 0.183. The colour steps over that sliver in
// one frame (2% of luminance, not visible as a jump) as the text flips to the
// dark theme; while the fade runs, secondary text and accents use the full
// text colour. Reduced motion: always A.

type Into = 'a' | 'b';
const EVENT = 'exhibition-into';
const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb);
  window.addEventListener(EVENT, cb);
  return () => { window.removeEventListener('popstate', cb); window.removeEventListener(EVENT, cb); };
};
const read = (): Into => (new URLSearchParams(window.location.search).get('into') === 'b' ? 'b' : 'a');
function setInto(v: Into) {
  const url = new URL(window.location.href);
  url.searchParams.set('into', v);
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new Event(EVENT));
}

const PAPER = [247, 247, 244], INK = [14, 20, 36];
const mix = (t: number) => PAPER.map((c, k) => Math.round(c + (INK[k] - c) * t));
const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map(c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// The point along the fade where the background's luminance falls to `l`.
const at = (l: number) => { let lo = 0, hi = 1; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (lum(mix(m)) > l) lo = m; else hi = m; } return hi; };
const INK_OK = at(0.2065);   // Ink text ≥ 4.5:1 above this luminance
const WHITE_OK = at(0.183);  // white text ≥ 4.5:1 below it

export function TechAct() {
  const chosen = useSyncExternalStore(subscribe, read, () => 'a' as Into);
  const reduced = useReducedMotion();
  const into: Into = reduced ? 'a' : chosen;
  useIntoFade(into === 'b');
  return (
    <>
      <TechSection into={into} />
      <IntoToggle value={chosen} />
    </>
  );
}

// B: drives chapter 06's background and theme (and the rail's, which sits over it)
// from the technology section's position. Straight DOM writes, once a frame.
function useIntoFade(on: boolean) {
  useEffect(() => {
    const room = document.getElementById('adapt');
    const ride = document.querySelector<HTMLElement>('nav[aria-label="Chapters"]');
    const tech = document.getElementById('technology');
    if (!room || !ride || !tech) return;
    const set = (u: number) => {
      const t = u < INK_OK ? u : Math.max(u, WHITE_OK);
      const dark = u >= INK_OK;
      const changed = (room.dataset.theme === 'dark') !== dark;
      room.style.backgroundColor = u > 0 ? `rgb(${mix(t).join(' ')})` : '';
      for (const el of [room, ride]) {
        el.dataset.theme = dark ? 'dark' : 'light';
        el.toggleAttribute('data-fading', u > 0 && u < 1);
      }
      // The sticky header reads the theme under it: tell it to look again.
      if (changed) window.dispatchEvent(new Event('exhibition-theme'));
    };
    if (!on) { set(0); return; }
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      set(Math.min(1, Math.max(0, (vh - tech.getBoundingClientRect().top) / (0.4 * vh))));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); set(0); };
  }, [on]);
}

// A mockup-only control for comparing A and B.
function IntoToggle({ value }: { value: Into }) {
  return (
    <div data-mock-control data-theme="light" className="fixed right-3 bottom-3 z-50 flex items-center gap-1 rounded-full border border-(--ink)/15 bg-(--white) p-1 shadow-[0_8px_24px_-12px_color-mix(in_srgb,var(--ink)_40%,transparent)]">
      <span className="t-label hidden px-2 text-(--ink)/70 sm:inline">Into the technology</span>
      {(['a', 'b'] as const).map(v => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => setInto(v)}
          className={`t-label rounded-full px-2.5 py-1 font-semibold transition-colors ${value === v ? 'bg-(--ink) text-(--white)' : 'text-(--ink) hover:text-(--cobalt)'}`}>
          {v === 'a' ? 'A · Clean edge' : 'B · Fade'}
        </button>
      ))}
    </div>
  );
}
