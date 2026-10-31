'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

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

// A chapter's scene, from how far its track has scrolled through the window.
// Reduced motion: always the last scene.
export function useScenes(count: number) {
  const reduced = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState(count - 1);
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
      setScene(Math.min(count - 1, Math.floor(p * count)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, [count, reduced]);
  return { track, scene: reduced ? count - 1 : scene, reduced };
}

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
