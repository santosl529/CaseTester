'use client';
import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { APART, BRAND, HOOD, HOOD_ID, PRODUCT_HREF, SLIDES, SLIDE_SOURCE, type ScreenId } from './content';
import { seg, useReducedMotion } from './motion';
import { BrowserFrame, Screen, VOICE_STEPS } from './screens';
import { Cast } from './cast';
import { DiagnosticCta } from './diagnostic-cta';
import { HoodFigure } from './hood';
import { SLIDE_CAST } from './characters';
import s from './exhibition.module.css';

// What sets us apart (Matt's brief, 24 Oct 2026, matched to his salesforce.com
// screenshots): three consulting slides that stack as you scroll. Each slide
// is sticky with a staggered top, so the next slides up over it. As it is
// covered, its content fades out and a compact one-line tab fades in at its
// top (tracker and title left, the feature right), so the strip left showing
// reads as a folder tab. Each slide on top takes 4% off the scale of those
// below, so the tabs behind narrow like a stack. The scroll is never touched:
// a scroll handler only reads where the slides are and writes transform and
// opacity. The slides share a bottom edge (their margins), so after slide 3
// settles and a short hold they release together.
//
// Stacking runs on desktops from 700px tall (13-inch laptops). Every slide
// passed keeps its tab, so at the end all three headlines show (Matt, 25 Oct,
// after salesforce.com); between 700 and 860px tall the tabs are slimmer and
// the titles a step smaller.
// Phones, shorter windows and reduced motion get the slides one after another
// as full cards. Exhibits are screens at real size, cropped to the space.
//
// Under the hood (Matt, 28 Oct): a fourth, dark slide, the technology as the
// layer under the three features. As it comes up, slides 01–03 compress into
// 30px tabs above it (tracker and feature, the title tab crossfading out)
// and their scales ease from 4% steps to 2%, so the tabs step wider down to
// it like layers resting on it. Its figure separates once it settles, and
// again after the visitor has scrolled back out of it and down again.

const STACKING = '(min-width: 1024px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)';
const subscribe = (cb: () => void) => { const m = window.matchMedia(STACKING); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
const useStacking = () => useSyncExternalStore(subscribe, () => window.matchMedia(STACKING).matches, () => false);

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';
// The collapsed tabs above Under the hood (px; --tab-c in the CSS).
const TAB_C = 30;
const pad = (n: number) => String(n).padStart(2, '0');

// `desktopOnly`: left out on phones (exhibit 3a: slide 3 shows only the
// drill there, so it isn't twice a phone screen tall).
function Exhibit({ id, label, title, step, desktopOnly = false }: { id: ScreenId; label: string; title: string; step?: number; desktopOnly?: boolean }) {
  return (
    <figure aria-label={`${label}: ${title}, a sample screen`} className={`${desktopOnly ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-1 flex-col`}>
      <figcaption className="t-label mb-2 flex-none"><span className="font-semibold">{label}</span><span className="text-(--ink)/65"> · {title}</span></figcaption>
      <div className="hidden min-h-0 flex-1 lg:block"><BrowserFrame crop fill={id === 'interview'}><Screen id={id} step={step} /></BrowserFrame></div>
      <div className="lg:hidden"><BrowserFrame><Screen id={id} step={step} compact /></BrowserFrame></div>
    </figure>
  );
}

// Exhibit 1's conversation, scrubbed by scroll (Matt, 25 Oct): it starts as
// the exhibit comes up past three quarters of the screen and is complete just
// before slide 2's top edge enters the frame; scrolling up rewinds it. Read
// from slide 1's and slide 2's places in the page (`marks`, in normal flow
// even while the slides stick), so it works stacked or not. Reduced motion:
// complete.
function VoiceExhibit({ marks, label, title }: { marks: React.RefObject<(HTMLDivElement | null)[]>; label: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    let start = 0, end = 1;
    const measure = () => {
      const [m0, m1] = marks.current;
      const el = box.current, slide = el?.closest('section');
      if (!m0 || !m1 || !el || !slide) return;
      const vh = window.innerHeight;
      const offset = el.getBoundingClientRect().top - slide.getBoundingClientRect().top;
      start = m0.getBoundingClientRect().top + window.scrollY + offset - vh * 0.75;
      end = m1.getBoundingClientRect().top + window.scrollY - vh - 24;
    };
    const update = () => {
      frame = 0;
      const k = Math.floor(seg(window.scrollY, start, end) * VOICE_STEPS.total);
      setStep(prev => (prev === k ? prev : k));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onResize = () => { measure(); onScroll(); };
    measure();
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); cancelAnimationFrame(frame); };
  }, [reduced, marks]);
  return <div ref={box} className="flex min-h-0 flex-col"><Exhibit id="interview" label={label} title={title} step={reduced ? VOICE_STEPS.total : step} /></div>;
}

export function ApartSection() {
  const stacking = useStacking();
  const reduced = useReducedMotion();
  const marks = useRef<(HTMLDivElement | null)[]>([]);
  const slides = useRef<(HTMLElement | null)[]>([]);
  const tabBars = useRef<(HTMLDivElement | null)[]>([]);
  const contents = useRef<(HTMLDivElement | null)[]>([]);
  const headings = useRef<(HTMLHeadingElement | null)[]>([]);
  const miniBars = useRef<(HTMLDivElement | null)[]>([]);
  // Which slides are covered enough to be a tab, and which one is active
  // (settled, the next not yet over its foot: the cast row shows there).
  // Re-renders only when these change.
  const [covered, setCovered] = useState([false, false, false]);
  const [active, setActive] = useState([false, false, false, false]);
  // Under the hood's figure: at rest until the slide settles (stacked) or is
  // well in view (unstacked), then it plays; back to rest once out of it.
  const [hood, setHood] = useState<'rest' | 'play'>('rest');
  // How tall each slide's characters could be drawn (0: no room). All or
  // none: the illustrations show only if every slide has room, the two solo
  // characters at the smaller of their heights (the pair is fixed at 140).
  const [artRoom, setArtRoom] = useState([0, 0, 0]);
  const onArt = useCallback((i: number, h: number) => setArtRoom(prev => (prev[i] === h ? prev : prev.map((v, k) => (k === i ? h : v)))), []);
  const art = artRoom.every(h => h > 0) ? Math.min(artRoom[0], artRoom[1]) : 0;

  // Where slide i rests once settled: its place in the page, less its sticky top.
  const restAt = (i: number) => {
    const m = marks.current[i], el = slides.current[i];
    if (!m || !el) return 0;
    return m.getBoundingClientRect().top + window.scrollY - (stacking ? parseFloat(getComputedStyle(el).top) || 0 : 80);
  };
  const goTo = (i: number) => window.scrollTo({ top: restAt(i), behavior: reduced ? 'auto' : 'smooth' });

  useEffect(() => {
    const els = slides.current;
    if (!stacking) {
      els.forEach(el => { if (el) el.style.transform = ''; });
      [...tabBars.current, ...miniBars.current, ...contents.current].forEach(t => { if (t) t.style.opacity = ''; });
      // Unstacked, the figure plays once the slide is well in view.
      const hoodEl = els[3];
      if (reduced || !hoodEl) return;
      const io = new IntersectionObserver(([e]) => setHood(prev => (e.intersectionRatio >= 0.35 ? 'play' : e.isIntersecting ? prev : 'rest')), { threshold: [0, 0.35] });
      io.observe(hoodEl);
      return () => io.disconnect();
    }
    let frame = 0;
    let tops: number[] = [];
    const measure = () => { tops = els.map(el => (el ? parseFloat(getComputedStyle(el).top) || 0 : 0)); };
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      // How far each slide has come up, from entering at the bottom (0) to settled (1).
      const enter = marks.current.map((m, i) => (m ? seg(vh - m.getBoundingClientRect().top, 0, vh - tops[i]) : 0));
      // Under the hood's arrival: the feature slides rise so each tab
      // narrows from --tab to TAB_C, and their scales move to 2% steps.
      const k = enter[3] ?? 0, lift = Math.max(0, tops[1] - tops[0] - TAB_C) * k;
      els.forEach((el, i) => {
        if (!el || i === 3) return;
        const over = enter.slice(i + 1, 3).reduce((a, b) => a + b, 0);
        const scale = 1 - 0.04 * over + (0.04 * over - 0.02 * (3 - i)) * k;
        el.style.transform = over > 0 || k > 0 ? `translateY(${(-i * lift).toFixed(2)}px) scale(${scale.toFixed(4)})` : '';
        // Late in the cover, the content gives way to the tab; under the
        // hood, the title tab gives way to the 30px tracker tab.
        const cover = enter[i + 1] ?? 0, tabbed = seg(cover, 0.72, 0.98);
        const bar = tabBars.current[i], small = miniBars.current[i], body = contents.current[i];
        // One after the other, so their text never overlaps.
        if (bar) bar.style.opacity = String(tabbed * (1 - seg(k, 0.3, 0.55)));
        if (small) small.style.opacity = String(tabbed * seg(k, 0.6, 0.85));
        if (body) body.style.opacity = String(1 - seg(cover, 0.68, 0.94));
      });
      const nextCovered = [0, 1, 2].map(i => (enter[i + 1] ?? 0) > 0.95);
      const nextActive = enter.map((e, i) => e > 0.98 && (enter[i + 1] ?? 0) < 0.2);
      setActive(prev => (prev.every((v, n) => v === nextActive[n]) ? prev : nextActive));
      setCovered(prev => (prev.every((v, n) => v === nextCovered[n]) ? prev : nextCovered));
      setHood(prev => (k > 0.98 ? 'play' : k < 0.5 ? 'rest' : prev));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onResize = () => { measure(); onScroll(); };
    measure();
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); cancelAnimationFrame(frame); };
  }, [stacking, reduced]);

  // Arriving at #under-the-hood (the header's Technology link, or a link from
  // the product page): stacked, the slide's resting place, not where the
  // browser's own jump leaves it.
  useEffect(() => {
    if (!stacking) return;
    const go = () => {
      if (window.location.hash !== `#${HOOD_ID}`) return;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const m = marks.current[3], el = slides.current[3];
        if (m && el) window.scrollTo({ top: m.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(el).top) || 0), behavior: 'smooth' });
      }));
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, [stacking]);

  // Tabbing into a slide that a later one has started to cover brings it back,
  // so keyboard focus never lands out of sight (the tab button itself excepted).
  const onFocus = (i: number) => (e: React.FocusEvent) => {
    const target = e.target as HTMLElement;
    if (!stacking || target.dataset.tab !== undefined) return;
    const next = slides.current[i + 1], own = slides.current[i];
    if (next && own && next.getBoundingClientRect().top < own.getBoundingClientRect().bottom - 1) { goTo(i); return; }
    // Or the browser scrolled it in only as far as the top edge, under the header.
    requestAnimationFrame(() => {
      const header = document.querySelector('[data-sticky-header]')?.getBoundingClientRect().bottom ?? 0;
      if (target.getBoundingClientRect().top < header + 8) goTo(i);
    });
  };

  return (
    <section id="apart" aria-labelledby="apart-h" data-shot="apart" className="border-t border-(--ink)/12 bg-(--paper) pt-24 pb-16 lg:pt-36 lg:pb-12">
      <div className={WRAP}>
        <p data-reveal="text" className={`${s.caps} t-label text-(--cobalt)`}>{APART.eyebrow}</p>
        <h2 id="apart-h" data-reveal="text" className={`${s.display} t-section mt-4 max-w-[20ch] text-balance`}>{APART.headline}</h2>
      </div>

      <div className={`${WRAP} ${s.slideStack} mt-14 lg:mt-20`}>
        {APART.blocks.map((b, i) => {
          const meta = SLIDES[i];
          const n = i + 1;
          const tab = stacking && covered[i];
          return (
            <Fragment key={b.id}>
              <div ref={el => { marks.current[i] = el; }} aria-hidden="true" />
              <section ref={el => { slides.current[i] = el; }} id={b.id} aria-labelledby={`${b.id}-h`} onFocusCapture={onFocus(i)}
                className={s.slide} style={{ '--i': i } as React.CSSProperties}>
                {/* The tab a covered slide leaves showing: one line, faded in as
                    the slide is covered (the button is live only then). */}
                <button type="button" data-tab tabIndex={tab ? 0 : -1} aria-hidden={!tab} aria-label={`Back to slide ${n}: ${b.title}`}
                  onClick={() => { goTo(i); headings.current[i]?.focus({ preventScroll: true }); }}
                  className={`peer absolute inset-x-0 top-0 z-20 h-(--tab) rounded-t-[24px] focus-visible:outline-offset-[-4px] ${tab ? 'cursor-pointer' : 'pointer-events-none'}`} />
                <div ref={el => { tabBars.current[i] = el; }} aria-hidden="true" className={`${s.tabBar} pointer-events-none absolute inset-x-0 top-0 z-10 flex h-(--tab) items-center gap-4 px-5 transition-colors peer-hover:text-(--cobalt) lg:px-9`}>
                  <p className={`${s.figures} t-label flex-none text-(--ink)/65`}>{pad(n)} / {pad(SLIDES.length)}</p>
                  <p className={`${s.tabText} min-w-0 flex-1 truncate font-semibold tracking-[-0.01em]`}>{b.title}</p>
                  <p className="t-small flex-none font-semibold">{meta.feature}</p>
                </div>
                {/* Under the hood's tab: tracker and feature in 30px. */}
                <div ref={el => { miniBars.current[i] = el; }} aria-hidden="true" className={`${s.tabBar} pointer-events-none absolute inset-x-0 top-0 z-10 flex h-(--tab-c) items-center gap-4 px-5 transition-colors peer-hover:text-(--cobalt) lg:px-9`}>
                  <p className={`${s.figures} t-label flex-none text-(--ink)/70`}>Why {BRAND} · <span className="font-semibold text-(--ink)">{pad(n)}</span> / {pad(SLIDES.length)}</p>
                  <p className="t-label ml-auto flex-none font-semibold">{meta.feature}</p>
                </div>

                <div ref={el => { contents.current[i] = el; }} className={s.slideContent}>
                <div className={`${s.slideTop} flex flex-none items-start gap-4 px-5 pt-5 pb-2 lg:px-9 lg:pt-6`}>
                  <p className={`${s.figures} t-label flex-none text-(--ink)/70`}>Why {BRAND} · <span className="font-semibold text-(--ink)">{pad(n)}</span> / {pad(SLIDES.length)}</p>
                  <p className="ml-auto flex-none text-right">
                    <span className="t-small block font-semibold">{meta.feature}</span>
                    <span className="t-label block text-(--ink)/65">{meta.sub}</span>
                  </p>
                </div>

                <div className={`${s.slideBody} grid gap-x-12 gap-y-8 px-5 pt-3 pb-6 lg:grid-cols-2 lg:px-9 lg:pt-3`}>
                  <div className={s.slideLeft}>
                    <h3 ref={el => { headings.current[i] = el; }} id={`${b.id}-h`} tabIndex={-1} className={`${s.display} ${s.slideTitle} t-section border-b border-(--ink) pb-4 text-balance outline-none`}>{b.title}</h3>
                    <p className={`${s.slideText} t-body mt-4 text-(--ink)/70`}>{b.body}</p>
                    <Cast index={i} ids={SLIDE_CAST[i]} active={stacking && active[i]} stacking={stacking} art={art} onArt={onArt} />
                  </div>
                  <div className={`${s.slideRight} flex min-h-0 min-w-0 flex-col`}>
                    <div className={`${s.exhibits} grid min-h-0 flex-1 gap-4 ${meta.exhibits.length > 1 ? 'lg:grid-cols-2' : ''}`}>
                      {meta.exhibits.map(ex => (ex.id === 'interview'
                        ? <VoiceExhibit key={ex.id} marks={marks} label={ex.label} title={ex.title} />
                        : <Exhibit key={ex.id} id={ex.id} label={ex.label} title={ex.title} desktopOnly={ex.id === 'lesson'} />))}
                    </div>
                    <p className="t-label mt-2.5 flex-none text-(--ink)/65">{SLIDE_SOURCE}</p>
                  </div>
                </div>

                <div className={`${s.slideFoot} mx-5 mt-auto flex flex-none items-center justify-between border-t border-(--ink)/12 py-3 lg:mx-9`}>
                  <p className="t-small font-semibold tracking-[-0.01em]">{BRAND}</p>
                  <p className={`${s.figures} t-label text-(--ink)/65`}><span className="sr-only">Slide </span>{n}</p>
                </div>
                </div>
              </section>
            </Fragment>
          );
        })}
        <div ref={el => { marks.current[3] = el; }} aria-hidden="true" />
        <section ref={el => { slides.current[3] = el; }} id={HOOD_ID} aria-labelledby="hood-h" data-on-ink onFocusCapture={e => onFocus(3)(e)}
          className={`${s.slide} ${s.hood}`} style={{ '--i': 3 } as React.CSSProperties}>
          {/* Phones: the feature label wraps under the tracker. */}
          <div className={`${s.slideTop} flex flex-none flex-wrap items-start gap-x-4 gap-y-2 px-5 pt-5 pb-2 lg:px-9 lg:pt-6`}>
            <p className={`${s.hoodMono} t-label flex-none text-(--hood-2)`}>Why {BRAND} · <span className="font-medium text-(--paper)">{HOOD.tracker}</span></p>
            <p className="ml-auto flex-none text-right">
              <span className="t-small block font-semibold">{HOOD.feature}</span>
              <span className="t-label block text-(--hood-2)">{HOOD.sub}</span>
            </p>
          </div>
          <div className={`${s.slideBody} grid gap-x-12 gap-y-8 px-5 pt-3 pb-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-9 lg:pt-3`}>
            <div className={s.slideLeft}>
              <h3 ref={el => { headings.current[3] = el; }} id="hood-h" tabIndex={-1} className={`${s.display} ${s.slideTitle} t-section border-b border-(--paper) pb-4 text-balance outline-none`}>{HOOD.title}</h3>
              <p className={`${s.slideText} t-body mt-4 text-(--hood-2)`}>{HOOD.body}</p>
              <div className="mt-6"><Link href={PRODUCT_HREF} className={s.hoodBtn}>{HOOD.button}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></div>
            </div>
            <div className={`${s.slideRight} flex min-h-0 min-w-0 flex-col`}>
              <HoodFigure state={reduced ? 'still' : hood} />
            </div>
          </div>
          <div className={`${s.slideFoot} mx-5 mt-auto flex flex-none items-center justify-between border-t border-[rgb(247_247_244/0.16)] py-3 lg:mx-9`}>
            <p className="t-small font-semibold tracking-[-0.01em]">{BRAND}</p>
            <p className="t-label text-(--hood-2)">{HOOD.foot}</p>
          </div>
        </section>
        {/* The last slide holds a moment before the stack lets go. */}
        <div aria-hidden="true" className={s.stackHold} />
      </div>

      {/* Stacked, the row rises into the last slide's 14rem margin, so it
          follows the released stack closely; it stays below the window while
          the stack is pinned (the slide's foot is a gap above the window's). */}
      <div className={`${WRAP} ${s.apartAfter} mt-14 flex flex-wrap items-center gap-x-8 gap-y-5 lg:mt-16`}>
        <div data-reveal="text"><DiagnosticCta className="btn-primary">{APART.primary}</DiagnosticCta></div>
        <div data-reveal="text">
          <Link href={PRODUCT_HREF} className="link t-body inline-flex items-center gap-2">{APART.tour}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
      </div>
    </section>
  );
}
