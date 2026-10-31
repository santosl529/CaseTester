'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { CHAPTERS, EXHIBIT, SNAPSHOT, TRANSCRIPT } from './content';
import { Caption, Orb, Waveform, wordCount } from './call';
import { useClock, useOnScreen, useScenes } from './motion';
import { ChapterLayout } from './ride';
import s from './exhibition.module.css';

// Chapter 01 · Diagnose: the Fresh Basket interview as a live voice call.
// Scrolling advances the conversation (one exchange per scene); within a
// scene the new captions light word by word, the orb pulses while the
// interviewer speaks and the waveform moves while you do. Notes join their
// caption lines in the margin; the exhibit slides in beside the captions.
// The last scene lifts the notes into a skill snapshot, which chapter 02
// picks up. Pausable; reduced motion shows the last scene, fully lit.

const SCENES = 5;
const LAST_TALK = TRANSCRIPT.reduce((m, l) => Math.max(m, l.scene), 0);
const PER_WORD = 85;
const GAP = 300;
const CLOCKS = ['00:41', '02:14', '05:21', '06:37', '08:30'];

// When each line of a scene starts and how long it speaks, from the scene's start.
function timing(scene: number) {
  let at = 0;
  return TRANSCRIPT.map(l => {
    if (l.scene !== scene) return null;
    const start = at;
    const dur = wordCount(l.text) * PER_WORD;
    at = start + dur + GAP;
    return { start, dur };
  });
}
const TIMINGS = Array.from({ length: SCENES }, (_, k) => timing(k));
const SCENE_MS = TIMINGS.map(t => t.reduce((m, x) => (x ? Math.max(m, x.start + x.dur) : m), 0));

// `flat`: a section of the call panel (no card inside a card); otherwise a card.
export function Snapshot({ on = true, compact = false, flat = false }: { on?: boolean; compact?: boolean; flat?: boolean }) {
  return (
    <div className={flat ? 'border-t border-(--ink)/12 bg-(--paper) px-4 py-4 sm:px-5' : `rounded-[12px] border border-(--ink)/12 bg-(--white) ${compact ? 'p-4' : 'p-5'}`}>
      <p className={`${s.caps} text-(--ink)`}>Skill snapshot</p>
      <ul className="mt-3 divide-y divide-(--ink)/10">
        {SNAPSHOT.map((r, i) => (
          <li key={r.skill} className={`${s.reveal} flex items-center justify-between gap-3 py-2.5 text-sm`} data-on={on} style={{ '--delay': `${250 + i * 180}ms` } as React.CSSProperties}>
            <span className="font-medium">{r.skill}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.strong ? 'bg-(--mastery) text-(--ink)' : 'bg-(--cobalt) text-(--white)'}`}>{r.strong ? 'Strong start' : 'Focus area'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DiagnoseChapter() {
  const { track, scene, reduced } = useScenes(SCENES);
  const [paused, setPaused] = useState(false);
  const { ref: win, on } = useOnScreen<HTMLDivElement>(0.3);
  const ms = useClock(scene, !paused && on, 1e9);

  const talkScene = Math.min(scene, LAST_TALK);
  const final = scene === SCENES - 1;
  const t = final ? 1e9 : ms;
  const lit = TRANSCRIPT.map((l, i) => {
    if (l.scene < talkScene) return wordCount(l.text);
    if (l.scene > talkScene) return 0;
    const tm = TIMINGS[talkScene][i]!;
    return Math.max(0, Math.min(wordCount(l.text), Math.floor((t - tm.start) / PER_WORD) + 1));
  });
  const speaker = (() => {
    if (final || reduced) return null;
    const i = TRANSCRIPT.findIndex((l, k) => l.scene === talkScene && t >= TIMINGS[talkScene][k]!.start && t < TIMINGS[talkScene][k]!.start + TIMINGS[talkScene][k]!.dur + 150);
    return i < 0 ? null : TRANSCRIPT[i].who;
  })();
  const shownLines = TRANSCRIPT.map((l, i) => ({ l, i })).filter(({ l }) => l.scene <= talkScene);
  const exhibitShown = scene >= 1;
  const exhibitCompact = scene >= 3;
  const elapsed = Math.floor(Math.min(ms, SCENE_MS[talkScene] + 1500) / 1000);
  const [mm, ss] = CLOCKS[scene].split(':').map(Number);
  const time = `${String(mm + Math.floor((ss + elapsed) / 60)).padStart(2, '0')}:${String((ss + elapsed) % 60).padStart(2, '0')}`;

  return (
    <ChapterLayout copy={CHAPTERS.diagnose} n={SCENES} track={track}>
      <div ref={win} data-paused={paused || !on} className={`${s.panel} ${s.quiet} ${s.stage} relative flex flex-col overflow-hidden`}>
        <div className="flex items-center gap-3 border-b border-(--ink)/10 px-4 py-3 sm:px-5">
          <p className={`${s.caps} text-(--ink)`}>Sample interview</p>
          <p className="hidden text-sm text-(--ink)/65 sm:block">Fresh Basket · Profitability</p>
          <p className={`${s.figures} ml-auto flex items-center gap-2 text-sm text-(--ink)/70`}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--cobalt)" /><span className="sr-only">Call time </span>{time}
          </p>
          {!reduced && (
            <button type="button" onClick={() => setPaused(p => !p)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-(--ink)/20 px-2.5 text-xs font-medium hover:border-(--ink)">
              {paused ? <Play aria-hidden="true" className="h-3 w-3" /> : <Pause aria-hidden="true" className="h-3 w-3" />}
              {paused ? 'Play' : 'Pause'}<span className="sr-only"> interview</span>
            </button>
          )}
        </div>

        <Body lines={shownLines} lit={lit} talkScene={talkScene} final={final} exhibitShown={exhibitShown} exhibitCompact={exhibitCompact} speaker={speaker} />

        {/* The hand-off: the notes lift into a skill snapshot, which grows in under the captions. */}
        <div className={s.grow} data-on={final} aria-hidden={!final}>
          <div><Snapshot on={final} flat /></div>
        </div>
        <div className={s.grow} data-on={!final}>
          <div>
            <div className="flex items-center gap-3 border-t border-(--ink)/10 px-4 py-3 sm:px-5">
              <span className="text-xs font-semibold text-(--ink)/65">You</span>
              <Waveform speaking={speaker === 'You'} className="h-8 flex-1 overflow-hidden" />
            </div>
          </div>
        </div>
      </div>
    </ChapterLayout>
  );
}

type Shown = { l: (typeof TRANSCRIPT)[number]; i: number }[];

function Body({ lines, lit, talkScene, final, exhibitShown, exhibitCompact, speaker }: { lines: Shown; lit: number[]; talkScene: number; final: boolean; exhibitShown: boolean; exhibitCompact: boolean; speaker: string | null }) {
  const body = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const marks = useRef(new Map<number, HTMLElement | null>());
  const rows = useRef(new Map<number, HTMLElement | null>());
  const exhibitBox = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<{ i: number; top: number; d: string; len: number }[]>([]);

  // Where each visible annotated line sits, and the connector from its phrase to the margin.
  useLayoutEffect(() => {
    const measure = () => {
      const b = body.current, rg = region.current;
      if (!b || !rg || !window.matchMedia('(min-width: 1024px)').matches) { setGeo([]); return; }
      const base = b.getBoundingClientRect();
      const top = rg.getBoundingClientRect().top;
      const railX = rg.getBoundingClientRect().right - base.left + 14;
      const out: { i: number; top: number; d: string; len: number }[] = [];
      // Notes stack below the exhibit and each other, and stay inside the body.
      let floor = (exhibitBox.current?.getBoundingClientRect().bottom ?? base.top) - base.top + 10;
      const ceiling = b.clientHeight - 6;
      for (const { l, i } of lines) {
        const m = marks.current.get(i), row = rows.current.get(i);
        if (!l.note || !m || !row) continue;
        const rowTop = row.getBoundingClientRect().top;
        if (rowTop < top + 12) continue;
        const rects = m.getClientRects();
        const end = rects[rects.length - 1];
        const x0 = rects[0].left - base.left, x1 = end.right - base.left, y = end.bottom - base.top + 3;
        const height = Math.ceil(l.note.length / 26) * 20;
        const noteTop = Math.min(Math.max(rowTop - base.top, floor), ceiling - height);
        floor = noteTop + height + 10;
        const yDot = noteTop + 9;
        const d = rects.length > 1
          ? `M ${end.left - base.left} ${y} H ${railX} V ${yDot} H ${railX + 18}`
          : `M ${x0} ${y} H ${railX} V ${yDot} H ${railX + 18}`;
        out.push({ i, top: noteTop, d, len: Math.abs(railX - Math.min(x0, x1)) + Math.abs(yDot - y) + 18 });
      }
      setGeo(prev => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (body.current) ro.observe(body.current);
    return () => ro.disconnect();
    // Lines change only with the scene; the exhibit changes the margin's width use.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lines` is derived from talkScene
  }, [talkScene, final, exhibitShown, exhibitCompact]);

  const noteOn = (i: number) => !final && lit[i] >= wordCount(TRANSCRIPT[i].text);
  // Positions measured for an earlier scene may name lines no longer shown.
  const shownGeo = geo.filter(g => lines.some(x => x.i === g.i));

  return (
    <div ref={body} className="relative grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="flex min-h-0 flex-col px-4 pt-4 sm:px-5">
        <div className="flex items-center gap-3">
          <Orb speaking={speaker === 'Interviewer'} size={48} />
          <p className="text-sm font-semibold">Interviewer <span className="font-normal text-(--ink)/65">· {speaker === 'Interviewer' ? 'speaking' : speaker === 'You' ? 'listening' : 'on the line'}</span></p>
        </div>
        <div ref={region} className={`${s.capFade} relative mt-2 flex min-h-0 flex-1 flex-col justify-end overflow-hidden pb-3`}>
          <ol className="space-y-3.5">
            {lines.map(({ l, i }) => (
              <li key={i} ref={el => { rows.current.set(i, el); }}>
                <p className={`text-xs font-semibold tracking-[0.04em] ${l.who === 'You' ? 'text-(--cobalt)' : 'text-(--ink)/65'}`}>{l.who}</p>
                <Caption text={l.text} lit={lit[i]} mark={l.mark} markRef={el => { marks.current.set(i, el); }}
                  className={`mt-0.5 leading-relaxed ${l.scene === talkScene && !final ? 'text-lg text-(--ink)' : 'text-base text-(--ink)/80'}`} />
                {l.note && (
                  <p className={`${s.reveal} mt-1.5 flex items-start gap-2 text-sm font-medium lg:hidden`} data-on={noteOn(i)}>
                    <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-(--cobalt)" /><span><span className="sr-only">Note: </span>{l.note}</span>
                  </p>
                )}
                {l.exhibit && <div className="mt-2 lg:hidden"><ExhibitPanel on={exhibitShown} /></div>}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Desktop margin: the exhibit, then the notes beside their lines. */}
      <div className="relative hidden border-l border-(--ink)/10 lg:block">
        <div ref={exhibitBox} className={`${s.reveal} ${s.revealX} p-3`} data-on={exhibitShown}>
          {exhibitCompact
            ? <p className="rounded-[8px] bg-(--paper) px-3 py-2 text-xs font-medium">{EXHIBIT.title}<span className="block text-(--ink)/65">Product costs 70% → 74%</span></p>
            : <ExhibitPanel on={exhibitShown} />}
        </div>
      </div>
      {shownGeo.map(g => {
        const line = TRANSCRIPT[g.i];
        return (
          <aside key={g.i} aria-hidden="true" className={`${s.reveal} absolute right-3 hidden w-[11.25rem] lg:block`} data-on={noteOn(g.i)} style={{ top: g.top }}>
            <p className="flex items-start gap-2 rounded-[6px] bg-(--white) text-sm leading-snug font-medium">
              <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-(--cobalt)" />{line.note}
            </p>
          </aside>
        );
      })}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 hidden h-full w-full overflow-visible lg:block">
        {shownGeo.map(g => (
          <path key={g.i} d={g.d} fill="none" stroke="var(--cobalt)" strokeWidth="1" vectorEffect="non-scaling-stroke"
            className={s.reveal} data-on={noteOn(g.i)} />
        ))}
      </svg>
    </div>
  );
}

function ExhibitPanel({ on }: { on: boolean }) {
  return (
    <div className={`${s.reveal} rounded-[10px] border border-(--ink)/12 bg-(--paper) p-3`} data-on={on}>
      <p className="text-xs font-semibold">{EXHIBIT.title}</p>
      <table className="mt-2 w-full border-collapse text-left text-xs">
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
}
