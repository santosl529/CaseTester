'use client';
import { memo, useEffect, useRef, useSyncExternalStore } from 'react';
import { HOOD } from './content';
import { TECH_LAYERS_SVG } from './tech-layers';
import s from './exhibition.module.css';

// Figure 1 on the Under the hood slide (Matt's brief, 28 Oct 2026): the layer
// diagram (public/landing/tech-layers.svg) inlined, so its groups animate and
// its text takes the page's fonts. `state` comes from the slide: "rest" (the
// four layers drawn together at the centre, connectors and labels hidden),
// "play" (they separate once: 04 first, then 03, 02 and 01, 90ms apart, 700ms
// each; the connectors draw in; each label fades in just after its layer
// lands) and "still" (the end state without motion: reduced motion and the
// server render). CSS only, transforms, opacity and strokes.
//
// The SVG is aria-hidden; the list after it carries the same four layers for
// screen readers, and is the visible key on phones (below 640px), where the
// diagram shows its planes only.

// The connectors are dashed, so they draw in through a mask of solid lines
// (stroke-dashoffset), bottom to top as the layers land.
const DRAW = `<defs><mask id="hood-draw" maskUnits="userSpaceOnUse" x="0" y="0" width="580" height="420">${[30, 170, 310]
  .map(x => `<line class="hood-draw" x1="${x}" y1="358" x2="${x}" y2="76" stroke="#fff" stroke-width="6" pathLength="1"/>`).join('')}</mask></defs>`;
// Drawn from the top left, under its label, whatever room the column gives.
const SVG = TECH_LAYERS_SVG.replace('<svg ', '<svg preserveAspectRatio="xMinYMin meet" ').replace(/(<svg[^>]*>)/, `$1${DRAW}`).replace('<g id="connectors">', '<g id="connectors" mask="url(#hood-draw)">');

// The four layers' labels and lines, read from the SVG itself (top layer first).
const texts = (part: string, font: string) => [...part.matchAll(new RegExp(`<text[^>]*font-family="${font}[^"]*"[^>]*>([^<]*)</text>`, 'g'))].map(m => m[1]);
export const HOOD_LAYERS = TECH_LAYERS_SVG.split('<g id="layer-').slice(1)
  .map(part => ({ n: part.slice(0, 2), label: texts(part, 'JetBrains')[0], line: texts(part, 'Inter').join(' ') }))
  .sort((a, b) => a.n.localeCompare(b.n));

// Phones: the planes only, so the view closes in on them.
const NARROW = '(max-width: 639.98px)';
const subscribe = (cb: () => void) => { const m = window.matchMedia(NARROW); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };

// The SVG on its own, never re-rendered: React would write the markup again
// on every state change, undoing the view set below.
const Diagram = memo(function Diagram() {
  return <div className={s.hoodSvg} dangerouslySetInnerHTML={{ __html: SVG }} />;
});

export function HoodFigure({ state }: { state: 'rest' | 'play' | 'still' }) {
  const box = useRef<HTMLDivElement>(null);
  const narrow = useSyncExternalStore(subscribe, () => window.matchMedia(NARROW).matches, () => false);
  useEffect(() => {
    const svg = box.current?.querySelector('svg');
    if (!svg) return;
    // The view and its proportions together (width and height set the aspect ratio).
    const [w, h] = narrow ? [300, 402] : [580, 420];
    svg.setAttribute('viewBox', narrow ? `20 14 ${w} ${h}` : `0 0 ${w} ${h}`);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
  }, [narrow]);
  return (
    <figure aria-labelledby="hood-fig" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <figcaption id="hood-fig" className={`${s.hoodMono} ${s.hoodFigLabel} mb-3 flex-none`}>
        <span className="text-(--paper)">{HOOD.figure[0]}</span><span className="text-(--hood-2)"> · {HOOD.figure[1]}</span>
      </figcaption>
      <div ref={box} data-state={state} className={s.hoodFig}><Diagram /></div>
      <ol className={`${s.hoodKey} sr-only max-sm:not-sr-only`}>
        {HOOD_LAYERS.map(l => (
          <li key={l.n}>
            <p className={`${s.hoodMono} ${s.hoodKeyLabel}`}>{l.label}</p>
            <p className="mt-1 text-(--paper)">{l.line}</p>
          </li>
        ))}
      </ol>
    </figure>
  );
}
