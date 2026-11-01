'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { CHARACTERS, type CharacterId } from './characters';
import s from './exhibition.module.css';

// The cast row at the foot of a slide's left column (Matt's brief, 25 Oct
// 2026): a caption block (a speech bubble over a name tag, per character),
// then the illustration, whose table edge sits on the slide's footer rule.
//
// Stacked slides only show the illustration, sized to the room the column
// leaves: slides 01 and 02 up to 184px tall (3:2), slide 03's pair at a fixed
// 210 × 140 each, Kai overlapping Imani by 84px so their tables join. It is
// measured, never allowed to overflow: below 120px tall (140 for the pair),
// or too narrow beside the captions, the illustration goes and the caption
// stays; a caption too tall for the room steps down to the compact size
// (slide 03's two then sit side by side), and if even that doesn't fit, the
// row stays empty (the captions kept for screen readers) rather than overlap
// the copy.
// One decision for the whole section (Matt, 25 Oct): each row only reports
// how tall its art could be (`onArt`); the slides show illustrations only if
// all three can, and Graham and Valeria then share one height (`art`), so a
// visitor never sees one character drawn and another as text alone.
// The row shows only on the active slide: the art fades in, then the bubbles
// 150ms later. Unstacked (phones, short windows, reduced motion): captions
// only, as a plain list under the paragraph.
//
// The quotes and name tags are the text; the images are decorative (alt="",
// aria-hidden), so each character is introduced once.

const PAIR_W = 210, PAIR_H = 140, PAIR_OVERLAP = 84;
const SOLO_MAX = 184, SOLO_MIN = 120, GAP = 14;

type Mode = 'full' | 'compact' | 'side' | 'none';

export function Cast({ index, ids, active, stacking, art, onArt }: {
  index: number; ids: CharacterId[]; active: boolean; stacking: boolean;
  art: number; onArt: (index: number, artH: number) => void;
}) {
  const pair = ids.length > 1;
  const row = useRef<HTMLDivElement>(null);
  const caps = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Slide 03's captions are compact from the start.
  const [mode, setMode] = useState<Mode>(pair ? 'compact' : 'full');
  const [capH, setCapH] = useState(0);

  // The room the column leaves; a new size starts the fit over.
  useLayoutEffect(() => {
    const el = row.current;
    if (!el || !stacking) return;
    const ro = new ResizeObserver(() => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      setSize(prev => (prev.w === next.w && prev.h === next.h ? prev : next));
      setMode(pair ? 'compact' : 'full');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [stacking, pair]);

  // Fit the captions, then the illustration beside them.
  useLayoutEffect(() => {
    const c = caps.current;
    if (!stacking || !c || !size.h) return;
    if (mode === 'none') { onArt(index, 0); return; }
    const h0 = c.offsetHeight, capW = c.offsetWidth;
    if (h0 > size.h) { setMode(mode === 'full' ? 'compact' : pair && mode === 'compact' ? 'side' : 'none'); return; }
    let artH = 0;
    if (pair) {
      if (size.h >= PAIR_H && capW + GAP + PAIR_W * 2 - PAIR_OVERLAP <= size.w) artH = PAIR_H;
    } else {
      const h = Math.min(size.h, SOLO_MAX, (size.w - capW - GAP) / 1.5);
      if (h >= SOLO_MIN) artH = Math.floor(h);
    }
    setCapH(h0);
    onArt(index, artH);
  }, [stacking, size, mode, pair, index, onArt]);

  // Drawn only when every slide can be: `art` is the shared height (0: text only).
  const showArt = stacking && art > 0 && mode !== 'none';
  const soloH = Math.min(art, SOLO_MAX);
  // Slides 01 and 02: the bubble rises to about head height (58px at full size).
  const lift = !showArt ? 0 : pair ? 4 : Math.max(0, Math.min(Math.round(soloH * 0.315), size.h - capH));
  const compact = mode === 'compact' || mode === 'side';
  return (
    <div ref={row} className={s.cast} data-active={active} data-hidden={stacking && mode === 'none'}>
      <div ref={caps} data-side={mode === 'side'} className={`${s.castCaptions} ${pair ? s.castPair : ''}`} style={stacking ? { marginBottom: lift } : undefined}>
        {ids.map(id => {
          const c = CHARACTERS[id];
          return (
            <div key={id} className={s.castCaption}>
              <p className={`${s.bubble} ${compact ? s.bubbleCompact : ''}`}>“{c.quote}”</p>
              <p className={s.nameTag}><span className={s.castName}>{c.name}</span><span className={s.castRole}> · {c.role}</span></p>
            </div>
          );
        })}
      </div>
      {showArt && (
        <div aria-hidden="true" className={s.castArt}>
          {ids.map((id, k) => (
            // eslint-disable-next-line @next/next/no-img-element -- interim SVG art, served as is
            <img key={id} src={CHARACTERS[id].src} alt="" width={600} height={400} loading="lazy" decoding="async"
              style={pair ? { width: PAIR_W, height: PAIR_H, marginLeft: k > 0 ? -PAIR_OVERLAP : 0 } : { width: Math.round(soloH * 1.5), height: soloH }} />
          ))}
        </div>
      )}
    </div>
  );
}
