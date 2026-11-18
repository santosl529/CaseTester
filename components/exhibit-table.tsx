'use client';
// An exhibit as a table — shared by the text chat and the voice page. In the
// homepage's window, its label above ("Exhibit · …").
// Layout (Matt, 17 Nov, exhibit clarity): a figure or short label stays on one line,
// longer text and headers wrap, and the first column stays put while a wide table scrolls; when
// there is more to the right, a fade at the edge and "Swipe to see more" say so.
// Headers show the exhibit's display labels (`columnLabels`) where it has them.
import { useEffect, useRef, useState } from 'react';
import type { ExhibitDisplay } from '@/lib/orchestrator/turn-types';
import { Exhibit } from '@/components/brand/window';

// A figure ("$1,200", "(1.2)", "75%", "2,000", "$3.0 million") or a short label ("2 years ago") stays on one line;
// longer text wraps, from a minimum width so a column never shrinks to a word per line.
export const FIGURE = /^[\s$£€(−–+-]*\d[\d.,]*\s*(?:%|\)|million|billion|M|K)?\)?$/;
const SHORT = 14;
export const keepsOnOneLine = (text: string) => FIGURE.test(text) || text.length <= SHORT;
export const SCROLL_CUE = 'Swipe to see more';

// More of the table lies to the right of what is in view (a pixel of rounding is not "more").
export function moreToTheRight(scrollWidth: number, clientWidth: number, scrollLeft: number): boolean {
  return scrollWidth - clientWidth - scrollLeft > 1;
}

export function ExhibitTable({ exhibit }: { exhibit: ExhibitDisplay }) {
  const columns = Object.keys(exhibit.data[0] ?? {});
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setMore(moreToTheRight(el.scrollWidth, el.clientWidth, el.scrollLeft));
    check();
    el.addEventListener('scroll', check, { passive: true });
    const resized = new ResizeObserver(check);
    resized.observe(el);
    return () => { el.removeEventListener('scroll', check); resized.disconnect(); };
  }, []);
  return (
    <Exhibit label="Exhibit" title={exhibit.title} className="mt-3 text-ink">
      {more && <p className="t-label px-3 pt-2 text-right text-ink/70">{SCROLL_CUE} <span aria-hidden="true">→</span></p>}
      <div className="relative">
        {/* A wide table scrolls in its own box; focusable so the keyboard can scroll it. */}
        <div ref={box} role="region" aria-label={`${exhibit.title}: table`} tabIndex={0} className="overflow-x-auto">
          <table className="t-small w-full border-collapse">
            <thead>
              <tr className="text-ink/70">
                {columns.map((col, j) => (
                  <th key={col} className={`border-b border-ink/20 px-3 py-2 text-left align-bottom font-medium ${j === 0 ? 'sticky left-0 z-[1] bg-white' : ''}`}>
                    {exhibit.columnLabels?.[col] ?? col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exhibit.data.map((row, i) => (
                <tr key={i} className="border-b border-ink/10 last:border-b-0">
                  {columns.map((col, j) => {
                    const text = String(row[col] ?? '');
                    const wrap = keepsOnOneLine(text) ? 'whitespace-nowrap' : j === 0 ? 'min-w-[8rem] max-w-[11rem]' : 'min-w-[8rem]';
                    return (
                      <td key={col} className={`px-3 py-2 align-top tabular-nums ${wrap} ${j === 0 ? 'sticky left-0 z-[1] bg-white font-medium shadow-[1px_0_0_rgb(0_0_0/0.08)]' : ''}`}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {more && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-white to-transparent" />}
      </div>
      {exhibit.notes && (
        <p className="t-label border-t border-ink/10 px-3 py-2 text-ink/70">
          {exhibit.notes}
        </p>
      )}
    </Exhibit>
  );
}
