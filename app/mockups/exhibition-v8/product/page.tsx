import type { Metadata } from 'next';
import Link from 'next/link';
import { DIAGNOSTIC_HREF } from '../../_shared/copy';
import { LoopSection } from '../loop';
import { Ride } from '../ride';
import { DiagnoseChapter } from '../ch-diagnose';
import { AdaptChapter, DrillChapter, LearnChapter, MockChapter, PlanChapter } from '../chapters';
import { StickyHeader } from '../sticky-header';
import { CloseCta, SiteFooter, TopBar } from '../chrome';
import { RevealRoot } from '../reveal';
import { META, PRODUCT_INTRO } from '../content';
import s from '../exhibition.module.css';
import '../type.css';

// The product page (Matt's brief, 24 Oct 2026): how it works. The intro, the
// loop (its nodes jump to the chapters below), the six chapters as built on
// the one-page version (v7) with the sticky rail, the close. Stands in for
// /product.

export const metadata: Metadata = { title: META.product.title, description: META.product.description };

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';

export default function ExhibitionV8ProductMockup() {
  return (
    <div data-mockup data-exhibition className="flex-1 bg-(--paper)">
      <StickyHeader watch="intro-cta" page="product" />
      <TopBar />

      <main>
        {/* 1. Intro, on Paper */}
        <section aria-labelledby="product-h" data-shot="intro" className="border-t border-(--ink)/12">
          <div className={`${WRAP} pt-14 pb-4 sm:pt-20 lg:pt-28`}>
            <h1 id="product-h" className={`${s.display} t-display max-w-[16ch] text-balance`}>{PRODUCT_INTRO.headline}</h1>
            <p className="t-body mt-6 max-w-[34rem] text-(--ink)/70 sm:mt-7">{PRODUCT_INTRO.subhead}</p>
            <div className="mt-8 sm:mt-10"><Link id="intro-cta" href={DIAGNOSTIC_HREF} className="btn-primary">{PRODUCT_INTRO.primary}</Link></div>
          </div>
        </section>

        {/* 2. The loop: nodes jump to the chapters */}
        <LoopSection where="product" />

        {/* 3. The six chapters, with the sticky rail */}
        <Ride>
          <DiagnoseChapter />
          <PlanChapter />
          <LearnChapter />
          <DrillChapter />
          <MockChapter />
          <AdaptChapter />
        </Ride>

        {/* 4. Final call to action */}
        <CloseCta />
      </main>

      <SiteFooter />
      <RevealRoot />
    </div>
  );
}
