import Link from 'next/link';
import { ArrowDown } from 'lucide-react';
import { DIAGNOSTIC_HREF } from '../_shared/copy';
import { HeroDemo } from './hero-demo';
import { LoopSection, StatsBand } from './loop';
import { Ride } from './ride';
import { DiagnoseChapter } from './ch-diagnose';
import { AdaptChapter, DrillChapter, LearnChapter, MockChapter, PlanChapter } from './chapters';
import { TechSection } from './tech';
import { StickyHeader } from './sticky-header';
import { RevealRoot } from './reveal';
import { HERO } from './content';
import s from './exhibition.module.css';
import './type.css';

// The exhibition homepage mockup, v3 (Matt's briefs, 23 Oct 2026): the hero
// opens on a live interview; a stats band; the loop; a guided ride through it
// (one scroll-scrubbed chapter per step, a sticky rail to keep you oriented;
// the 8 skills are called out in chapter 05's report); the technology; the
// close. v3 adds the sticky header, "Skip the tour", one strict type scale
// (type.css) and two control styles. v2 is at /mockups/exhibition-v2.

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';
const MUTED = 'text-(--ink)/70';

export default function ExhibitionV6Mockup() {
  return (
    <div data-mockup data-exhibition className="flex-1 bg-(--paper)">
      <StickyHeader watch="hero-cta" />
      <header className={`${WRAP} flex h-16 items-center justify-between`}>
        <Link href="/mockups" className="t-card font-semibold tracking-[-0.02em]">CaseTester</Link>
        <Link href="/sign-in" className="link t-small">Sign in</Link>
      </header>

      <main>
        {/* 1. Hero */}
        <section aria-labelledby="ex-hero" data-shot="hero" className="border-t border-(--ink)/12">
          <div className={`${WRAP} grid gap-10 pt-8 pb-16 sm:gap-14 sm:pt-12 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-14 lg:pt-20 lg:pb-24`}>
            <div className="lg:pt-4">
              <h1 id="ex-hero" className={`${s.display} t-display text-balance`}>{HERO.headline}</h1>
              <p className={`t-body mt-5 max-w-[30rem] sm:mt-7 ${MUTED}`}>{HERO.subhead}</p>
              <div className="mt-7 sm:mt-9">
                <Link id="hero-cta" href={DIAGNOSTIC_HREF} className="btn-primary">{HERO.primary}</Link>
                <p className={`t-small mt-3 ${MUTED}`}>{HERO.reassurance}</p>
              </div>
              <a href="#how" className="link t-body mt-6 inline-flex items-center gap-2 sm:mt-8">
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
            <h2 id="ex-close" data-reveal="text" className={`${s.display} t-display mx-auto max-w-[14ch] text-balance`}>Find out where you stand. It’s free.</h2>
            <p data-reveal="text" className={`t-body mx-auto mt-6 max-w-[34rem] ${MUTED}`}>Take the diagnostic and get a personalized training plan in minutes.</p>
            {/* The wrapper reveals, so the button keeps its own hover transition. */}
            <div data-reveal="text" className="mt-10"><Link href={DIAGNOSTIC_HREF} className="btn-primary">Take the free diagnostic</Link></div>
          </div>
        </section>
      </main>

      <footer className={WRAP}>
        <div className="border-t border-(--ink)/12 py-8">
          <p className="t-body font-semibold">CaseTester</p>
          <p className={`t-label mt-3 max-w-[48rem] ${MUTED}`}>
            CaseTester is not affiliated with or endorsed by McKinsey &amp; Company, Boston Consulting Group, Bain &amp; Company, or any other firm named on this site.
          </p>
        </div>
      </footer>
      <RevealRoot />
    </div>
  );
}
