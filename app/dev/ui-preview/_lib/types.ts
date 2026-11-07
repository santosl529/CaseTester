import type { Canned } from './guard';

// One preview screen: a page of the app with sample data, and the sample
// answers its requests get (guard.tsx).
export interface Screen {
  slug: string;
  area: string;
  title: string;
  // The pilot's screens (the design pass's first restyle).
  pilot?: boolean;
  // Drills pages sit in the drills layout's header and feedback button.
  chrome?: 'drills';
  render: () => { node: React.ReactNode; api?: Canned[] } | Promise<{ node: React.ReactNode; api?: Canned[] }>;
}
