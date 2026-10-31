import Link from 'next/link';
import { DIAGNOSTIC_HREF, HERO, PLAN_SHOT, ROW, STATS, TECH, TECH_INTRO, WORKOUT_SHOT, type Shot } from '../_shared/copy';
import { ShotImage } from '../_shared/shot';
import s from './case-report.module.css';

// Concept 1: The Case Report (Matt's mockup brief, 21 Oct 2026). Sections are
// exported so the hybrid can use them as they are.

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';
const SECONDARY = 'text-(--ink)/75';

export function headlineClass(serif: boolean) {
  return serif ? s.display : s.sans;
}

// A chapter: a full-width Ink rule, the number in the margin column on
// desktop and above the content on phones.
export function Chapter({ n, id, label, serif = true, children, className = '' }: { n: string; id?: string; label: string; serif?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-label={label} className={`border-t border-(--ink) ${className}`}>
      <div className={`${WRAP} lg:grid lg:grid-cols-[136px_minmax(0,1fr)]`}>
        <p aria-hidden="true" className={`${s.chapterNumber} ${serif ? '' : s.sans} pt-8 text-[1.75rem] lg:pt-14 lg:text-[2.75rem]`}>{n}</p>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

export function Masthead() {
  return (
    <header className={`${WRAP} flex h-16 items-center justify-between`}>
      <Link href="/mockups" className="text-lg font-semibold tracking-[-0.01em]">CaseTester</Link>
      <Link href="/sign-in" className="text-sm font-medium text-(--cobalt) underline-offset-4 hover:underline">Sign in</Link>
    </header>
  );
}

// An exhibit: number and title over a rule, the screen, a caption.
export function Exhibit({ n, title, caption, shot, sizes, priority = false, className = '' }: { n: number; title: string; caption: string; shot: Shot; sizes: string; priority?: boolean; className?: string }) {
  return (
    <figure className={className}>
      <p className="flex items-baseline gap-2 border-b border-(--ink) pb-2 text-sm">
        <span className={`${s.caps} text-(--cobalt)`}>Exhibit {n}</span>
        <span className="font-semibold">{title}</span>
      </p>
      <div className="mt-4 border border-(--ink)/15 bg-(--white)">
        <ShotImage shot={shot} sizes={sizes} priority={priority} />
      </div>
      <figcaption className="mt-2 text-xs leading-relaxed text-(--ink)/70">{caption}</figcaption>
    </figure>
  );
}

export function Hero({ serif }: { serif: boolean }) {
  return (
    <Chapter n="01" label="Introduction" serif={serif}>
      <div className="grid items-start gap-12 pt-6 pb-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-14 lg:pt-14 lg:pb-24">
        <div className="lg:pt-6">
          <h1 className={`${headlineClass(serif)} text-balance text-[clamp(2.5rem,4.3vw,3.9rem)] leading-[1.04]`}>{HERO.headline}</h1>
          <p className={`mt-6 max-w-[32rem] text-lg leading-relaxed ${SECONDARY}`}>{HERO.subhead}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href={DIAGNOSTIC_HREF} className="inline-flex h-12 items-center rounded-[4px] bg-(--cobalt) px-6 text-base font-medium text-(--white) transition-colors hover:bg-(--ink)">{HERO.primary}</Link>
            <a href="#product" className="inline-flex h-12 items-center rounded-[4px] border border-(--ink) px-6 text-base font-medium transition-colors hover:bg-(--ink) hover:text-(--white)">{HERO.secondary}</a>
          </div>
        </div>
        <Exhibit n={1} title="Today’s workout" caption="Sample student data: week 2 of a 6-week Standard plan." shot={WORKOUT_SHOT} priority
          sizes="(min-width: 1240px) 480px, (min-width: 1024px) 40vw, 448px" className="mx-auto w-full max-w-md lg:max-w-none" />
      </div>
    </Chapter>
  );
}

// The stats bar as a key-findings slide: a bordered panel, five findings, each
// under a short Cobalt rule.
export function Findings({ serif }: { serif: boolean }) {
  return (
    <Chapter n="02" label="Key findings" serif={serif}>
      <div className="py-10 lg:py-14">
        <div className="border border-(--ink) bg-(--white)">
          <h2 className={`${s.caps} border-b border-(--ink) px-6 py-4`}>Key findings</h2>
          <dl className="grid sm:grid-cols-6 lg:grid-cols-5">
            {STATS.map((st, i) => (
              <div key={st.label} className={[
                'flex flex-col-reverse justify-end gap-3 px-6 py-7 border-(--ink)/15 lg:col-span-1 lg:border-t-0',
                i > 0 ? 'border-t' : '',
                i < 3 ? 'sm:col-span-2 sm:border-t-0' : 'sm:col-span-3 sm:border-t',
                i === 1 || i === 2 || i === 4 ? 'sm:border-l' : '',
                i === 3 ? 'lg:border-l' : '',
              ].join(' ')}>
                <dt className={`max-w-[15rem] text-sm leading-snug ${SECONDARY}`}>{st.label}</dt>
                <dd className="flex flex-col gap-3">
                  <span aria-hidden="true" className="block h-0.5 w-8 bg-(--cobalt)" />
                  <span className={`${headlineClass(serif)} ${s.figures} text-[clamp(2.5rem,4vw,3.4rem)] leading-none`}>{st.value}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Chapter>
  );
}

export function ExhibitRow({ serif }: { serif: boolean }) {
  return (
    <Chapter n="03" id="product" label={ROW.headline} serif={serif} className="scroll-mt-4">
      <div className="grid items-start gap-12 pt-6 pb-16 lg:grid-cols-2 lg:gap-16 lg:pt-14 lg:pb-24">
        <div className="lg:sticky lg:top-10">
          <p className={`${s.caps} text-(--cobalt)`}>{ROW.step}</p>
          <h2 className={`${headlineClass(serif)} mt-4 text-balance text-[clamp(2rem,3.4vw,2.9rem)] leading-[1.06]`}>{ROW.headline}</h2>
          <p className={`mt-5 max-w-[34rem] text-lg leading-relaxed ${SECONDARY}`}>{ROW.body}</p>
          <ul className={`${s.bullets} mt-7 max-w-[34rem] space-y-2.5 border-t border-(--ink)/15 pt-6 text-base leading-relaxed`}>
            {ROW.bullets.map(b => <li key={b}>{b}</li>)}
          </ul>
        </div>
        <Exhibit n={2} title="Your training plan" caption="Sample student data: a 7-day Sprint plan on day 2." shot={PLAN_SHOT}
          sizes="(min-width: 1240px) 460px, (min-width: 1024px) 40vw, 448px" className="mx-auto w-full max-w-md lg:mr-0 lg:max-w-[460px]" />
      </div>
    </Chapter>
  );
}

export function TechChapter({ serif }: { serif: boolean }) {
  return (
    <Chapter n="04" label={TECH_INTRO.headline} serif={serif}>
      <div className="pt-6 pb-20 lg:pt-14 lg:pb-28">
        <p className={`${s.caps} text-(--cobalt)`}>{TECH_INTRO.eyebrow}</p>
        <h2 className={`${headlineClass(serif)} mt-4 text-[clamp(2.2rem,3.8vw,3.2rem)] leading-[1.04]`}>{TECH_INTRO.headline}</h2>
        <p className={`mt-5 max-w-[40rem] text-lg leading-relaxed ${SECONDARY}`}>{TECH_INTRO.subhead}</p>
        <ul className="mt-12 grid gap-5 md:grid-cols-2">
          {TECH.map(t => (
            <li key={t.n} className="flex flex-col border border-(--ink)/20 p-7 lg:p-9">
              <p className={`${s.caps} text-(--cobalt)`}><span className={s.figures}>{t.n}</span> · {t.label}</p>
              <h3 className={`${headlineClass(serif)} mt-4 text-[1.65rem] leading-tight`}>{t.title}</h3>
              <p className={`mt-3 text-base leading-relaxed ${SECONDARY}`}>{t.body}</p>
              <ul aria-label="Tags" className="mt-auto flex flex-wrap gap-2 pt-7">
                {t.tags.map(tag => <li key={tag} className="rounded-[3px] bg-(--sky) px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em]">{tag}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </Chapter>
  );
}

export function Colophon() {
  return <div className="border-t border-(--ink)" />;
}
