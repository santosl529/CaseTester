'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

// A term with its meaning on hover, keyboard focus or tap (Matt, 13 Nov: the
// skill states). The term is a button described by the tip, so a screen
// reader hears the meaning with it; Escape, leaving or a tap elsewhere hides
// it. The tip shifts left as needed to stay on screen on a phone.
export function TermTip({ tip, className, style, children }: { tip: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [shift, setShift] = useState(0);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const open = hover || focus || tapped;

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setHover(false); setFocus(false); setTapped(false); } };
    const outside = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) { setTapped(false); setHover(false); } };
    document.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', outside); };
  }, [open]);

  // Keep the tip inside the window (16px from each edge).
  useLayoutEffect(() => {
    if (!open || !box.current || !wrap.current) return;
    const left = wrap.current.getBoundingClientRect().left;
    const width = box.current.offsetWidth;
    const over = left + width - (document.documentElement.clientWidth - 16);
    setShift(over > 0 ? -Math.min(over, left - 16) : 0);
  }, [open]);

  return (
    <span ref={wrap} className="relative inline-flex" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" aria-describedby={id} onClick={() => setTapped(t => !t)}
        onFocus={e => setFocus(e.currentTarget.matches(':focus-visible'))} onBlur={() => { setFocus(false); setTapped(false); }}
        className={`cursor-help underline decoration-dotted decoration-1 underline-offset-[3px] ${className ?? ''}`} style={style}>
        {children}
      </button>
      <span ref={box} role="tooltip" id={id} hidden={!open} style={{ transform: `translateX(${shift}px)` }}
        className="t-label pointer-events-none absolute top-full left-0 z-30 mt-1.5 w-max max-w-[min(16rem,calc(100vw-2rem))] rounded-window bg-ink px-2.5 py-1.5 font-normal text-white shadow-panel">
        {tip}
      </span>
    </span>
  );
}
