'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { NODES, type ChapterCopy } from './content';
import s from './exhibition.module.css';

// The ride (Matt's brief, 23 Oct 2026, v2): six chapters, one per loop step,
// with a sticky rail that keeps the visitor oriented. The rail only reads
// where the chapters are; it never moves the page (its links are anchors,
// smooth only when motion is allowed).

export function Ride({ children }: { children: React.ReactNode }) {
  return (
    <div id="ride">
      <Rail />
      {children}
    </div>
  );
}

function Rail() {
  const [state, setState] = useState({ visible: false, current: -1, loopBack: false });
  const loopBack = state.loopBack;
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const h = window.innerHeight;
      const ride = document.getElementById('ride');
      if (!ride) return;
      const r = ride.getBoundingClientRect();
      const visible = r.top < h * 0.35 && r.bottom > h * 0.5;
      const current = NODES.reduce((cur, n, i) => {
        const el = document.getElementById(n.id);
        return el && el.getBoundingClientRect().top <= h * 0.5 ? i : cur;
      }, -1);
      // Chapter 06's last scene marks itself; the rail then lights Your plan.
      const loopBack = Boolean(document.querySelector('#adapt [data-loop="true"]'));
      setState(prev => (prev.visible === visible && prev.current === current && prev.loopBack === loopBack ? prev : { visible, current, loopBack }));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, []);

  const dot = (i: number) => {
    const done = i < state.current;
    const now = i === state.current;
    return (
      <span aria-hidden="true" className={`${s.dot} ${i === 1 && loopBack ? s.ping : ''} flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs font-semibold tabular-nums ${
        done ? 'border-(--mastery) bg-(--mastery) text-(--ink)' : now ? 'border-(--cobalt) bg-(--cobalt) text-(--white)' : 'border-(--ink)/25 bg-(--paper) text-(--ink)/70'}`}>
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : `0${i + 1}`}
      </span>
    );
  };
  const status = (i: number) => (i < state.current ? ', done' : i === state.current ? ', current chapter' : '');

  return (
    <nav aria-label="Chapters" data-on={state.visible} className={s.ride}>
      {/* Desktop: a slim rail on the left edge. */}
      <ol className="fixed top-1/2 left-4 z-40 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
        {NODES.map((n, i) => (
          <li key={n.id}>
            <a href={`#${n.id}`} aria-current={i === state.current ? 'step' : undefined} className={`${s.railItem} relative flex items-center rounded-full`}>
              {dot(i)}
              <span className={`${s.railLabel} absolute left-8 rounded-full bg-(--white) px-2.5 py-1 text-xs font-medium whitespace-nowrap shadow-[0_0_0_1px_color-mix(in_srgb,var(--ink)_12%,transparent)] ${i === state.current ? 'text-(--cobalt)' : ''}`}>
                {n.label}
              </span>
              <span className="sr-only">{status(i)}</span>
            </a>
          </li>
        ))}
      </ol>
      {/* Phones: a slim bar across the top. */}
      <ol className="fixed inset-x-0 top-0 z-40 grid h-12 grid-cols-6 border-b border-(--ink)/12 bg-(--paper)/95 backdrop-blur-sm lg:hidden">
        {NODES.map((n, i) => (
          <li key={n.id} className="min-w-0">
            <a href={`#${n.id}`} aria-current={i === state.current ? 'step' : undefined} className="flex h-full flex-col items-center justify-center gap-0.5">
              <span className="scale-[0.85]">{dot(i)}</span>
              <span className={`max-w-full truncate px-0.5 text-xs leading-none font-medium ${i === state.current ? 'text-(--cobalt)' : 'text-(--ink)/70'}`}>{n.short}</span>
              <span className="sr-only">{status(i)}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// A chapter: copy on the left (pinned on desktop), the visual on the right in
// a tall track whose scroll progress picks the scene.
export function ChapterLayout({ copy, n, track, children }: { copy: ChapterCopy; n: number; track: React.RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
  return (
    <section id={copy.id} aria-labelledby={`${copy.id}-h`} data-shot={copy.id} className="scroll-mt-12 border-t border-(--ink)/12 lg:scroll-mt-0">
      <div className={`${s.chapter} mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-10 px-6 pt-16 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-16 lg:px-12 lg:pt-0`}>
        <div className={s.pinText}>
          <div>
            <p className={`${s.caps} text-(--cobalt)`}>{copy.label}</p>
            <h2 id={`${copy.id}-h`} className={`${s.display} mt-4 text-balance text-[clamp(2.15rem,4vw,3.5rem)]`}>{copy.headline}</h2>
            <p className="mt-5 max-w-[30rem] text-base leading-relaxed text-(--ink)/70 lg:text-lg">{copy.body}</p>
            <ul className="mt-6 max-w-[30rem] space-y-2.5 border-t border-(--ink)/12 pt-5 text-sm leading-relaxed lg:text-base">
              {copy.bullets.map(b => (
                <li key={b} className="flex gap-3"><span aria-hidden="true" className="mt-[0.55em] h-1.5 w-1.5 flex-none rounded-full bg-(--cobalt)" />{b}</li>
              ))}
            </ul>
          </div>
        </div>
        <div ref={track} data-track className={s.track} style={{ '--n': n } as React.CSSProperties}>
          <div className={s.pin}>
            <div className="w-full pb-8 lg:pb-0">{children}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
