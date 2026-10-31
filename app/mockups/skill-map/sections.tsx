import Link from 'next/link';
import { DIAGNOSTIC_HREF, HERO, HERO_SHOT, PLAN_SHOT, ROW, STATS, TECH, TECH_INTRO } from '../_shared/copy';
import { ShotImage } from '../_shared/shot';
import { Reveal } from '../_shared/reveal';
import { CountUp } from '../_shared/count-up';
import s from './skill-map.module.css';

// Concept 3: The Skill Map (Matt's mockup brief, 21 Oct 2026). Every section
// is a node on the spine (`data-level`, driven by ./spine.tsx).

// Content sits right of the spine: 3rem on phones, the spine's column plus a gap on desktop.
const WRAP = 'mx-auto w-full max-w-[1240px] pr-6 pl-12 lg:pr-12 lg:pl-28';

function LevelSection({ id, labelledBy, nodeTop = '3.25rem', className = '', children }: { id?: string; labelledBy: string; nodeTop?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} data-level="mastered" className={`relative ${className}`}>
      <span aria-hidden="true" className={s.node} style={{ top: nodeTop }} />
      {children}
    </section>
  );
}

// A faint constellation behind the hero screen: the skill graph as texture.
function Constellation() {
  const nodes: [number, number, 'sky' | 'cobalt' | 'mastery'][] = [[6, 10, 'mastery'], [30, 2, 'cobalt'], [62, 6, 'sky'], [92, 14, 'cobalt'], [98, 52, 'sky'], [90, 92, 'mastery'], [52, 98, 'cobalt'], [14, 94, 'sky'], [2, 56, 'cobalt']];
  const links: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 0], [1, 6], [2, 8], [3, 5]];
  const fill = { sky: 'var(--sky)', cobalt: 'var(--cobalt)', mastery: 'var(--mastery)' };
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className={`${s.constellation} absolute -inset-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)] overflow-visible lg:-inset-10 lg:h-[calc(100%+5rem)] lg:w-[calc(100%+5rem)]`}>
      {links.map(([a, b]) => <line key={`${a}-${b}`} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} vectorEffect="non-scaling-stroke" />)}
      {nodes.map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r="1.1" fill={fill[c]} vectorEffect="non-scaling-stroke" style={{ transform: 'scale(1)', transformBox: 'fill-box' }} />)}
    </svg>
  );
}

export function Header() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between px-6 lg:px-12">
      <Link href="/mockups" className="text-lg font-semibold tracking-[-0.01em]">CaseTester</Link>
      <Link href="/sign-in" className="text-sm font-medium text-(--cobalt) underline-offset-4 hover:underline">Sign in</Link>
    </header>
  );
}

export function Hero() {
  return (
    <LevelSection labelledBy="sm-hero" nodeTop="4.1rem" className="overflow-x-clip">
      <div className={`${WRAP} grid items-start gap-14 pt-14 pb-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20 lg:pb-28`}>
        <div>
          <h1 id="sm-hero" className="text-balance text-[clamp(2.5rem,4.4vw,3.9rem)] font-semibold leading-[1.04] tracking-[-0.035em]">{HERO.headline}</h1>
          <p className="mt-6 max-w-[32rem] text-lg leading-relaxed text-(--ink)/75">{HERO.subhead}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href={DIAGNOSTIC_HREF} className="inline-flex h-12 items-center rounded-full bg-(--cobalt) px-6 text-base font-medium text-(--white) transition-colors hover:bg-(--ink)">{HERO.primary}</Link>
            <a href="#sm-product" className="inline-flex h-12 items-center rounded-full border border-(--ink)/30 px-6 text-base font-medium transition-colors hover:border-(--ink)">{HERO.secondary}</a>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <figure className="relative">
            {/* The constellation frames the screen only, so the caption below stays clear of it. */}
            <div className="relative">
              <div className="hidden lg:block"><Constellation /></div>
              <div className={`${s.plate} relative overflow-hidden p-2`}>
                <ShotImage shot={HERO_SHOT} priority sizes="(min-width: 1240px) 500px, (min-width: 1024px) 42vw, 448px" className="rounded-[8px]" />
              </div>
            </div>
            <figcaption className="relative mt-12 text-xs text-(--ink)/70 lg:mt-14">Sample student data</figcaption>
          </figure>
        </div>
      </div>
    </LevelSection>
  );
}

export function Stats() {
  return (
    <LevelSection labelledBy="sm-stats" nodeTop="2.6rem">
      <div className={`${WRAP} pb-16`}>
        <h2 id="sm-stats" className="sr-only">CaseTester at a glance</h2>
        <dl className="grid gap-3 sm:grid-cols-6 lg:grid-cols-5">
          {STATS.map((st, i) => (
            <Reveal key={st.label} threshold={0.6} className={`${s.stat} flex flex-col-reverse justify-end gap-3 rounded-[14px] bg-(--white) p-5 ring-1 ring-(--ink)/10 lg:col-span-1 ${i < 3 ? 'sm:col-span-2' : 'sm:col-span-3'}`}>
              <dt className="max-w-[15rem] text-sm leading-snug text-(--ink)/75">{st.label}</dt>
              <dd className="flex flex-col gap-3">
                <CountUp value={st.value} className={`${s.figures} text-[clamp(2.3rem,3.4vw,2.9rem)] font-semibold leading-none tracking-[-0.03em]`} />
                <span aria-hidden="true" className={s.bar}><span /><span /><span /></span>
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </LevelSection>
  );
}

export function ProductRow() {
  return (
    <LevelSection id="sm-product" labelledBy="sm-row" nodeTop="5.1rem" className="scroll-mt-4">
      <div className={`${WRAP} grid items-start gap-12 py-20 lg:grid-cols-2 lg:gap-16`}>
        <div>
          <p className="text-sm font-semibold text-(--cobalt)">{ROW.step}</p>
          <h2 id="sm-row" className="mt-3 text-balance text-[clamp(2rem,3.4vw,2.8rem)] font-semibold leading-[1.08] tracking-[-0.03em]">{ROW.headline}</h2>
          <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-(--ink)/75">{ROW.body}</p>
          <ul className={`${s.bullets} mt-7 max-w-[34rem] space-y-2.5 text-base leading-relaxed`}>
            {ROW.bullets.map(b => <li key={b}>{b}</li>)}
          </ul>
        </div>
        <figure className="mx-auto w-full max-w-md lg:mr-0 lg:max-w-[440px]">
          <div className={`${s.plate} overflow-hidden p-2`}>
            <ShotImage shot={PLAN_SHOT} sizes="(min-width: 1240px) 424px, (min-width: 1024px) 36vw, 420px" className="rounded-[8px]" />
          </div>
          <figcaption className="mt-2 text-xs text-(--ink)/70">Sample student data: a 7-day Sprint plan</figcaption>
        </figure>
      </div>
    </LevelSection>
  );
}

// Four cards joined to one hub; each card's node levels up in turn.
export function TechSection() {
  return (
    <LevelSection labelledBy="sm-tech" nodeTop="4.15rem">
      <div className={`${WRAP} pt-16 pb-24 lg:pb-32`}>
        <p className="text-sm font-semibold text-(--cobalt)">{TECH_INTRO.eyebrow}</p>
        <h2 id="sm-tech" className="mt-3 text-[clamp(2.2rem,3.8vw,3.1rem)] font-semibold leading-[1.05] tracking-[-0.035em]">{TECH_INTRO.headline}</h2>
        <p className="mt-5 max-w-[40rem] text-lg leading-relaxed text-(--ink)/75">{TECH_INTRO.subhead}</p>
        <div className="relative mt-12">
          {/* Equal rows put the hub at the grid's centre; its four spokes land on each card's inner-corner node. */}
          <ul className="grid gap-5 md:auto-rows-fr md:grid-cols-2 md:gap-10">
            {TECH.map((t, i) => (
              <Reveal as="li" key={t.n} threshold={0.35} className={`${s.card} flex flex-col p-7 lg:p-9`} style={{ '--delay': `${i * 220}ms` } as React.CSSProperties}>
                <span aria-hidden="true" className={`${s.cardNode} ${s.corner} hidden md:block`} data-corner={['br', 'bl', 'tr', 'tl'][i]} />
                <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.1em] text-(--cobalt)">
                  <span className={s.figures}>{t.n}</span><span aria-hidden="true">·</span><span>{t.label}</span>
                </p>
                <h3 className="mt-4 text-xl font-semibold leading-snug tracking-[-0.01em]">{t.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-(--ink)/75">{t.body}</p>
                <ul aria-label="Tags" className="mt-auto flex flex-wrap gap-2 pt-7">
                  {t.tags.map(tag => <li key={tag} className="rounded-full bg-(--sky) px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em]">{tag}</li>)}
                </ul>
              </Reveal>
            ))}
          </ul>
          <svg aria-hidden="true" viewBox="0 0 40 40" className={`${s.hubLines} absolute top-1/2 left-1/2 hidden h-10 w-10 -translate-x-1/2 -translate-y-1/2 overflow-visible md:block`} data-final="">
            <line x1="20" y1="20" x2="0" y2="0" />
            <line x1="20" y1="20" x2="40" y2="0" />
            <line x1="20" y1="20" x2="0" y2="40" />
            <line x1="20" y1="20" x2="40" y2="40" />
            <circle cx="20" cy="20" r="9" fill="var(--paper)" />
            <circle cx="20" cy="20" r="6" className={s.hub} />
          </svg>
        </div>
      </div>
    </LevelSection>
  );
}
