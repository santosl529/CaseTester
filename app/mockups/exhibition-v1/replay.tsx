'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Reveal } from '../_shared/reveal';
import { REPLAY, REPLAY_CLOSE, REPLAY_EXHIBIT, type Line } from './content';
import s from './exhibition.module.css';

// The interview replay (Matt's brief, 23 Oct 2026): a large interview
// interface whose lines appear as they scroll into view; on desktop a thin
// Cobalt line runs from each annotated phrase (highlighted in Sky) to its
// note in the margin, measured from where the phrase actually wraps. Phones
// put the note inline under its line. Nothing auto-plays; reduced motion
// shows it all.
const ROW = 'lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-x-16';
const PANEL = 'border-x border-(--ink)/12 bg-(--white) px-5 sm:px-10';

export function Replay() {
  return (
    <div>
      <div className={ROW}>
        <div className={`${PANEL} flex items-center justify-between rounded-t-[12px] border-t py-4`}>
          <p className={`${s.caps} text-(--ink)`}>Sample interview</p>
          <p className="hidden text-sm text-(--ink)/65 sm:block">Fresh Basket · Profitability</p>
        </div>
      </div>
      <ol>
        {REPLAY.map((line, i) => <Message key={i} line={line} first={i === 0} />)}
      </ol>
      <div className={ROW}>
        <div className={`${PANEL} rounded-b-[12px] border-b pb-8`} />
      </div>
      <Reveal threshold={0.6} className={`${s.close} mt-10 lg:mr-[calc(18rem+4rem)]`}>
        <div className={s.closeRule} />
        <p className={`${s.closeBody} mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-base`}>
          <span aria-hidden="true" className="flex h-5 w-5 flex-none translate-y-1 items-center justify-center rounded-full bg-(--mastery) text-(--white)"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
          <span className="font-semibold">{REPLAY_CLOSE.skill}</span>
          <span aria-hidden="true" className="hidden text-(--ink)/40 sm:inline">·</span>
          <q className="italic">{REPLAY_CLOSE.quote}</q>
        </p>
      </Reveal>
    </div>
  );
}

function Message({ line, first }: { line: Line; first: boolean }) {
  const interviewer = line.who === 'Interviewer';
  const row = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<{ d: string; len: number; x: number; y: number } | null>(null);

  // Measure: from the end of the highlighted phrase's last line to the note's marker.
  useLayoutEffect(() => {
    if (!line.note) return;
    const measure = () => {
      const r = row.current, m = mark.current, d = dot.current, bb = bubble.current;
      if (!r || !m || !d || !bb || !window.matchMedia('(min-width: 1024px)').matches) { setPath(null); return; }
      const base = r.getBoundingClientRect();
      const rects = m.getClientRects();
      const end = rects[rects.length - 1];
      const dr = d.getBoundingClientRect();
      // Underline the phrase (its last line), drop straight down out of the
      // message, then run to the margin note: the line never crosses words.
      const x0 = end.left - base.left, xr = end.right - base.left, y1 = end.bottom - base.top + 2;
      const y3 = bb.getBoundingClientRect().bottom - base.top + 10;
      const x2 = dr.left - base.left - 6, y2 = dr.top + dr.height / 2 - base.top;
      const elbow = x2 - 28;
      const d1 = `M ${x0} ${y1} H ${xr} V ${y3} H ${elbow} V ${y2} H ${x2}`;
      setPath({ d: d1, len: (xr - x0) + (y3 - y1) + Math.abs(elbow - xr) + Math.abs(y2 - y3) + Math.abs(x2 - elbow), x: x0, y: y1 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (row.current) ro.observe(row.current);
    return () => ro.disconnect();
  }, [line.note]);

  const text = line.mark ? (() => {
    const at = line.text.indexOf(line.mark!);
    return <>{line.text.slice(0, at)}<mark ref={mark as React.RefObject<HTMLElement>} className={`${s.mark} text-(--ink)`}>{line.mark}</mark>{line.text.slice(at + line.mark!.length)}</>;
  })() : line.text;

  return (
    <Reveal as="li" threshold={0.4} className={s.msg}>
      <div ref={row} className={`relative ${ROW}`}>
      <div className={`${PANEL} ${first ? 'pt-6' : 'pt-4'} pb-4`}>
        <div className={`flex ${interviewer ? 'justify-start' : 'justify-end'}`}>
          <div ref={bubble} className={`max-w-[38rem] rounded-[10px] px-5 py-4 ${interviewer ? 'bg-(--paper)' : 'border border-(--ink)/12'}`}>
            <p className="text-xs font-semibold tracking-[0.04em] text-(--ink)/65">{line.who}</p>
            <p className="mt-1.5 text-lg leading-relaxed">{text}</p>
            {line.exhibit && (
              <table className="mt-4 w-full max-w-sm border-collapse text-left text-sm">
                <caption className="pb-2 text-left text-xs font-semibold">Costs as a share of sales</caption>
                <thead><tr className="border-b border-(--ink)/20 text-xs"><th scope="col" className="py-1.5 pr-4 font-medium">Cost</th><th scope="col" className="py-1.5 pr-4 font-medium">Two years ago</th><th scope="col" className="py-1.5 font-medium">Now</th></tr></thead>
                <tbody>
                  {REPLAY_EXHIBIT.map(r => (
                    <tr key={r.cost} className="border-b border-(--ink)/10">
                      <th scope="row" className="py-1.5 pr-4 font-normal">{r.cost}</th>
                      <td className={`${s.figures} py-1.5 pr-4`}>{r.before}</td>
                      <td className={`${s.figures} py-1.5 ${r.before !== r.after ? 'font-semibold text-(--cobalt)' : ''}`}>{r.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {line.note && (
              <p className={`${s.note} mt-3 flex items-start gap-2 border-t border-(--ink)/10 pt-3 text-sm font-medium lg:hidden`}>
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-(--cobalt)" />
                <span><span className="sr-only">Note: </span>{line.note}</span>
              </p>
            )}
          </div>
        </div>
      </div>
      {line.note ? (
        <aside className={`${s.note} relative hidden pt-5 lg:block`} aria-hidden="true">
          <p className="flex items-start gap-2.5 text-base font-medium leading-snug">
            <span ref={dot} className="mt-1.5 h-2 w-2 flex-none rounded-full bg-(--cobalt)" />
            <span className="text-pretty">{line.note}</span>
          </p>
        </aside>
      ) : <div className="hidden lg:block" />}
      {path && (
        <svg aria-hidden="true" className={`${s.connector} pointer-events-none absolute inset-0 hidden h-full w-full overflow-visible lg:block`} style={{ '--len': path.len } as React.CSSProperties}>
          <path d={path.d} />
        </svg>
      )}
      </div>
    </Reveal>
  );
}
