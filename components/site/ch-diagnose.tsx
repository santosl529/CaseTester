'use client';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHAPTERS, EXHIBIT, SNAPSHOT, TRANSCRIPT } from './content';
import { wordCount } from './call';
import { useRecent, useScrub } from './motion';
import { ChapterLayout } from './ride';
import { ThreadMark } from './thread';
import { CallControls, CaptionLine, ExhibitPanel, Presence, VoiceTopBar, type Speaker } from './voice-call';
import s from './exhibition.module.css';

// Chapter 01 · Diagnose (tension). The Fresh Basket interview as a live voice
// call, scrubbed by scroll: each word of each caption is a step along the
// chapter's track, so scrolling down plays the conversation and scrolling up
// rewinds it. After the math error and after the CFO's pushback the scrub
// holds for a beat before the candidate recovers. The last stretch lifts the
// notes into a skill snapshot, which chapter 02 picks up. Every line is in the
// page as text throughout. Since 24 Oct the call is drawn with the same pieces
// as the homepage's device (voice-call.tsx): the orb and waveform move only
// while the scroll does, so the Pause button went. Reduced motion shows the
// last scene, fully lit.

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

// The candidate is "You" on the call.
const speaker = (who: string): Speaker => (who === 'Lorenzo' ? 'You' : 'Interviewer');

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

export function DiagnoseChapter() {
  const { track, p, reduced } = useScrub();
  const step = Math.floor(p * STEPS.total);
  const st = useMemo(() => state(step), [step]);
  const pulse = useRecent(step);
  return (
    <ChapterLayout copy={CHAPTERS.diagnose} len={1.5} track={track} thread={st.final ? 'focus' : st.started[SLIP] ? 'gap' : 'none'}
      desktop={<DesktopCall st={st} pulse={pulse} reduced={reduced} />}
      mobile={<MobileCall st={st} pulse={pulse} reduced={reduced} />} />
  );
}

type St = ReturnType<typeof state>;

// ---------- Desktop: the full call, notes in the margin ----------

const DesktopCall = memo(function DesktopCall({ st, pulse, reduced }: { st: St; pulse: boolean; reduced: boolean }) {
  const exhibitShown = st.started[4];
  const exhibitCompact = st.started[7];
  const who = st.speaking ? speaker(st.speaking) : null;
  return (
    <div className={`${s.panel} ${s.quiet} relative flex h-[min(37rem,calc(100vh-var(--hdr)-9rem))] flex-col overflow-hidden`}>
      <VoiceTopBar name="Fresh Basket" time={clock(st.pos)} />
      <Body st={st} who={who} pulse={pulse} exhibitShown={exhibitShown} exhibitCompact={exhibitCompact} />
      <div className={s.grow} data-on={st.final} aria-hidden={!st.final}>
        <div><Snapshot on={st.final} flat /></div>
      </div>
      <div className={s.grow} data-on={!st.final}>
        <div><CallControls speaking={pulse && who === 'You'} still={reduced} /></div>
      </div>
    </div>
  );
});

function Body({ st, who, pulse, exhibitShown, exhibitCompact }: { st: St; who: Speaker | null; pulse: boolean; exhibitShown: boolean; exhibitCompact: boolean }) {
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
        <Presence who={who} pulse={pulse} size={48} />
        <div ref={region} className={`${s.capFade} relative mt-2 min-h-0 flex-1 overflow-hidden`}>
          <ol ref={list} className="absolute inset-x-0 top-0 space-y-3">
            {TRANSCRIPT.map((l, i) => (
              // Lines not reached yet stay in the page for screen readers, unseen.
              <li key={i} ref={el => { rows.current.set(i, el); }} className={st.started[i] ? '' : 'sr-only'}>
                <CaptionLine who={speaker(l.who)} text={l.text} lit={st.started[i] ? st.lit[i] : 99} mark={l.mark} markRef={markRefs[i]} newest={i === st.current && !st.final} />
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

// ---------- Phones: framed on one line at a time ----------
// The focal moment is the math error: the current caption, its highlight and
// its note, with the orb small at the top. Earlier lines leave the screen
// (the whole transcript stays in the page for screen readers).

const MobileCall = memo(function MobileCall({ st, pulse, reduced }: { st: St; pulse: boolean; reduced: boolean }) {
  const cur = Math.max(0, st.current);
  const line = TRANSCRIPT[cur];
  const prev = cur > 0 ? TRANSCRIPT[cur - 1] : null;
  const who = st.speaking ? speaker(st.speaking) : null;
  return (
    <div className={`${s.panel} ${s.quiet} relative flex flex-col overflow-hidden`}>
      <VoiceTopBar name="Fresh Basket" time={clock(st.pos)} compact />
      <div aria-hidden="true" className="px-4 pt-3"><Presence who={who} pulse={pulse} size={28} /></div>
      {st.final ? (
        <div className="mt-3"><Snapshot flat /></div>
      ) : (
        <div aria-hidden="true" className="min-h-[15rem] px-4 pt-3 pb-4">
          {prev && <div className="line-clamp-3"><CaptionLine who={speaker(prev.who)} text={prev.text} lit={99} newest={false} className="t-small" /></div>}
          <div className="mt-3"><CaptionLine who={speaker(line.who)} text={line.text} lit={st.lit[cur]} mark={line.mark} newest /></div>
          {line.note && (
            <p className={`${s.reveal} t-small mt-3 flex items-start gap-2 border-t border-(--ink)/10 pt-3 font-medium`} data-on={st.done[cur]}>
              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-(--cobalt)" />{line.note}
            </p>
          )}
          {line.exhibit && <div className="mt-3"><ExhibitPanel compact /></div>}
        </div>
      )}
      {/* The whole transcript, for screen readers. */}
      <ol className="sr-only">
        {TRANSCRIPT.map((l, i) => <li key={i}>{speaker(l.who)}: {l.text}{l.note ? ` Note: ${l.note}` : ''}</li>)}
      </ol>
      <CallControls speaking={pulse && who === 'You'} still={reduced} compact />
    </div>
  );
});
