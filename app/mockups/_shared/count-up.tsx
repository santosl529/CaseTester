'use client';
import { useEffect, useRef, useState } from 'react';

// A stat that counts up the first time it's seen ("200+": 0 → 200, then the
// full value with its "+"; "24/7": 0 → 24, then "24/7"). It renders the final value first, so
// without JS, under reduced motion, or already on screen, nothing moves.
// `duration` (ms) and `linear` let a page drop the flourish.
// `waitForReveal`: count when the stat's reveal (exhibition reveal.tsx) plays,
// starting with its stagger; a reveal without motion just shows the value.
export function CountUp({ value, className, duration = 1100, linear = false, waitForReveal = false }: { value: string; className?: string; duration?: number; linear?: boolean; waitForReveal?: boolean }) {
  const match = value.match(/^(\d+)(.*)$/);
  const target = match ? Number(match[1]) : 0;
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !match || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const host = waitForReveal ? el.closest('[data-reveal]') : null;
    if (host) {
      let raf = 0, timer = 0;
      const onReveal = (e: Event) => {
        const { delay, instant } = (e as CustomEvent<{ delay: number; instant: boolean }>).detail;
        if (instant) return;
        setShown('0');
        timer = window.setTimeout(() => {
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = linear ? t : 1 - Math.pow(1 - t, 4);
            setShown(t < 1 ? String(Math.round(target * eased)) : value);
            if (t < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        }, delay);
      };
      host.addEventListener('reveal', onReveal);
      return () => { host.removeEventListener('reveal', onReveal); cancelAnimationFrame(raf); window.clearTimeout(timer); };
    }
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return;
    setShown('0');
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = linear ? t : 1 - Math.pow(1 - t, 4);
        setShown(t < 1 ? String(Math.round(target * eased)) : value);
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per value
  }, [value]);
  return (
    <span className={className}>
      <span aria-hidden="true" ref={ref}>{shown}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
