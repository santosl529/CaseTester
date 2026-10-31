import type { Metadata } from 'next';
import { Bodoni_Moda } from 'next/font/google';
import './palette.css';

// Homepage mockups (Matt, 21 Oct 2026): four visual directions to compare.
// Open to anyone with the link, kept out of search engines. The production
// homepage is app/(marketing)/page.tsx and is not touched by these.
export const metadata: Metadata = {
  title: 'CaseTester homepage mockups',
  robots: { index: false, follow: false },
};

const display = Bodoni_Moda({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });

export default function MockupsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} flex min-h-full flex-col`} suppressHydrationWarning>
      {/* Lets the reveal styles hide what animates in; without JS everything shows in its final state.
          Set on this wrapper (not <html>) before hydration, hence suppressHydrationWarning above. */}
      <script dangerouslySetInnerHTML={{ __html: "document.currentScript.parentElement.classList.add('mk-js')" }} />
      {children}
    </div>
  );
}
