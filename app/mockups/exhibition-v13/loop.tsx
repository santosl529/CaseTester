'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { CountUp } from '../_shared/count-up';
import { STATS } from '../_shared/copy';
import { BRAND, LOOP_INTRO, NODES, PRODUCT_HREF } from './content';
import { LoopPreview } from './loop-previews';
import { seg, useReducedMotion } from './motion';
import s from './exhibition.module.css';

// The stats band and the loop diagram (Matt's brief, 23 Oct 2026, v2). Two
// pages (24 Oct): on the homepage each node opens its chapter on the product
// page, with the full tour linked under the diagram; on the product page the
// nodes jump to the chapters below.
//
// The loop's progress (Matt's brief, 27 Oct 2026): scroll-scrubbed, never
// pinned. A Cobalt line fills a grey track along the connectors; a card turns
// active as the line reaches it (its wordless preview plays once) and gets a
// green dot once the line has passed. Pass 1 runs Diagnose → Plan updates and
// fills the Readiness meter to 40%, the return path draws back to Your plan,
// then a quicker, brighter pulse runs Your plan → Plan updates (a brief
// highlight per card, no replays) and takes the meter to 85%, never 100%.
// Desktop progress runs from the diagram's top at 80% of the window to its
// centre at 35%; phones fill the left-hand track down to a line at 75% of the
// window. Scrolling back reverses it all; a preview resets only once the line
// is back before its card. Reduced motion (and the server render): the end
// state, still. One rAF-throttled scroll handler writes transforms and
// opacity, and each card's state as data attributes when it changes (no
// React render while scrolling).

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
// its end (or while pass 2's pulse is inside it), then done. A preview that
// was still (already passed on load) stays still rather than replaying.
function cardsAt(prev: CardState[], starts: number[], ends: number[], d1: number, d2: number | null): CardState[] {
  return prev.map((c, k) => {
    const reached = d1 > starts[k], done = d1 >= ends[k];
    const pulse = d2 !== null && d2 >= starts[k] && d2 < ends[k];
    return { pv: !reached ? 'rest' : c.pv === 'still' ? 'still' : 'play', active: (reached && !done) || pulse, done };
  });
}

// Desktops: the line's path measured in steps, a card 1 and a connector 0.4.
// Card k spans [k·STEP, k·STEP + 1]; connector j (card j → j + 1) the 0.4 after it.
const STEP = 1.4, PATH = 5 * STEP + 1;
const D_STARTS = NODES.map((_, k) => k * STEP), D_ENDS = D_STARTS.map(x => x + 1);
// The scroll's share-out: pass 1, the return path, then pass 2 (~2.5× quicker).
const PASS1 = 0.58, BACK = 0.72, P2 = [0.75, 0.93] as const;
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
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = nav.current?.getBoundingClientRect();
      if (!box) return;
      const vh = window.innerHeight;
      // Far off screen, the line is already at 0 or 1: nothing to do.
      const near = box.top < 2 * vh && box.bottom > -vh;
      if (!near && !wasNear) return;
      wasNear = near;
      let starts = D_STARTS, ends = D_ENDS, d1: number, d2: number | null;
      if (desk.matches) {
        const p = seg(0.8 * vh - box.top, 0, 0.45 * vh + box.height / 2);
        d1 = seg(p, 0, PASS1) * PATH;
        d2 = p > P2[0] && p < P2[1] ? STEP + seg(p, P2[0], P2[1]) * (PATH - STEP) : null;
        for (let j = 0; j < 5; j++) {
          const from = j * STEP + 1;
          const f = seg(d1, from, from + STEP - 1);
          put(`c${j}`, j === 0 ? `scaleY(${f})` : `scaleX(${f})`);
          if (j > 0) {
            const t = d2 === null ? -1 : (d2 - from) / (STEP - 1);
            put(`p${j}`, `translateX(${((Math.min(t, 1.8) - 1) * 100).toFixed(1)}%)`, t >= 0 && t <= 1.8 ? 1 : 0);
          }
        }
        put('backR', `scaleY(${seg(p, PASS1, PASS1 + 0.02)})`);
        put('backB', `scaleX(${seg(p, PASS1 + 0.02, BACK - 0.02)})`);
        put('backL', `scaleY(${seg(p, BACK - 0.02, BACK)})`);
        meter('meterD', p < P2[0] ? 0.4 * seg(d1, PATH - 1, PATH) : 0.4 + 0.45 * seg(p, P2[0], P2[1]));
      } else {
        // Phones: the track's own length in px; cards by where they sit on it.
        const wrap = els.current.wrap?.getBoundingClientRect();
        if (!wrap) return;
        const h = wrap.height, d = 0.75 * vh - wrap.top;
        const rects = NODES.map((_, k) => els.current[`m${k}`]?.getBoundingClientRect());
        starts = rects.map((b, k) => (b ? b.top - wrap.top : 0) + (k === 0 ? 24 : 0));
        ends = rects.map((b, k) => (k === 0 ? 8 : k === NODES.length - 1 ? h : b ? b.bottom - wrap.top : 0));
        const q = seg(d, h, h + 0.45 * vh);
        d1 = d;
        d2 = q > 0 && q < 1 ? starts[1] + q * (h - starts[1]) : null;
        put('mFill', `scaleY(${seg(d, 0, h)})`);
        put('mPulse', `translateY(${((d2 ?? 0) - 40).toFixed(1)}px)`, d2 === null ? 0 : 1);
        meter('meterM', d < h ? 0.4 * seg(d, starts[NODES.length - 1], h) : 0.4 + 0.45 * q);
      }
      const next = cardsAt(shown, starts, ends, d1, d2);
      next.forEach((c, k) => { if (!same(shown[k], c)) mark(k, c); });
      shown = next;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    frame = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, [reduced]);

  return (
    <section aria-labelledby="ex-loop-h" id="how" data-shot="loop" className="scroll-mt-4 py-24 lg:py-36">
      <div className="mx-auto w-full max-w-[1240px] px-6 lg:px-12">
        <h2 id="ex-loop-h" data-reveal="text" className={`${s.display} t-section max-w-[16ch] text-balance`}>{LOOP_INTRO.headline}</h2>
        <p data-reveal="text" className="t-body mt-7 max-w-[42rem] text-(--ink)/70">{LOOP_INTRO.subhead}</p>

        {/* The diagram reveals as one piece; its nodes don't animate on their own. */}
        <nav ref={nav} aria-label="The training loop" data-reveal="media" className="mt-16">
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
    </section>
  );
}
