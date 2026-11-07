import Link from 'next/link';
import { DRILLS_CONFIG, getDrill, getSkill } from '@/lib/drills/config';
import type { programView, workoutWithStatus } from '@/lib/drills/program/store';
import type { openPrescriptions } from '@/lib/drills/progress/profile';
import type { ProgramRow } from '@/lib/drills/program/store';
import { buttonVariants } from '@/components/ui/button';
import { StartSetButton } from '@/components/drills/start-set-button';

const TRACK = { foundations: 'Foundations', standard: 'Standard', sprint: 'Sprint', self_directed: 'Practice on my own' } as const;
const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export interface PlanData {
  track: ProgramRow['track'];
  source: string;
  rx: Awaited<ReturnType<typeof openPrescriptions>>;
  checks: string[];
  view: NonNullable<Awaited<ReturnType<typeof programView>>>;
  workout: Awaited<ReturnType<typeof workoutWithStatus>> | null;
  next: number;
  startHref: string | null;
}

// "Your plan"'s screen; app/drills/plan/page.tsx loads its data.
export function PlanScreen({ track, source, rx, checks, view, workout, next, startHref }: PlanData) {
  const nav = <nav className="text-sm"><Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← Training home</Link></nav>;
  const focus = (
    rx.length > 0 && (
      <section aria-labelledby="focus" className="space-y-2">
        <h2 id="focus" className="font-medium">Where you start</h2>
        <ul className="space-y-2">
          {rx.map(r => (
            <li key={r.id} className="rounded-lg border p-3 text-sm">
              <span className="font-medium">{r.skill_name}</span> <span className="text-muted-foreground">· {r.drill_name}</span>
              <span className="block text-muted-foreground">{r.reason}</span>
            </li>
          ))}
        </ul>
      </section>
    )
  );

  if (track === 'self_directed') {
    const first = rx[0];
    return (
      <main className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
        {nav}
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">Your starting point</h1>
          <p className="text-sm text-muted-foreground">{source}</p>
        </header>
        <p className="text-sm">You&apos;re practicing on your own, so there&apos;s no weekly schedule: we suggest what to do next and you choose. You can switch to a plan any time in Settings.</p>
        {focus}
        {checks.length > 0 && <p className="text-sm text-muted-foreground">Suggestions start with a short check of {checks.slice(0, 2).map(id => getSkill(id).name).join(' and ')}.</p>}
        <div className="flex flex-wrap gap-3">
          {checks[0]
            ? <StartSetButton body={{ skill_id: checks[0], quick_start: true, placement_check: true }} label="Start a quick check" size="lg" />
            : first && <StartSetButton body={{ skill_id: first.skill_id, quick_start: true }} label={`Start ${first.skill_name}`} size="lg" />}
          <Link href="/drills/browse" className={buttonVariants({ variant: 'outline', size: 'lg' })}>Browse drills</Link>
        </div>
      </main>
    );
  }

  const week = view.week;
  const weeks = view.plan.kind === 'weeks' ? view.plan.weeks.filter(w => w.week > 0) : [];
  const days = view.plan.kind === 'days' ? view.plan.days : [];
  const length = view.plan.kind === 'weeks' ? `${weeks.length} weeks` : `${days.length} days`;
  const end = view.plan.kind === 'weeks' ? weeks.at(-1)?.end : days.at(-1)?.date;
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
      {nav}
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Your plan</h1>
        <p className="text-sm text-muted-foreground">{source}</p>
      </header>

      <section aria-labelledby="track" className="space-y-1 rounded-lg border p-4">
        <h2 id="track" className="font-medium">{TRACK[track]} · {length}{end ? `, until ${date(end)}` : ''}</h2>
        {view.interview_date && <p className="text-sm text-muted-foreground">Interview: {date(view.interview_date)} ({view.interview_days_out} days)</p>}
      </section>

      {week && (
        <section aria-labelledby="this-week" className="space-y-2">
          <h2 id="this-week" className="font-medium">This week: {week.theme}</h2>
          <p className="text-sm">Focus:</p>
          <ul className="flex flex-wrap gap-2 text-sm">
            {week.focus_areas.map(code => <li key={code} className="rounded-full border px-3 py-1">{DRILLS_CONFIG.taxonomy.areas.find(a => a.code === code)?.name ?? code}</li>)}
            {week.focus_skills.filter(id => !week.focus_areas.includes(getSkill(id).area)).map(id => <li key={id} className="rounded-full border px-3 py-1">{getSkill(id).name}</li>)}
          </ul>
        </section>
      )}
      {view.plan.kind === 'days' && view.day && (
        <section aria-labelledby="today" className="space-y-1">
          <h2 id="today" className="font-medium">Today: day {view.sprint_day_index} of {days.length}</h2>
        </section>
      )}

      {focus}

      <section aria-labelledby="schedule" className="space-y-2">
        <h2 id="schedule" className="font-medium">Your schedule</h2>
        {view.plan.kind === 'weeks' ? (
          <>
            <p className="text-sm">{view.workouts_per_week} workouts a week, about 20 minutes each, plus the week&apos;s cases. Do them on any days you like.</p>
            <div role="region" aria-label="Weekly schedule" tabIndex={0} className="overflow-x-auto rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Weekly schedule</caption>
                <thead><tr className="text-left text-muted-foreground"><th scope="col" className="border-b py-1 pr-3 font-normal">Week</th><th scope="col" className="border-b py-1 pr-3 font-normal">Dates</th><th scope="col" className="border-b py-1 pr-3 font-normal">Theme</th><th scope="col" className="border-b py-1 font-normal">Workouts, cases</th></tr></thead>
                <tbody>
                  {weeks.map(w => (
                    <tr key={w.week} className={w.week === week?.week ? 'font-medium' : ''}>
                      <th scope="row" className="border-b py-1 pr-3 text-left font-normal">{w.week}{w.week === week?.week ? ' (now)' : ''}</th>
                      <td className="border-b py-1 pr-3">{date(w.start)}–{date(w.end)}</td>
                      <td className="border-b py-1 pr-3">{w.theme}</td>
                      <td className="border-b py-1">{w.workouts_target}, {w.cases_target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <ol className="space-y-1 text-sm">
            {days.map((d, i) => <li key={d.date} className={d.date === view.today ? 'font-medium' : ''}>Day {i + 1} ({date(d.date)}): {d.activities.join(', ').replace(/_/g, ' ')}{d.workout_minutes ? `, ${d.workout_minutes}-minute workout` : ''}</li>)}
          </ol>
        )}
      </section>

      {workout && workout.blocks.length > 0 && next >= 0 ? (
        <section aria-labelledby="first" className="space-y-3 rounded-lg border p-4">
          <h2 id="first" className="font-medium">Your first workout</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {workout.blocks.map((b, i) => <li key={i}><span className="font-medium">{getDrill(b.drill_id).name}</span> <span className="text-muted-foreground">· {b.reason}</span></li>)}
          </ol>
          {startHref
            ? <Link href={startHref} className={buttonVariants({ size: 'lg' })}>Start first workout</Link>
            : <StartSetButton body={{ workout_id: workout.id, block: next }} label="Start first workout" size="lg" />}
        </section>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Link href="/drills" className={buttonVariants({ size: 'lg' })}>Go to today&apos;s training</Link>
          <Link href="/drills/browse" className={buttonVariants({ variant: 'outline', size: 'lg' })}>Browse drills</Link>
        </div>
      )}
    </main>
  );
}
