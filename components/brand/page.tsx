import { cn } from '@/lib/utils';

// A page of the app in the homepage's layout: Paper, the homepage's 24px
// gutters, a column sized to its content, generous space above and below.
const WIDTH = { narrow: 'max-w-xl', reading: 'max-w-3xl', wide: 'max-w-5xl' } as const;

export function AppPage({ width = 'reading', className, children }: { width?: keyof typeof WIDTH; className?: string; children: React.ReactNode }) {
  return <main className={cn('mx-auto w-full px-6 pt-8 pb-24 sm:pt-12', WIDTH[width], className)}>{children}</main>;
}
