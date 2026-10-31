import Link from 'next/link';
import { BRAND, CLOSE, HOME_HREF, PRODUCT_HREF } from './content';
import { DiagnosticCta } from './diagnostic-cta';
import s from './exhibition.module.css';

// What the homepage and the product page share (Matt's brief, 24 Oct 2026):
// the top bar, the final call to action and the footer.

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';
const MUTED = 'text-(--ink)/70';

export function TopBar() {
  return (
    <header className={`${WRAP} flex h-16 items-center justify-between`}>
      <Link href={HOME_HREF} className="t-card font-semibold tracking-[-0.02em]">{BRAND}</Link>
      <Link href="/sign-in" className="link t-small">Sign in</Link>
    </header>
  );
}

export function CloseCta() {
  return (
    <section aria-labelledby="ex-close" data-shot="close" className="py-28 lg:py-44">
      <div className={`${WRAP} text-center`}>
        <h2 id="ex-close" data-reveal="text" className={`${s.display} t-display mx-auto max-w-[14ch] text-balance`}>{CLOSE.headline}</h2>
        <p data-reveal="text" className={`t-body mx-auto mt-6 max-w-[34rem] ${MUTED}`}>{CLOSE.subhead}</p>
        {/* The wrapper reveals, so the button keeps its own hover transition. */}
        <div data-reveal="text" className="mt-10"><DiagnosticCta className="btn-primary">{CLOSE.primary}</DiagnosticCta></div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className={WRAP}>
      <div className="border-t border-(--ink)/12 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <p className="t-body font-semibold">{BRAND}</p>
          <nav aria-label="Footer">
            <Link href={PRODUCT_HREF} className="link t-small">Product</Link>
          </nav>
        </div>
        <p className={`t-label mt-3 max-w-[48rem] ${MUTED}`}>
          {BRAND} is not affiliated with or endorsed by McKinsey &amp; Company, Boston Consulting Group, Bain &amp; Company, or any other firm named on this site.
        </p>
      </div>
    </footer>
  );
}
