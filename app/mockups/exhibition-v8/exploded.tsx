'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { TECH } from '../_shared/copy';
import { Orb } from './call';
import { seg } from './motion';
import s from './exhibition.module.css';

// The technology as an exploded view (Matt's brief, 23 Oct 2026, v3): chapter
// 01's interview window lifts apart into five glass layers and one answer,
// "6% → 4%", falls through them; each layer lights as it arrives and shows
// what it does for the student. Scrubbed by scroll like the ride (same
// hook): down advances, up reverses. Reduced motion: the last scene.
//
// Discretion (the brief): each layer shows only its effect for the student,
// in the cards' own terms. Nothing flows between layers but the one answer.

export const LAYERS = [
  { name: 'The interview', effect: 'Your answer, captured live' },
  { name: TECH[0].label, effect: '4% doesn’t match the case data' },
  { name: TECH[1].label, effect: 'The interviewer responds: “Walk me through how you got 4%.”' },
  { name: TECH[2].label, effect: 'Quote confirmed for your feedback report' },
  { name: TECH[3].label, effect: 'Math drill · added to your next workout', card: true },
] as const;

// Scenes: 0–15% the interview; 15–35% lift apart; 35–90% the answer falls
// (reaching layer k at REACH[k], holding ~3% at each); 90–100% the full system.
const LIFT = [0.15, 0.35] as const;
const REACH = [0.35, 0.48, 0.61, 0.74, 0.87];
const HOLD = 0.03;

// Where the answer is, as a fractional layer index (0 = the interview).
function fall(p: number) {
  for (let k = 0; k < REACH.length - 1; k++) {
    if (p < REACH[k] + HOLD) return k;
    if (p < REACH[k + 1]) return k + seg(p, REACH[k] + HOLD, REACH[k + 1]);
  }
  return REACH.length - 1;
}

export interface Scene { lift: number; f: number; pill: number; names: number; reached: boolean[] }
export function scene(p: number): Scene {
  return {
    lift: seg(p, LIFT[0], LIFT[1]),
    f: fall(p),
    pill: seg(p, REACH[0], REACH[0] + 0.02),
    names: seg(p, 0.24, LIFT[1]),
    reached: REACH.map(r => p >= r),
  };
}

function Caption({ dim }: { dim: boolean }) {
  return (
    <p className="t-small mt-1 text-(--white)">
      So the margin went from <span className={`transition-opacity duration-300 ${dim ? 'opacity-60' : ''}`}>6% to 4%</span>.
    </p>
  );
}

function WindowTop() {
  return (
    <div className="flex items-center justify-between border-b border-(--white)/10 px-4 py-2.5">
      <p className={`${s.caps} t-label text-(--white)`}>Sample interview</p>
      <p className={`${s.figures} t-label flex items-center gap-1.5 text-(--sky)`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--sky)" /><span className="sr-only">Call time </span>12:41</p>
    </div>
  );
}

function Pill() {
  return <span className={`${s.xPill} ${s.figures} t-label inline-flex h-7 items-center rounded-full px-2.5 font-semibold whitespace-nowrap`}>6% → 4%</span>;
}

function Effect({ i, on }: { i: number; on: boolean }) {
  const l = LAYERS[i];
  return 'card' in l
    ? <p className={`${s.reveal} t-small mt-1.5 inline-flex rounded-[8px] border border-(--mastery) bg-(--ink) px-2.5 py-1 font-medium text-(--sky)`} data-on={on}>{l.effect}</p>
    : <p className={`${s.reveal} t-small mt-0.5 text-(--sky)`} data-on={on}>{l.effect}</p>;
}

// ---------- Desktop: the tilted stack, labels on the right ----------

const W = 440, PH = 260, H = 720, GAP = 120, CX = 260, LABEL_X = 560, TILT = 56;
const yAt = (i: number, lift: number) => H / 2 + (i - 2) * GAP * lift;

export function ExplodedDesktop({ sc, hot, onHot }: { sc: Scene; hot: number | null; onHot: (i: number | null) => void }) {
  const pillY = yAt(sc.f, 1);
  return (
    <div className="relative mx-auto" style={{ width: LABEL_X + 360, height: H }}>
      {/* Scene 1 centres the window on the page; it slides left as the stack opens. */}
      <div className={`${s.xStage} ${s.xMove} absolute inset-y-0 left-0`} style={{ width: LABEL_X - 40, transform: `translate3d(${(1 - sc.lift) * ((LABEL_X + 360) / 2 - CX)}px, 0, 0)` }}>
        {LAYERS.map((l, i) => (
          <div key={l.name} className={s.layer} data-lit={sc.reached[i]} data-done={i === 4 && sc.reached[4]} data-hot={hot === i}
            onMouseEnter={() => onHot(i)} onMouseLeave={() => onHot(null)}
            aria-hidden={i > 0}
            style={{
              left: CX - W / 2, top: 0, width: W, height: PH, zIndex: 10 - i,
              // A hovered or focused card spotlights its layer: the others step back.
              opacity: (i === 0 ? 1 : seg(sc.lift, 0, 0.4)) * (hot !== null && hot !== i ? 0.35 : 1),
              transform: `translate3d(0, ${yAt(i, sc.lift) - PH / 2}px, 0) rotateX(${TILT * sc.lift}deg)`,
            }}>
            {i === 0 && (
              <div className="flex h-full flex-col">
                <WindowTop />
                <div className="flex flex-1 items-center gap-3 px-5">
                  <Orb speaking={sc.lift === 0} size={44} />
                  <div>
                    <p className="t-label font-semibold text-(--sky)">Lorenzo</p>
                    <Caption dim={sc.pill > 0} />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {/* The answer: straight down the stack's centre line. */}
        <div aria-hidden="true" className={`${s.xMove} absolute top-0 z-20`} style={{ left: CX, transform: `translate3d(0, ${pillY}px, 0)`, opacity: sc.pill }}>
          <div className="-translate-x-1/2 -translate-y-1/2"><Pill /></div>
        </div>
      </div>
      {/* Names and effects, top to bottom, each on a thin leader to its layer. */}
      <ol className="pointer-events-none absolute inset-0" style={{ opacity: sc.names }}>
        {LAYERS.map((l, i) => (
          <li key={l.name} className="pointer-events-auto absolute transition-opacity duration-300" style={{ opacity: hot !== null && hot !== i ? 0.35 : 1, top: yAt(i, 1), left: CX + W / 2 + 12, width: LABEL_X - (CX + W / 2) - 12 + 360 }}
            onMouseEnter={() => onHot(i)} onMouseLeave={() => onHot(null)}>
            <div className="flex -translate-y-1/2 items-start gap-3">
              <span aria-hidden="true" className={`mt-3 h-px flex-none transition-colors duration-300 ${sc.reached[i] || hot === i ? 'bg-(--sky)/70' : 'bg-(--sky)/25'}`} style={{ width: LABEL_X - (CX + W / 2) - 24 }} />
              <div className="min-w-0">
                <p className="t-card font-semibold text-(--white)">{l.name}</p>
                <Effect i={i} on={sc.reached[i]} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------- Phones: a flat column, text under each layer ----------
// The layers sit in normal flow (so a name that wraps at 360px just makes its
// block taller); their offsets are measured, and the lift slides each one
// down from behind the window by that offset. The answer falls down a lane
// on the left, clear of the text.

const BAR = 36, LANE = 84, CAPTION_Y = 84;

export function ExplodedMobile({ sc }: { sc: Scene }) {
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const [tops, setTops] = useState<number[]>([0, 0, 0, 0, 0]);
  useLayoutEffect(() => {
    const measure = () => {
      const next = items.current.map(el => el?.offsetTop ?? 0);
      setTops(prev => (prev.every((v, k) => v === next[k]) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    items.current.forEach(el => el && ro.observe(el));
    return () => ro.disconnect();
  }, []);
  const at = (k: number) => (k === 0 ? CAPTION_Y : tops[k] + BAR / 2);
  const k = Math.min(3, Math.floor(sc.f));
  const pillY = sc.f >= 4 ? at(4) : at(k) + (at(k + 1) - at(k)) * (sc.f - k);
  return (
    <div className="relative w-full">
      <ol className="space-y-3">
        {LAYERS.map((l, i) => (
          <li key={l.name} ref={el => { items.current[i] = el; }} className={`${s.xMove} relative`} style={{
            zIndex: 10 - i,
            opacity: i === 0 ? 1 : seg(sc.lift, 0, 0.5),
            transform: i === 0 ? undefined : `translate3d(0, ${-tops[i] * (1 - sc.lift)}px, 0)`,
          }}>
            <div className={s.layer} data-lit={sc.reached[i]} data-done={i === 4 && sc.reached[4]}
              style={{ position: 'relative', height: i === 0 ? undefined : BAR }}>
              {i === 0 && (
                <>
                  <WindowTop />
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Orb speaking={sc.lift === 0} size={32} />
                    <div className="min-w-0">
                      <p className="t-label font-semibold text-(--sky)">Lorenzo</p>
                      <Caption dim={sc.pill > 0} />
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Names wait until the layers have separated, so nothing overlaps mid-lift. */}
            <div className="pt-2" style={{ paddingLeft: LANE, opacity: seg(sc.lift, 0.85, 1) }}>
              <p className="t-card font-semibold text-(--white)">{l.name}</p>
              <Effect i={i} on={sc.reached[i]} />
            </div>
          </li>
        ))}
      </ol>
      <div aria-hidden="true" className={`${s.xMove} absolute top-0 z-20`} style={{ left: LANE / 2, transform: `translate3d(0, ${pillY}px, 0)`, opacity: sc.pill }}>
        <div className="-translate-x-1/2 -translate-y-1/2"><Pill /></div>
      </div>
    </div>
  );
}
