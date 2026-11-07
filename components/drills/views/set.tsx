import Link from 'next/link';
import { DrillRunner, type RunnerView } from '@/components/drills/runner';
import { SetResults } from '@/components/drills/results';
import { GradingWait } from '@/components/drills/grading-wait';
import type { Checkin } from '@/lib/drills/feedback';
import type { setResults } from '@/lib/drills/sets/service';

// A drill set and its results. Their pages (app/drills/sets/[setId] and
// …/results) load the data and redirect.

export function SetScreen({ view, expired }: { view: RunnerView; expired: boolean }) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <nav className="text-sm"><Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← Training home</Link></nav>
      {expired ? (
        <p className="text-sm">This set expired after 24 hours. Your answers were saved. <Link href="/drills" className="underline underline-offset-4">Start a new one</Link>.</p>
      ) : (
        <DrillRunner view={view} />
      )}
    </main>
  );
}

export type ResultsData = Awaited<ReturnType<typeof setResults>>;

export function ResultsScreen({ results, checkin }: { results: ResultsData; checkin: Checkin | null }) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <nav className="text-sm"><Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← Training home</Link></nav>
      {results.status === 'grading'
        ? <GradingWait drillName={results.drill.name} delayed={results.delayed} />
        : <SetResults results={results} checkin={checkin} />}
    </main>
  );
}
