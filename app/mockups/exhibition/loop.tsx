'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { CountUp } from '../_shared/count-up';
import { STATS } from '../_shared/copy';
import { BRAND, LOOP_INTRO, NODES, PRODUCT_HREF } from './content';
import { LoopPreview } from './loop-previews';
import { seg, useReducedMotion } from './motion';
import s from './exhibition.module.css';

// The loop's pacing (Matt, 28 Oct 2026). RUNWAY_VH: how tall the desktop
// runway is (the diagram stays pinned while it scrolls past); try 240 if it
// feels slow, 320 if it still feels rushed. HOLD: the share of each card's
// segment it stays active after the line reaches it. EASE: how quickly the
// shown progress catches up with the scroll each frame; MAX_STEP caps that
// catch-up (desktop: segments per frame; phones: px per frame), so on a fast
// flick each card still shows for a few frames (~100ms) on the way.
const RUNWAY_VH = 280;
const HOLD = 0.6;
const EASE = 0.12;
const MAX_STEP = { desk: 0.1, phone: 30 };

// The stats band and the loop diagram (Matt's brief, 23 Oct 2026, v2). Two
// pages (24 Oct): on the homepage each node opens its chapter on the product
// page, with the full tour linked under the diagram; on the product page the
// nodes jump to the chapters below.
//
// The loop's progress (Matt's brief, 27 Oct 2026): scroll-scrubbed. A Cobalt line fills a grey track along the connectors; a card turns
// active as the line reaches it (its wordless preview plays once) and gets a
// green dot once the line has passed. Pass 1 runs Diagnose → Plan updates and
// fills the Readiness meter to 40%, the return path draws back to Your plan,
// then a quicker, brighter pulse runs Your plan → Plan updates (a brief
// highlight per card, no replays) and takes the meter to 85%, never 100%.
// Paced (28 Oct): on desktops the diagram sits in a RUNWAY_VH-tall runway,
// pinned in the middle of the window (position: sticky; the page scrolls
// normally the whole time), and the runway is shared out in segments: one per
// card, Diagnose to Plan updates (the line reaches the card in the first
// 1 − HOLD of its segment, then the card holds the rest), then a last, shorter
// one (0.6 of a segment) for the return path, the second pass and the meter.
// Phones fill the left-hand track down to a line at 75% of the window. On
// both, the shown progress eases toward the scroll (EASE per frame), so a fast
// flick has the line catch up card by card instead of jumping. Scrolling back
// reverses it all; a preview resets only once the line is back before its
// card. Reduced motion (and the server render): the end state, no runway.
// One rAF loop writes transforms and opacity, and each card's state as data
// attributes when it changes (no React render while scrolling).

export function StatsBand() {
  return (
    <section aria-labelledby="ex-stats" data-shot="stats" className="border-y border-(--ink)/12 bg-(--white)">
      <h2 id="ex-stats" className="sr-only">{BRAND} at a glance</h2>
      <dl className="mx-auto grid w-full max-w-[1240px] grid-cols-2 px-6 lg:grid-cols-5 lg:px-12">
        {STATS.map((st, i) => (
          <div key={st.label} data-reveal="card" className={[
            'flex flex-col-reverse justify-end gap-4 border-(--ink)/12 py-10 lg:py-16',
            i === 4 ? 'col-span-2 border-t lg:col-span-1 lg:border-t-0' : '',
            i >= 2 && i < 4 ? 'border-t lg:border-t-0' : '',
            i % 2 === 1 && i < 4 ? 'border-l pl-5' : 'pr-5',
            i > 0 ? 'lg:border-l lg:pl-6' : '',
            i === 4 ? 'lg:pr-0' : '',
          ].join(' ')}>
            <dt className="t-small max-w-[15rem] text-(--ink)/70">{st.label}</dt>
            <dd className="flex flex-col gap-4">
              <CountUp value={st.value} duration={800} linear waitForReveal className={`${s.display} ${s.figures} t-display`} />
              <span aria-hidden="true" className={s.statRule} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type Pv = 'rest' | 'play' | 'still';
interface CardState { pv: Pv; active: boolean; done: boolean }

const FINAL: CardState[] = NODES.map(() => ({ pv: 'still', active: false, done: true }));
const same = (a: CardState, b: CardState) => a.pv === b.pv && a.active === b.active && a.done === b.done;

// A card is reached once the line passes its start, active until it passes
// its end (or while pass 2's pulse is inside it: `pulse`), then done. A
// preview that was still (already passed on load) stays still rather than
// replaying.
function cardsAt(prev: CardState[], starts: number[], ends: number[], d: number, pulse: boolean[]): CardState[] {
  return prev.map((c, k) => {
    const reached = d > starts[k], done = d >= ends[k];
    return { pv: !reached ? 'rest' : c.pv === 'still' ? 'still' : 'play', active: (reached && !done) || pulse[k], done };
  });
}

// Desktops, pass 1, in runway segments: card k's segment is [k, k + 1]; the
// line fills connector k − 1 in its first 1 − HOLD, then card k is active
// until k + 1 (Diagnose, the start, from 0). Then the last segment, [N, N + 0.6]:
// the return path, then pass 2 and the meter, then a beat of rest.
const N = NODES.length, FILL = 1 - HOLD, U = N + 0.6;
const U_STARTS = NODES.map((_, k) => (k === 0 ? 0 : k + FILL)), U_ENDS = NODES.map((_, k) => k + 1);
const BACK = [N, N + 0.2] as const, PASS2 = [N + 0.2, N + 0.55] as const;
// Pass 2's pulse runs the path Your plan → Plan updates measured in steps (a
// card 1, a connector 0.4), so it moves at an even speed through cards and connectors.
const STEP = 1.4, PATH = 5 * STEP + 1;
const D_STARTS = NODES.map((_, k) => k * STEP), D_ENDS = D_STARTS.map(x => x + 1);
// The return path's x: the centre of the first (and, from the right, the last) column.
const EDGE = 'calc((100% - 10rem) / 10)';

function Arrow({ dir, className = '' }: { dir: 'down' | 'right'; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 10 6" className={`h-1.5 w-2.5 fill-(--ink) ${dir === 'right' ? '-rotate-90' : ''} ${className}`}><path d="M0 0h10L5 6z" /></svg>
  );
}

type Where = 'home' | 'product';

// Rendered in the end state (the server render, reduced motion); the scroll
// handler sets data-active, data-done and data-pv from there.
function Node({ node, where, nodeRef, entry = false }: {
  node: typeof NODES[number]; where: Where; nodeRef: (el: HTMLAnchorElement | null) => void; entry?: boolean;
}) {
  const cls = `${s.node} ${entry ? s.nodeEntry : ''} group relative block h-full rounded-[10px] border p-4 ${entry ? 'border-(--ink) bg-(--ink) text-(--white)' : 'border-(--ink)/20 bg-(--white)'}`;
  const states = { 'data-active': false, 'data-done': true, 'data-pv': 'still' };
  const body = (
    <>
      <LoopPreview id={node.id} />
      <span aria-hidden="true" className={s.nodeDot} />
      <span className={`${s.nodeLabel} t-body block font-semibold transition-colors ${entry ? 'group-hover:text-(--sky)' : ''}`}>{node.label}</span>
      <span className={`t-small mt-1.5 block ${entry ? 'text-(--sky)' : 'text-(--ink)/70'}`}>{node.description}</span>
    </>
  );
  // In-page jumps stay plain anchors (native smooth scroll, the reveal script's jump handling).
  return where === 'product'
    ? <a ref={nodeRef} href={`#${node.id}`} className={cls} {...states}>{body}</a>
    : <Link ref={nodeRef} href={`${PRODUCT_HREF}#${node.id}`} className={cls} {...states}>{body}</Link>;
}

// The phones' centred arrows between cards stay as they were; the progress
// runs on the track down the left.
const DOWN = <div aria-hidden="true" className="flex h-8 flex-col items-center"><span className="w-0 flex-1 border-l-[1.5px] border-(--ink)" /><Arrow dir="down" /></div>;

function Meter({ fillRef }: { fillRef: (el: HTMLSpanElement | null) => void }) {
  return (
    <span className={s.meter}>
      <span className="text-[12px] leading-4 font-medium text-(--ink)">Readiness</span>
      <span className={s.meterBar}><span ref={fillRef} className={s.meterFill} /></span>
    </span>
  );
}

export function LoopSection({ where }: { where: Where }) {
  const [diagnose, ...loop] = NODES;
  const reduced = useReducedMotion();
  const nav = useRef<HTMLElement>(null);
  const els = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const all = () => Object.values(els.current).filter((el): el is HTMLElement => !!el);
    // Both layouts' copies of card k (one is hidden).
    const mark = (k: number, c: CardState) => {
      for (const el of [els.current[`d${k}`], els.current[`m${k}`]]) {
        if (!el) continue;
        el.dataset.active = String(c.active);
        el.dataset.done = String(c.done);
        el.dataset.pv = c.pv;
      }
    };
    // Reduced motion: the CSS defaults are the end state (lines full, meter at 85%).
    if (reduced) { for (const el of all()) { el.style.transform = ''; el.style.opacity = ''; } FINAL.forEach((c, k) => mark(k, c)); return; }
    const desk = window.matchMedia('(min-width: 1024px)');
    // Writes only what changed since the last frame.
    const written: Record<string, string> = {};
    const put = (key: string, transform: string, opacity?: number) => {
      const el = els.current[key];
      const value = `${transform}|${opacity ?? ''}`;
      if (!el || written[key] === value) return;
      written[key] = value;
      el.style.transform = transform;
      if (opacity !== undefined) el.style.opacity = String(opacity);
    };
    let shown = FINAL, wasNear = true;
    const meter = (key: string, m: number) => put(key, `translateX(${((m - 1) * 100).toFixed(2)}%)`);
    // The shown progress (desktop: runway segments; phones: px down the track), eased toward the scroll.
    let eased: number | null = null, mode = '';
    const paintDesk = (u: number) => {
      for (let j = 0; j < 5; j++) put(`c${j}`, `${j === 0 ? 'scaleY' : 'scaleX'}(${seg(u, j + 1, j + 1 + FILL)})`);
      const d2 = u > PASS2[0] && u < PASS2[1] ? STEP + seg(u, PASS2[0], PASS2[1]) * (PATH - STEP) : null;
      for (let j = 1; j < 5; j++) {
        const from = j * STEP + 1, t = d2 === null ? -1 : (d2 - from) / (STEP - 1);
        put(`p${j}`, `translateX(${((Math.min(t, 1.8) - 1) * 100).toFixed(1)}%)`, t >= 0 && t <= 1.8 ? 1 : 0);
      }
      const back = seg(u, BACK[0], BACK[1]);
      put('backR', `scaleY(${seg(back, 0, 0.08)})`);
      put('backB', `scaleX(${seg(back, 0.08, 0.92)})`);
      put('backL', `scaleY(${seg(back, 0.92, 1)})`);
      meter('meterD', u < PASS2[0] ? 0.4 * seg(u, N - 1 + FILL, N) : 0.4 + 0.45 * seg(u, PASS2[0], PASS2[1]));
      return cardsAt(shown, U_STARTS, U_ENDS, u, D_STARTS.map((x, k) => d2 !== null && d2 >= x && d2 < D_ENDS[k]));
    };
    const paintPhone = (d: number, vh: number) => {
      // The track's own length in px; cards by where they sit on it.
      const wrap = els.current.wrap?.getBoundingClientRect();
      if (!wrap) return shown;
      const h = wrap.height;
      const rects = NODES.map((_, k) => els.current[`m${k}`]?.getBoundingClientRect());
      const starts = rects.map((b, k) => (b ? b.top - wrap.top : 0) + (k === 0 ? 24 : 0));
      const ends = rects.map((b, k) => (k === 0 ? 8 : k === N - 1 ? h : b ? b.bottom - wrap.top : 0));
      const q = seg(d, h, h + 0.45 * vh);
      const d2 = q > 0 && q < 1 ? starts[1] + q * (h - starts[1]) : null;
      put('mFill', `scaleY(${seg(d, 0, h)})`);
      put('mPulse', `translateY(${((d2 ?? 0) - 40).toFixed(1)}px)`, d2 === null ? 0 : 1);
      meter('meterM', d < h ? 0.4 * seg(d, starts[N - 1], h) : 0.4 + 0.45 * q);
      return cardsAt(shown, starts, ends, d, starts.map((x, k) => d2 !== null && d2 >= x && d2 < ends[k]));
    };
    let frame = 0;
    const update = () => {
      frame = 0;
      const navEl = nav.current, box = navEl?.getBoundingClientRect();
      if (!navEl || !box) return;
      const vh = window.innerHeight;
      const isDesk = desk.matches, m = isDesk ? 'desk' : 'phone';
      if (m !== mode) { mode = m; eased = null; }
      // Where the scroll says the progress is. Desktop: through the runway,
      // from the diagram pinning to its release.
      let target: number;
      if (isDesk) {
        const run = els.current.runway?.getBoundingClientRect();
        if (!run) return;
        const pinTop = parseFloat(getComputedStyle(navEl).top) || 0;
        target = U * seg(pinTop - run.top, 0, run.height - box.height);
      } else {
        const wrap = els.current.wrap?.getBoundingClientRect();
        if (!wrap) return;
        target = 0.75 * vh - wrap.top;
      }
      const settled = eased === target;
      // Far off screen and settled: nothing to do.
      const near = box.top < 2 * vh && box.bottom > -vh;
      if (!near && !wasNear && settled) return;
      wasNear = near;
      const cap = isDesk ? MAX_STEP.desk : MAX_STEP.phone;
      eased = eased === null ? target : eased + Math.max(-cap, Math.min(cap, (target - eased) * EASE));
      if (Math.abs(target - eased) < (isDesk ? 0.002 : 0.5)) eased = target;
      const next = isDesk ? paintDesk(eased) : paintPhone(eased, vh);
      next.forEach((c, k) => { if (!same(shown[k], c)) mark(k, c); });
      shown = next;
      // Keep catching up until the shown progress meets the scroll.
      if (eased !== target) frame = requestAnimationFrame(update);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    // The pinned diagram's height centres it in the window (--nav-h).
    const ro = new ResizeObserver(() => { const n = nav.current, r = els.current.runway; if (n && r) r.style.setProperty('--nav-h', `${n.offsetHeight}px`); onScroll(); });
    if (nav.current) ro.observe(nav.current);
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); ro.disconnect(); };
  }, [reduced]);

  return (
    <section aria-labelledby="ex-loop-h" id="how" data-shot="loop" className="scroll-mt-4 py-24 lg:py-36">
      <div className="mx-auto w-full max-w-[1240px] px-6 lg:px-12">
        <h2 id="ex-loop-h" data-reveal="text" className={`${s.display} t-section max-w-[16ch] text-balance`}>{LOOP_INTRO.headline}</h2>
        <p data-reveal="text" className="t-body mt-7 max-w-[42rem] text-(--ink)/70">{LOOP_INTRO.subhead}</p>

        {/* The diagram reveals as one piece; its nodes don't animate on their own. */}
        {/* Desktops: the runway the diagram stays pinned in while the line runs (RUNWAY_VH). */}
        <div ref={el => { els.current.runway = el; }} className={`${s.loopRunway} mt-16`} style={{ '--runway': `${RUNWAY_VH}vh` } as React.CSSProperties}>
        <nav ref={nav} aria-label="The training loop" data-reveal="media" className={s.loopPin}>
          <p className="sr-only">Diagnose first, once. Then the loop: Your plan, Learn, Drill, Mock interview, Plan updates, and back to Your plan. {where === 'product' ? 'Each step links to its chapter below.' : 'Each step opens its chapter in the product tour.'}</p>
          {/* Desktop: Diagnose above Your plan, the five loop steps in a row, the return path under them. */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-[repeat(4,minmax(0,1fr)_2.5rem)_minmax(0,1fr)]">
              <div><Node node={diagnose} where={where} nodeRef={el => { els.current.d0 = el; }} entry /></div>
            </div>
            <div className="grid grid-cols-[repeat(4,minmax(0,1fr)_2.5rem)_minmax(0,1fr)]">
              <div aria-hidden="true" className="flex h-8 flex-col items-center">
                <span className={`${s.loopTrack} ${s.loopTrackY}`}><span ref={el => { els.current.c0 = el; }} className={s.loopFill} /></span>
                <Arrow dir="down" />
              </div>
            </div>
            <ol className="grid grid-cols-[repeat(4,minmax(0,1fr)_2.5rem)_minmax(0,1fr)] items-stretch">
              {loop.map((n, i) => (
                <li key={n.id} className="contents">
                  <div><Node node={n} where={where} nodeRef={el => { els.current[`d${i + 1}`] = el; }} /></div>
                  {i < loop.length - 1 && (
                    <div aria-hidden="true" className="flex items-center px-1.5">
                      <span className={`${s.loopTrack} ${s.loopTrackX}`}>
                        <span ref={el => { els.current[`c${i + 1}`] = el; }} className={s.loopFill} />
                        <span ref={el => { els.current[`p${i + 1}`] = el; }} className={s.pulseX}><span className={s.pulseHead} /></span>
                      </span>
                      <Arrow dir="right" className="-ml-0.5" />
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <div aria-hidden="true" className="relative h-9">
              <span className={`${s.loopTrack} absolute top-0 bottom-0 w-[2px]`} style={{ right: `calc(${EDGE} - 1px)` }}><span ref={el => { els.current.backR = el; }} className={s.loopFill} style={{ transformOrigin: 'top' }} /></span>
              <span className={`${s.loopTrack} absolute bottom-0 h-[2px]`} style={{ left: `calc(${EDGE} - 1px)`, right: `calc(${EDGE} - 1px)` }}><span ref={el => { els.current.backB = el; }} className={s.loopFill} style={{ transformOrigin: 'right' }} /></span>
              <span className={`${s.loopTrack} absolute top-0 bottom-0 w-[2px]`} style={{ left: `calc(${EDGE} - 1px)` }}><span ref={el => { els.current.backL = el; }} className={s.loopFill} style={{ transformOrigin: 'bottom' }} /></span>
              <svg viewBox="0 0 10 6" className="absolute -top-1.5 h-1.5 w-2.5 -translate-x-1/2 rotate-180 fill-(--cobalt)" style={{ left: EDGE }}><path d="M0 0h10L5 6z" /></svg>
              <span className="t-label absolute top-3 font-medium text-(--cobalt)" style={{ left: `calc(${EDGE} + 1rem)` }}>Repeat until you’re ready</span>
              <span className="absolute top-3" style={{ right: `calc(${EDGE} + 1rem)` }}><Meter fillRef={el => { els.current.meterD = el; }} /></span>
            </div>
          </div>

          {/* Phones: a column, the progress track down the left side; the return path becomes one row under Plan updates. */}
          <div className="lg:hidden">
            <Node node={diagnose} where={where} nodeRef={el => { els.current.m0 = el; }} entry />
            <div ref={el => { els.current.wrap = el; }} className="relative">
              <span aria-hidden="true" className={`${s.loopTrack} absolute top-0 bottom-0 left-[11px] w-[2px]`}>
                <span ref={el => { els.current.mFill = el; }} className={s.loopFill} style={{ transformOrigin: 'top' }} />
                <span ref={el => { els.current.mPulse = el; }} className={s.pulseY} />
              </span>
              {DOWN}
              <ol className="pl-8">
                {loop.map((n, i) => (
                  <li key={n.id}>
                    <Node node={n} where={where} nodeRef={el => { els.current[`m${i + 1}`] = el; }} />
                    {i < loop.length - 1 && DOWN}
                  </li>
                ))}
              </ol>
            </div>
            <div aria-hidden="true" className="mt-4 flex items-center justify-between gap-3 pl-8">
              <span className="t-label font-medium whitespace-nowrap text-(--cobalt)">Repeat until you’re ready</span>
              <Meter fillRef={el => { els.current.meterM = el; }} />
            </div>
          </div>
        </nav>
        </div>
      </div>
    </section>
  );
}
