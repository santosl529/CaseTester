import type { CSSProperties } from 'react';
import s from './exhibition.module.css';

// The loop cards' wordless previews (Matt's brief, 27 Oct 2026): one small
// picture per step, no text and no numbers, inline SVG and CSS only. Each
// rests until its card's `data-pv` turns to "play", plays once (CSS
// animations, transforms, opacity and SVG strokes only) and holds its last
// frame; "still" is that last frame without motion (reduced motion, or a card
// the line had already passed when the page loaded).

const v = (o: Record<string, string | number>) => o as CSSProperties;

// Diagnose: 8 skills benchmarked, the bars filling to varied lengths.
const BARS = [0.82, 0.56, 0.7, 0.4, 0.92, 0.62, 0.48, 0.76];
function Diagnose() {
  return (
    <span className={s.pvBars}>
      {BARS.map((f, k) => <span key={k} className={s.pvBar}><span className={s.pvBarFill} style={v({ '--f': `${f * 100}%`, '--k': k })} /></span>)}
    </span>
  );
}

// Your plan: a week, filled up to today (the 5th day, ringed).
function Plan() {
  return (
    <span className={s.pvWeek}>
      {Array.from({ length: 7 }, (_, k) => (
        <span key={k} className={s.pvDay}>
          {k < 5 && <span className={s.pvDayFill} style={v({ '--k': k })} />}
          {k === 4 && <span className={s.pvToday} />}
        </span>
      ))}
    </span>
  );
}

// Learn: an issue tree drawn top-down (1 node, 2 children, 4 leaves).
const TREE_LINES: [string, number][] = [
  ['M60 10V19H30V28', 150], ['M60 10V19H90V28', 150],
  ['M30 36V45H15V54', 520], ['M30 36V45H45V54', 520], ['M90 36V45H75V54', 520], ['M90 36V45H105V54', 520],
];
const TREE_NODES: [number, number, number][] = [[52, 2, 0], [22, 28, 420], [82, 28, 420], [7, 54, 700], [37, 54, 700], [67, 54, 700], [97, 54, 700]];
function Learn() {
  return (
    <svg viewBox="0 0 120 64" className={s.pvSvg}>
      <g className={s.pvTreeBase}>
        {TREE_LINES.map(([d]) => <path key={d} d={d} />)}
        {TREE_NODES.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="16" height="8" rx="2" />)}
      </g>
      {TREE_LINES.map(([d, delay]) => <path key={d} d={d} pathLength={1} className={s.pvLine} style={v({ '--d': `${delay}ms` })} />)}
      {TREE_NODES.map(([x, y, delay], k) => <rect key={`${x}-${y}`} x={x} y={y} width="16" height="8" rx="2" className={`${s.pvNode} ${k === 0 ? s.pvRoot : ''}`} style={v({ '--d': `${delay}ms` })} />)}
    </svg>
  );
}

// Drill: a timer runs down, then a streak of three.
function Drill() {
  return (
    <svg viewBox="0 0 120 64" className={s.pvSvg}>
      <circle cx="32" cy="32" r="24" className={s.pvRingTrack} />
      <circle cx="32" cy="32" r="24" pathLength={1} transform="rotate(-90 32 32)" className={s.pvRing} />
      {[72, 88, 104].map((x, k) => (
        <g key={x}>
          <circle cx={x} cy="32" r="4.5" fill="#E3E2DC" />
          <circle cx={x} cy="32" r="4.5" className={s.pvStreak} style={v({ '--k': k })} />
        </g>
      ))}
    </svg>
  );
}

// Mock interview: a voice waveform that speaks, then holds its shape.
// Per bar: three heights to pulse through, then the one it settles on.
const WAVE = [
  [0.7, 0.35, 0.6, 0.32], [0.4, 0.85, 0.5, 0.5], [0.9, 0.5, 0.75, 0.78], [0.6, 0.95, 0.4, 0.46],
  [0.5, 0.7, 1, 0.92], [0.85, 0.4, 0.55, 0.62], [0.75, 0.9, 0.45, 0.36], [0.45, 0.6, 0.85, 0.72],
  [0.65, 0.75, 0.6, 1], [0.95, 0.45, 0.7, 0.56], [0.55, 0.85, 0.4, 0.42], [0.8, 0.35, 0.6, 0.66],
  [0.5, 0.7, 0.35, 0.3], [0.4, 0.6, 0.5, 0.22],
];
function Mock() {
  return (
    <span className={s.pvWave}>
      {WAVE.map(([a, b, c, h], k) => (
        <span key={k} className={s.pvWaveBar} style={v({ '--a': a, '--b': b, '--c': c, '--h': h })}><span className={s.pvWaveOn} /></span>
      ))}
    </span>
  );
}

// Plan updates: the bottom row turns Cobalt and rises to the top.
const ROWS = ['92%', '70%', '84%'];
function Updates() {
  return (
    <span className={s.pvRows}>
      {ROWS.map((w, k) => (
        <span key={k} className={`${s.pvRow} ${k === 2 ? s.pvRowUp : ''}`} style={v({ '--w': w, '--k': k })}>{k === 2 && <span className={s.pvRowOn} />}</span>
      ))}
    </span>
  );
}

const PREVIEWS = { diagnose: Diagnose, plan: Plan, learn: Learn, drill: Drill, mock: Mock, adapt: Updates };

export function LoopPreview({ id }: { id: keyof typeof PREVIEWS }) {
  const Preview = PREVIEWS[id];
  return <span aria-hidden="true" className={s.pv}><Preview /></span>;
}
