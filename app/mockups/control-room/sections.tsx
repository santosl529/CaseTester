import Link from 'next/link';
import { DIAGNOSTIC_HREF, HERO, PLAN_SHOT, WORKOUT_SHOT, ROW, SKILLS, STATS, TECH, TECH_INTRO, type Shot } from '../_shared/copy';
import { ShotImage } from '../_shared/shot';
import { Reveal } from '../_shared/reveal';
import s from './control-room.module.css';

// Concept 2: The Control Room (Matt's mockup brief, 21 Oct 2026). The tech
// section is exported for the hybrid.

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';

// A sample student's skill map: the 8 skills from the homepage, in the
// product's states (green only for Mastered).
const NODE_STATES = ['mastered', 'mastered', 'practiced', 'learning', 'learning', 'practiced', 'practiced', 'learning'] as const;
const STATE_WORD = { mastered: 'Mastered', practiced: 'Practiced', learning: 'Learning' } as const;

export function Header() {
  return (
    <header className={`${WRAP} flex h-16 items-center justify-between`}>
      <Link href="/mockups" className="text-lg font-semibold tracking-[-0.01em]">CaseTester</Link>
      <Link href="/sign-in" className="text-sm font-medium text-(--sky) underline-offset-4 hover:underline">Sign in</Link>
    </header>
  );
}

// A lit screen: the product capture inside a glowing panel; it fills in from
// the top when it scrolls into view.
function Screen({ shot, sizes, caption, priority = false, children }: { shot: Shot; sizes: string; caption: string; priority?: boolean; children?: React.ReactNode }) {
  return (
    <figure>
      <Reveal className={`${s.panel} p-3 sm:p-4`} threshold={0.2}>
        <div className={`${s.fill} overflow-hidden rounded-[8px] bg-(--white)`}>
          <ShotImage shot={shot} sizes={sizes} priority={priority} />
        </div>
        {children}
      </Reveal>
      <figcaption className={`${s.mono} mt-3 text-[0.6875rem] text-(--sky)`}>{caption}</figcaption>
    </figure>
  );
}

function SkillRail() {
  return (
    <Reveal as="div" className={`${s.nodes} mt-4 border-t border-(--sky)/12 px-1 pt-4`} threshold={0.5}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className={`${s.mono} text-[0.6875rem] text-(--sky)`}>Skill map</p>
        <ul aria-label="Legend" className={`${s.mono} flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-(--sky)`}>
          {(['mastered', 'practiced', 'learning'] as const).map(st => (
            <li key={st} className="flex items-center gap-1.5"><span aria-hidden="true" data-state={st} className={`${s.node} !h-2 !w-2`} />{STATE_WORD[st]}</li>
          ))}
        </ul>
      </div>
      <ol className={`${s.rail} mt-3 grid grid-cols-2 gap-y-4 sm:grid-cols-4`}>
        {SKILLS.map((sk, i) => (
          <li key={sk.name}>
            <span aria-hidden="true" data-state={NODE_STATES[i]} className={s.node} style={{ transitionDelay: `${300 + i * 140}ms` }} />
            <span className={`${s.mono} block text-[0.6875rem] leading-snug tracking-[0.02em] text-(--sky)`}>
              {sk.name}<span className="sr-only">: {STATE_WORD[NODE_STATES[i]]}</span>
            </span>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="cr-hero" className="relative overflow-x-clip">
      <div aria-hidden="true" className={`${s.halo} pointer-events-none absolute top-0 right-[-10%] h-[720px] w-[720px] max-w-none`} />
      <div className={`${WRAP} relative grid items-center gap-12 pt-10 pb-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:pt-16 lg:pb-28`}>
        <div>
          <h1 id="cr-hero" className="text-balance text-[clamp(2.5rem,4.4vw,3.9rem)] font-semibold leading-[1.04] tracking-[-0.035em]">{HERO.headline}</h1>
          <p className={`mt-6 max-w-[32rem] text-lg leading-relaxed ${s.muted}`}>{HERO.subhead}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href={DIAGNOSTIC_HREF} className={`${s.glowButton} inline-flex h-12 items-center rounded-[8px] bg-(--cobalt) px-6 text-base font-medium text-(--white) transition-colors hover:bg-(--white) hover:text-(--ink)`}>{HERO.primary}</Link>
            <a href="#cr-product" className="inline-flex h-12 items-center rounded-[8px] border border-(--sky)/40 px-6 text-base font-medium text-(--sky) transition-colors hover:border-(--sky)">{HERO.secondary}</a>
          </div>
        </div>
        <div className="mx-auto w-full max-w-md lg:max-w-none">
          <Screen shot={WORKOUT_SHOT} priority caption="Sample student data" sizes="(min-width: 1240px) 520px, (min-width: 1024px) 44vw, 448px">
            <SkillRail />
          </Screen>
        </div>
      </div>
    </section>
  );
}

export function Stats() {
  return (
    <section aria-labelledby="cr-stats" className={WRAP}>
      <h2 id="cr-stats" className="sr-only">CaseTester at a glance</h2>
      <dl className="grid border-y border-(--sky)/15 sm:grid-cols-6 lg:grid-cols-5">
        {STATS.map((st, i) => (
          <div key={st.label} className={[
            'flex flex-col-reverse justify-end gap-3 py-7 sm:px-6 border-(--sky)/15 lg:col-span-1 lg:border-t-0',
            i > 0 ? 'border-t' : '',
            i < 3 ? 'sm:col-span-2 sm:border-t-0' : 'sm:col-span-3 sm:border-t',
            i === 1 || i === 2 || i === 4 ? 'sm:border-l' : '',
            i === 3 ? 'lg:border-l' : '',
            i === 0 || i === 3 ? 'sm:pl-0' : '',
            i === 3 ? 'lg:pl-6' : '',
          ].join(' ')}>
            <dt className={`${s.mono} max-w-[15rem] text-[0.6875rem] leading-relaxed text-(--sky)`}>{st.label}</dt>
            <dd className="text-[clamp(2.4rem,3.6vw,3.1rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums">{st.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ProductRow() {
  return (
    <section id="cr-product" aria-labelledby="cr-row" className="scroll-mt-4 py-20 lg:py-28">
      <div className={`${WRAP} grid items-start gap-12 lg:grid-cols-2 lg:gap-16`}>
        <div className="lg:sticky lg:top-12">
          <p className={`${s.mono} text-xs text-(--sky)`}>{ROW.step}</p>
          <h2 id="cr-row" className="mt-4 text-balance text-[clamp(2rem,3.4vw,2.8rem)] font-semibold leading-[1.08] tracking-[-0.03em]">{ROW.headline}</h2>
          <p className={`mt-5 max-w-[34rem] text-lg leading-relaxed ${s.muted}`}>{ROW.body}</p>
          <ul className={`${s.bullets} mt-7 max-w-[34rem] space-y-2.5 text-base leading-relaxed`}>
            {ROW.bullets.map(b => <li key={b}>{b}</li>)}
          </ul>
        </div>
        <div className="mx-auto w-full max-w-md lg:mr-0 lg:max-w-[480px]">
          <Screen shot={PLAN_SHOT} caption="Sample student data: a 7-day Sprint plan" sizes="(min-width: 1240px) 448px, (min-width: 1024px) 38vw, 420px" />
        </div>
      </div>
    </section>
  );
}

// The technology on lighter Ink cards with monospace chips. The hybrid passes
// a chapter number (set in the report's margin column) and its headline face.
export function TechSection({ chapter, headlineClassName = 'font-semibold tracking-[-0.03em]', titleClassName = 'font-semibold tracking-[-0.01em]', glow = false, cobaltEdges = false, className = '' }: { chapter?: React.ReactNode; headlineClassName?: string; titleClassName?: string; glow?: boolean; cobaltEdges?: boolean; className?: string }) {
  return (
    <section aria-labelledby="cr-tech" className={`py-20 lg:py-28 ${className}`}>
      <div className={chapter ? `${WRAP} lg:grid lg:grid-cols-[136px_minmax(0,1fr)]` : WRAP}>
        {chapter}
        <div className="min-w-0">
        <p className={`${s.mono} text-xs text-(--sky)`}>{TECH_INTRO.eyebrow}</p>
        <h2 id="cr-tech" className={`mt-4 text-[clamp(2.2rem,3.8vw,3.1rem)] leading-[1.05] ${headlineClassName}`}>{TECH_INTRO.headline}</h2>
        <p className={`mt-5 max-w-[40rem] text-lg leading-relaxed ${s.muted}`}>{TECH_INTRO.subhead}</p>
        <div className="relative mt-12">
        {glow && <div aria-hidden="true" className={`${s.halo} pointer-events-none absolute -inset-x-10 -inset-y-16`} />}
        <ul className="relative grid gap-4 md:grid-cols-2">
          {TECH.map(t => (
            <li key={t.n} className={`${s.card} ${cobaltEdges ? s.cardCobalt : ''} flex flex-col p-7 lg:p-9`}>
              <p className={`${s.mono} text-xs text-(--sky)`}><span className="tabular-nums">{t.n}</span> · {t.label}</p>
              <h3 className={`mt-4 text-xl leading-snug ${titleClassName}`}>{t.title}</h3>
              <p className={`mt-3 text-base leading-relaxed ${s.muted}`}>{t.body}</p>
              <ul aria-label="Tags" className="mt-auto flex flex-wrap gap-2 pt-7">
                {t.tags.map(tag => <li key={tag} className={`${s.chip} ${s.mono} rounded-full px-3 py-1 text-xs`}>{tag}</li>)}
              </ul>
            </li>
          ))}
        </ul>
        </div>
        </div>
      </div>
    </section>
  );
}

export { s as controlRoomStyles };
