import Link from 'next/link';
import { ArrowDown } from 'lucide-react';
import { DIAGNOSTIC_HREF } from '../_shared/copy';
import { HeroDemo } from './hero-demo';
import { LoopSection, StatsBand } from './loop';
import { Ride } from './ride';
import { DiagnoseChapter } from './ch-diagnose';
import { AdaptChapter, DrillChapter, LearnChapter, MockChapter, PlanChapter } from './chapters';
import { TechSection } from './tech';
import { HERO } from './content';
import s from './exhibition.module.css';

// The exhibition homepage mockup, v2 (Matt's brief, 23 Oct 2026): the hero
// opens on a live interview; a stats band; the loop; a guided ride through it
// (one chapter per step, a sticky rail to keep you oriented; the 8 skills are
// called out in chapter 05's report); the technology and the close as built in v1 (/mockups/exhibition-v1).

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';
const MUTED = 'text-(--ink)/70';
const BUTTON = 'inline-flex h-12 items-center rounded-full bg-(--cobalt) px-7 text-base font-medium text-(--white) transition-colors hover:bg-(--ink)';

export default function ExhibitionV2Mockup() {
  return (
    <div data-mockup className="flex-1 bg-(--paper)">
      <header className={`${WRAP} flex h-16 items-center justify-between`}>
        <Link href="/mockups" className="text-lg font-semibold tracking-[-0.02em]">CaseTester</Link>
        <Link href="/sign-in" className="text-sm font-medium text-(--cobalt) underline-offset-4 hover:underline">Sign in</Link>
      </header>

      <main>
        {/* 1. Hero */}
        <section aria-labelledby="ex-hero" data-shot="hero" className="border-t border-(--ink)/12">
          <div className={`${WRAP} grid gap-10 pt-8 pb-16 sm:gap-14 sm:pt-12 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-14 lg:pt-20 lg:pb-24`}>
            <div className="lg:pt-4">
              <h1 id="ex-hero" className={`${s.display} text-balance text-[clamp(2.5rem,4.9vw,4.4rem)]`}>{HERO.headline}</h1>
              <p className={`mt-5 max-w-[30rem] text-base leading-relaxed sm:mt-7 sm:text-lg ${MUTED}`}>{HERO.subhead}</p>
              <div className="mt-7 sm:mt-9">
                <Link href={DIAGNOSTIC_HREF} className={BUTTON}>{HERO.primary}</Link>
                <p className={`mt-3 text-sm ${MUTED}`}>{HERO.reassurance}</p>
              </div>
              <a href="#how" className="mt-6 inline-flex items-center gap-2 text-base font-medium text-(--cobalt) underline-offset-4 hover:underline sm:mt-8">
                {HERO.secondary}<ArrowDown aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>
            <HeroDemo />
          </div>
        </section>

        {/* 2. Stats band */}
        <StatsBand />

        {/* 3. The loop */}
        <LoopSection />

        {/* 4. The ride */}
        <Ride>
          <DiagnoseChapter />
          <PlanChapter />
          <LearnChapter />
          <DrillChapter />
          <MockChapter />
          <AdaptChapter />
        </Ride>

        {/* 6. Technology (as built) */}
        <TechSection />

        {/* 7. Final call to action (as built) */}
        <section aria-labelledby="ex-close" data-shot="close" className="py-28 lg:py-44">
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
