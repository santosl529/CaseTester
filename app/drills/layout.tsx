import { FeedbackButton } from '@/components/drills/feedback';

// Every drills page gets the feedback button (D6 pilot feedback). The padding
// keeps the end of each page clear of the button's corner on phones.
export default function DrillsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="pb-20">{children}</div>
      <FeedbackButton />
    </>
  );
}
