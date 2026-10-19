'use client';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// The end screen when a case ends (site flow, 19 Oct): Get my report, Start
// another case, Go to drills, Home. `report` is absent when there is no report
// (nothing assessable, a conduct end) or the page shows its own report button
// (the voice room's "Score this interview").
export type EndReport = 'ready' | 'preparing' | 'failed';

export function CaseEndPanel({ sessionId, report, onRetry, note }: {
  sessionId: string;
  report?: EndReport;
  onRetry?: () => void;
  note?: string;
}) {
  return (
    <section aria-label="The case has ended" className="space-y-3 rounded-lg border bg-white p-4">
      <p className="text-sm font-medium">{note ?? 'The case has ended.'}</p>
      {report === 'preparing' && <p className="text-sm text-neutral-600">Preparing your report — this can take a couple of minutes.</p>}
      {report === 'failed' && <p className="text-sm text-red-600">Generating your report hit an error.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {report === 'ready' && <Link href={`/case/${sessionId}/report`} className={cn(buttonVariants({ size: 'lg' }))}>Get my report</Link>}
        {report === 'preparing' && <Button size="lg" disabled>Preparing your report…</Button>}
        {report === 'failed' && <Button size="lg" onClick={onRetry}>Try again</Button>}
        <Link href="/home#cases" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>Start another case</Link>
        <Link href="/drills" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>Go to drills</Link>
        <Link href="/home" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>Home</Link>
      </div>
    </section>
  );
}
