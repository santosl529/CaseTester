import { FeedbackButton } from '@/components/drills/feedback';
import { SiteHeader } from '@/components/site-header';

// What every drills page sits in (app/drills/layout.tsx): the shared header
// (site flow, 19 Oct) and the feedback button (D6 pilot feedback). The padding
// keeps the end of each page clear of the button's corner on phones.
export function DrillsChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="pb-20">{children}</div>
      <FeedbackButton />
    </>
  );
}
