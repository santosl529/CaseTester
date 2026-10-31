'use client';
import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { TECH, TECH_INTRO } from '../_shared/copy';
import s from './exhibition.module.css';

// Section 4: the one dark act. Four nodes (one per card below) joined by thin
// Cobalt lines, with soft light travelling between them in different
// directions: connection, not a pipeline. Pausable; reduced motion shows the
// still network.
// Two arrangements: wide on desktop, tall on phones (its own composition,
// labels at reading size). Nodes are named for the cards, in no order.
type Layout = { w: number; h: number; nodes: [number, number][]; anchor: ('middle' | 'start' | 'end')[]; dy: number[] };
const WIDE: Layout = { w: 730, h: 290, nodes: [[120, 70], [470, 40], [610, 210], [230, 250]], anchor: ['middle', 'middle', 'middle', 'middle'], dy: [34, 34, 34, 34] };
const TALL: Layout = { w: 340, h: 420, nodes: [[90, 60], [260, 140], [230, 340], [70, 270]], anchor: ['middle', 'middle', 'middle', 'middle'], dy: [34, 34, 34, 34] };
const NAMES = ['Interview engine', 'Agents', 'Verification', 'Mastery'];
const EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]];
const PULSES: { edge: number; dur: number; delay: number; reverse?: true }[] = [
  { edge: 0, dur: 8.4, delay: 0 }, { edge: 2, dur: 10.2, delay: 2.6, reverse: true }, { edge: 4, dur: 12, delay: 4.2 },
  { edge: 1, dur: 9.2, delay: 6, reverse: true }, { edge: 5, dur: 11.2, delay: 1.4, reverse: true }, { edge: 3, dur: 9.8, delay: 5.2 },
];

function Network({ l, className }: { l: Layout; className: string }) {
  const line = ([a, b]: [number, number]) => `M ${l.nodes[a][0]} ${l.nodes[a][1]} L ${l.nodes[b][0]} ${l.nodes[b][1]}`;
  return (
    <svg viewBox={`0 0 ${l.w} ${l.h}`} className={`h-auto w-full ${className}`} role="img" aria-label="Four connected parts of the system: interview engine, agents, verification and mastery">
      {EDGES.map((e, i) => <path key={i} d={line(e)} className={s.vizLine} />)}
      {PULSES.map((p, i) => (
        <circle key={i} r="2.5" className={s.pulse} data-reverse={p.reverse}
          style={{ offsetPath: `path('${line(EDGES[p.edge])}')`, '--dur': `${p.dur}s`, '--delay': `${p.delay}s` } as React.CSSProperties} />
      ))}
      {l.nodes.map(([x, y], i) => (
        <g key={i} className={s.vizGlow}>
          <circle cx={x} cy={y} r="13" fill="var(--ink)" stroke="var(--cobalt)" strokeWidth="1.25" />
          <circle cx={x} cy={y} r="3.5" fill="var(--sky)" />
          <text x={x} y={y + l.dy[i]} textAnchor={l.anchor[i]} fontSize="12" fill="var(--sky)" className={s.mono}>{NAMES[i]}</text>
        </g>
      ))}
    </svg>
  );
}

export function TechSection() {
  const [paused, setPaused] = useState(false);
  return (
    <section id="technology" aria-labelledby="ex-tech" data-shot="technology" data-on-ink className="overflow-x-clip bg-(--ink) py-24 text-(--white) lg:py-36">
      <div className="mx-auto w-full max-w-[1240px] px-6 lg:px-12">
        <p className={`${s.mono} t-label text-(--sky)`}>{TECH_INTRO.eyebrow}</p>
        <h2 id="ex-tech" className={`${s.display} t-display mt-5 max-w-[14ch]`}>{TECH_INTRO.headline}</h2>
        <p className="t-body mt-6 max-w-[40rem] text-(--sky)">{TECH_INTRO.subhead}</p>

        <figure className="relative mx-auto mt-16 max-w-[24rem] pb-12 md:max-w-[45.625rem] md:pb-0" data-paused={paused}>
          <Network l={WIDE} className="hidden md:block" />
          <Network l={TALL} className="block md:hidden" />
          <button type="button" onClick={() => setPaused(p => !p)}
            className="btn-secondary absolute right-0 bottom-0 motion-reduce:hidden">
            {paused ? <Play aria-hidden="true" className="h-3 w-3" /> : <Pause aria-hidden="true" className="h-3 w-3" />}
            {paused ? 'Play' : 'Pause'}<span className="sr-only"> the light</span>
          </button>
        </figure>

        <ul className="mt-14 grid gap-4 md:grid-cols-2">
          {TECH.map(t => (
            <li key={t.n} className="flex flex-col rounded-[12px] border border-(--cobalt)/45 bg-[color-mix(in_srgb,var(--ink)_93%,var(--white))] p-7 lg:p-9">
              <p className={`${s.mono} t-label text-(--sky)`}><span className="tabular-nums">{t.n}</span> · {t.label}</p>
              <h3 className="t-card mt-4 font-semibold tracking-[-0.015em]">{t.title}</h3>
              <p className="t-body mt-3 text-(--sky)">{t.body}</p>
              <ul aria-label="Tags" className="mt-auto flex flex-wrap gap-2 pt-7">
                {t.tags.map(tag => <li key={tag} className={`${s.mono} rounded-full border border-(--cobalt)/80 px-3 py-1 t-label text-(--sky)`}>{tag}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
