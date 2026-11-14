'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// A small "View options" panel (Your progress, Matt 13 Nov): a button that
// opens its controls below it. Escape closes it and returns focus; a click
// outside closes it.
export function OptionsMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    const outside = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  return (
    <div ref={wrap} className="relative">
      <button ref={button} type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(o => !o)}
        className="t-small inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-ink/20 bg-white px-3.5 py-1.5 transition-colors hover:border-ink/40 motion-reduce:transition-none">
        {label}<ChevronDown aria-hidden="true" className={`size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={`${id}-panel`} hidden={!open} className="absolute right-0 z-20 mt-2 w-max max-w-[min(32rem,calc(100vw-3rem))] space-y-3 rounded-window border border-ink/12 bg-white p-4 shadow-panel">
        {children}
      </div>
    </div>
  );
}
