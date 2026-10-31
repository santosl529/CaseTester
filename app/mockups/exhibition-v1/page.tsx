import Link from 'next/link';
import { ArrowDown } from 'lucide-react';
import { DIAGNOSTIC_HREF, SKILLS } from '../_shared/copy';
import { HeroDemo } from './hero-demo';
import { Replay } from './replay';
import { PlanTimeline } from './plan';
import { TechSection } from './tech';
import { HERO, STATS_LINE } from './content';
import s from './exhibition.module.css';

// The exhibition homepage mockup (Matt's brief, 23 Oct 2026): "Intelligence,
// made visible". Five acts, each led by a product artefact at true scale:
// the loop, the interviewer, the plan, the engine, the close.

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';
const MUTED = 'text-(--ink)/70';
const BUTTON = 'inline-flex h-12 items-center rounded-full bg-(--cobalt) px-7 text-base font-medium text-(--white) transition-colors hover:bg-(--ink)';
const H2 = `${s.display} text-balance text-[clamp(2.15rem,5.4vw,4.75rem)]`;

export default function ExhibitionV1Mockup() {
  return (
    <div data-mockup className="flex-1 bg-(--paper)">
      <header className={`${WRAP} flex h-16 items-center justify-between`}>
        <Link href="/mockups" className="text-lg font-semibold tracking-[-0.02em]">CaseTester</Link>
        <Link href="/sign-in" className="text-sm font-medium text-(--cobalt) underline-offset-4 hover:underline">Sign in</Link>
      </header>

      <main>
        {/* 1. Hero: the whole promise in one glance */}
        <section aria-labelledby="ex-hero" className="border-t border-(--ink)/12">
          <div className={`${WRAP} grid gap-10 pt-8 pb-16 sm:gap-14 sm:pt-12 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-14 lg:pt-20 lg:pb-20`}>
            <div className="lg:pt-4">
              <h1 id="ex-hero" className={`${s.display} text-balance text-[clamp(2.5rem,4.9vw,4.4rem)]`}>{HERO.headline}</h1>
              <p className={`mt-5 max-w-[30rem] text-base leading-relaxed sm:mt-7 sm:text-lg ${MUTED}`}>{HERO.subhead}</p>
              <div className="mt-7 sm:mt-9">
                <Link href={DIAGNOSTIC_HREF} className={BUTTON}>{HERO.primary}</Link>
                <p className={`mt-3 text-sm ${MUTED}`}>{HERO.reassurance}</p>
              </div>
              <a href="#ex-replay-h" className="mt-6 inline-flex items-center gap-2 text-base font-medium text-(--cobalt) underline-offset-4 hover:underline sm:mt-8">
                {HERO.secondary}<ArrowDown aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>
            <div>
              <HeroDemo />
            </div>
          </div>
          <div className={WRAP}>
            <p className={`${s.figures} border-t border-(--ink)/12 py-5 text-sm ${MUTED}`}>{STATS_LINE.join(' · ')}</p>
          </div>
        </section>

        {/* 2. Interview replay: realism */}
        <section aria-labelledby="ex-replay-h" className="scroll-mt-4 py-24 lg:py-36">
          <div className={WRAP}>
            <p className={`${s.caps} text-(--cobalt)`}>See it in action</p>
            <h2 id="ex-replay-h" className={`${H2} mt-5 lg:max-w-[16ch]`}>An AI interviewer that plays it like the real thing</h2>
            <div className="mt-14 lg:mt-20">
              <Replay />
            </div>
          </div>
        </section>

        {/* 3. The plan that builds itself */}
        <section aria-labelledby="ex-plan-h" className="border-t border-(--ink)/12 py-24 lg:py-36">
          <div className={WRAP}>
            <h2 id="ex-plan-h" className={`${H2} lg:max-w-[15ch]`}>Built on how experts actually learn</h2>
            <p className={`mt-7 max-w-[40rem] text-lg leading-relaxed ${MUTED}`}>
              Doing case after case feels productive, but it rarely fixes what’s actually holding you back. A case interview is eight skills at once, and practicing them all together lets weak spots hide. We isolate each skill, train it to mastery, then prove it in a full case, so your improvement is real and lasts under pressure.
            </p>
            <div className="mt-16 lg:mt-20">
              <PlanTimeline />
            </div>

            <div className="mt-24 grid gap-10 border-t border-(--ink)/12 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
              <div>
                <h3 className="text-2xl font-semibold tracking-[-0.03em]">The 8 skills top firms hire for</h3>
                <p className={`mt-3 text-base leading-relaxed ${MUTED}`}>Interviewers at McKinsey, BCG, Bain, and the Big 4 evaluate the same core abilities. We train every one of them.</p>
              </div>
              <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
                {SKILLS.map(sk => (
                  <li key={sk.name} className="border-t border-(--ink)/12 pt-3">
                    <h4 className="text-sm font-semibold">{sk.name}</h4>
                    <p className={`mt-1 text-sm leading-relaxed ${MUTED}`}>{sk.line}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 4. Technology */}
        <TechSection />

        {/* 5. Final call to action */}
        <section aria-labelledby="ex-close" className="py-28 lg:py-44">
          <div className={`${WRAP} text-center`}>
            <h2 id="ex-close" className={`${s.display} mx-auto max-w-[14ch] text-balance text-[clamp(2.75rem,6vw,5.5rem)]`}>Find out where you stand. It’s free.</h2>
            <p className={`mx-auto mt-6 max-w-[34rem] text-lg leading-relaxed ${MUTED}`}>Take the diagnostic and get a personalized training plan in minutes.</p>
            <Link href={DIAGNOSTIC_HREF} className={`${BUTTON} mt-10`}>Take the free diagnostic</Link>
          </div>
        </section>
      </main>

      <footer className={WRAP}>
        <div className="border-t border-(--ink)/12 py-8">
        <p className="font-semibold">CaseTester</p>
        <p className={`mt-3 max-w-[48rem] text-xs leading-relaxed ${MUTED}`}>
          CaseTester is not affiliated with or endorsed by McKinsey &amp; Company, Boston Consulting Group, Bain &amp; Company, or any other firm named on this site.
        </p>
        </div>
      </footer>
    </div>
  );
}
