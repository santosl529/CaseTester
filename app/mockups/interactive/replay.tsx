'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw, TriangleAlert } from 'lucide-react';
import { REPLAY, REPLAY_EXHIBIT, REPLAY_FEEDBACK } from './content';
import s from './interactive.module.css';

// The annotated interview replay (Matt's brief, 22 Oct 2026). Lines play one
// by one once the transcript scrolls into view; margin notes land beside the
// line they explain (inline below it on phones). Pause/Play, Show all and
// Replay controls. Without JS, or with reduced motion, everything shows at once.
const STEPS = REPLAY.length + 1; // the lines, then the feedback card
const STEP_MS = 1500;
// Notes are numbered in order: line index → 1, 2, 3; the feedback card's note is last.
const NOTE_NUMBER = new Map(REPLAY.flatMap((l, i) => (l.note ? [i] : [])).map((i, k) => [i, k + 1]));

export function Replay() {
  const [shown, setShown] = useState(STEPS);
  const [playing, setPlaying] = useState(false);
  const [motion, setMotion] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setMotion(true);
    setShown(1);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) { started.current = true; setPlaying(true); }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const done = shown >= STEPS;
  // Playing stops by itself at the end: `active` is false once everything shows.
  const active = playing && !done;
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setShown(n => n + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [active, shown]);

  const toggle = useCallback(() => {
    if (done) { setShown(1); setPlaying(true); } else setPlaying(!active);
  }, [done, active]);

  const visible = (i: number) => i < shown;
  return (
    <div ref={root}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--ink) pb-3">
        <p className={`${s.caps} text-(--ink)`}>Sample interview</p>
        {motion && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button type="button" onClick={toggle} className="inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-(--ink)/25 px-3 font-medium hover:border-(--ink)">
              {active ? <Pause aria-hidden="true" className="h-3.5 w-3.5" /> : done ? <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> : <Play aria-hidden="true" className="h-3.5 w-3.5" />}
              {active ? 'Pause' : done ? 'Replay' : 'Play'}
            </button>
            {!done && <button type="button" onClick={() => { setPlaying(false); setShown(STEPS); }} className="h-9 px-2 font-medium text-(--cobalt) underline underline-offset-4">Show all</button>}
          </div>
        )}
      </div>

      <ol className="mt-6 space-y-4">
        {REPLAY.map((line, i) => {
          const hidden = !visible(i);
          const interviewer = line.who === 'Interviewer';
          const n = line.note ? NOTE_NUMBER.get(i) : undefined;
          return (
            <li key={i} data-hidden={hidden || undefined} aria-hidden={hidden || undefined} inert={hidden || undefined} className={`${s.line} lg:grid lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:gap-14`}>
              <div className="flex items-start">
                {!interviewer && <span className="flex-1" />}
                <div className={`max-w-[34rem] px-4 py-3 ${interviewer ? 'border border-(--ink)/15 bg-(--white)' : 'bg-(--sky)'}`}>
                  <p className={`${s.caps} !text-xs text-(--ink)/70`}>{line.who}</p>
                  <p className="mt-1 text-base leading-relaxed">{line.text}</p>
                  {line.exhibit && (
                    <table className="mt-3 w-full border-collapse text-left text-sm">
                      <caption className="pb-2 text-left text-xs font-semibold">Costs as a share of sales</caption>
                      <thead><tr className="border-b border-(--ink)/20 text-xs"><th scope="col" className="py-1 pr-3 font-medium">Cost</th><th scope="col" className="py-1 pr-3 font-medium">Two years ago</th><th scope="col" className="py-1 font-medium">Now</th></tr></thead>
                      <tbody>
                        {REPLAY_EXHIBIT.map(r => (
                          <tr key={r.cost} className="border-b border-(--ink)/10">
                            <th scope="row" className="py-1 pr-3 font-normal">{r.cost}</th>
                            <td className={`${s.figures} py-1 pr-3`}>{r.before}</td>
                            <td className={`${s.figures} py-1 ${r.before !== r.after ? 'font-semibold text-(--cobalt)' : ''}`}>{r.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {/* Desktop: the hairline runs from this line's edge to its margin note. */}
                {interviewer && n && <span aria-hidden="true" className="mt-[0.625rem] hidden h-px flex-1 bg-(--cobalt) lg:block" />}
                {interviewer && !n && <span className="flex-1" />}
              </div>
              {line.note && n && <Note n={n} text={line.note} />}
            </li>
          );
        })}
        <li data-hidden={!visible(REPLAY.length) || undefined} aria-hidden={!visible(REPLAY.length) || undefined} inert={!visible(REPLAY.length) || undefined} className={`${s.line} pt-4 lg:grid lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:gap-14`}>
          <FeedbackPreview />
          <Note n={NOTE_NUMBER.size + 1} text={REPLAY_FEEDBACK.note} />
        </li>
      </ol>
    </div>
  );
}

// A margin note: a numbered Cobalt marker joined by a hairline to its line on
// desktop; inline under the line on phones, with the same number.
function Note({ n, text }: { n: number; text: string }) {
  return (
    <aside className="relative mt-2 flex items-start gap-2.5 text-sm leading-snug lg:mt-0">
      <span aria-hidden="true" className={`${s.noteLink} hidden lg:block`} />
      <span aria-hidden="true" className={`${s.figures} flex h-5 w-5 flex-none items-center justify-center rounded-full bg-(--cobalt) text-[0.75rem] font-semibold text-(--white)`}>{n}</span>
      <p className="pt-0.5"><span className="sr-only">Note {n}: </span>{text}</p>
    </aside>
  );
}

function FeedbackPreview() {
  const f = REPLAY_FEEDBACK;
  return (
    <div className="border border-(--ink) bg-(--white) p-5">
      <p className={`${s.caps} text-(--ink)`}>Feedback preview</p>
      <div className="mt-4 space-y-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-(--mastery) text-(--white)"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">{f.strength.label} · {f.strength.skill}</p>
            <p className="mt-0.5">{f.strength.text} <q className="italic">{f.strength.quote}</q></p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-(--cobalt) text-(--white)"><TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.5} /></span>
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">{f.work.label} · {f.work.skill}</p>
            <p className="mt-0.5">{f.work.text} (<q className="italic">{f.work.quote}</q>). {f.work.after}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
