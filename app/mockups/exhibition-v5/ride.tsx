'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { DIAGNOSTIC_HREF } from '../_shared/copy';
import { NODES, type ChapterCopy, type ThreadState } from './content';
import { StoryLine, StoryPinned, StoryStrip } from './thread';
import s from './exhibition.module.css';

// The ride (Matt's brief, 23 Oct 2026, v2; refined in v3): six chapters, one
// per loop step, with a sticky rail that keeps the visitor oriented and a
// "Skip the tour" link at the start. The rail only reads where the chapters
// are; it never moves the page (its links are anchors, smooth only when
// motion is allowed). No idle animation: only state changes.

export function Ride({ children }: { children: React.ReactNode }) {
  return (
    <div id="ride" data-theme="light" data-surface="paper">
      <div className="mx-auto w-full max-w-[1240px] px-6 pb-2 lg:px-12">
        <a href="#technology" className="link-quiet t-small">Skip the tour</a>
      </div>
      {/* After the skip link in the tab order, before the chapters it navigates. */}
      <Rail />
      {children}
    </div>
  );
}

function Rail() {
  const [state, setState] = useState({ visible: false, current: -1, loopBack: false });
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const h = window.innerHeight;
      const ride = document.getElementById('ride');
      if (!ride) return;
      const r = ride.getBoundingClientRect();
      // Shown while the chapters are under the whole rail, so it never sits
      // over the technology's Ink (v4): its lowest point is the desktop
      // rail's foot or the phone bar's bottom edge.
      const parts = [...document.querySelectorAll<HTMLElement>('nav[aria-label="Chapters"] > *')].filter(el => el.offsetParent || getComputedStyle(el).position === 'fixed' && getComputedStyle(el).display !== 'none');
      const foot = Math.max(h * 0.5, ...parts.map(el => el.getBoundingClientRect().bottom));
      const visible = r.top < h * 0.35 && r.bottom > foot + 8;
      const current = NODES.reduce((cur, n, i) => {
        const el = document.getElementById(n.id);
        return el && el.getBoundingClientRect().top <= h * 0.5 ? i : cur;
      }, -1);
      // Chapter 06's last scene marks itself; the rail then rings Your plan.
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
      <span aria-hidden="true" className={`${s.dot} ${i === 1 && state.loopBack ? s.ping : ''} t-label flex h-6 w-6 flex-none items-center justify-center rounded-full border font-semibold tabular-nums ${
        done ? 'border-(--mastery) bg-(--mastery) text-(--ink)' : now ? 'border-(--cobalt) bg-(--cobalt) text-(--white)' : 'border-(--ink)/25 bg-(--paper) text-(--ink)/70'}`}>
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : `0${i + 1}`}
      </span>
    );
  };
  const status = (i: number) => (i < state.current ? ', done' : i === state.current ? ', current chapter' : '');

  return (
    <nav aria-label="Chapters" data-on={state.visible} className={s.ride}>
      {/* Wide screens: a slim rail in the left margin, with the diagnostic at
          its foot. Only from 1520px is the margin wide enough to keep it clear
          of the chapter copy. */}
      <div className="fixed top-1/2 left-4 z-30 hidden -translate-y-1/2 flex-col items-start gap-5 min-[1520px]:flex">
        <ol className="flex flex-col gap-3">
          {NODES.map((n, i) => (
            <li key={n.id}>
              <a href={`#${n.id}`} aria-current={i === state.current ? 'step' : undefined} className={`${s.railItem} relative flex items-center rounded-full`}>
                {dot(i)}
                <span className={`${s.railLabel} t-label absolute left-8 rounded-full bg-(--white) px-2.5 py-1 font-medium whitespace-nowrap shadow-[0_0_0_1px_color-mix(in_srgb,var(--ink)_12%,transparent)] ${i === state.current ? 'text-(--cobalt)' : 'text-(--ink)'}`}>
                  {n.label}
                </span>
                <span className="sr-only">{status(i)}</span>
              </a>
            </li>
          ))}
        </ol>
        <a href={DIAGNOSTIC_HREF} className={`${s.vertical} t-label ml-0 px-1.5 font-semibold text-(--accent) underline underline-offset-4 hover:text-(--text)`}>Take the free diagnostic</a>
      </div>
      {/* Phones and laptops: one compact bar under the sticky header: the
          current chapter by name, and six segments (each a link) for where
          you are in the ride. */}
      <div className="fixed inset-x-0 top-(--hdr) z-30 h-(--railbar) border-b border-(--ink)/12 bg-(--paper)/95 backdrop-blur-sm min-[1520px]:hidden">
        <div className="mx-auto flex h-full w-full max-w-[1240px] items-center gap-4 px-6 lg:px-12">
          <p aria-hidden="true" className="t-label w-[7.5rem] flex-none truncate font-semibold text-(--ink)">
            {state.current >= 0 ? <><span className={`${s.figures} text-(--cobalt)`}>0{state.current + 1}</span> · {NODES[state.current].label}</> : NODES[0].label}
          </p>
          <ol className="flex h-full flex-1 items-stretch gap-1">
            {NODES.map((n, i) => {
              const done = i < state.current, now = i === state.current;
              return (
                <li key={n.id} className="flex-1">
                  <a href={`#${n.id}`} aria-current={now ? 'step' : undefined} className="flex h-full items-center rounded-sm">
                    <span aria-hidden="true" className={`${s.dot} h-1 w-full rounded-full ${done ? 'bg-(--mastery)' : now ? 'bg-(--cobalt)' : 'bg-(--ink)/15'}`} />
                    <span className="sr-only">0{i + 1} {n.label}{status(i)}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </nav>
  );
}

// A chapter: copy on the left (pinned on desktop), the visual on the right in
// a track 1–1.5 screens long whose scroll progress scrubs the visual. Phones
// get their own visual, framed on the chapter's single focal moment. Above
// each visual, Lorenzo's story: the day, the beat, and his weak spot's pill
// (`thread`, which the chapter moves as it plays).
// The rooms: chapters alternate white and Paper (v4), a quiet change of light.
const SURFACE: Record<string, 'white' | 'paper'> = { diagnose: 'white', plan: 'paper', learn: 'white', drill: 'paper', mock: 'white', adapt: 'paper' };

export function ChapterLayout({ copy, len, track, thread, desktop, mobile }: { copy: ChapterCopy; len: number; track: React.RefObject<HTMLDivElement | null>; thread: ThreadState; desktop: React.ReactNode; mobile: React.ReactNode }) {
  return (
    <section id={copy.id} aria-labelledby={`${copy.id}-h`} data-shot={copy.id} data-theme="light" data-surface={SURFACE[copy.id]} className="scroll-mt-28 border-t border-(--rule) lg:scroll-mt-0">
      <div className={`${s.chapter} mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-10 px-6 pt-16 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-16 lg:px-12 lg:pt-0`}>
        <div className={s.pinText}>
          <div>
            <p className={`${s.caps} t-label text-(--accent)`}>{copy.label}</p>
            <h2 id={`${copy.id}-h`} className={`${s.display} t-section mt-4 text-balance`}>{copy.headline}</h2>
            <p className="t-body mt-5 max-w-[30rem] text-(--text-2)">{copy.body}</p>
            <ul className="t-small mt-6 max-w-[30rem] space-y-2.5 border-t border-(--rule) pt-5">
              {copy.bullets.map(b => (
                <li key={b} className="flex gap-3"><span aria-hidden="true" className="mt-[0.55em] h-1.5 w-1.5 flex-none rounded-full bg-(--cobalt)" />{b}</li>
              ))}
            </ul>
            <div className="lg:hidden"><StoryLine id={copy.id} /></div>
          </div>
        </div>
        <div ref={track} data-track className={s.track} style={{ '--len': len } as React.CSSProperties}>
          <div className={s.pin}>
            <div className="w-full pb-8 lg:pb-0">
              <div className="hidden lg:block"><StoryStrip id={copy.id} state={thread} />{desktop}</div>
              <div className="lg:hidden"><StoryPinned id={copy.id} state={thread} />{mobile}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
