import Link from 'next/link';
import { getDrill, getSkill } from '@/lib/drills/config';
import type { programView, workoutWithStatus } from '@/lib/drills/program/store';
import type { openPrescriptions } from '@/lib/drills/progress/profile';
import type { ProgramRow } from '@/lib/drills/program/store';
import { buttonVariants } from '@/components/ui/button';
import { StartSetButton } from '@/components/drills/start-set-button';
import { AppPage } from '@/components/brand/page';
import { StepDot } from '@/components/brand/progress';
import { ArrowLink } from '@/components/brand/links';
import { ChevronRight } from 'lucide-react';
import { WeekCount } from '@/components/drills/week-count';
import { scheduleCell, segmentState, showFirstWorkout, type SegmentState } from '@/lib/drills/program/plan-page';

const TRACK = { foundations: 'Foundations', standard: 'Standard', sprint: 'Sprint', self_directed: 'Practice on my own' } as const;
const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export interface PlanData {
  track: ProgramRow['track'];
  // Null when it wouldn't be accurate (planSourceLine).
  source: string | null;
  rx: Awaited<ReturnType<typeof openPrescriptions>>;
  checks: string[];
  view: NonNullable<Awaited<ReturnType<typeof programView>>>;
  workout: Awaited<ReturnType<typeof workoutWithStatus>> | null;
  next: number;
  startHref: string | null;
  // Each week's completed workouts and cases, and whether any workout is done (weekCounts).
  counts: Record<number, { workouts: number; cases: number }>;
  anyWorkout: boolean;
}

// Practice on my own has no plan (Matt, 13 Nov): Plan says so, with the way to
// set one up (the track, in Settings). The starting point, once there is one,
// follows it.
export function PlanEmpty({ children }: { children?: React.ReactNode }) {
  return (
    <AppPage width="reading" className="space-y-10">
      <header className="space-y-4">
        <h1 className="t-title">Your plan</h1>
        <p className="t-body">You don&apos;t have a plan yet.</p>
        <Link href="/drills/settings" className={buttonVariants({ size: 'lg' })}>Set up a plan</Link>
      </header>
      {children}
    </AppPage>
  );
}

// "Your plan"'s screen; app/drills/plan/page.tsx loads its data.
export function PlanScreen({ track, source, rx, checks, view, workout, next, startHref, counts, anyWorkout }: PlanData) {
  const focus = (
    rx.length > 0 && (
      <section aria-labelledby="focus" className="space-y-3">
        <h2 id="focus" className="t-heading font-semibold">Where you start</h2>
        <ul className="space-y-2">
          {rx.map(r => (
            <li key={r.id} className="t-small rounded-panel border border-ink/12 bg-white p-4">
              <span className="font-semibold">{r.skill_name}</span> <span className="text-ink/70">· {r.drill_name}</span>
              <span className="block text-ink/70">{r.reason}</span>
            </li>
          ))}
        </ul>
      </section>
    )
  );

  if (track === 'self_directed') {
    const first = rx[0];
    // Under the empty state, whose Set up a plan is the page's one primary button.
    return (
      <PlanEmpty>
        <section aria-labelledby="starting-point" className="space-y-6 border-t border-ink/12 pt-10">
          <div className="space-y-2">
            <h2 id="starting-point" className="t-heading font-semibold">Your starting point</h2>
            <p className="t-small text-ink/70">{source}</p>
          </div>
          <p className="t-small">You&apos;re practicing on your own, so there&apos;s no weekly schedule: we suggest what to do next and you choose. You can switch to a plan any time in Settings.</p>
          {focus}
          {checks.length > 0 && <p className="t-small text-ink/70">Suggestions start with a short check of {checks.slice(0, 2).map(id => getSkill(id).name).join(' and ')}.</p>}
          <div className="flex flex-wrap gap-3">
            {checks[0]
              ? <StartSetButton body={{ skill_id: checks[0], quick_start: true, placement_check: true }} label="Start a quick check" variant="outline" />
              : first && <StartSetButton body={{ skill_id: first.skill_id, quick_start: true }} label={`Start ${first.skill_name}`} variant="outline" />}
            <Link href="/drills/browse" className={buttonVariants({ variant: 'outline' })}>Browse drills</Link>
          </div>
        </section>
      </PlanEmpty>
    );
  }

  const week = view.week;
  const weeks = view.plan.kind === 'weeks' ? view.plan.weeks.filter(w => w.week > 0) : [];
  const days = view.plan.kind === 'days' ? view.plan.days : [];
  const end = view.plan.kind === 'weeks' ? weeks.at(-1)?.end : days.at(-1)?.date;
  const current = week?.week ?? null;
  const title = view.plan.kind === 'days'
    ? `Day ${view.sprint_day_index} of ${days.length}`
    : week ? `Week ${week.week} of ${weeks.length}: ${week.theme}` : TRACK[track];
  const thisWeek = week ? counts[week.week] : undefined;
  return (
    <AppPage width="reading" className="space-y-10">
      <header className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <p className="t-label text-ink/70"><span className="font-semibold text-ink">{TRACK[track]} plan</span>{end && ` · ends ${date(end)}`}</p>
          <Link href="/drills/settings" className="t-small text-ink/70 underline-offset-4 transition-colors hover:text-cobalt hover:underline motion-reduce:transition-none">Change plan</Link>
        </div>
        <h1 className="t-title text-balance">{title}</h1>
        {source && <p className="t-small text-ink/70">{source}</p>}
        {view.interview_date && <p className="t-small text-ink/70">Interview: {date(view.interview_date)} ({view.interview_days_out} days)</p>}
      </header>

      {/* The track, one segment a week (a day for Sprint): done, this one in Cobalt, to come; two rows of three on a phone. */}
      {view.plan.kind === 'weeks' && weeks.length > 0 && <Track label="Your weeks" items={weeks.map(w => ({ key: w.week, name: w.theme, state: segmentState(w.week, current) }))} />}
      {view.plan.kind === 'days' && view.sprint_day_index && <Track label="Your days" items={days.map((d, i) => ({ key: i + 1, name: `Day ${i + 1}`, state: segmentState(i + 1, view.sprint_day_index) }))} />}

      {week && (
        <section aria-labelledby="this-week" className="space-y-3">
          <h2 id="this-week" className="t-heading font-semibold">This week</h2>
          <ul className="t-small flex flex-wrap gap-x-10 gap-y-2">
            {week.workouts_target > 0 && <WeekCount name="Workouts" done={thisWeek?.workouts ?? 0} target={week.workouts_target} />}
            {week.cases_target > 0 && <WeekCount name="Cases" done={thisWeek?.cases ?? 0} target={week.cases_target} />}
          </ul>
          <p className="t-small"><ArrowLink href="/drills">Go to today&apos;s workout</ArrowLink></p>
        </section>
      )}
      {view.plan.kind === 'days' && view.day && (
        <section aria-labelledby="today" className="space-y-1">
          <h2 id="today" className="t-heading font-semibold">Today: day {view.sprint_day_index} of {days.length}</h2>
          <p className="t-small"><ArrowLink href="/drills">Go to today&apos;s workout</ArrowLink></p>
        </section>
      )}

      {workout && showFirstWorkout(anyWorkout, workout.blocks.length, next) && (
        <section aria-labelledby="first" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <h2 id="first" className="t-heading font-semibold">Your first workout</h2>
          <ol className="t-small list-decimal space-y-1.5 pl-5 marker:text-ink/50">
            {workout.blocks.map((b, i) => <li key={i} className="pl-1"><span className="font-semibold">{getDrill(b.drill_id).name}</span> <span className="text-ink/70">· {b.reason}</span></li>)}
          </ol>
          {/* Outline: Your plan has no main button (Matt, 13 Nov). */}
          {startHref
            ? <Link href={startHref} className={buttonVariants({ variant: 'outline' })}>Start first workout</Link>
            : <StartSetButton body={{ workout_id: workout.id, block: next }} label="Start first workout" variant="outline" />}
        </section>
      )}

      <section aria-labelledby="schedule" className="space-y-3">
        <h2 id="schedule" className="t-heading font-semibold">Your schedule</h2>
        {view.plan.kind === 'weeks' ? (
          <>
            <p className="t-small">{view.workouts_per_week} workouts a week, about 20 minutes each, plus the week&apos;s cases. Do them on any days you like.</p>
            {/* A table from md up; a list of weeks on a phone. */}
            <div role="region" aria-label="Weekly schedule" tabIndex={0} className="hidden overflow-x-auto rounded-window border border-ink/12 bg-white md:block">
              <table className="t-small w-full border-collapse">
                <caption className="sr-only">Weekly schedule</caption>
                <thead><tr className="bg-paper text-left text-ink/70">{['Week', 'Dates', 'Theme', 'Workouts', 'Cases'].map(h => <th key={h} scope="col" className="border-b border-ink/12 px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {weeks.map(w => (
                    <tr key={w.week} className={w.week === current ? 'bg-sky/50 font-semibold' : ''}>
                      <th scope="row" className="border-b border-ink/10 px-3 py-2 text-left font-[inherit] tabular-nums">{w.week}{w.week === current ? ' (now)' : ''}</th>
                      <td className="border-b border-ink/10 px-3 py-2 tabular-nums">{date(w.start)}–{date(w.end)}</td>
                      <td className="border-b border-ink/10 px-3 py-2">{w.theme}</td>
                      <td className="border-b border-ink/10 px-3 py-2"><Cell {...scheduleCell(w.week, current, w.workouts_target, counts[w.week]?.workouts)} /></td>
                      <td className="border-b border-ink/10 px-3 py-2"><Cell {...scheduleCell(w.week, current, w.cases_target, counts[w.week]?.cases)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ol aria-label="Weekly schedule" className="divide-y divide-ink/10 overflow-hidden rounded-window border border-ink/12 bg-white md:hidden">
              {weeks.map(w => (
                <li key={w.week} className={`t-small space-y-1 px-4 py-3 ${w.week === current ? 'bg-sky/50' : ''}`}>
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold">Week {w.week}{w.week === current ? ' (now)' : ''}: {w.theme}</span>
                    <span className="text-ink/70 tabular-nums">{date(w.start)}–{date(w.end)}</span>
                  </p>
                  <p className="flex flex-wrap gap-x-6">
                    <span className="inline-flex items-center gap-1.5">Workouts <Cell {...scheduleCell(w.week, current, w.workouts_target, counts[w.week]?.workouts)} /></span>
                    <span className="inline-flex items-center gap-1.5">Cases <Cell {...scheduleCell(w.week, current, w.cases_target, counts[w.week]?.cases)} /></span>
                  </p>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <ol className="space-y-1 t-small">
            {days.map((d, i) => <li key={d.date} className={d.date === view.today ? 'font-semibold' : ''}>Day {i + 1} ({date(d.date)}): {d.activities.join(', ').replace(/_/g, ' ')}{d.workout_minutes ? `, ${d.workout_minutes}-minute workout` : ''}</li>)}
          </ol>
        )}
      </section>

      {/* Where the plan started, at the end and folded (Matt, 13 Nov). */}
      {rx.length > 0 && (
        <details className="group rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <summary className="t-heading flex cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden="true" className="size-4 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />Where you started
          </summary>
          <ul className="mt-4 space-y-2">
            {rx.map(r => (
              <li key={r.id} className="t-small rounded-window border border-ink/12 p-4">
                <span className="font-semibold">{r.skill_name}</span> <span className="text-ink/70">· {r.drill_name}</span>
                <span className="block text-ink/70">{r.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </AppPage>
  );
}

// Over target: the check first ("✓ 32 done"); met: after ("3 / 3 ✓"); missed: in gray.
function Cell({ text, met, missed }: { text: string; met: boolean; missed: boolean }) {
  const over = text.endsWith(' done');
  return (
    <span className={`inline-flex items-center gap-1.5 tabular-nums ${missed ? 'text-ink/60' : ''}`}>
      {over && <StepDot state="done" />}{text}{met && !over && <StepDot state="done" />}{met && <span className="sr-only">, complete</span>}
    </span>
  );
}

function Track({ label, items }: { label: string; items: { key: number; name: string; state: SegmentState }[] }) {
  const word = { done: 'done', current: 'this week', upcoming: 'to come' } as const;
  return (
    <ol aria-label={label} style={{ '--n': items.length } as React.CSSProperties} className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-[repeat(var(--n),minmax(0,1fr))]">
      {items.map(it => (
        <li key={it.key} className="space-y-1.5">
          <span aria-hidden="true" className={`block h-1.5 rounded-full ${it.state === 'done' ? 'bg-ink/45' : it.state === 'current' ? 'bg-cobalt' : 'bg-ink/12'}`} />
          <span className={`t-label block ${it.state === 'current' ? 'font-semibold text-ink' : 'text-ink/70'}`}>
            {it.name}<span className="sr-only"> ({label === 'Your days' ? (it.state === 'current' ? 'today' : word[it.state]) : word[it.state]})</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
