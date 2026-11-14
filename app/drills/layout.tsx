import { DrillsChrome } from '@/components/drills/views/chrome';

// Every drills page gets the shared header and the feedback button
// (components/drills/views/chrome.tsx).
export default function DrillsLayout({ children }: { children: React.ReactNode }) {
  return <DrillsChrome>{children}</DrillsChrome>;
}
