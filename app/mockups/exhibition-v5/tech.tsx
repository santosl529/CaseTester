'use client';
import { useState } from 'react';
import { TECH, TECH_INTRO } from '../_shared/copy';
import { ExplodedDesktop, ExplodedMobile, scene } from './exploded';
import { useScrub } from './motion';
import s from './exhibition.module.css';

// Section 4: the one dark act. v3 (Matt's brief, 23 Oct 2026): the four-node
// diagram gave way to an exploded view of the product, scrubbed by scroll
// (pinned for about two screens on desktop, one and a half on phones). The
// cards and the layers point at each other: hovering or focusing card 0n
// lights layer n+1, hovering a layer lights its card; on touch, tapping a
// card brings the finished view into sight with its layer lit.

export function TechSection({ into = 'a' }: { into?: 'a' | 'b' }) {
  const { track, p, reduced } = useScrub();
  const sc = scene(p);
  const [hot, setHot] = useState<number | null>(null);

  const tap = (layer: number) => {
    if (!window.matchMedia('(hover: none)').matches || !track.current) return;
    setHot(layer);
    const r = track.current.getBoundingClientRect();
    window.scrollTo({ top: r.top + window.scrollY + r.height - window.innerHeight, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    // A (clean edge): a hard cut to Ink with generous room at the top. B: the
    // fade band above has already brought the page to Ink, so the usual padding.
    <section id="technology" aria-labelledby="ex-tech" data-shot="technology" data-theme="dark" data-surface="ink" data-on-ink
      className={`overflow-x-clip pb-24 lg:pb-36 ${into === 'a' ? 'pt-36 lg:pt-56' : 'pt-24 lg:pt-36'}`}>
      <div className="mx-auto w-full max-w-[1240px] px-6 lg:px-12">
        <p className={`${s.mono} t-label text-(--text-2)`}>{TECH_INTRO.eyebrow}</p>
        <h2 id="ex-tech" className={`${s.display} t-display mt-5 max-w-[14ch]`}>{TECH_INTRO.headline}</h2>
        <p className="t-body mt-6 max-w-[40rem] text-(--text-2)">{TECH_INTRO.subhead}</p>
      </div>

      <div ref={track} className={`${s.xTrack} mt-8 [--len:1.5] lg:mt-4 lg:[--len:2]`}>
        <div className={s.xPin}>
          <figure role="group" aria-label="How one answer moves through the system" className="w-full px-6 lg:px-12">
            <div className="hidden lg:block"><ExplodedDesktop sc={sc} hot={hot} onHot={setHot} /></div>
            <div className="mx-auto max-w-[26rem] lg:hidden"><ExplodedMobile sc={sc} /></div>
          </figure>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1240px] px-6 lg:px-12">
        <ul className="mt-14 grid gap-4 md:grid-cols-2">
          {TECH.map((t, i) => {
            const lit = hot === i + 1;
            return (
              <li key={t.n}>
                {/* Focusable so the keyboard gets the same layer highlight as hover. */}
                <article tabIndex={0} aria-labelledby={`tech-card-${t.n}`}
                  onMouseEnter={() => setHot(i + 1)} onMouseLeave={() => setHot(null)}
                  onFocus={() => setHot(i + 1)} onBlur={() => setHot(null)} onClick={() => tap(i + 1)}
                  className={`flex h-full flex-col rounded-[12px] border p-7 transition-colors duration-300 lg:p-9 ${lit ? 'border-(--sky) bg-[color-mix(in_srgb,var(--ink)_86%,var(--white))]' : 'border-(--cobalt)/45 bg-[color-mix(in_srgb,var(--ink)_93%,var(--white))]'}`}>
                  <p className={`${s.mono} t-label text-(--text-2)`}><span className="tabular-nums">{t.n}</span> · {t.label}</p>
                  <h3 id={`tech-card-${t.n}`} className="t-card mt-4 font-semibold tracking-[-0.015em]">{t.title}</h3>
                  <p className="t-body mt-3 text-(--text-2)">{t.body}</p>
                  <ul aria-label="Tags" className="mt-auto flex flex-wrap gap-2 pt-7">
                    {t.tags.map(tag => <li key={tag} className={`${s.mono} rounded-full border border-(--cobalt)/80 px-3 py-1 t-label text-(--sky)`}>{tag}</li>)}
                  </ul>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
