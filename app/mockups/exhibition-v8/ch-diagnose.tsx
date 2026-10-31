'use client';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { CHAPTERS, EXHIBIT, SNAPSHOT, TRANSCRIPT } from './content';
import { Caption, Orb, Waveform, wordCount } from './call';
import { useScrub } from './motion';
import { ChapterLayout } from './ride';
import { ThreadMark } from './thread';
import s from './exhibition.module.css';

// Chapter 01 · Diagnose (tension). The Fresh Basket interview as a live voice
// call, scrubbed by scroll: each word of each caption is a step along the
// chapter's track, so scrolling down plays the conversation and scrolling up
// rewinds it. After the math error and after the CFO's pushback the scrub
// holds for a beat before the candidate recovers. The last stretch lifts the
// notes into a skill snapshot, which chapter 02 picks up. Every line is in the
// page as text throughout. Pausable (the orb and waveform); reduced motion
// shows the last scene, fully lit.

const SLIP = TRANSCRIPT.findIndex(l => l.slip); // the line that starts the story's thread
const LEAD = 3;                       // a beat before the first word
const HOLD_AFTER = new Map([[6, 16], [8, 16]]); // the tense beats: math error, pushback
const GAP = 2;
const SNAP = 18;                      // the snapshot's stretch

// Where each line starts and ends, in word steps.
const STEPS = (() => {
  let at = LEAD;
  const lines = TRANSCRIPT.map((l, i) => {
    const start = at;
    const end = start + wordCount(l.text);
    at = end + GAP + (HOLD_AFTER.get(i) ?? 0);
    return { start, end };
  });
  return { lines, snapshot: at, total: at + SNAP };
})();

// The scene at a whole word step (so the call re-renders only when a word changes).
function state(pos: number) {
  const lit = STEPS.lines.map(({ start, end }) => Math.max(0, Math.min(end - start, Math.floor(pos - start) + 1)));
  const started = STEPS.lines.map(({ start }) => pos >= start);
  const done = STEPS.lines.map(({ end }) => pos >= end);
  const speaking = TRANSCRIPT.find((_, i) => started[i] && !done[i])?.who ?? null;
  const final = pos >= STEPS.snapshot;
  const current = started.lastIndexOf(true);
  return { pos, lit, started, done, speaking, final, current };
}

const clock = (pos: number) => { const sec = 41 + Math.floor(pos * 2.4); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };

export function Snapshot({ on = true, flat = false }: { on?: boolean; flat?: boolean }) {
  return (
    <div className={flat ? 'border-t border-(--ink)/12 bg-(--paper) px-4 py-4 sm:px-5' : 'rounded-[12px] border border-(--ink)/12 bg-(--white) p-4'}>
      <p className={`${s.caps} t-label text-(--ink)`}>Skill snapshot</p>
      <ul className="mt-2 divide-y divide-(--ink)/10">
        {SNAPSHOT.map((r, i) => (
          <li key={r.skill} className={`${s.reveal} t-small flex items-center justify-between gap-3 py-2`} data-on={on} style={{ '--delay': `${150 + i * 150}ms` } as React.CSSProperties}>
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-medium">{r.thread && <ThreadMark />}{r.skill}</span>
              {r.thread && <span className="t-label mt-0.5 block text-(--ink)/70">{r.thread}</span>}
            </span>
            <span className={`t-label flex-none rounded-full px-2.5 py-0.5 font-semibold ${r.strong ? 'bg-(--mastery) text-(--ink)' : 'bg-(--cobalt) text-(--white)'}`}>{r.strong ? 'Strong start' : 'Focus area'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CallHeader({ pos, paused, onPause, reduced, compact = false }: { pos: number; paused: boolean; onPause: () => void; reduced: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-(--ink)/10 px-4 py-2.5 sm:px-5">
      <p className={`${s.caps} t-label text-(--ink)`}>Sample interview</p>
      {!compact && <p className="t-small text-(--ink)/65">Fresh Basket · Profitability</p>}
      <p className={`${s.figures} t-small ml-auto flex items-center gap-2 text-(--ink)/70`}>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--cobalt)" /><span className="sr-only">Call time </span>{clock(pos)}
      </p>
      {!reduced && (
        <button type="button" onClick={onPause} className="btn-secondary">
          {paused ? <Play aria-hidden="true" className="h-3 w-3" /> : <Pause aria-hidden="true" className="h-3 w-3" />}
          {paused ? 'Play' : 'Pause'}<span className="sr-only"> interview</span>
        </button>
      )}
    </div>
  );
}

export function DiagnoseChapter() {
  const { track, p, reduced } = useScrub();
  const [paused, setPaused] = useState(false);
  const step = Math.floor(p * STEPS.total);
  const st = useMemo(() => state(step), [step]);
  const onPause = useCallback(() => setPaused(x => !x), []);
  return (
    <ChapterLayout copy={CHAPTERS.diagnose} len={1.5} track={track} thread={st.final ? 'focus' : st.started[SLIP] ? 'gap' : 'none'}
      desktop={<DesktopCall st={st} paused={paused} onPause={onPause} reduced={reduced} />}
      mobile={<MobileCall st={st} paused={paused} onPause={onPause} reduced={reduced} />} />
  );
}

type St = ReturnType<typeof state>;

// ---------- Desktop: the full call, notes in the margin ----------

const DesktopCall = memo(function DesktopCall({ st, paused, onPause, reduced }: { st: St; paused: boolean; onPause: () => void; reduced: boolean }) {
  const exhibitShown = st.started[4];
  const exhibitCompact = st.started[7];
  return (
    <div data-paused={paused} className={`${s.panel} ${s.quiet} relative flex h-[min(37rem,calc(100vh-var(--hdr)-9rem))] flex-col overflow-hidden`}>
      <CallHeader pos={st.pos} paused={paused} onPause={onPause} reduced={reduced} />
      <Body st={st} exhibitShown={exhibitShown} exhibitCompact={exhibitCompact} />
      <div className={s.grow} data-on={st.final} aria-hidden={!st.final}>
        <div><Snapshot on={st.final} flat /></div>
      </div>
      <div className={s.grow} data-on={!st.final}>
        <div>
          <div className="flex items-center gap-3 border-t border-(--ink)/10 px-4 py-2.5 sm:px-5">
            <span className="t-label font-semibold text-(--ink)/65">Lorenzo</span>
            <Waveform speaking={st.speaking === 'Lorenzo'} className="h-7 flex-1 overflow-hidden" />
          </div>
        </div>
      </div>
    </div>
  );
});

function Body({ st, exhibitShown, exhibitCompact }: { st: St; exhibitShown: boolean; exhibitCompact: boolean }) {
  const body = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const marks = useRef(new Map<number, HTMLElement | null>());
  const rows = useRef(new Map<number, HTMLElement | null>());
  const exhibitBox = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [geo, setGeo] = useState<{ i: number; top: number; d: string }[]>([]);
  // Stable per-line ref callbacks, so lines that aren't changing skip re-rendering.
  const markRefs = useMemo(() => TRANSCRIPT.map((_, i) => (el: HTMLElement | null) => { marks.current.set(i, el); }), []);
  const shown = st.started.filter(Boolean).length;

  // Notes sit beside their lines in the margin, below the exhibit and each
  // other; a line runs from under the highlighted phrase to each note.
  useLayoutEffect(() => {
    const measure = () => {
      const b = body.current, rg = region.current;
      if (!b || !rg || b.offsetParent === null) { setGeo(prev => (prev.length ? [] : prev)); return; }
      // The newest line sits at the bottom and earlier ones ride up, moved by a
      // transform (no reflow, no layout shift), before the notes are measured.
      if (list.current) list.current.style.transform = `translateY(${rg.clientHeight - 12 - list.current.offsetHeight}px)`;
      const base = b.getBoundingClientRect();
      const top = rg.getBoundingClientRect().top;
      const railX = rg.getBoundingClientRect().right - base.left + 14;
      let floor = (exhibitBox.current?.getBoundingClientRect().bottom ?? base.top) - base.top + 10;
      const ceiling = b.clientHeight - 6;
      const out: { i: number; top: number; d: string }[] = [];
      TRANSCRIPT.forEach((l, i) => {
        const m = marks.current.get(i), row = rows.current.get(i);
        if (!l.note || !m || !row || !st.started[i]) return;
        const rowTop = row.getBoundingClientRect().top;
        if (rowTop < top + 12) return;
        const rects = m.getClientRects();
        if (!rects.length) return;
        const end = rects[rects.length - 1];
        const x0 = (rects.length > 1 ? end.left : rects[0].left) - base.left, y = end.bottom - base.top + 3;
        const height = Math.ceil(l.note.length / 26) * 20;
        const noteTop = Math.min(Math.max(rowTop - base.top, floor), ceiling - height);
        floor = noteTop + height + 10;
        out.push({ i, top: noteTop, d: `M ${x0} ${y} H ${railX} V ${noteTop + 9} H ${railX + 18}` });
      });
      setGeo(prev => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (body.current) ro.observe(body.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layout changes only when a line starts or the exhibit changes
  }, [shown, st.final, exhibitShown, exhibitCompact]);

  const noteOn = (i: number) => !st.final && st.done[i];
  return (
    <div ref={body} className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_13rem]">
      <div className="flex min-h-0 flex-col px-5 pt-4">
        <div className="flex items-center gap-3">
          <Orb speaking={st.speaking === 'Interviewer'} size={48} />
          <p className="t-small font-semibold">Interviewer <span className="font-normal text-(--ink)/65">· {st.speaking === 'Interviewer' ? 'speaking' : st.speaking === 'Lorenzo' ? 'listening' : 'on the line'}</span></p>
        </div>
        <div ref={region} className={`${s.capFade} relative mt-2 min-h-0 flex-1 overflow-hidden`}>
          <ol ref={list} className="absolute inset-x-0 top-0 space-y-3">
            {TRANSCRIPT.map((l, i) => (
              // Lines not reached yet stay in the page for screen readers, unseen.
              <li key={i} ref={el => { rows.current.set(i, el); }} className={st.started[i] ? '' : 'sr-only'}>
                <p className={`t-label font-semibold ${l.who === 'Lorenzo' ? 'text-(--cobalt)' : 'text-(--ink)/65'}`}>{l.who}</p>
                <Caption text={l.text} lit={st.started[i] ? st.lit[i] : 99} mark={l.mark} markRef={markRefs[i]}
                  className={`t-body ${i === st.current && !st.final ? 'text-(--ink)' : 'text-(--ink)/80'}`} />
                {/* The margin note, read with its line (the visible note in the margin is decorative to readers). */}
                {l.note && <p className="sr-only">Note: {l.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="relative border-l border-(--ink)/10">
        <div ref={exhibitBox} className={`${s.reveal} ${s.revealX} p-3`} data-on={exhibitShown}>
          {exhibitCompact
            ? <p className="t-label rounded-[8px] bg-(--paper) px-3 py-2 font-medium">{EXHIBIT.title}<span className="block text-(--ink)/65">Product costs 70% → 74%</span></p>
            : <ExhibitPanel />}
        </div>
      </div>
      {TRANSCRIPT.map((l, i) => {
        if (!l.note) return null;
        const g = geo.find(x => x.i === i);
        return (
          <div key={i} aria-hidden="true" className={`${s.reveal} absolute right-3 w-[11.25rem] ${g ? '' : 'hidden'}`} data-on={noteOn(i)} style={{ top: g?.top ?? 0 }}>
            <p className="t-small flex items-start gap-2 rounded-[6px] bg-(--white) font-medium">
              <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-(--cobalt)" />{l.note}
            </p>
          </div>
        );
      })}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {geo.map(g => <path key={g.i} d={g.d} fill="none" stroke="var(--cobalt)" strokeWidth="1" vectorEffect="non-scaling-stroke" className={s.reveal} data-on={noteOn(g.i)} />)}
      </svg>
    </div>
  );
}

const ExhibitPanel = memo(function ExhibitPanel() {
  return (
    <div className="rounded-[10px] border border-(--ink)/12 bg-(--paper) p-3">
      <p className="t-label font-semibold">{EXHIBIT.title}</p>
      <table className="t-label mt-2 w-full border-collapse text-left">
        <thead><tr className="border-b border-(--ink)/20"><th scope="col" className="py-1 pr-2 font-medium">Cost</th><th scope="col" className="py-1 pr-2 font-medium">2 yrs ago</th><th scope="col" className="py-1 font-medium">Now</th></tr></thead>
        <tbody>
          {EXHIBIT.rows.map(r => (
            <tr key={r.cost} className="border-b border-(--ink)/10">
              <th scope="row" className="py-1 pr-2 font-normal">{r.cost}</th>
              <td className={`${s.figures} py-1 pr-2`}>{r.before}</td>
              <td className={`${s.figures} py-1 ${r.before !== r.after ? 'font-semibold text-(--cobalt)' : ''}`}>{r.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

// ---------- Phones: framed on one line at a time ----------
// The focal moment is the math error: the current caption, its highlight and
// its note, with the orb small at the top. Earlier lines leave the screen
// (the whole transcript stays in the page for screen readers).

const MobileCall = memo(function MobileCall({ st, paused, onPause, reduced }: { st: St; paused: boolean; onPause: () => void; reduced: boolean }) {
  const cur = Math.max(0, st.current);
  const line = TRANSCRIPT[cur];
  const prev = cur > 0 ? TRANSCRIPT[cur - 1] : null;
  return (
    <div data-paused={paused} className={`${s.panel} ${s.quiet} relative flex flex-col overflow-hidden`}>
      <CallHeader pos={st.pos} paused={paused} onPause={onPause} reduced={reduced} compact />
      <div aria-hidden="true" className="flex items-center gap-2.5 px-4 pt-3">
        <Orb speaking={st.speaking === 'Interviewer'} size={24} />
        <p className="t-label font-semibold">Interviewer <span className="font-normal text-(--ink)/65">· {st.speaking === 'Interviewer' ? 'speaking' : st.speaking === 'Lorenzo' ? 'listening' : 'on the line'}</span></p>
      </div>
      {st.final ? (
        <div className="mt-3"><Snapshot flat /></div>
      ) : (
        <div aria-hidden="true" className="min-h-[15rem] px-4 pt-3 pb-4">
          {prev && <p className="t-small line-clamp-2 text-(--ink)/65"><span className="font-semibold">{prev.who}: </span>{prev.text}</p>}
          <p className={`t-label mt-3 font-semibold ${line.who === 'Lorenzo' ? 'text-(--cobalt)' : 'text-(--ink)/65'}`}>{line.who}</p>
          <Caption text={line.text} lit={st.lit[cur]} mark={line.mark} className="t-body mt-0.5" />
          {line.note && (
            <p className={`${s.reveal} t-small mt-3 flex items-start gap-2 border-t border-(--ink)/10 pt-3 font-medium`} data-on={st.done[cur]}>
              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-(--cobalt)" />{line.note}
            </p>
          )}
          {line.exhibit && <div className="mt-3"><ExhibitPanel /></div>}
        </div>
      )}
      {/* The whole transcript, for screen readers. */}
      <ol className="sr-only">
        {TRANSCRIPT.map((l, i) => <li key={i}>{l.who}: {l.text}{l.note ? ` Note: ${l.note}` : ''}</li>)}
      </ol>
      <div className="flex items-center gap-3 border-t border-(--ink)/10 px-4 py-2.5">
        <span className="t-label font-semibold text-(--ink)/65">Lorenzo</span>
        <Waveform speaking={st.speaking === 'Lorenzo'} bars={22} className="h-6 flex-1 overflow-hidden" />
      </div>
    </div>
  );
});
