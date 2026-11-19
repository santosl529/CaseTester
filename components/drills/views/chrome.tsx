import { FeedbackButton } from '@/components/drills/feedback';
import { DrillsLayoutNav } from '@/components/app-nav';

// What every drills page sits in (app/drills/layout.tsx): the app's bar
// (components/app-nav.tsx) and the feedback button (D6 pilot feedback). The
// padding keeps the end of each page clear of the button's corner (md and up;
// on phones Feedback is in the bar, S6).
export function DrillsChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DrillsLayoutNav />
      <div className="pb-20">{children}</div>
      <FeedbackButton />
    </>
  );
}
