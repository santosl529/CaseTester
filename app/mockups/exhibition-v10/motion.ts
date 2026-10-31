'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { revealNow } from './reveal';

// Motion helpers for the exhibition mockup. Nothing here touches the scroll
// position: chapters read how far their track has been scrolled and pick a
// scene from it; the visitor's scroll is never slowed, snapped or locked.

const REDUCE = '(prefers-reduced-motion: reduce)';
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(REDUCE);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

// True when the visitor wants reduced motion. The server (and the first
// paint) assume it, so the final state is what renders without JS.
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(REDUCE).matches, () => true);
}

// A chapter's progress, 0 to 1, from how far its track has scrolled through
// the window: scrolling down advances it, scrolling up reverses it. The one
// scroll-progress approach every chapter uses. Reduced motion: always 1.
export function useScrub() {
  const reduced = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(1);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = track.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = Math.max(1, r.height - window.innerHeight);
      const p = Math.min(1, Math.max(0, -r.top / span));
      // Once the scene starts to move, its visual's reveal is finished at once,
      // so a fast scroll never scrubs a half-faded first scene. Visuals only:
      // text sharing a track (What sets us apart) keeps its own reveal.
      if (p > 0.005) { const host = el.querySelector('[data-reveal="media"]:not([data-reveal-done])'); if (host) revealNow(host, 0, true); }
      // Quantize a little so a frame's tiny scroll doesn't re-render everything.
      setProgress(prev => (Math.abs(prev - p) < 0.002 ? prev : p));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, [reduced]);
  return { track, p: reduced ? 1 : progress, reduced };
}

// An element's progress as it comes up the screen, 0 to 1 (no pin: used where
// a scene plays in normal flow, the phones' block 1): 0 while its top is below
// 80% of the viewport, 1 once it has climbed to 20%. Reduced motion: 1.
export function useViewProgress<T extends Element>() {
  const reduced = useReducedMotion();
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(1);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const h = window.innerHeight;
      const q = Math.min(1, Math.max(0, (h * 0.8 - el.getBoundingClientRect().top) / (h * 0.6)));
      setProgress(prev => (Math.abs(prev - q) < 0.005 ? prev : q));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, [reduced]);
  return { ref, q: reduced ? 1 : progress, reduced };
}

// True for `ms` after `value` last changed. The voice interview's orb and
// waveform move only while the scroll is moving the conversation, so nothing
// keeps moving on its own (no pause control needed: motion never runs 5s+).
export function useRecent(value: unknown, ms = 1200) {
  const [state, setState] = useState({ value, recent: false });
  if (state.value !== value) setState({ value, recent: true });
  useEffect(() => {
    if (!state.recent) return;
    const id = window.setTimeout(() => setState(s => ({ ...s, recent: false })), ms);
    return () => window.clearTimeout(id);
  }, [state, ms]);
  return state.recent;
}

// How far `p` is through the window [a, b], as 0 to 1.
export const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));

// Milliseconds since `key` last changed, ticking only while `running`
// (paused, off screen or reduced motion: it holds). `full` is returned under
// reduced motion so timed reveals show their end state.
export function useClock(key: unknown, running: boolean, full: number) {
  const reduced = useReducedMotion();
  const [state, setState] = useState({ key, ms: 0 });
  const ms = state.key === key ? state.ms : 0;
  useEffect(() => {
    if (reduced || !running) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setState(s => ({ key, ms: (s.key === key ? s.ms : 0) + dt }));
    }, 50);
    return () => clearInterval(id);
  }, [key, running, reduced]);
  return reduced ? full : ms;
}

// Whether an element is on screen (for pausing loops nobody can see).
export function useOnScreen<T extends Element>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, on };
}
