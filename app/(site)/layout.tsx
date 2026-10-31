import { Bodoni_Moda } from 'next/font/google';
import './palette.css';

// The public site: the homepage and How it works (Matt's exhibition design,
// UI-Overhaul 5b8364b2; live since the site launch, 31 Oct 2026). The pages
// set their own metadata.

const display = Bodoni_Moda({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} flex min-h-full flex-col`} suppressHydrationWarning>
      {/* Lets the reveal styles hide what animates in; without JS everything shows in its final state.
          Set on this wrapper (not <html>) before hydration, hence suppressHydrationWarning above. */}
      <script dangerouslySetInnerHTML={{ __html: "document.currentScript.parentElement.classList.add('mk-js')" }} />
      {children}
    </div>
  );
}
