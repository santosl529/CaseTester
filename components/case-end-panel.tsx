'use client';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEndFocus } from '@/components/app-nav';

// The end screen when a case ends (site flow, 19 Oct): Get my report and Start
// another case; the app's bar, back in full here, covers the rest (Matt, 13
// Nov). `report` is absent when there is no report
// (nothing assessable, a conduct end) or the page shows its own report button
// (the voice room's "Score this interview").
export type EndReport = 'ready' | 'preparing' | 'failed';

export function CaseEndPanel({ sessionId, report, onRetry, note }: {
  sessionId: string;
  report?: EndReport;
  onRetry?: () => void;
  note?: string;
}) {
  useEndFocus();
  return (
    <section aria-label="The case has ended" className="space-y-4 rounded-panel border border-ink/12 bg-white p-6 shadow-panel animate-enter motion-reduce:animate-none">
      <p className="t-heading font-semibold">{note ?? 'The case has ended.'}</p>
      {report === 'preparing' && <p className="t-small text-ink/70">Preparing your report — this can take a couple of minutes.</p>}
      {report === 'failed' && <p className="t-small text-alert">Generating your report hit an error.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {report === 'ready' && <Link href={`/case/${sessionId}/report`} className={cn(buttonVariants({ size: 'lg' }))}>Get my report</Link>}
        {report === 'preparing' && <Button size="lg" disabled>Preparing your report…</Button>}
        {report === 'failed' && <Button size="lg" onClick={onRetry}>Try again</Button>}
        <Link href="/home#cases" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>Start another case</Link>
      </div>
    </section>
  );
}
