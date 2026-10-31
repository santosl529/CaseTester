import type { Metadata } from 'next';
import { DiagnosticCta } from './diagnostic-cta';
import { HeroDemo } from './hero-demo';
import { LoopSection, StatsBand } from './loop';
import { ApartSection } from './apart';
import { TechSection } from './tech';
import { StickyHeader } from './sticky-header';
import { CloseCta, SiteFooter, TopBar } from './chrome';
import { RevealRoot } from './reveal';
import { HERO, META } from './content';
import s from './exhibition.module.css';
import './type.css';

// The exhibition homepage mockup (Matt's briefs, 23–24 Oct 2026). Since
// 24 Oct the site is two pages: this one sells the difference (hero, stats,
// the loop, What sets us apart, the technology, the close); the six chapters
// moved to the product page (./product). v7 is the one-page version.

export const metadata: Metadata = { title: META.home.title, description: META.home.description };

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';
const MUTED = 'text-(--ink)/70';

export default function ExhibitionV12Mockup() {
  return (
    <div data-mockup data-exhibition className="flex-1 bg-(--paper)">
      <StickyHeader watch="hero-cta" page="home" />
      <TopBar />

      <main>
        {/* 1. Hero */}
        <section aria-labelledby="ex-hero" data-shot="hero" className="border-t border-(--ink)/12">
          <div className={`${WRAP} grid gap-10 pt-8 pb-16 sm:gap-14 sm:pt-12 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-14 lg:pt-20 lg:pb-24`}>
            <div className="lg:pt-4">
              <h1 id="ex-hero" className={`${s.display} t-display text-balance`}>{HERO.headline}</h1>
              <p className={`t-body mt-5 max-w-[30rem] sm:mt-7 ${MUTED}`}>{HERO.subhead}</p>
              <div className="mt-7 sm:mt-9">
                <DiagnosticCta id="hero-cta" className="btn-primary">{HERO.primary}</DiagnosticCta>
                <p className={`t-small mt-3 ${MUTED}`}>{HERO.reassurance}</p>
              </div>
            </div>
            <HeroDemo />
          </div>
        </section>

        {/* 2. Stats band */}
        <StatsBand />

        {/* 3. The loop: each node opens its chapter on the product page */}
        <LoopSection where="home" />

        {/* 4. What sets us apart */}
        <ApartSection />

        {/* 5. Technology (as built) */}
        <TechSection />

        {/* 6. Final call to action (as built) */}
        <CloseCta />
      </main>

      <SiteFooter />
      <RevealRoot />
    </div>
  );
}
