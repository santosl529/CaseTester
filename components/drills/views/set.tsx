import Link from 'next/link';
import { AppPage } from '@/components/brand/page';
import { AppNav } from '@/components/app-nav';
import { Breadcrumbs } from '@/components/brand/breadcrumbs';
import { DrillRunner, type RunnerView } from '@/components/drills/runner';
import { SetResults } from '@/components/drills/results';
import { GradingWait } from '@/components/drills/grading-wait';
import type { Checkin } from '@/lib/drills/feedback';
import type { setResults } from '@/lib/drills/sets/service';
import { getDrill } from '@/lib/drills/config';
import { drillDescription } from '@/lib/drills/drill-info';

const KIND = { recognize: 'Spot it', repair: 'Fix it', construct: 'Build it' } as const;

// A drill set and its results. Their pages (app/drills/sets/[setId] and
// …/results) load the data and redirect. These pages draw the app's bar
// themselves (the drills layout's steps aside): it marks Today for a set from
// today's workout or the diagnostic, else Drills, and is in focus mode (the
// logo and Exit) while the set runs.

// What leaving does (lib/drills/sets/service.ts): answers are saved as they
// are submitted, an unfinished set can be resumed until it expires after 24
// hours, and an item's time limit runs on the server from when it was shown.
const LEAVE_SET = 'Leave this set? Your answers so far are saved, and you can resume it from Today within 24 hours. If it’s timed, the clock on the current question keeps running.';

const trailStart = (today: boolean) => (today ? { label: 'Today', href: '/drills' } : { label: 'Drills', href: '/drills/browse' });

export function SetScreen({ view, expired, fromWorkout }: { view: RunnerView; expired: boolean; fromWorkout: boolean }) {
  const today = fromWorkout || view.diagnostic !== null;
  const confirm = expired ? undefined : LEAVE_SET;
  const trail = view.diagnostic
    ? [trailStart(true), { label: 'Diagnostic', href: '/drills/diagnostic' }, { label: view.drill.name }]
    : [trailStart(today), { label: view.drill.name }];
  return (
    <>
      <AppNav section={today ? 'today' : 'drills'} focus={confirm ? { confirm } : undefined} />
      <AppPage className="space-y-6">
        <Breadcrumbs trail={trail} confirm={confirm} />
        {expired ? (
          <p className="t-body">This set expired after 24 hours. Your answers were saved. <Link href="/drills" className="link">Start a new one</Link>.</p>
        ) : (
          <DrillRunner view={view} about={{ kind: KIND[getDrill(view.drill.id).stage], why: drillDescription(view.drill.id)?.why ?? null }} />
        )}
      </AppPage>
    </>
  );
}

export type ResultsData = Awaited<ReturnType<typeof setResults>>;

export function ResultsScreen({ results, checkin, blocksLeft }: { results: ResultsData; checkin: Checkin | null; blocksLeft: boolean }) {
  return (
    <>
      <AppNav section={results.from_workout ? 'today' : 'drills'} />
      <AppPage className="space-y-6">
        <Breadcrumbs trail={[trailStart(results.from_workout), { label: results.drill.name }]} />
        {results.status === 'grading'
          ? <GradingWait drillName={results.drill.name} delayed={results.delayed} />
          : <SetResults results={results} checkin={checkin} blocksLeft={blocksLeft} />}
      </AppPage>
    </>
  );
}
